import assert from "node:assert/strict"
import test from "node:test"

import { evaluateFeatures } from "../src/commands/setup/features.mjs"
import { formatPlan, planInstall } from "../src/commands/setup/install.mjs"

function context(overrides = {}) {
  return {
    tools: {
      node: { ok: true },
      pnpm: { ok: true },
      docker: { ok: false },
      tesseract: { ok: true },
      ffmpeg: { ok: true },
      ffprobe: { ok: true },
      piper: { ok: true },
      voice_model: { ok: true },
    },
    ollama: {
      reachable: true,
      host: "http://127.0.0.1:11434",
      models: {
        available: ["minicpm-v4.6:latest", "MedAIBase/PaddleOCR-VL:0.9b"],
        required: ["minicpm-v4.6:latest", "MedAIBase/PaddleOCR-VL:0.9b"],
        missing: [],
      },
    },
    ...overrides,
  }
}

test("all features are ready with a complete environment", () => {
  const features = evaluateFeatures(context())
  for (const name of ["image-analysis", "ocr", "video-analysis", "speak"]) {
    assert.equal(features[name].ok, true, name)
  }
})

test("missing models disable dependent skills", () => {
  const features = evaluateFeatures(
    context({
      ollama: {
        reachable: true,
        host: "http://127.0.0.1:11434",
        models: {
          available: [],
          required: ["minicpm-v4.6:latest"],
          missing: ["minicpm-v4.6:latest"],
        },
      },
    }),
  )
  assert.equal(features["image-analysis"].ok, false)
  assert.equal(features.ocr.ok, false)
  assert.equal(features["video-analysis"].ok, false)
})

test("tesseract is optional for ocr", () => {
  const base = context()
  base.tools.tesseract = { ok: false }
  const features = evaluateFeatures(base)
  assert.equal(features.ocr.ok, true)
  assert.equal(features.ocr.optional[0].ok, false)
})

test("planInstall lists missing tools and models", () => {
  const manifest = {
    tools: {
      pnpm: { ok: true },
      docker: { ok: false },
      tesseract: { ok: false },
      ffmpeg: { ok: false },
      ffprobe: { ok: false },
      piper: { ok: false },
      voice_model: { ok: false },
    },
    ollama: {
      reachable: true,
      host: "http://127.0.0.1:11434",
      models: {
        available: [],
        required: ["minicpm-v4.6:latest"],
        missing: ["minicpm-v4.6:latest"],
      },
    },
  }
  const actions = planInstall(manifest, "/tmp/does-not-exist-cheap-ai", "linux")
  const ids = actions.map((action) => action.id)
  assert.ok(ids.includes("deps"))
  assert.ok(ids.includes("model:minicpm-v4.6:latest"))
  assert.ok(ids.includes("tesseract"))
  assert.ok(ids.includes("ffmpeg"))
  assert.match(formatPlan(actions), /Tesseract/)
})

test("planInstall downloads the system-language voice when piper exists", () => {
  const manifest = {
    tools: {
      pnpm: { ok: true },
      docker: { ok: true },
      tesseract: { ok: true },
      ffmpeg: { ok: true },
      ffprobe: { ok: true },
      piper: { ok: true },
      voice_model: { ok: false },
    },
    ollama: {
      reachable: true,
      host: "http://127.0.0.1:11434",
      models: { available: [], required: [], missing: [] },
    },
  }
  const actions = planInstall(manifest, "/repo", "linux")
  const voice = actions.find((action) => action.id === "piper-voice")
  assert.ok(voice)
  assert.equal(voice.kind, "command")
  assert.deepEqual(voice.args.slice(-2), ["voice", "ensure"])
})
