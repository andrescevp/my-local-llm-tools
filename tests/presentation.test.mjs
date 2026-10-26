import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { loadConfig, validateConfig } from "../src/commands/presentation/config.mjs"
import { renderHtml } from "../src/commands/presentation/html.mjs"
import { renderPptx } from "../src/commands/presentation/pptx/engine.mjs"
import { applyOverrides, hexToRgb, loadTheme } from "../src/commands/presentation/theme.mjs"

const CONFIG = {
  title: "Demo",
  author: "Tester",
  theme: "corporate",
  slides: [
    { type: "title", title: "Welcome", subtitle: "Sub" },
    { type: "bullets", title: "Points", items: ["A", "B"] },
    { type: "table", title: "Data", headers: ["K", "V"], rows: [["A", "1"]] },
    {
      type: "chart",
      title: "Chart",
      chart_type: "bar",
      labels: ["Q1", "Q2"],
      datasets: [{ label: "X", data: [1, 2], color: "#0066CC" }],
    },
    { type: "closing", title: "Thanks" },
  ],
}

test("themes load by name and deep-merge overrides", () => {
  const theme = loadTheme("corporate")
  assert.equal(theme.name, "Corporate Blue")
  assert.deepEqual(hexToRgb("#FF0000"), [255, 0, 0])
  const merged = applyOverrides(theme, { colors: { accent: "#00ff88" } })
  assert.equal(merged.colors.accent, "#00ff88")
  assert.equal(merged.colors.background, theme.colors.background)
})

test("config validation accepts a valid config and rejects a bad slide", () => {
  assert.equal(validateConfig(CONFIG), CONFIG)
  assert.throws(() => validateConfig({ title: "x", slides: [{ type: "nope" }] }), /invalid/)
  assert.throws(() => validateConfig({ title: "x", slides: [] }), /invalid/)
})

test("loadConfig reads JSON and reports parse errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "presentation-config-"))
  try {
    const good = join(dir, "good.json")
    writeFileSync(good, JSON.stringify(CONFIG))
    assert.equal(loadConfig(good).title, "Demo")
    const bad = join(dir, "bad.json")
    writeFileSync(bad, "{")
    assert.throws(() => loadConfig(bad), /cannot read config/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("HTML rendering copies assets and includes slide content", () => {
  const dir = mkdtempSync(join(tmpdir(), "presentation-html-"))
  try {
    const output = join(dir, "deck.html")
    renderHtml({ config: CONFIG, theme: loadTheme("corporate"), outputPath: output })
    const html = readFileSync(output, "utf8")
    assert.match(html, /Welcome/)
    assert.match(html, /deck-assets\/reveal\.js/)
    assert.match(html, /deck-assets\/chart\.umd\.js/)
    assert.equal(statSync(join(dir, "deck-assets", "reveal.js")).size > 0, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("PPTX rendering produces a non-empty presentation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "presentation-pptx-"))
  try {
    const output = join(dir, "deck.pptx")
    await renderPptx({ config: CONFIG, theme: loadTheme("corporate"), outputPath: output })
    assert.equal(statSync(output).size > 1000, true)
    assert.equal(readFileSync(output).subarray(0, 2).toString(), "PK")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
