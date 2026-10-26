import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { BROWSER_HELP, browser } from "../src/commands/browser.mjs"
import { browserHome, readRecording, systemBrowser, writeRecording } from "../src/lib/browser.mjs"
import {
  findSelectors,
  listSelectors,
  openBrowserDb,
  removeSelector,
  selectorStats,
  upsertSelector,
} from "../src/lib/browser-db.mjs"

function env() {
  return { MY_LOCAL_LLM_TOOLS_CONFIG_DIR: mkdtempSync(join(tmpdir(), "browser-test-")) }
}

test("browser paths live under the plugin config directory", () => {
  const e = env()
  try {
    assert.equal(browserHome(e), join(e.MY_LOCAL_LLM_TOOLS_CONFIG_DIR, "browser"))
  } finally {
    rmSync(e.MY_LOCAL_LLM_TOOLS_CONFIG_DIR, { recursive: true, force: true })
  }
})

test("systemBrowser honors an explicit path and otherwise falls back", () => {
  const found = systemBrowser({
    env: { MLLT_BROWSER_PATH: "/opt/chrome" },
    exists: (path) => path === "/opt/chrome",
  })
  assert.equal(found.path, "/opt/chrome")
  const fallback = systemBrowser({ env: {}, exists: () => false })
  assert.equal(fallback.ok, false)
  assert.equal(fallback.source, "bundled")
})

test("selector SQLite supports upsert, list, stats, and remove", () => {
  const e = env()
  try {
    const { db } = openBrowserDb(e)
    try {
      const row = upsertSelector(db, {
        page: "example.com",
        field: "title",
        selector: "h1",
        extractMode: "text",
        confidence: 0.8,
      })
      assert.equal(row.selector, "h1")
      assert.equal(findSelectors(db, "example.com", "title")[0].selector, "h1")
      assert.equal(listSelectors(db, { page: "example.com" }).length, 1)
      assert.equal(selectorStats(db).total, 1)
      assert.equal(removeSelector(db, row.id), true)
      assert.equal(listSelectors(db).length, 0)
    } finally {
      db.close()
    }
  } finally {
    rmSync(e.MY_LOCAL_LLM_TOOLS_CONFIG_DIR, { recursive: true, force: true })
  }
})

test("recordings are JSON files under ~/.mllt/browser/recordings", () => {
  const e = env()
  try {
    const path = writeRecording(
      { version: 1, name: "demo", startUrl: "https://example.com", steps: [] },
      e,
    )
    assert.equal(path, join(e.MY_LOCAL_LLM_TOOLS_CONFIG_DIR, "browser", "recordings", "demo.json"))
    assert.equal(readRecording("demo", e).name, "demo")
  } finally {
    rmSync(e.MY_LOCAL_LLM_TOOLS_CONFIG_DIR, { recursive: true, force: true })
  }
})

test("browser --help returns the usage text", async () => {
  const lines = []
  const code = await browser(["--help"], { log: (line) => lines.push(line), warn: () => {} })
  assert.equal(code, 0)
  assert.equal(lines[0], BROWSER_HELP)
})

test("browser rejects an unknown command", async () => {
  const code = await browser(["nope"], { log: () => {}, warn: () => {} })
  assert.equal(code, 2)
})
