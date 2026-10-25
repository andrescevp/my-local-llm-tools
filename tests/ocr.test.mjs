import assert from "node:assert/strict"
import test from "node:test"

import { buildOcrPrompt, shouldUseTesseract } from "../src/commands/ocr.mjs"

test("tesseract is off for a normal first pass", () => {
  assert.equal(shouldUseTesseract({}), false)
})

test("correction passes enable tesseract", () => {
  assert.equal(shouldUseTesseract({ feedback: "missing row" }), true)
  assert.equal(shouldUseTesseract({ previous: "/tmp/out.md" }), true)
  assert.equal(shouldUseTesseract({ tesseract: true }), true)
})

test("--no-tesseract wins over correction flags", () => {
  assert.equal(shouldUseTesseract({ noTesseract: true, feedback: "x", previous: "y" }), false)
})

test("base prompt is used when there is no context", () => {
  assert.equal(buildOcrPrompt({ base: "Extract text" }), "Extract text")
})

test("prompt includes previous extraction and feedback", () => {
  const prompt = buildOcrPrompt({
    base: "Extract text",
    previous: "total: 10",
    feedback: "the total is 12 and a row is missing",
  })
  assert.match(prompt, /Previous extraction to correct/)
  assert.match(prompt, /total: 10/)
  assert.match(prompt, /the total is 12/)
  assert.match(prompt, /Do not invent content/)
})

test("prompt includes tesseract as complementary evidence", () => {
  const prompt = buildOcrPrompt({ base: "Extract text", tesseract: "raw tesseract lines" })
  assert.match(prompt, /Complementary Tesseract OCR output/)
  assert.match(prompt, /raw tesseract lines/)
  assert.match(prompt, /trust the image/)
})

test("long context is truncated", () => {
  const prompt = buildOcrPrompt({ base: "Extract", tesseract: "x".repeat(20000) })
  assert.match(prompt, /\[truncated\]/)
})
