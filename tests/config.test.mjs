import assert from "node:assert/strict"
import { homedir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { configDir, factsPath, manifestPath } from "../src/lib/config.mjs"
import { voiceCandidates } from "../src/lib/piper.mjs"

test("configDir follows XDG on Linux", () => {
  assert.equal(configDir({ XDG_CONFIG_HOME: "/tmp/xdg" }, "linux"), "/tmp/xdg/cheap-ai-tools")
})

test("configDir uses APPDATA on Windows", () => {
  const appData = "C:\\Users\\demo\\AppData\\Roaming"
  assert.equal(configDir({ APPDATA: appData }, "win32"), join(appData, "cheap-ai-tools"))
})

test("configDir uses Application Support on macOS", () => {
  assert.equal(
    configDir({}, "darwin"),
    join(homedir(), "Library", "Application Support", "cheap-ai-tools"),
  )
})

test("CHEAP_AI_CONFIG_DIR overrides the platform default", () => {
  assert.equal(configDir({ CHEAP_AI_CONFIG_DIR: "/custom" }, "linux"), "/custom")
})

test("piper voice candidates honor PIPER_VOICE", () => {
  const previous = process.env.PIPER_VOICE
  process.env.PIPER_VOICE = "/custom/voice.onnx"
  try {
    assert.equal(voiceCandidates()[0], "/custom/voice.onnx")
  } finally {
    if (previous === undefined) delete process.env.PIPER_VOICE
    else process.env.PIPER_VOICE = previous
  }
})

test("manifest and facts live in the config directory", () => {
  assert.equal(
    manifestPath({ CHEAP_AI_CONFIG_DIR: "/custom" }, "linux"),
    join("/custom", "manifest.json"),
  )
  assert.equal(
    factsPath({ CHEAP_AI_CONFIG_DIR: "/custom" }, "linux"),
    join("/custom", "instance_facts.json"),
  )
})
