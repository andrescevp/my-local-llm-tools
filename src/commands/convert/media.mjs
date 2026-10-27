import { basename, extname, join } from "node:path"

import { runCommand } from "../../lib/exec.mjs"

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "m4v",
  "mov",
  "mkv",
  "webm",
  "avi",
  "mpg",
  "mpeg",
  "ts",
  "flv",
  "wmv",
  "gif",
])
const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "flac",
  "ogg",
  "opus",
  "m4a",
  "aac",
  "wma",
  "aiff",
  "alac",
  "ac3",
  "caf",
])
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"])
const FRAME_FORMATS = new Set(["jpg", "jpeg", "png", "webp"])
const MEDIA_OPTIONS = [
  "start",
  "end",
  "duration",
  "frames",
  "at",
  "scale",
  "crop",
  "rotate",
  "fps",
  "mute",
  "volume",
  "normalize",
  "codec",
  "audioCodec",
  "crf",
  "preset",
  "bitrate",
  "audioBitrate",
  "sampleRate",
  "channels",
]

function extension(value) {
  return extname(String(value)).slice(1).toLowerCase()
}

export function mediaKind(path) {
  const ext = extension(path)
  if (VIDEO_EXTENSIONS.has(ext)) return "video"
  if (AUDIO_EXTENSIONS.has(ext)) return "audio"
  if (IMAGE_EXTENSIONS.has(ext)) return "image"
  return ""
}

export function mediaOutputKind(format) {
  const ext = String(format ?? "")
    .replace(/^\./, "")
    .toLowerCase()
  if (ext === "gif") return "image"
  if (AUDIO_EXTENSIONS.has(ext)) return "audio"
  if (IMAGE_EXTENSIONS.has(ext)) return "image"
  if (VIDEO_EXTENSIONS.has(ext)) return "video"
  return ""
}

export function hasMediaOptions(values) {
  return MEDIA_OPTIONS.some((key) => values[key] !== undefined)
}

export function isFrameMode(values) {
  return values.frames !== undefined || values.at !== undefined
}

export function parseTime(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value
  const text = String(value ?? "").trim()
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text)
  const parts = text.split(":")
  if (parts.length < 2 || parts.length > 3) throw new Error(`invalid time: ${value}`)
  const numbers = parts.map(Number)
  if (numbers.some((part) => !Number.isFinite(part) || part < 0)) {
    throw new Error(`invalid time: ${value}`)
  }
  return numbers.reduce((total, part) => total * 60 + part, 0)
}

export function sampleTimestamps(start, end, count) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("invalid time range")
  const total = end - start
  if (!(total > 0)) return [start]
  const frames = Math.max(1, Math.min(Number(count) || 1, 200))
  return Array.from({ length: frames }, (_, index) =>
    Number((start + (total * (index + 0.5)) / frames).toFixed(3)),
  )
}

export function frameDir(input, outDir) {
  return join(outDir, `${basename(input, extname(input))}-frames`)
}

function rotateFilter(value) {
  const degrees = Number(value)
  if (degrees === 90) return "transpose=1"
  if (degrees === 180) return "hflip,vflip"
  if (degrees === 270) return "transpose=2"
  throw new Error("--rotate must be 90, 180, or 270")
}

export function buildMediaArgs({ input, output, outputKind, values }) {
  const args = ["-hide_banner", "-loglevel", "error", "-n"]
  const start = values.start !== undefined ? parseTime(values.start) : 0
  let duration = null
  if (values.end !== undefined && values.duration !== undefined) {
    throw new Error("use --end or --duration, not both")
  }
  if (values.end !== undefined) duration = parseTime(values.end) - start
  else if (values.duration !== undefined) duration = parseTime(values.duration)
  if (duration !== null && duration <= 0) throw new Error("duration must be positive")
  if (values.start !== undefined) args.push("-ss", String(values.start))
  args.push("-i", input)
  if (duration !== null) args.push("-t", String(duration))

  if (outputKind === "audio") args.push("-vn")
  else if (values.mute || outputKind === "image") args.push("-an")

  const videoFilters = []
  if (outputKind !== "audio") {
    if (values.scale) videoFilters.push(`scale=${values.scale}`)
    if (values.crop) videoFilters.push(`crop=${values.crop}`)
    if (values.rotate !== undefined) videoFilters.push(rotateFilter(values.rotate))
    if (values.fps !== undefined) videoFilters.push(`fps=${values.fps}`)
  }
  if (videoFilters.length) args.push("-vf", videoFilters.join(","))

  const audioFilters = []
  if (outputKind !== "image" && !values.mute) {
    if (values.volume !== undefined) audioFilters.push(`volume=${values.volume}`)
    if (values.normalize) audioFilters.push("loudnorm=I=-16:TP=-1.5:LRA=11")
  }
  if (audioFilters.length) args.push("-af", audioFilters.join(","))

  if (outputKind !== "audio" && values.codec) args.push("-c:v", String(values.codec))
  if (outputKind !== "image" && values.audioCodec && !values.mute) {
    args.push("-c:a", String(values.audioCodec))
  }
  if (outputKind !== "audio" && values.crf !== undefined) args.push("-crf", String(values.crf))
  if (outputKind !== "audio" && values.preset) args.push("-preset", String(values.preset))
  if (outputKind === "audio") {
    const bitrate = values.audioBitrate ?? values.bitrate
    if (bitrate) args.push("-b:a", String(bitrate))
  } else if (outputKind === "video" && values.bitrate) {
    args.push("-b:v", String(values.bitrate))
  }
  if (outputKind === "video" && values.audioBitrate && !values.mute) {
    args.push("-b:a", String(values.audioBitrate))
  }
  if (outputKind !== "image" && !values.mute) {
    if (values.sampleRate !== undefined) args.push("-ar", String(values.sampleRate))
    if (values.channels !== undefined) args.push("-ac", String(values.channels))
  }
  if (outputKind === "image" && extension(output) === "gif") args.push("-loop", "0")
  if (outputKind === "video") {
    const ext = extension(output)
    if (["mp4", "m4v", "mov"].includes(ext)) args.push("-movflags", "+faststart")
  }
  args.push(output)
  return args
}

export function buildFrameArgs({ input, output, timestamp }) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-n",
    "-ss",
    String(timestamp),
    "-i",
    input,
    "-frames:v",
    "1",
    output,
  ]
}

export function probeDuration(input, run = runCommand) {
  const result = run(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", input],
    { timeout: 30000 },
  )
  const duration = Number.parseFloat(`${result.stdout ?? ""}`.trim())
  if (result.status !== 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe could not read a duration from ${input}`)
  }
  return duration
}
