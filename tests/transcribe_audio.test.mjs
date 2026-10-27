import assert from "node:assert/strict"
import test from "node:test"

import {
  buildChunkArgs,
  buildExtractArgs,
  defaultOutputPath,
  formatTimestamp,
  formatTranscript,
  planChunks,
} from "../src/commands/transcribe/plan.mjs"

test("planChunks splits long audio into bounded sequential chunks", () => {
  assert.deepEqual(planChunks(1000, 300), [
    { index: 0, start: 0, end: 300 },
    { index: 1, start: 300, end: 600 },
    { index: 2, start: 600, end: 900 },
    { index: 3, start: 900, end: 1000 },
  ])
  assert.deepEqual(planChunks(120, 300), [{ index: 0, start: 0, end: 120 }])
  assert.deepEqual(planChunks(0, 300), [])
})

test("formatTimestamp renders transcript offsets", () => {
  assert.equal(formatTimestamp(0), "00:00:00")
  assert.equal(formatTimestamp(65), "00:01:05")
  assert.equal(formatTimestamp(3723), "01:02:03")
})

test("defaultOutputPath uses the source basename", () => {
  assert.equal(defaultOutputPath("/in/clip.mp4", "md"), "/in/clip.transcript.md")
  assert.equal(defaultOutputPath("/in/voice.wav", "json"), "/in/voice.transcript.json")
})

test("buildExtractArgs normalizes audio for hyprwhspr", () => {
  const args = buildExtractArgs({ input: "/in/clip.mp4", output: "/tmp/work.wav" })
  assert.ok(args.includes("-vn"))
  assert.deepEqual(args.slice(args.indexOf("-ac"), args.indexOf("-ac") + 2), ["-ac", "1"])
  assert.deepEqual(args.slice(args.indexOf("-ar"), args.indexOf("-ar") + 2), ["-ar", "16000"])
  assert.equal(args.at(-1), "/tmp/work.wav")
})

test("buildChunkArgs extracts a bounded chunk", () => {
  const args = buildChunkArgs({
    input: "/tmp/work.wav",
    output: "/tmp/chunk-001.wav",
    start: 300,
    end: 600,
  })
  assert.ok(args.includes("-ss"))
  assert.ok(args.includes("300"))
  assert.ok(args.includes("-t"))
  assert.ok(args.includes("300"))
  assert.equal(args.at(-1), "/tmp/chunk-001.wav")
})

test("formatTranscript renders markdown, text, and json", () => {
  const report = {
    source: "/in/clip.mp4",
    duration: 610,
    language: "en",
    chunks: [
      { start: 0, end: 300, text: "First part." },
      { start: 300, end: 610, text: "Second part." },
    ],
  }
  const markdown = formatTranscript(report, "md")
  assert.match(markdown, /# Transcript/)
  assert.match(markdown, /## 00:00:00 – 00:05:00/)
  assert.match(markdown, /First part\./)
  assert.match(markdown, /## 00:05:00 – 00:10:10/)

  const text = formatTranscript(report, "txt")
  assert.equal(text, "First part.\n\nSecond part.")

  const json = JSON.parse(formatTranscript(report, "json"))
  assert.equal(json.duration, 610)
  assert.equal(json.chunks.length, 2)
  assert.equal(json.text, "First part.\n\nSecond part.")
})
