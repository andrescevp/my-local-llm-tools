import { isFrameMode, mediaOutputKind, parseTime } from "./media.mjs"

const FRAME_FORMATS = new Set(["jpg", "jpeg", "png", "webp"])
const ROTATIONS = new Set([90, 180, 270])

export function validateMediaRequest({ inputKind, outputKind, values }) {
  if (!inputKind) throw new Error("unsupported media input")
  for (const key of [
    "resize",
    "flip",
    "grayscale",
    "quality",
    "strip",
    "background",
    "autoOrient",
    "trim",
  ]) {
    if (values[key] !== undefined) throw new Error(`--${key} is image-only`)
  }
  if (values.end !== undefined && values.duration !== undefined) {
    throw new Error("use --end or --duration, not both")
  }
  if (
    values.at !== undefined &&
    (values.start !== undefined || values.end !== undefined || values.duration !== undefined)
  ) {
    throw new Error("--at is absolute; do not combine it with --start, --end, or --duration")
  }
  if (values.frames !== undefined) {
    if (!Number.isInteger(values.frames) || values.frames < 1 || values.frames > 200) {
      throw new Error("--frames must be an integer from 1 to 200")
    }
    if (values.at !== undefined && values.frames !== 1) {
      throw new Error("--at extracts one frame; do not combine it with --frames > 1")
    }
  }
  for (const key of ["start", "end", "duration", "at"]) {
    if (values[key] !== undefined) parseTime(values[key])
  }
  if (isFrameMode(values)) {
    if (inputKind !== "video") throw new Error("frame extraction requires a video input")
    const format = values.to ? String(values.to).replace(/^\./, "") : "jpg"
    if (!FRAME_FORMATS.has(format)) {
      throw new Error("frame extraction supports jpg, png, or webp output")
    }
    return { mode: "frames", format }
  }
  if (!values.to) throw new Error("--to is required for media conversion")
  if (!outputKind) throw new Error(`unsupported media target: ${values.to}`)
  if (outputKind === "image" && String(values.to).toLowerCase() !== "gif") {
    throw new Error("use --at or --frames to produce an image")
  }
  if (inputKind === "audio" && outputKind !== "audio") {
    throw new Error("audio input can only produce audio output")
  }
  if (values.rotate !== undefined && !ROTATIONS.has(Number(values.rotate))) {
    throw new Error("--rotate must be 90, 180, or 270")
  }
  if (values.scale && !/^-?\d+:-?\d+$/.test(String(values.scale))) {
    throw new Error("--scale must be WIDTH:HEIGHT, for example 1280:-2")
  }
  if (values.crop && !/^\d+:\d+:\d+:\d+$/.test(String(values.crop))) {
    throw new Error("--crop must be WIDTH:HEIGHT:X:Y")
  }
  if (
    values.fps !== undefined &&
    (!(Number(values.fps) > 0) || !Number.isFinite(Number(values.fps)))
  ) {
    throw new Error("--fps must be a positive number")
  }
  if (
    values.volume !== undefined &&
    (!Number.isFinite(Number(values.volume)) || Number(values.volume) < 0)
  ) {
    throw new Error("--volume must be a non-negative number")
  }
  if (
    values.crf !== undefined &&
    (!Number.isInteger(values.crf) || values.crf < 0 || values.crf > 63)
  ) {
    throw new Error("--crf must be an integer from 0 to 63")
  }
  if (
    values.sampleRate !== undefined &&
    (!Number.isInteger(values.sampleRate) || values.sampleRate <= 0)
  ) {
    throw new Error("--sample-rate must be a positive integer")
  }
  if (
    values.channels !== undefined &&
    (!Number.isInteger(values.channels) || values.channels <= 0)
  ) {
    throw new Error("--channels must be a positive integer")
  }
  if (outputKind === "audio") {
    for (const key of ["scale", "crop", "rotate", "fps", "mute", "codec", "crf", "preset"]) {
      if (values[key] !== undefined) throw new Error(`--${key} is not valid for audio output`)
    }
  }
  if (outputKind === "image") {
    for (const key of [
      "volume",
      "normalize",
      "audioCodec",
      "audioBitrate",
      "sampleRate",
      "channels",
    ]) {
      if (values[key] !== undefined) throw new Error(`--${key} is not valid for GIF output`)
    }
  }
  if (values.codec === "copy" && (values.scale || values.crop || values.rotate || values.fps)) {
    throw new Error("--codec copy cannot be combined with video filters")
  }
  if (values.audioCodec === "copy" && (values.volume !== undefined || values.normalize)) {
    throw new Error("--audio-codec copy cannot be combined with audio filters")
  }
  return { mode: "convert" }
}
