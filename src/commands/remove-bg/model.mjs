import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import * as ort from "onnxruntime-node"
import sharp from "sharp"

const SIZE = 320
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]
const sessions = new Map()

export function modelPath(env = process.env, home = homedir()) {
  return env.TOOLBOX_U2NET_MODEL || env.U2NET_MODEL || join(home, ".mllt", "models", "u2net.onnx")
}

export function resolveModel(options = {}) {
  const path = options.path || modelPath(options.env, options.home)
  return existsSync(path)
    ? { ok: true, path }
    : {
        ok: false,
        path,
        error: `U2Net model not found at ${path}. Place u2net.onnx there or set TOOLBOX_U2NET_MODEL.`,
      }
}

function normalize(rgb) {
  const plane = SIZE * SIZE
  const data = new Float32Array(3 * plane)
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      data[channel * plane + index] =
        (rgb[index * 3 + channel] / 255 - MEAN[channel]) / STD[channel]
    }
  }
  return data
}

function normalizeMask(values) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  const range = max - min || 1
  const mask = new Float32Array(values.length)
  for (let index = 0; index < values.length; index += 1) {
    mask[index] = (values[index] - min) / range
  }
  return mask
}

async function sessionFor(path) {
  if (!sessions.has(path)) sessions.set(path, await ort.InferenceSession.create(path))
  return sessions.get(path)
}

/** Run U2Net on an image and return a normalized 320x320 mask. */
export async function runModel(model, input) {
  const image = await sharp(input)
    .removeAlpha()
    .resize(SIZE, SIZE, { fit: "fill" })
    .raw()
    .toBuffer()
  const session = await sessionFor(model)
  const tensor = new ort.Tensor("float32", normalize(image), [1, 3, SIZE, SIZE])
  const results = await session.run({ [session.inputNames[0]]: tensor })
  const output = results[session.outputNames[0]]
  const data = output?.data
  if (!data?.length) throw new Error("U2Net returned no mask")
  return normalizeMask(data)
}

/** Resize a 320x320 mask to the source dimensions. */
export async function resizeMask(mask, width, height) {
  const bytes = Buffer.alloc(mask.length)
  for (let index = 0; index < mask.length; index += 1) {
    bytes[index] = Math.round(mask[index] * 255)
  }
  const resized = await sharp(bytes, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer()
  const output = new Float32Array(width * height)
  for (let index = 0; index < output.length; index += 1) output[index] = resized[index] / 255
  return output
}

export { SIZE }
