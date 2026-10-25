import assert from "node:assert/strict"
import test from "node:test"

import { formatVideoOutput, planTimestamps } from "../src/commands/video.mjs"

test("planTimestamps samples frame midpoints", () => {
  assert.deepEqual(planTimestamps(10, 5), [1, 3, 5, 7, 9])
})

test("planTimestamps handles a single frame", () => {
  assert.deepEqual(planTimestamps(10, 1), [5])
})

test("planTimestamps handles zero duration", () => {
  assert.deepEqual(planTimestamps(0, 3), [0])
})

test("planTimestamps clamps the frame budget", () => {
  assert.equal(planTimestamps(10, 100).length, 24)
  assert.equal(planTimestamps(10, 0).length, 1)
})

test("formatVideoOutput renders markdown", () => {
  const report = {
    file: "clip.mp4",
    duration: 10,
    model: "minicpm",
    frames: [{ timestamp: 2.5, description: "A cat jumps." }],
    summary: "A short clip.",
  }
  const output = formatVideoOutput(report, "markdown")
  assert.match(output, /# clip\.mp4/)
  assert.match(output, /## 2\.50s/)
  assert.match(output, /## Summary/)
})

test("formatVideoOutput renders json and raw", () => {
  const report = {
    file: "clip.mp4",
    duration: 10,
    model: "minicpm",
    frames: [
      { timestamp: 1, description: "one" },
      { timestamp: 2, description: "two" },
    ],
    summary: "",
  }
  assert.equal(JSON.parse(formatVideoOutput(report, "json")).frames.length, 2)
  assert.equal(formatVideoOutput(report, "raw"), "one\n\ntwo")
})
