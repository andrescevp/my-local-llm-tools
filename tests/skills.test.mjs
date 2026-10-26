import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { discoverSkills, parseSkillFrontmatter, renderSkillContent } from "../src/lib/skills.mjs"

function fixture(entries) {
  const root = mkdtempSync(join(tmpdir(), "skills-discovery-"))
  mkdirSync(join(root, "skills"), { recursive: true })
  for (const [id, content] of Object.entries(entries)) {
    const dir = join(root, "skills", id)
    mkdirSync(dir, { recursive: true })
    if (content !== undefined) writeFileSync(join(dir, "SKILL.md"), content)
  }
  return root
}

function skill(name, description = "Use this skill when testing discovery.") {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody.\n`
}

test("discovers skills in directory order with normalized frontmatter", () => {
  const root = fixture({
    beta: skill("beta", "Use this skill when   testing   beta."),
    alpha: skill("alpha"),
  })
  try {
    const { skills, warnings } = discoverSkills(root)
    assert.deepEqual(warnings, [])
    assert.deepEqual(
      skills.map((entry) => entry.id),
      ["alpha", "beta"],
    )
    assert.equal(skills[0].name, "alpha")
    assert.equal(skills[0].description, "Use this skill when testing discovery.")
    assert.equal(skills[1].description, "Use this skill when testing beta.")
    assert.ok(skills[0].path.endsWith("skills/alpha/SKILL.md"))
    assert.match(skills[0].content, /# alpha/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("skips a directory without SKILL.md and reports a warning", () => {
  const root = fixture({ alpha: skill("alpha"), empty: undefined })
  try {
    const { skills, warnings } = discoverSkills(root)
    assert.deepEqual(
      skills.map((entry) => entry.id),
      ["alpha"],
    )
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /skills\/empty\/SKILL\.md/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("skips malformed YAML and reports a warning", () => {
  const root = fixture({ broken: "---\nname: [\ndescription: nope\n---\nBody.\n" })
  try {
    const { skills, warnings } = discoverSkills(root)
    assert.deepEqual(skills, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /skills\/broken\/SKILL\.md/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("skips a skill without a description and reports a warning", () => {
  const root = fixture({ nodesc: "---\nname: nodesc\n---\nBody.\n" })
  try {
    const { skills, warnings } = discoverSkills(root)
    assert.deepEqual(skills, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /no description/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("falls back to the directory id when name is missing", () => {
  const root = fixture({ unnamed: "---\ndescription: Use this skill when unnamed.\n---\nBody.\n" })
  try {
    const { skills } = discoverSkills(root)
    assert.equal(skills[0].name, "unnamed")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("returns a warning when skills/ is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "skills-missing-"))
  try {
    const { skills, warnings } = discoverSkills(root)
    assert.deepEqual(skills, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /skills\//)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("parseSkillFrontmatter normalizes whitespace and ignores non-strings", () => {
  assert.deepEqual(
    parseSkillFrontmatter(
      "---\nname: demo\ndescription: >\n  Use this skill\n  when testing.\n---\n",
    ),
    {
      name: "demo",
      description: "Use this skill when testing.",
    },
  )
  assert.deepEqual(parseSkillFrontmatter("no frontmatter"), {})
  assert.deepEqual(parseSkillFrontmatter("---\nname: 42\ndescription: ok\n---\n"), {
    description: "ok",
  })
})

test("renderSkillContent replaces plugin and skill placeholders", () => {
  const content = "root=${CLAUDE_PLUGIN_ROOT} dir=${CLAUDE_SKILL_DIR}"
  assert.equal(
    renderSkillContent(content, "C:\\repo\\plugin", "C:\\repo\\plugin\\skills\\demo"),
    "root=C:/repo/plugin dir=C:/repo/plugin/skills/demo",
  )
})
