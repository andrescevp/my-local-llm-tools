import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { parse } from "yaml"

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/

/** Return normalized name/description from a SKILL.md frontmatter block. */
export function parseSkillFrontmatter(text) {
  const match = FRONTMATTER.exec(String(text ?? ""))
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
      fields[key] = data[key].replace(/\s+/g, " ").trim()
    }
  }
  return fields
}

/** Render host placeholders in a SKILL.md body. */
export function renderSkillContent(content, pluginRoot, skillDir) {
  const root = String(pluginRoot).replaceAll("\\", "/")
  const directory = String(skillDir).replaceAll("\\", "/")
  return String(content)
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", root)
    .replaceAll("${CLAUDE_SKILL_DIR}", directory)
}

/** Discover sorted skills from <root>/skills/<id>/SKILL.md. */
export function discoverSkills(root) {
  const skillsDir = join(root, "skills")
  let entries
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true })
  } catch {
    return { skills: [], warnings: ["skills/ is missing or unreadable; no skills loaded"] }
  }

  const warnings = []
  const skills = []
  for (const id of entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    const path = join(skillsDir, id, "SKILL.md")
    let content
    try {
      content = readFileSync(path, "utf8")
    } catch {
      warnings.push(`skills/${id}/SKILL.md is missing or unreadable; skipped`)
      continue
    }
    const meta = parseSkillFrontmatter(content)
    if (!meta.description) {
      warnings.push(`skills/${id}/SKILL.md has no description; skipped`)
      continue
    }
    skills.push({
      id,
      name: meta.name || id,
      description: meta.description,
      path,
      content,
    })
  }
  return { skills, warnings }
}
