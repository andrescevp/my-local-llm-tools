import assert from "node:assert/strict"
import { homedir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { configDir, manifestPath } from "../src/lib/config.mjs"
import { voiceCandidates } from "../src/lib/piper.mjs"

test("configDir uses ~/.mllt on every platform", () => {
  assert.equal(configDir({}, "linux"), join(homedir(), ".mllt"))
  assert.equal(configDir({}, "darwin"), join(homedir(), ".mllt"))
  assert.equal(configDir({}, "win32"), join(homedir(), ".mllt"))
})

test("XDG and APPDATA do not move the plugin config", () => {
  assert.equal(configDir({ XDG_CONFIG_HOME: "/tmp/xdg" }, "linux"), join(homedir(), ".mllt"))
  assert.equal(configDir({ APPDATA: "C:\\AppData" }, "win32"), join(homedir(), ".mllt"))
})

test("MY_LOCAL_LLM_TOOLS_CONFIG_DIR overrides the platform default", () => {
  assert.equal(configDir({ MY_LOCAL_LLM_TOOLS_CONFIG_DIR: "/custom" }, "linux"), "/custom")
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

test("manifest lives in the config directory", () => {
  assert.equal(
    manifestPath({ MY_LOCAL_LLM_TOOLS_CONFIG_DIR: "/custom" }, "linux"),
    join("/custom", "manifest.json"),
  )
})
