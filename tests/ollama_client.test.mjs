import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  buildChatPayload,
  buildGeneratePayload,
  encodeImages,
  normalizeUrl,
  OllamaError,
  parseMessage,
  summarizeModel,
} from "../src/commands/ollama/client.mjs"

test("normalizeUrl strips trailing slashes", () => {
  assert.equal(normalizeUrl("http://127.0.0.1:11434/"), "http://127.0.0.1:11434")
})

import { humanSize } from "../src/lib/output.mjs"

test("humanSize formats units", () => {
  assert.equal(humanSize(0), "-")
  assert.equal(humanSize(512), "512 B")
  assert.equal(humanSize(1024), "1.0 KiB")
  assert.equal(humanSize(5 * 1024 ** 3), "5.0 GiB")
})

test("parseMessage validates roles", () => {
  assert.deepEqual(parseMessage("user=hola"), { role: "user", content: "hola" })
  assert.throws(() => parseMessage("nope"), /role=content/)
  assert.throws(() => parseMessage("robot=hola"), /role must be one of/)
})

test("summarizeModel fills defaults", () => {
  const summary = summarizeModel({
    name: "m",
    size: 10,
    details: { family: "llama", parameter_size: "7B", quantization_level: "Q4" },
  })
  assert.equal(summary.family, "llama")
  assert.equal(summary.context, "-")
  assert.deepEqual(summary.capabilities, [])
})

test("buildGeneratePayload maps options and images", () => {
  const root = mkdtempSync(join(tmpdir(), "ollama-"))
  try {
    const image = join(root, "x.png")
    writeFileSync(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const payload = buildGeneratePayload({
      model: "m",
      prompt: "hi",
      system: "sys",
      image: [image],
      temperature: 0.2,
      numCtx: 4096,
      format: "json",
    })
    assert.equal(payload.model, "m")
    assert.equal(payload.stream, false)
    assert.equal(payload.format, "json")
    assert.deepEqual(payload.options, { temperature: 0.2, num_ctx: 4096 })
    assert.equal(payload.images.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("buildChatPayload inserts system and attaches images to last user", () => {
  const root = mkdtempSync(join(tmpdir(), "ollama-"))
  try {
    const image = join(root, "x.jpg")
    writeFileSync(image, Buffer.from([0xff, 0xd8]))
    const payload = buildChatPayload({
      model: "m",
      system: "sys",
      prompt: "describe",
      image: [image],
    })
    assert.deepEqual(payload.messages[0], { role: "system", content: "sys" })
    assert.deepEqual(payload.messages[1].images, [Buffer.from([0xff, 0xd8]).toString("base64")])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("buildGeneratePayload maps all options", () => {
  const payload = buildGeneratePayload({
    model: "m",
    prompt: "hi",
    temperature: 0,
    numCtx: 2048,
    numPredict: 64,
  })
  assert.deepEqual(payload.options, { temperature: 0, num_ctx: 2048, num_predict: 64 })
})

test("buildChatPayload requires messages", () => {
  assert.throws(() => buildChatPayload({ model: "m" }), OllamaError)
})

test("encodeImages rejects relative paths", () => {
  assert.throws(() => encodeImages(["relative.png"]), /must be absolute/)
})
