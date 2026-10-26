import assert from "node:assert/strict"
import test from "node:test"

import {
  alphaBounds,
  applyAlpha,
  centerOnCanvas,
  cropRgba,
  maskToAlpha,
  padRgba,
} from "../src/commands/remove-bg/composite.mjs"

test("maskToAlpha supports soft, balanced, and hard masks", () => {
  const mask = new Float32Array([0, 0.25, 0.5, 0.75, 1])
  assert.deepEqual([...maskToAlpha(mask, 5, 1, { threshold: 0.5 })], [0, 0, 255, 255, 255])
  assert.deepEqual([...maskToAlpha(mask, 5, 1, { threshold: 0.5, softness: 1 })].slice(0, 1), [0])
  assert.equal(maskToAlpha(mask, 5, 1, { threshold: 0 })[1], 255)
})

test("applyAlpha preserves RGB and replaces alpha", () => {
  const rgba = Buffer.from([10, 20, 30, 255, 40, 50, 60, 255])
  const out = applyAlpha(rgba, new Uint8Array([0, 128]))
  assert.deepEqual([...out], [10, 20, 30, 0, 40, 50, 60, 128])
})

test("alphaBounds finds the non-transparent box", () => {
  const alpha = new Uint8Array([0, 0, 0, 0, 255, 0, 0, 0, 255])
  assert.deepEqual(alphaBounds(alpha, 3, 3), { x: 1, y: 1, width: 2, height: 2 })
})

test("crop, pad, and canvas preserve transparency", () => {
  const rgba = Buffer.alloc(2 * 2 * 4, 255)
  const cropped = cropRgba(rgba, 2, 2, { x: 0, y: 0, width: 1, height: 1 })
  assert.equal(cropped.width, 1)
  const padded = padRgba(cropped.buffer, 1, 1, 2)
  assert.equal(padded.width, 5)
  assert.equal(padded.buffer[0], 0)
  const canvas = centerOnCanvas(padded.buffer, padded.width, padded.height, 10)
  assert.equal(canvas.width, 10)
  assert.equal(canvas.buffer.length, 10 * 10 * 4)
})
