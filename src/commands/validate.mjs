import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { discoverSkills } from "../lib/skills.mjs"
import { validateSkillFile } from "./skill/validate.mjs"

const TEXT_EXTENSIONS = new Set([".md", ".py", ".sh", ".mjs", ".ts"])

export const VALIDATE_HELP = `Usage: node src/cli.mjs validate [repo-root]

Validate skills, package metadata, the plugin entry, docs, and line limits.
`

function lineCount(text) {
  return text.replace(/\n$/, "").split("\n").length
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

function loadJson(path, result) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    result.errors.push(`${path}: invalid JSON: ${error.message}`)
    return undefined
  }
}

function check(result, condition, message) {
  if (condition) result.checks.push(message)
  else result.errors.push(message)
}

function checkSkills(root, result) {
  const { skills, warnings } = discoverSkills(root)
  for (const warning of warnings) result.errors.push(warning)
  check(result, skills.length > 0, `skills/ contains at least one skill (${skills.length})`)

  for (const skill of skills) {
    const validation = validateSkillFile(skill.path)
    for (const error of validation.errors) {
      result.errors.push(`skills/${skill.id}/SKILL.md: ${error}`)
    }
    for (const warning of validation.warnings) {
      result.warnings.push(`skills/${skill.id}/SKILL.md: ${warning}`)
    }
    check(result, validation.errors.length === 0, `skills/${skill.id}/SKILL.md valid`)
  }

  check(result, !existsSync(join(root, "skills", "manifest.json")), "skills/manifest.json removed")
  return skills
}

function checkPackage(root, result) {
  const pkg = loadJson(join(root, "package.json"), result)
  if (!pkg) return
  check(result, pkg.name === "my-local-llm-tools", "package.json name matches")
  check(result, Boolean(pkg.version), "package.json has version")
  check(result, pkg.type === "module", "package.json is ESM (type: module)")
  check(result, pkg.exports?.["."] === "./index.ts", "package.json exports '.' -> ./index.ts")
  check(
    result,
    Boolean(pkg.dependencies?.["@opencode/plugin"]),
    "package.json depends on @opencode/plugin",
  )
  const scripts = Object.values(pkg.scripts ?? {}).map((value) => String(value))
  check(
    result,
    !scripts.some((value) => value.includes("scripts/")),
    "package.json scripts do not reference scripts/",
  )
}

function checkEntry(root, result) {
  const path = join(root, "index.ts")
  check(result, existsSync(path), "index.ts present")
  if (!existsSync(path)) return
  const source = readFileSync(path, "utf8")
  check(
    result,
    source.includes("id: HARNESS_ID") || source.includes('id: "my-local-llm-tools"'),
    "index.ts uses the harness id",
  )
  check(result, source.includes("Plugin.define"), "index.ts uses Plugin.define")
  check(result, source.includes("ctx.skill.transform"), "index.ts registers skills")
  check(result, source.includes("ctx.session.hook"), "index.ts hooks sessions")
  check(result, source.includes("## my-local-llm-tools"), "index.ts injects the context marker")
  check(result, source.includes("discoverSkills"), "index.ts uses discoverSkills")
  check(
    result,
    !source.includes("skills/manifest.json"),
    "index.ts does not read skills/manifest.json",
  )
  check(result, lineCount(source) <= 300, "index.ts <= 300 lines")
}

function checkLimits(root, result) {
  for (const [dir, recursive] of [
    [join(root, "src"), true],
    [join(root, "tests"), false],
  ]) {
    if (!existsSync(dir)) continue
    const files = recursive
      ? walk(dir)
      : readdirSync(dir)
          .filter((name) => /\.(mjs|ts)$/.test(name))
          .map((name) => join(dir, name))
    for (const path of files.filter((file) => /\.(mjs|ts)$/.test(file))) {
      if (statSync(path).isFile() && lineCount(readFileSync(path, "utf8")) > 300) {
        result.errors.push(`${relative(root, path)}: exceeds 300 lines`)
      }
    }
  }
}

function checkPortability(root, skills, result) {
  const skillsDir = join(root, "skills")
  if (!existsSync(skillsDir)) return
  const files = walk(skillsDir)
  const executables = files.filter((path) => path.endsWith(".py") || path.endsWith(".sh"))
  check(result, executables.length === 0, "skills/ contains no Python or shell executables")

  for (const path of files) {
    if (!TEXT_EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) continue
    const text = readFileSync(path, "utf8")
    for (const skill of skills) {
      if (new RegExp(`~/\\.agents/skills/${skill.id}/`).test(text)) {
        result.errors.push(`${relative(root, path)}: hard-coded ~/.agents path`)
        break
      }
    }
  }

  for (const path of files.filter((file) => file.endsWith(".sh"))) {
    const proc = spawnSync("bash", ["-n", path], { encoding: "utf8" })
    check(result, proc.status === 0, `${relative(root, path)}: bash syntax OK`)
  }
}

function checkDocs(root, result) {
  check(result, existsSync(join(root, "README.md")), "README.md present")
  check(result, existsSync(join(root, "AGENTS.md")), "AGENTS.md present")
}

export function validateHarness(root) {
  const result = { ok: false, errors: [], warnings: [], checks: [] }
  const skills = checkSkills(root, result)
  checkPackage(root, result)
  checkEntry(root, result)
  checkLimits(root, result)
  checkPortability(root, skills, result)
  check(result, !existsSync(join(root, "scripts")), "scripts/ removed")
  checkDocs(root, result)
  result.ok = result.errors.length === 0
  return result
}

export function validate(argv) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(VALIDATE_HELP)
    return 0
  }
  const root = argv[0]
    ? resolve(argv[0])
    : resolve(dirname(fileURLToPath(import.meta.url)), "../..")
  const result = validateHarness(root)

  console.log(`Inspecting harness: ${root}\n`)
  console.log(`  OK (${result.checks.length}):`)
  for (const line of result.checks) console.log(`    ✓ ${line}`)
  if (result.warnings.length) {
    console.log(`\n  WARN (${result.warnings.length}):`)
    for (const line of result.warnings) console.log(`    ⚠ ${line}`)
  }
  if (result.errors.length) {
    console.log(`\n  FAILED (${result.errors.length}):`)
    for (const line of result.errors) console.log(`    ✗ ${line}`)
    return 1
  }
  console.log("\n✅ VALIDATION SUCCESSFUL: harness is consistent.")
  return 0
}
