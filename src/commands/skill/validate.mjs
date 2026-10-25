import { existsSync, readFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { parse } from "yaml"

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const VALID_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "allowed-tools",
  "metadata",
])
const VAGUE_PATTERNS = [
  /handle errors appropriately/i,
  /follow best practices/i,
  /as appropriate/i,
  /when necessary/i,
]

function lineCount(text) {
  return text.replace(/\n$/, "").split("\n").length
}

/** Validate a SKILL.md file against the skill specification. */
export function validateSkillFile(filePath) {
  const errors = []
  const warnings = []
  const path = resolve(filePath)

  if (!existsSync(path)) {
    return { errors: [`file not found: ${filePath}`], warnings, code: 2 }
  }

  const content = readFileSync(path, "utf8")
  if (!content.startsWith("---")) {
    errors.push("file must start with '---' (YAML frontmatter)")
  }

  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!match) {
    errors.push("invalid frontmatter: missing closing '---'")
    return { errors, warnings, code: 1 }
  }

  let data
  try {
    data = parse(match[1]) ?? {}
  } catch (error) {
    errors.push(`invalid YAML in frontmatter: ${error.message}`)
    return { errors, warnings, code: 1 }
  }

  const name = typeof data.name === "string" ? data.name : ""
  const description = typeof data.description === "string" ? data.description : ""

  if (!name) {
    errors.push("name is empty")
  } else {
    if (name.length > 64) errors.push(`name is ${name.length} chars (max 64)`)
    if (!NAME_PATTERN.test(name)) {
      errors.push(`name '${name}' does not match ^[a-z0-9]+(-[a-z0-9]+)*$`)
    }
  }

  if (!description) {
    errors.push("description is empty")
  } else {
    if (description.length > 500) {
      errors.push(`description is ${description.length} chars (max 500)`)
    }
    const lowered = description.toLowerCase()
    if (!["use this skill", "use this", "when"].some((phrase) => lowered.includes(phrase))) {
      errors.push(
        "description should use imperative phrasing with trigger contexts (e.g., 'Use this skill when...')",
      )
    }
  }

  for (const key of Object.keys(data)) {
    if (!VALID_FIELDS.has(key)) errors.push(`unknown frontmatter field: ${key}`)
  }

  if (basename(path) !== "SKILL.md") {
    errors.push(`file must be named SKILL.md, got '${basename(path)}'`)
  }
  const parent = basename(dirname(path))
  if (name && parent !== name) {
    errors.push(`directory name '${parent}' does not match skill name '${name}'`)
  }
  const grandparent = basename(dirname(dirname(path)))
  if (grandparent !== "skills") {
    errors.push(`parent directory should be 'skills/', got '${grandparent}'`)
  }

  const body = content.slice(match[0].length)
  for (const [label, pattern] of [
    ["## What I do", /^## What I do\s*$/m],
    ["## When to use me", /^## When to use me\s*$/m],
  ]) {
    if (pattern.test(body)) {
      errors.push(
        `banned section '${label}' present — remove it and compress the info into the frontmatter description`,
      )
    }
  }

  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(body)) {
      errors.push(`vague language detected: '${pattern.source}' — be specific`)
    }
  }

  const lines = lineCount(content)
  if (lines > 250) {
    errors.push(`skill is ${lines} lines (hard cap: 250) — move detail to references/`)
  } else if (lines > 200) {
    warnings.push(
      `skill is ${lines} lines (target: under 200) — consider moving detail to references/`,
    )
  }

  return { errors, warnings, code: errors.length ? 1 : 0 }
}

export function validate(argv) {
  if (argv.length < 1) {
    process.stderr.write("Usage: node src/cli.mjs skill validate <path-to-SKILL.md>\n")
    return 2
  }
  const { errors, warnings, code } = validateSkillFile(argv[0])
  for (const warning of warnings) process.stdout.write(`  ⚠ ${warning}\n`)
  if (code === 0) {
    process.stdout.write("PASSED — all checks passed\n")
    return 0
  }
  process.stdout.write(`FAILED (${errors.length} errors):\n`)
  for (const error of errors) process.stdout.write(`  ✗ ${error}\n`)
  return code
}
