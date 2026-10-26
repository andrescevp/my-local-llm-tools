import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { learnAdd, learnList, learnTest } from "../src/commands/browser/learn.mjs"
import { extractFromHtml, selectorForValue } from "../src/commands/browser/learn-html.mjs"

const HTML = `<!doctype html><html><body>
<main><h1>Example Domain</h1><p>This domain is for use in documentation examples.</p></main>
</body></html>`

function env() {
  return { MY_LOCAL_LLM_TOOLS_CONFIG_DIR: mkdtempSync(join(tmpdir(), "browser-learn-")) }
}

test("linkedom learns a selector from a value without a browser", () => {
  const result = selectorForValue(HTML, "This domain is for use")
  assert.ok(result.selector)
  assert.equal(result.count, 1)
  assert.deepEqual(extractFromHtml(HTML, result.selector).values, [
    "This domain is for use in documentation examples.",
  ])
})

test("learn add/list/test reads HTML and persists in SQLite", async () => {
  const e = env()
  const dir = mkdtempSync(join(tmpdir(), "browser-learn-html-"))
  const file = join(dir, "page.html")
  writeFileSync(file, HTML)
  const logs = []
  try {
    const code = await learnAdd({
      html: file,
      field: "intro",
      value: "This domain is for use",
      pageName: "example.com",
      env: e,
      log: (line) => logs.push(line),
    })
    assert.equal(code, 0)
    assert.equal(JSON.parse(logs.at(-1)).field, "intro")
    assert.equal(JSON.parse(logs.at(-1)).count, 1)
    assert.equal(learnList({ page: "example.com", env: e, log: () => {} }), 0)

    const testLogs = []
    const testCode = await learnTest({
      html: file,
      field: "intro",
      pageName: "example.com",
      env: e,
      log: (line) => testLogs.push(line),
    })
    assert.equal(testCode, 0)
    assert.equal(JSON.parse(testLogs.at(-1)).count, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(e.MY_LOCAL_LLM_TOOLS_CONFIG_DIR, { recursive: true, force: true })
  }
})

test("learn add accepts a static URL through fetch", async () => {
  const e = env()
  const logs = []
  try {
    const code = await learnAdd({
      url: "https://example.test/page",
      field: "title",
      value: "Example Domain",
      env: e,
      log: (line) => logs.push(line),
      fetchImpl: async () => ({ ok: true, text: async () => HTML }),
    })
    assert.equal(code, 0)
    assert.equal(JSON.parse(logs.at(-1)).page, "example.test")
  } finally {
    rmSync(e.MY_LOCAL_LLM_TOOLS_CONFIG_DIR, { recursive: true, force: true })
  }
})
