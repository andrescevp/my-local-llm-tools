import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, extname, join, resolve } from "node:path"

import { hasCommand, runCommand } from "../../lib/exec.mjs"
import {
  buildFrameArgs,
  buildMediaArgs,
  frameDir,
  isFrameMode,
  mediaKind,
  mediaOutputKind,
  parseTime,
  probeDuration,
  sampleTimestamps,
} from "./media.mjs"
import { validateMediaRequest } from "./media-validate.mjs"

function targetPath(input, outDir, to) {
  return join(outDir, `${basename(input, extname(input))}.${to}`)
}

function convertMediaFile(input, outputKind, values, { run, log, warn, timeout }) {
  const outDir = values.out ? resolve(values.out) : dirname(input)
  mkdirSync(outDir, { recursive: true })
  const expected = targetPath(input, outDir, values.to)
  if (existsSync(expected)) {
    warn(`ERROR: output already exists: ${expected}`)
    return 2
  }

  let args
  try {
    args = buildMediaArgs({
      input,
      output: expected,
      outputKind,
      values,
    })
  } catch (error) {
    warn(`ERROR: ${error.message}`)
    return 2
  }

  const result = run("ffmpeg", args, { timeout })
  if (result.status !== 0) {
    warn(`ERROR: ffmpeg failed for ${input}`)
    warn(`${result.stderr ?? ""}`.trim())
    return 4
  }
  if (!existsSync(expected) || statSync(expected).size === 0) {
    warn(`ERROR: ffmpeg produced no output for ${input}`)
    return 4
  }
  log(`Converted: ${input} -> ${expected}`)
  return 0
}

function extractFrames(input, values, format, { run, log, warn, timeout }) {
  const duration = probeDuration(input, run)
  const start = values.start !== undefined ? parseTime(values.start) : 0
  const at = values.at !== undefined ? parseTime(values.at) : null
  let end = duration
  if (at === null) {
    if (values.end !== undefined) end = parseTime(values.end)
    else if (values.duration !== undefined) end = start + parseTime(values.duration)
    if (!(end > start)) throw new Error("frame range end must be after start")
  }
  const timestamps = at === null ? sampleTimestamps(start, end, values.frames) : [at]
  const outDir = values.out ? resolve(values.out) : dirname(input)
  const dir = frameDir(input, outDir)
  if (existsSync(dir)) {
    if (readdirSync(dir).length) {
      warn(`ERROR: output directory is not empty: ${dir}`)
      return 2
    }
  } else {
    mkdirSync(dir, { recursive: true })
  }

  for (const [index, timestamp] of timestamps.entries()) {
    const target = join(dir, `frame-${String(index + 1).padStart(3, "0")}.${format}`)
    if (existsSync(target)) {
      warn(`ERROR: output already exists: ${target}`)
      return 2
    }
    const result = run("ffmpeg", buildFrameArgs({ input, output: target, timestamp }), {
      timeout,
    })
    if (result.status !== 0 || !existsSync(target) || statSync(target).size === 0) {
      warn(`ERROR: ffmpeg failed to extract a frame at ${timestamp}s from ${input}`)
      warn(`${result.stderr ?? ""}`.trim())
      return 4
    }
    log(`Extracted frame: ${input} @ ${timestamp}s -> ${target}`)
  }
  log(`Frames: ${timestamps.length} -> ${dir}`)
  return 0
}

export function convertMedia(
  values,
  { run = runCommand, log = console.log, warn = console.warn, hasBinary = hasCommand, timeout },
) {
  if (!hasBinary("ffmpeg")) {
    warn("ERROR: ffmpeg not found")
    warn("Run: node src/cli.mjs setup --install")
    return 3
  }
  if (isFrameMode(values) && !hasBinary("ffprobe")) {
    warn("ERROR: ffprobe not found")
    warn("Run: node src/cli.mjs setup --install")
    return 3
  }

  for (const raw of values.input) {
    const input = resolve(raw)
    if (!existsSync(input) || !statSync(input).isFile()) {
      warn(`ERROR: input not found: ${input}`)
      return 2
    }
    try {
      const inputKind = mediaKind(input)
      const outputKind = isFrameMode(values) ? "image" : mediaOutputKind(values.to)
      const request = validateMediaRequest({ inputKind, outputKind, values })
      const status =
        request.mode === "frames"
          ? extractFrames(input, values, request.format, { run, log, warn, timeout })
          : convertMediaFile(input, outputKind, values, { run, log, warn, timeout })
      if (status !== 0) return status
    } catch (error) {
      warn(`ERROR: ${error.message}`)
      return 2
    }
  }
  return 0
}
