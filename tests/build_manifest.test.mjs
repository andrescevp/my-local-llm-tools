import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { build, collect, parseFrontmatter } from "../scripts/build_manifest.mjs"

test("parseFrontmatter collapses folded descriptions", () => {
  const text = [
    "---",
    "name: demo",
    "description: >",
    "  Use this skill when",
    "  doing demo things.",
    "license: MIT",
    "---",
    "",
    "# demo",
  ].join("\n")
  const meta = parseFrontmatter(text)
  assert.equal(meta.name, "demo")
  assert.equal(meta.description, "Use this skill when doing demo things.")
})

test("parseFrontmatter reads a plain description", () => {
  const text = ["---", "name: demo", "description: Use this skill when testing.", "---"].join("\n")
  assert.equal(parseFrontmatter(text).description, "Use this skill when testing.")
})

test("parseFrontmatter returns {} without frontmatter", () => {
  assert.deepEqual(parseFrontmatter("# no frontmatter\n"), {})
})

test("collect keeps only dirs with SKILL.md, sorted", () => {
  const root = mkdtempSync(join(tmpdir(), "manifest-"))
  try {
    for (const name of ["beta", "alpha"]) {
      mkdirSync(join(root, name))
      writeFileSync(
        join(root, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: Use this skill when ${name}.\n---\n`,
      )
    }
    mkdirSync(join(root, "empty"))
    const entries = collect(root)
    assert.deepEqual(
      entries.map((entry) => entry.id),
      ["alpha", "beta"],
    )
    assert.equal(entries[0].description, "Use this skill when alpha.")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("collect falls back to the directory name", () => {
  const root = mkdtempSync(join(tmpdir(), "manifest-"))
  try {
    mkdirSync(join(root, "no-name"))
    writeFileSync(
      join(root, "no-name", "SKILL.md"),
      "---\ndescription: Use this skill when x.\n---\n",
    )
    assert.equal(collect(root)[0].name, "no-name")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("build writes a manifest with a trailing newline", () => {
  const root = mkdtempSync(join(tmpdir(), "manifest-"))
  try {
    mkdirSync(join(root, "skills", "demo"), { recursive: true })
    writeFileSync(
      join(root, "skills", "demo", "SKILL.md"),
      "---\nname: demo\ndescription: Use this skill when demo.\n---\n",
    )
    const out = build(root)
    const raw = readFileSync(out, "utf8")
    assert.equal(JSON.parse(raw).skills[0].id, "demo")
    assert.ok(raw.endsWith("\n"))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
