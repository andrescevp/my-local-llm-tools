import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  autodetectMode,
  callOllama,
  DEFAULT_ANALYZE_PROMPT,
  DEFAULT_MODEL,
  DEFAULT_OCR_PROMPT,
  encodeImage,
  formatOutput,
  isVisionError,
  resolvePrompt,
  runWithFallback,
} from "../src/lib/vision.mjs"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
)

function tempImage(name, bytes) {
  const root = mkdtempSync(join(tmpdir(), "vision-"))
  const path = join(root, name)
  writeFileSync(path, bytes)
  return { root, path }
}

test("encodeImage validates paths and mime types", () => {
  assert.throws(() => encodeImage("relative.png"), /must be absolute/)
  assert.throws(() => encodeImage("/tmp/does-not-exist-xyz.png"), /Image not found/)
  const { root, path } = tempImage("note.txt", "hello")
  try {
    assert.throws(() => encodeImage(path), /not a recognized image/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("encodeImage returns base64", () => {
  const { root, path } = tempImage("pixel.png", PNG)
  try {
    assert.equal(encodeImage(path), PNG.toString("base64"))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("autodetectMode picks ocr for paddle models", () => {
  assert.equal(autodetectMode(DEFAULT_MODEL), "analyze")
  assert.equal(autodetectMode("MedAIBase/PaddleOCR-VL:0.9b"), "ocr")
})

test("resolvePrompt returns mode defaults", () => {
  assert.equal(resolvePrompt("analyze"), DEFAULT_ANALYZE_PROMPT)
  assert.equal(resolvePrompt("ocr"), DEFAULT_OCR_PROMPT)
  assert.equal(resolvePrompt("ocr", "custom"), "custom")
})

test("isVisionError matches mmproj failures only", () => {
  assert.equal(isVisionError(new Error("image input is not supported - mmproj")), true)
  assert.equal(isVisionError(new Error("model not found")), false)
})

test("runWithFallback retries non-default models", async () => {
  const calls = []
  const call = async (options) => {
    calls.push(options.model)
    if (calls.length === 1) throw new Error("image input is not supported - mmproj missing")
    return { response: "fallback ok" }
  }
  const result = await runWithFallback(
    { model: "MedAIBase/PaddleOCR-VL:0.9b", prompt: "p", encodedImages: ["AAAA"] },
    call,
  )
  assert.deepEqual(result, { response: "fallback ok" })
  assert.deepEqual(calls, ["MedAIBase/PaddleOCR-VL:0.9b", DEFAULT_MODEL])
})

test("runWithFallback does not retry the default model", async () => {
  const call = async () => {
    throw new Error("mmproj missing")
  }
  await assert.rejects(runWithFallback({ model: DEFAULT_MODEL }, call), /mmproj/)
})

test("formatOutput supports markdown/json/raw", () => {
  assert.equal(formatOutput({ response: "  hello world\n" }, "markdown"), "hello world")
  assert.equal(formatOutput({ response: "hi" }, "raw"), "hi")
  const parsed = JSON.parse(formatOutput({ response: "hi", model: "m", done: true }, "json"))
  assert.equal(parsed.response, "hi")
  assert.equal(parsed.model, "m")
})

test("formatOutput strips thinking markers", () => {
  const raw = "thinking...\n</think>\n\nThe image shows a cat."
  assert.equal(formatOutput({ response: raw }, "markdown"), "The image shows a cat.")
})

test("callOllama posts the expected payload", async () => {
  const original = globalThis.fetch
  let captured
  globalThis.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) }
    return new Response(JSON.stringify({ response: "ok" }), { status: 200 })
  }
  try {
    const result = await callOllama({
      ollamaUrl: "http://127.0.0.1:11434/",
      model: "m",
      prompt: "describe",
      encodedImages: ["AAAA"],
      timeout: 30,
    })
    assert.equal(captured.url, "http://127.0.0.1:11434/api/generate")
    assert.equal(captured.body.model, "m")
    assert.deepEqual(captured.body.images, ["AAAA"])
    assert.equal(captured.body.options.temperature, 0)
    assert.equal(result.response, "ok")
  } finally {
    globalThis.fetch = original
  }
})
