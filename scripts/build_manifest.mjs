#!/usr/bin/env node
// Generate skills/manifest.json from the skill folders in this repository.
//
// The manifest is the registration metadata consumed by index.ts and checked by
// scripts/validate.mjs. It is derived data: never edit it by hand.
//
// Usage: node scripts/build_manifest.mjs [repo-root]
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const FRONTMATTER = /^---\n([\s\S]*?)\n---/

/** Return name/description from a SKILL.md frontmatter block. */
export function parseFrontmatter(text) {
  const match = FRONTMATTER.exec(text)
  if (!match) return {}
  let data
  try {
    data = parse(match[1]) ?? {}
  } catch {
    return {}
  }
  const fields = {}
  for (const key of ["name", "description"]) {
    if (typeof data[key] === "string" && data[key].trim()) {
      fields[key] = String(data[key]).replace(/\s+/g, " ").trim()
    }
  }
  return fields
}

/** Build manifest entries for every directory containing a SKILL.md. */
export function collect(skillsDir) {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((id) => {
      const skill = join(skillsDir, id, "SKILL.md")
      let text
      try {
        text = readFileSync(skill, "utf8")
      } catch {
        return []
      }
      const meta = parseFrontmatter(text)
      return [{ id, name: meta.name || id, description: meta.description || "" }]
    })
}

/** Write <root>/skills/manifest.json and return its path. */
export function build(root) {
  const target = join(root, "skills", "manifest.json")
  const payload = { skills: collect(join(root, "skills")) }
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  return target
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const root = process.argv[2]
    ? resolve(process.argv[2])
    : dirname(dirname(fileURLToPath(import.meta.url)))
  const target = build(root)
  const { skills } = JSON.parse(readFileSync(target, "utf8"))
  console.log(`wrote ${target} (${skills.length} skills)`)
}
