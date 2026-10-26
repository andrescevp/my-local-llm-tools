import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { validateHarness } from "../src/commands/validate.mjs"

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const INDEX = `import { Plugin } from "@opencode/plugin"
import { discoverSkills } from "./src/lib/skills.mjs"

const HARNESS_ID = "my-local-llm-tools"
const CONTEXT_MARKER = "## my-local-llm-tools"

export default Plugin.define({
  id: HARNESS_ID,
  async setup(ctx) {
    await ctx.skill.transform(() => {})
    await ctx.session.hook("context", () => {})
  },
})
`

const PACKAGE = {
  name: "my-local-llm-tools",
  version: "2.0.0",
  type: "module",
  exports: { ".": "./index.ts" },
  dependencies: { "@opencode/plugin": "2.1.3" },
}

function fixture({ index = INDEX, pkg = PACKAGE, skill, extra = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "validate-"))
  mkdirSync(join(root, "skills", "demo"), { recursive: true })
  writeFileSync(
    join(root, "skills", "demo", "SKILL.md"),
    skill ??
      "---\nname: demo\ndescription: Use this skill when testing validation.\n---\n\n## Workflow\n\nDo it.\n",
  )
  writeFileSync(join(root, "index.ts"), index)
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg, null, 2))
  writeFileSync(join(root, "README.md"), "# Demo\n")
  writeFileSync(join(root, "AGENTS.md"), "# Demo\n")
  for (const [path, content] of Object.entries(extra)) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return root
}

function check(root) {
  try {
    return validateHarness(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("the current repository validates", () => {
  const result = validateHarness(REPO_ROOT)
  assert.deepEqual(result.errors, [])
  assert.equal(result.ok, true)
})

test("accepts a minimal valid fixture", () => {
  const result = check(fixture())
  assert.deepEqual(result.errors, [])
  assert.equal(result.ok, true)
})

test("rejects a skill without a description", () => {
  const result = check(fixture({ skill: "---\nname: demo\n---\n\n## Workflow\n\nDo it.\n" }))
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("no description")))
})

test("rejects a remaining skills manifest", () => {
  const result = check(fixture({ extra: { "skills/manifest.json": "{}" } }))
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("manifest.json")))
})

test("rejects a remaining scripts directory", () => {
  const result = check(fixture({ extra: { "scripts/legacy.mjs": "" } }))
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("scripts/")))
})

test("rejects package scripts that reference scripts/", () => {
  const result = check(
    fixture({ pkg: { ...PACKAGE, scripts: { legacy: "node scripts/legacy.mjs" } } }),
  )
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("scripts/")))
})

test("rejects a source module over 300 lines", () => {
  const result = check(
    fixture({
      extra: {
        "src/too-long.mjs": Array.from({ length: 301 }, (_, i) => `// ${i}`).join("\n"),
      },
    }),
  )
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("exceeds 300 lines")))
})

test("rejects a package with the wrong name", () => {
  const result = check(fixture({ pkg: { ...PACKAGE, name: "other" } }))
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("package.json name")))
})

test("rejects an entry without dynamic discovery", () => {
  const result = check(fixture({ index: INDEX.replace("discoverSkills", "loadSkills") }))
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("discoverSkills")))
})

test("rejects a missing README", () => {
  const root = fixture()
  rmSync(join(root, "README.md"))
  const result = validateHarness(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("README.md")))
})

test("rejects a hard-coded .agents skill path", () => {
  const result = check(
    fixture({
      extra: {
        "skills/demo/references/notes.md": "~/.agents/skills/demo/nope\n",
      },
    }),
  )
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("hard-coded")))
})

test("reads the repository readme for the current repo check", () => {
  assert.match(readFileSync(join(REPO_ROOT, "README.md"), "utf8"), /my-local-llm-tools/)
})
