import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { applyOverrides, convert, loadPrompt, toValue } from "../src/commands/comfy/workflows.mjs"

const INFO = {
  KSampler: {
    input: {
      required: {
        seed: ["INT"],
        sampler_name: [["euler", "dpmpp"]],
        control_after_generate: ["fixed", "randomize"],
      },
    },
  },
  CheckpointLoader: { input: { required: { ckpt_name: [["a.safetensors"]] } } },
}

test("convert maps widgets to API inputs", () => {
  const prompt = convert(
    {
      nodes: [
        {
          id: 1,
          type: "KSampler",
          widgets_values: ["randomize", 42, "euler"],
          inputs: [],
        },
      ],
      links: [],
    },
    INFO,
  )
  assert.deepEqual(prompt["1"], {
    class_type: "KSampler",
    inputs: { seed: 42, sampler_name: "euler" },
  })
})

test("convert skips muted and bypassed nodes", () => {
  const prompt = convert(
    {
      nodes: [
        { id: 1, type: "KSampler", mode: 2, widgets_values: [], inputs: [] },
        { id: 2, type: "KSampler", mode: 4, widgets_values: [], inputs: [] },
      ],
      links: [],
    },
    INFO,
  )
  assert.deepEqual(prompt, {})
})

test("convert wires linked inputs", () => {
  const prompt = convert(
    {
      nodes: [
        {
          id: 2,
          type: "KSampler",
          widgets_values: [1, "euler"],
          inputs: [{ name: "model", link: 5 }],
        },
      ],
      links: [[5, 1, 0]],
    },
    INFO,
  )
  assert.deepEqual(prompt["2"].inputs.model, ["1", 0])
})

test("convert maps booleans to enable/disable", () => {
  const info = { Toggle: { input: { required: { enabled: ["BOOLEAN"] } } } }
  const prompt = convert(
    { nodes: [{ id: 1, type: "Toggle", widgets_values: [true], inputs: [] }], links: [] },
    info,
  )
  assert.equal(prompt["1"].inputs.enabled, "enable")
})

test("loadPrompt accepts frontend, prompt-wrapped, and API formats", () => {
  const root = mkdtempSync(join(tmpdir(), "comfy-"))
  try {
    const frontend = join(root, "frontend.json")
    writeFileSync(
      frontend,
      JSON.stringify({
        nodes: [{ id: 1, type: "CheckpointLoader", widgets_values: ["a.safetensors"], inputs: [] }],
        links: [],
      }),
    )
    assert.equal(loadPrompt(frontend, INFO)["1"].class_type, "CheckpointLoader")

    const wrapped = join(root, "wrapped.json")
    writeFileSync(wrapped, JSON.stringify({ prompt: { 1: { class_type: "X", inputs: {} } } }))
    assert.deepEqual(loadPrompt(wrapped, INFO), { 1: { class_type: "X", inputs: {} } })

    const api = join(root, "api.json")
    writeFileSync(api, JSON.stringify({ 2: { class_type: "Y", inputs: {} } }))
    assert.deepEqual(loadPrompt(api, INFO), { 2: { class_type: "Y", inputs: {} } })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("toValue casts numbers and booleans", () => {
  assert.equal(toValue("42"), 42)
  assert.equal(toValue("1.5"), 1.5)
  assert.equal(toValue("true"), true)
  assert.equal(toValue("false"), false)
  assert.equal(toValue("euler"), "euler")
})

test("applyOverrides sets values and ignores malformed entries", () => {
  const prompt = { 1: { class_type: "X", inputs: { seed: 1 } } }
  applyOverrides(prompt, ["1.seed=99", "bad", "2.seed=1"])
  assert.equal(prompt["1"].inputs.seed, 99)
})
