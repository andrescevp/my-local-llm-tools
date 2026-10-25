import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import test from "node:test"

import {
  baseUrl,
  buildServeCommand,
  discoverModels,
  normalizeClientHost,
} from "../src/commands/llamacpp/server.mjs"
import { humanSize } from "../src/lib/output.mjs"

test("normalizeClientHost maps wildcard binds", () => {
  assert.equal(normalizeClientHost("0.0.0.0"), "127.0.0.1")
  assert.equal(normalizeClientHost("::"), "::1")
  assert.equal(normalizeClientHost("192.168.1.5"), "192.168.1.5")
})

test("baseUrl brackets IPv6 hosts", () => {
  assert.equal(baseUrl("127.0.0.1", 8080), "http://127.0.0.1:8080")
  assert.equal(baseUrl("::1", 8080), "http://[::1]:8080")
})

test("buildServeCommand includes options and extras", () => {
  const command = buildServeCommand({
    binary: "/usr/bin/llama-server",
    model: "/models/qwen.gguf",
    host: "127.0.0.1",
    port: 8080,
    ctx: 4096,
    ngl: 99,
    threads: 8,
    alias: "qwen",
    apiKey: "secret",
    extra: ["--jinja"],
  })
  assert.deepEqual(command.slice(0, 3), ["/usr/bin/llama-server", "-m", "/models/qwen.gguf"])
  assert.equal(command[command.indexOf("--port") + 1], "8080")
  assert.equal(command[command.indexOf("-ngl") + 1], "99")
  assert.equal(command[command.indexOf("-t") + 1], "8")
  assert.equal(command[command.indexOf("--alias") + 1], "qwen")
  assert.equal(command.at(-1), "--jinja")
})

test("discoverModels is recursive, filtered, and deduplicated", () => {
  const root = mkdtempSync(join(tmpdir(), "gguf-"))
  try {
    mkdirSync(join(root, "nested"))
    writeFileSync(join(root, "a.gguf"), Buffer.alloc(16))
    writeFileSync(join(root, "nested", "b.GGUF"), Buffer.alloc(32))
    writeFileSync(join(root, "ignore.txt"), "nope")
    const found = discoverModels([root, root])
    assert.deepEqual(found.map((model) => basename(model.path)).sort(), ["a.gguf", "b.GGUF"])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("discoverModels ignores missing dirs", () => {
  assert.deepEqual(discoverModels(["/definitely/not/here"]), [])
})

test("humanSize reuses the shared formatter", () => {
  assert.equal(humanSize(0), "-")
  assert.equal(humanSize(1024), "1.0 KiB")
  assert.equal(humanSize(5 * 1024 ** 3), "5.0 GiB")
})

test("state files roundtrip and survive corrupt JSON", async () => {
  const root = mkdtempSync(join(tmpdir(), "state-"))
  const previous = process.env.XDG_STATE_HOME
  try {
    process.env.XDG_STATE_HOME = root
    const module = await import(`../src/commands/llamacpp/server.mjs?state=${Date.now()}`)
    const state = { pid: 1234, port: 8080, model: "/m/x.gguf" }
    module.writeState(8080, state)
    assert.deepEqual(module.readState(8080), state)
    assert.deepEqual(
      module.listStates().map((entry) => entry.port),
      [8080],
    )
    module.removeState(8080)
    assert.equal(module.readState(8080), null)

    writeFileSync(join(root, "llamacpp-server", "server-8080.json"), "{broken")
    assert.deepEqual(module.listStates(), [])
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME = previous
    rmSync(root, { recursive: true, force: true })
  }
})
