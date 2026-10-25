import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { validateSkillFile } from "../src/commands/skill/validate.mjs"

function skillFile(body, { name = "demo", description = "Use this skill when testing." } = {}) {
  const root = mkdtempSync(join(tmpdir(), "skill-"))
  const dir = join(root, "skills", name)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, "SKILL.md")
  writeFileSync(path, `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`)
  return { root, path }
}

test("accepts a valid skill", () => {
  const { root, path } = skillFile("## Workflow\n\nDo the thing.")
  try {
    const result = validateSkillFile(path)
    assert.deepEqual(result.errors, [])
    assert.equal(result.code, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects descriptions over 500 chars", () => {
  const { root, path } = skillFile("## Workflow\n", {
    description: `Use this skill when ${"x".repeat(490)}`,
  })
  try {
    const result = validateSkillFile(path)
    assert.equal(result.code, 1)
    assert.ok(result.errors.some((error) => error.includes("max 500")))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects banned sections", () => {
  const { root, path } = skillFile("## What I do\n\nstuff")
  try {
    const result = validateSkillFile(path)
    assert.ok(result.errors.some((error) => error.includes("banned section")))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects invalid names", () => {
  const { root, path } = skillFile("## Workflow\n", { name: "Bad_Name" })
  try {
    const result = validateSkillFile(path)
    assert.ok(result.errors.some((error) => error.includes("does not match")))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects files over 250 lines", () => {
  const { root, path } = skillFile(Array.from({ length: 260 }, (_, i) => `line ${i}`).join("\n"))
  try {
    const result = validateSkillFile(path)
    assert.ok(result.errors.some((error) => error.includes("hard cap: 250")))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
