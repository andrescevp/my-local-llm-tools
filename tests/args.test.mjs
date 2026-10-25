import assert from "node:assert/strict"
import test from "node:test"

import { parseFlags, splitGlobals } from "../src/lib/args.mjs"

test("parseFlags collects positionals and typed values", () => {
  const { values, positionals } = parseFlags(["-p", "hi", "--num-ctx", "4096", "model"], {
    "-p": { key: "prompt" },
    "--num-ctx": { key: "numCtx", type: "int" },
  })
  assert.equal(values.prompt, "hi")
  assert.equal(values.numCtx, 4096)
  assert.deepEqual(positionals, ["model"])
})

test("parseFlags supports repeated and inline values", () => {
  const { values } = parseFlags(["--image=a.png", "--image", "b.png"], {
    "--image": { key: "image", list: true },
  })
  assert.deepEqual(values.image, ["a.png", "b.png"])
})

test("parseFlags handles booleans and rejects unknown flags", () => {
  const { values } = parseFlags(["--yes"], { "--yes": { key: "yes", type: "boolean" } })
  assert.equal(values.yes, true)
  assert.throws(() => parseFlags(["--nope"], {}), /unknown option/)
})

test("splitGlobals removes url/json from any position", () => {
  const { rest, url, json } = splitGlobals(["--json", "models", "--url", "http://x"])
  assert.deepEqual(rest, ["models"])
  assert.equal(url, "http://x")
  assert.equal(json, true)
})
