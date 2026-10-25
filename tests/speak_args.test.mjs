import assert from "node:assert/strict"
import test from "node:test"

import { parseArgs } from "../src/commands/speak.mjs"

test("defaults and positional text", () => {
  const options = parseArgs(["Hola", "mundo"])
  assert.equal(options.text, "Hola mundo")
  assert.equal(options.sentenceSilence, "0.3")
  assert.equal(options.lengthScale, "1.1")
  assert.equal(options.volume, "1.0")
})

test("parses flags", () => {
  const options = parseArgs([
    "-f",
    "in.txt",
    "-s",
    "0.5",
    "-l",
    "1.2",
    "-v",
    "0.8",
    "-o",
    "out.wav",
    "-q",
  ])
  assert.equal(options.file, "in.txt")
  assert.equal(options.sentenceSilence, "0.5")
  assert.equal(options.lengthScale, "1.2")
  assert.equal(options.volume, "0.8")
  assert.equal(options.output, "out.wav")
  assert.equal(options.quiet, true)
})

test("parses help", () => {
  assert.equal(parseArgs(["-h"]).help, true)
})

test("rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown option/)
})
