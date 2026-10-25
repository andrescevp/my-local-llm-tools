import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { scanModels, scanWorkflows } from "../src/commands/setup/facts.mjs"

test("scanWorkflows lists JSON files with size and hash", () => {
  const root = mkdtempSync(join(tmpdir(), "facts-"))
  try {
    writeFileSync(join(root, "a.json"), '{"nodes":[]}')
    writeFileSync(join(root, "ignore.txt"), "nope")
    const workflows = scanWorkflows(root)
    assert.deepEqual(
      workflows.map((entry) => entry.name),
      ["a.json"],
    )
    assert.equal(workflows[0].size_bytes, '{"nodes":[]}'.length)
    assert.match(workflows[0].sha256, /^[a-f0-9]{64}$/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("scanModels walks model subdirectories", () => {
  const root = mkdtempSync(join(tmpdir(), "models-"))
  try {
    mkdirSync(join(root, "checkpoints"), { recursive: true })
    mkdirSync(join(root, "loras", "nested"), { recursive: true })
    writeFileSync(join(root, "checkpoints", "base.safetensors"), "x")
    writeFileSync(join(root, "loras", "nested", "style.safetensors"), "yy")
    const models = scanModels(root)
    assert.equal(models.length, 2)
    assert.deepEqual(
      models.map((model) => model.subdir),
      ["checkpoints", "loras"],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("scanModels tolerates missing directories", () => {
  assert.deepEqual(scanModels("/definitely/not/here"), [])
})
