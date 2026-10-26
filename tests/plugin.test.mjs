import assert from "node:assert/strict"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import plugin from "../index.ts"

const EXPECTED_SKILL_IDS = [
  "autoskills",
  "autoedit-with-gimp",
  "autoedit-with-inkscape",
  "convert-files",
  "ccreate-agent",
  "ccreate-skill",
  "execute-command",
  "image-analysis",
  "image-background-removal",
  "ocr",
  "openai-api-usage",
  "presentations-generator",
  "setup",
  "speak",
  "use-my-browser",
  "use-my-browser-learn",
  "use-my-browser-record",
  "video-analysis",
]

function fakeContext() {
  const skills = []
  const hooks = {}
  return {
    skills,
    hooks,
    ctx: {
      skill: {
        transform: async (callback) => {
          callback({
            list: () => skills,
            get: () => undefined,
            add: (skill) => skills.push(skill),
            update: () => {},
            remove: () => {},
          })
        },
      },
      session: {
        hook: async (name, callback) => {
          hooks[name] = callback
        },
      },
    },
  }
}

function machineManifest() {
  return {
    schema: 3,
    plugin: "my-local-llm-tools",
    generated_at: "2026-10-26T00:00:00.000Z",
    platform: { os: "linux", arch: "x64", release: "6.0.0" },
    ok: true,
    libre_office_path: "/usr/bin/soffice",
    hosts: { ollama: "http://ollama.test:11434" },
    models: { ollama: { available: [], required: [], missing: [] } },
    paths: { tesseract: "", ffmpeg: "", ffprobe: "", piper: "" },
    tools: {
      node: { ok: true, version: "v24.0.0", path: "/usr/bin/node" },
      pnpm: { ok: true, version: "11.0.0", path: "/usr/bin/pnpm" },
      docker: { ok: false, version: "", path: "" },
      tesseract: { ok: false, version: "", path: "", languages: [] },
      ffmpeg: { ok: false, version: "", path: "" },
      ffprobe: { ok: false, version: "", path: "" },
      piper: { ok: false, version: "", path: "" },
      voice_model: { ok: false, path: "" },
      libreoffice: { ok: true, version: "LibreOffice 26", path: "/usr/bin/soffice" },
      gimp: { ok: true, version: "GIMP 3", path: "/usr/bin/gimp" },
      inkscape: { ok: true, version: "Inkscape 1.4", path: "/usr/bin/inkscape" },
      potrace: { ok: true, version: "potrace 1.16", path: "/usr/bin/potrace" },
      pdftoppm: { ok: true, version: "pdftoppm 26", path: "/usr/bin/pdftoppm" },
      playwright: { ok: true, version: "1.64.1", path: "/cache/chromium" },
      u2net_model: { ok: true, path: "/models/u2net.onnx" },
    },
    ollama: {
      host: "http://ollama.test:11434",
      reachable: true,
      version: "0.1.0",
      models: { available: [], required: [], missing: [] },
    },
    features: {
      "image-analysis": { ok: true, requires: [], optional: [] },
      ocr: { ok: false, requires: [{ requirement: "ollama", ok: false }], optional: [] },
    },
    warnings: [],
  }
}

async function setupWith({ manifest, raw } = {}) {
  const configDir = mkdtempSync(join(tmpdir(), "my-local-llm-tools-"))
  if (manifest) {
    writeFileSync(join(configDir, "manifest.json"), JSON.stringify(manifest, null, 2))
  }
  if (raw !== undefined) writeFileSync(join(configDir, "manifest.json"), raw)

  const previous = process.env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR
  process.env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR = configDir
  const context = fakeContext()
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(" "))
  try {
    await plugin.setup(context.ctx)
  } finally {
    console.warn = originalWarn
    if (previous === undefined) delete process.env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR
    else process.env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR = previous
    rmSync(configDir, { recursive: true, force: true })
  }
  return { ...context, warnings }
}

function contextText(hooks) {
  const event = { system: [] }
  hooks.context(event)
  assert.equal(event.system.length, 1)
  return event.system[0].text
}

test("plugin registers every skill with path and content", async () => {
  const { skills } = await setupWith({ manifest: machineManifest() })
  assert.equal(skills.length, EXPECTED_SKILL_IDS.length)
  assert.deepEqual(
    skills.map((skill) => skill.id).sort(),
    EXPECTED_SKILL_IDS.map((id) => `my-local-llm-tools:${id}`).sort(),
  )
  for (const skill of skills) {
    assert.ok(skill.id.startsWith("my-local-llm-tools:"), `${skill.id} prefix`)
    assert.ok(skill.path.endsWith("SKILL.md"), `${skill.id} path`)
    assert.ok(existsSync(skill.path), `${skill.id} file exists`)
    assert.ok(skill.content.length > 0, `${skill.id} content`)
    assert.ok(!skill.content.includes("${CLAUDE_PLUGIN_ROOT}"), `${skill.id} plugin root rendered`)
    assert.ok(!skill.content.includes("${CLAUDE_SKILL_DIR}"), `${skill.id} skill dir rendered`)
  }
})

test("context hook injects the inventory once", async () => {
  const { hooks } = await setupWith({ manifest: machineManifest() })
  const event = { system: [] }
  hooks.context(event)
  hooks.context(event)
  assert.equal(event.system.length, 1)
  assert.match(event.system[0].text, /## my-local-llm-tools/)
  assert.match(event.system[0].text, /my-local-llm-tools:image-analysis/)
})

test("missing manifest alerts to run setup instead of using hardcoded hosts", async () => {
  const { hooks, warnings } = await setupWith()
  const text = contextText(hooks)
  assert.match(text, /machine manifest missing or invalid/i)
  assert.match(text, /manifest\.json/)
  assert.match(text, /cli\.mjs setup/)
  assert.match(text, /pnpm cli setup/)
  assert.ok(!text.includes("127.0.0.1:11434"), "no hardcoded Ollama host")
  assert.ok(
    warnings.some((line) => line.includes("missing or invalid")),
    "plugin load warns about the missing manifest",
  )
})

test("manifest hosts and readiness drive the injected profile", async () => {
  const { hooks, warnings } = await setupWith({ manifest: machineManifest() })
  const text = contextText(hooks)
  assert.match(text, /generated 2026-10-26T00:00:00\.000Z/)
  assert.match(text, /Ollama http:\/\/ollama\.test:11434: reachable/)
  assert.match(text, /my-local-llm-tools:image-analysis: .*— ready/)
  assert.match(text, /my-local-llm-tools:ocr: .*— not ready/)
  assert.ok(!text.includes("127.0.0.1:11434"), "no hardcoded Ollama host")
  assert.ok(!text.includes("llama.cpp http://127.0.0.1:8080"), "no hardcoded llama.cpp host")
  assert.equal(warnings.length, 0)
})

test("an unreadable manifest is reported like a missing one", async () => {
  const { hooks } = await setupWith({ raw: "{" })
  const text = contextText(hooks)
  assert.match(text, /machine manifest missing or invalid/i)
  assert.match(text, /cli\.mjs setup/)
})
