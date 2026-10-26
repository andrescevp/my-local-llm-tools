import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { readManifest, writeManifest } from "../src/commands/setup/manifest.mjs"
import { validateManifest } from "../src/commands/setup/schema.mjs"

function validManifest() {
  return {
    schema: 3,
    plugin: "my-local-llm-tools",
    generated_at: "2026-01-01T00:00:00.000Z",
    platform: { os: "linux", arch: "x64", release: "test" },
    ok: true,
    libre_office_path: "/usr/bin/soffice",
    hosts: { ollama: "http://127.0.0.1:11434" },
    models: {
      ollama: {
        available: ["minicpm-v4.6:latest"],
        required: ["minicpm-v4.6:latest"],
        missing: [],
      },
    },
    paths: {
      tesseract: "/usr/bin/tesseract",
      ffmpeg: "/usr/bin/ffmpeg",
      ffprobe: "/usr/bin/ffprobe",
      piper: "/usr/bin/piper",
    },
    tools: {
      node: { ok: true, version: "v24", path: "/usr/bin/node" },
      pnpm: { ok: true, version: "11", path: "/usr/bin/pnpm", error: "" },
      docker: { ok: false, version: "", path: "", error: "not found" },
      tesseract: {
        ok: true,
        version: "5",
        path: "/usr/bin/tesseract",
        error: "",
        languages: ["eng"],
      },
      ffmpeg: { ok: true, version: "7", path: "/usr/bin/ffmpeg", error: "" },
      ffprobe: { ok: true, version: "7", path: "/usr/bin/ffprobe", error: "" },
      piper: { ok: true, version: "found", path: "/usr/bin/piper" },
      voice_model: { ok: true, path: "/voices/es.onnx" },
      libreoffice: {
        ok: true,
        version: "LibreOffice 26",
        path: "/usr/bin/soffice",
        source: "system",
      },
      gimp: { ok: true, version: "GIMP 3", path: "/usr/bin/gimp" },
      inkscape: { ok: true, version: "Inkscape 1.4", path: "/usr/bin/inkscape" },
      potrace: { ok: true, version: "potrace 1.16", path: "/usr/bin/potrace" },
      pdftoppm: { ok: true, version: "pdftoppm 26", path: "/usr/bin/pdftoppm" },
      playwright: { ok: true, version: "1.64.1", path: "/cache/chromium" },
      u2net_model: { ok: true, path: "/models/u2net.onnx" },
    },
    ollama: {
      host: "http://127.0.0.1:11434",
      reachable: true,
      version: "0.1",
      models: {
        available: ["minicpm-v4.6:latest"],
        required: ["minicpm-v4.6:latest"],
        missing: [],
      },
    },
    features: {
      ocr: { ok: true, requires: [{ requirement: "ollama", ok: true }], optional: [] },
    },
    warnings: [],
  }
}

test("valid manifest passes the schema", () => {
  assert.deepEqual(validateManifest(validManifest()), { ok: true, errors: [] })
})

test("schema rejects missing hosts and unknown root fields", () => {
  const missing = validManifest()
  delete missing.hosts
  assert.equal(validateManifest(missing).ok, false)

  const extra = { ...validManifest(), unexpected: true }
  assert.equal(validateManifest(extra).ok, false)
})

test("schema pins the plugin and schema version", () => {
  assert.equal(validateManifest({ ...validManifest(), schema: 1 }).ok, false)
  assert.equal(validateManifest({ ...validManifest(), plugin: "other" }).ok, false)
})

test("writeManifest validates, and readManifest roundtrips", () => {
  const previous = process.env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR
  const root = mkdtempSync(join(tmpdir(), "manifest-schema-"))
  process.env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR = root
  try {
    const target = writeManifest(validManifest())
    assert.equal(target, join(root, "manifest.json"))
    assert.deepEqual(readManifest(), validManifest())
  } finally {
    if (previous === undefined) delete process.env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR
    else process.env.MY_LOCAL_LLM_TOOLS_CONFIG_DIR = previous
    rmSync(root, { recursive: true, force: true })
  }
})

test("writeManifest rejects an invalid manifest", () => {
  assert.throws(() => writeManifest({ schema: 2 }), /invalid manifest/)
})
