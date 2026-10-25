#!/usr/bin/env node
// Static validator for the my-local-llm-tools harness.
//
// Usage: node scripts/validate.mjs [repo-root]
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const EXPECTED_SKILLS = [
  "autoskills",
  "comfyui-server",
  "create-agent",
  "create-skill",
  "image-analysis",
  "ocr",
  "openai-api-usage",
  "setup",
  "speak",
  "video-analysis",
]
const REPO_SCRIPTS = ["install.mjs", "build_manifest.mjs", "validate.mjs"]
const TEXT_EXTENSIONS = new Set([".md", ".py", ".sh", ".mjs", ".ts"])

function check(condition, message, errors, ok) {
  if (condition) ok.push(message)
  else errors.push(message)
}

function lineCount(text) {
  return text.replace(/\n$/, "").split("\n").length
}

function loadJson(path, errors) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    errors.push(`${path}: invalid JSON: ${error.message}`)
    return undefined
  }
}

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text)
  if (!match) return {}
  let data
  try {
    data = parse(match[1]) ?? {}
  } catch {
    return {}
  }
  const fields = {}
  for (const [key, value] of Object.entries(data)) {
    fields[key] = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value
  }
  return fields
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else files.push(path)
  }
  return files
}

function validate(root) {
  const errors = []
  const ok = []
  const skillsDir = join(root, "skills")

  // 1. Skill directories and SKILL.md frontmatter
  const actual = existsSync(skillsDir)
    ? readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : []
  check(
    JSON.stringify(actual) === JSON.stringify([...EXPECTED_SKILLS].sort()),
    `skills/ contains exactly the ${EXPECTED_SKILLS.length} expected skills`,
    errors,
    ok,
  )
  for (const name of EXPECTED_SKILLS) {
    const skill = join(skillsDir, name, "SKILL.md")
    check(existsSync(skill), `skills/${name}/SKILL.md present`, errors, ok)
    if (!existsSync(skill)) continue
    const text = readFileSync(skill, "utf8")
    const meta = frontmatter(text)
    check(meta.name === name, `skills/${name}/SKILL.md frontmatter name matches`, errors, ok)
    check(Boolean(meta.description), `skills/${name}/SKILL.md has a description`, errors, ok)
    check(lineCount(text) <= 250, `skills/${name}/SKILL.md <= 250 lines`, errors, ok)
  }

  // 2. Manifest
  const manifest = loadJson(join(skillsDir, "manifest.json"), errors)
  if (manifest !== undefined) {
    const entries = manifest.skills ?? []
    const ids = new Set(entries.map((entry) => entry.id))
    check(
      ids.size === EXPECTED_SKILLS.length && EXPECTED_SKILLS.every((name) => ids.has(name)),
      `skills/manifest.json covers all ${EXPECTED_SKILLS.length} skills`,
      errors,
      ok,
    )
    for (const name of EXPECTED_SKILLS) {
      const entry = entries.find((candidate) => candidate.id === name) ?? {}
      check(entry.name === name, `manifest entry '${name}' has matching name`, errors, ok)
      check(Boolean(entry.description), `manifest entry '${name}' has a description`, errors, ok)
      const skillPath = join(skillsDir, name, "SKILL.md")
      if (!existsSync(skillPath)) continue
      const expected = frontmatter(readFileSync(skillPath, "utf8")).description ?? ""
      check(
        entry.description === expected,
        `manifest entry '${name}' description matches SKILL.md`,
        errors,
        ok,
      )
    }
  }

  // 3. Package + plugin entry
  const pkg = loadJson(join(root, "package.json"), errors)
  if (pkg !== undefined) {
    check(pkg.name === "my-local-llm-tools", "package.json name matches", errors, ok)
    check(Boolean(pkg.version), "package.json has version", errors, ok)
    check(pkg.type === "module", "package.json is ESM (type: module)", errors, ok)
    check(pkg.exports?.["."] === "./index.ts", "package.json exports '.' -> ./index.ts", errors, ok)
    check(
      Boolean(pkg.dependencies?.["@opencode/plugin"]),
      "package.json depends on @opencode/plugin",
      errors,
      ok,
    )
  }

  const entry = join(root, "index.ts")
  check(existsSync(entry), "index.ts present", errors, ok)
  if (existsSync(entry)) {
    const source = readFileSync(entry, "utf8")
    check(
      source.includes("id: HARNESS_ID") || source.includes('id: "my-local-llm-tools"'),
      "index.ts uses the harness id",
      errors,
      ok,
    )
    check(source.includes("Plugin.define"), "index.ts uses Plugin.define", errors, ok)
    check(source.includes("ctx.skill.transform"), "index.ts registers skills", errors, ok)
    check(source.includes("ctx.session.hook"), "index.ts hooks sessions", errors, ok)
    check(
      source.includes("## my-local-llm-tools"),
      "index.ts injects the context marker",
      errors,
      ok,
    )
    check(lineCount(source) <= 300, "index.ts <= 300 lines", errors, ok)
  }

  // 4. Scripts
  for (const script of REPO_SCRIPTS) {
    check(existsSync(join(root, "scripts", script)), `scripts/${script} present`, errors, ok)
  }

  // 5. Portability + file size + shell syntax
  const skillFiles = walk(skillsDir)
  const executables = skillFiles.filter((path) => path.endsWith(".py") || path.endsWith(".sh"))
  check(executables.length === 0, "skills/ contains no Python or shell executables", errors, ok)
  for (const path of skillFiles) {
    if (!TEXT_EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) continue
    const text = readFileSync(path, "utf8")
    for (const name of EXPECTED_SKILLS) {
      if (new RegExp(`~/\\.agents/skills/${name}/`).test(text)) {
        errors.push(`${relative(root, path)}: hard-coded ~/.agents path`)
        break
      }
    }
  }
  for (const dir of [join(root, "scripts"), join(root, "tests")]) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((name) => /\.(mjs|ts)$/.test(name))) {
      const path = join(dir, file)
      if (statSync(path).isFile() && lineCount(readFileSync(path, "utf8")) > 300) {
        errors.push(`${relative(root, path)}: script exceeds 300 lines`)
      }
    }
  }
  if (existsSync(join(root, "src"))) {
    for (const path of walk(join(root, "src"))) {
      if (path.endsWith(".mjs") && lineCount(readFileSync(path, "utf8")) > 300) {
        errors.push(`${relative(root, path)}: module exceeds 300 lines`)
      }
    }
  }
  const shellScripts =
    process.platform === "win32"
      ? []
      : [
          ...readdirSync(join(root, "scripts"))
            .filter((name) => name.endsWith(".sh"))
            .map((name) => join(root, "scripts", name)),
          ...walk(skillsDir).filter((path) => path.endsWith(".sh")),
        ]
  for (const path of shellScripts) {
    const proc = spawnSync("bash", ["-n", path], { encoding: "utf8" })
    check(proc.status === 0, `${relative(root, path)}: bash syntax OK`, errors, ok)
  }

  // 6. Repo docs
  check(existsSync(join(root, "README.md")), "README.md present", errors, ok)
  check(existsSync(join(root, "AGENTS.md")), "AGENTS.md present", errors, ok)

  console.log(`Inspecting harness: ${root}\n`)
  console.log(`  OK (${ok.length}):`)
  for (const line of ok) console.log(`    ✓ ${line}`)
  if (errors.length) {
    console.log(`\n  FAILED (${errors.length}):`)
    for (const line of errors) console.log(`    ✗ ${line}`)
    return 1
  }
  console.log("\n✅ VALIDATION SUCCESSFUL: harness is consistent.")
  return 0
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv[2]
    ? resolve(process.argv[2])
    : dirname(dirname(fileURLToPath(import.meta.url)))
  process.exit(validate(target))
}
