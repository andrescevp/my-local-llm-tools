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
      url: "http://127.0.0.1:11434",
      models: ["minicpm-v4.6:latest", "MedAIBase/PaddleOCR-VL:0.9b"],
      missing: [],
    },
    comfy: { reachable: true, url: "http://127.0.0.1:8188", vram_gb: 8, gpu_ok: true },
    ...overrides,
  }
}

test("all features are ready with a complete environment", () => {
  const features = evaluateFeatures(context())
  for (const name of ["image-analysis", "ocr", "video-analysis", "comfyui-server", "speak"]) {
    assert.equal(features[name].ok, true, name)
  }
})

test("missing models disable dependent skills", () => {
  const features = evaluateFeatures(
    context({
      ollama: {
        reachable: true,
        url: "http://127.0.0.1:11434",
        models: [],
        missing: ["minicpm-v4.6:latest"],
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

test("planInstall skips ComfyUI when VRAM is below 8 GB", () => {
  const manifest = {
    tools: {
      pnpm: { ok: true },
      docker: { ok: true },
      tesseract: { ok: true },
      ffmpeg: { ok: true },
      ffprobe: { ok: true },
      piper: { ok: true },
      voice_model: { ok: true },
    },
    gpu: { ok: true, name: "small", vram_gb: 4 },
    ollama: { reachable: true, url: "http://127.0.0.1:11434", missing: [] },
    comfy: { reachable: false, url: "http://127.0.0.1:8188" },
  }
  const actions = planInstall(manifest, "/tmp/does-not-exist-cheap-ai", "linux")
  assert.ok(actions.some((action) => action.id === "comfyui:skip"))
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
    ollama: { reachable: true, url: "http://127.0.0.1:11434", missing: ["minicpm-v4.6:latest"] },
    comfy: { reachable: false, url: "http://127.0.0.1:8188" },
  }
  const actions = planInstall(manifest, "/tmp/does-not-exist-cheap-ai", "linux")
  const ids = actions.map((action) => action.id)
  assert.ok(ids.includes("deps"))
  assert.ok(ids.includes("model:minicpm-v4.6:latest"))
  assert.ok(ids.includes("tesseract"))
  assert.ok(ids.includes("ffmpeg"))
  assert.ok(ids.includes("comfyui"))
  assert.match(formatPlan(actions), /Tesseract/)
})
