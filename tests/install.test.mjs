import assert from "node:assert/strict"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { install } from "../src/commands/install.mjs"

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "install-root-"))
  const plugins = mkdtempSync(join(tmpdir(), "install-plugins-"))
  return { root, plugins }
}

function options(root, plugins, extra = {}) {
  return {
    root,
    env: { OPENCODE_PLUGINS_DIR: plugins },
    hasOpencode: true,
    log: () => {},
    warn: () => {},
    ...extra,
  }
}

test("--help prints usage and changes nothing", () => {
  const { root, plugins } = fixture()
  const lines = []
  try {
    const code = install(["--help"], options(root, plugins, { log: (line) => lines.push(line) }))
    assert.equal(code, 0)
    assert.match(lines.join("\n"), /Usage: node src\/cli\.mjs install/)
    assert.equal(existsSync(join(plugins, "my-local-llm-tools")), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(plugins, { recursive: true, force: true })
  }
})

test("--dry-run does not create the plugins directory or link", () => {
  const { root } = fixture()
  const plugins = join(root, "missing-plugins")
  try {
    const code = install(["--dry-run"], options(root, plugins))
    assert.equal(code, 0)
    assert.equal(existsSync(plugins), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("creates an idempotent symlink to the repository root", () => {
  const { root, plugins } = fixture()
  const destination = join(plugins, "my-local-llm-tools")
  try {
    assert.equal(install([], options(root, plugins)), 0)
    assert.equal(lstatSync(destination).isSymbolicLink(), true)
    assert.equal(readlinkSync(destination), root)
    assert.equal(install([], options(root, plugins)), 0)
    assert.equal(readlinkSync(destination), root)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(plugins, { recursive: true, force: true })
  }
})

test("removes the legacy symlink", () => {
  const { root, plugins } = fixture()
  const legacy = join(plugins, "cheap-ai-winth-local-tools")
  try {
    symlinkSync(root, legacy, "dir")
    assert.equal(install([], options(root, plugins)), 0)
    assert.equal(existsSync(legacy), false)
    assert.equal(lstatSync(join(plugins, "my-local-llm-tools")).isSymbolicLink(), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(plugins, { recursive: true, force: true })
  }
})

test("refuses to replace a real directory", () => {
  const { root, plugins } = fixture()
  const destination = join(plugins, "my-local-llm-tools")
  try {
    mkdirSync(destination)
    assert.equal(install([], options(root, plugins)), 1)
    assert.equal(lstatSync(destination).isDirectory(), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(plugins, { recursive: true, force: true })
  }
})
