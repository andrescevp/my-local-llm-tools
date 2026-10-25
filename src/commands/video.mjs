import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, isAbsolute, join } from "node:path"

import { parseFlags } from "../lib/args.mjs"
import { hasCommand } from "../lib/exec.mjs"
import {
  callOllama,
  cleanResponse,
  DEFAULT_MODEL,
  DEFAULT_OLLAMA,
  encodeImage,
  runWithFallback,
} from "../lib/vision.mjs"

const DEFAULT_PROMPT =
  "Describe this video frame in detail: subjects, actions, setting, " +
  "on-screen text, and any notable changes. Be concise and objective."
const SUMMARY_PROMPT =
  "Summarize this video from its frame descriptions. Give a chronological " +
  "summary, the main subjects and actions, and any visible text. Be concise."

const SPEC = {
  "--input": { key: "input" },
  "--model": { key: "model" },
  "--frames": { key: "frames", type: "int" },
  "--prompt": { key: "prompt" },
  "--summary": { key: "summary", type: "boolean" },
  "--keep-frames": { key: "keepFrames" },
  "--ollama-url": { key: "ollamaUrl" },
  "--format": { key: "format" },
  "--timeout": { key: "timeout", type: "int" },
}

export const VIDEO_HELP = `Usage: node src/cli.mjs video --input PATH [options]

Options:
  --input PATH       Absolute video file (required)
  --model NAME       Ollama vision model (default: ${DEFAULT_MODEL})
  --frames N         Frames to sample, 1-24 (default: 6)
  --prompt TEXT      Per-frame instruction prompt
  --summary          Add a chronological summary of all frames
  --keep-frames DIR  Save extracted frames instead of using a temp dir
  --ollama-url URL   Ollama base URL (default: ${DEFAULT_OLLAMA})
  --format FORMAT    markdown | json | raw (default: markdown)
  --timeout SECONDS  Per-frame request timeout (default: 180)
`

function hasBinary(name) {
  return hasCommand(name)
}

export function planTimestamps(duration, frames) {
  if (!Number.isFinite(duration) || duration <= 0) return [0]
  const count = Math.min(Math.max(frames || 1, 1), 24)
  return Array.from({ length: count }, (_, index) =>
    Number(((duration * (index + 0.5)) / count).toFixed(3)),
  )
}

export function formatVideoOutput(report, format) {
  if (format === "json") return JSON.stringify(report, null, 2)
  if (format === "raw") return report.frames.map((frame) => frame.description).join("\n\n")
  const lines = [
    `# ${report.file}`,
    "",
    `Duration: ${report.duration.toFixed(2)}s · Frames: ${report.frames.length} · Model: ${report.model}`,
    "",
  ]
  for (const frame of report.frames) {
    lines.push(`## ${frame.timestamp.toFixed(2)}s`, "", frame.description, "")
  }
  if (report.summary) lines.push("## Summary", "", report.summary, "")
  return lines.join("\n").trim()
}

function probeDuration(input) {
  const proc = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", input],
    { encoding: "utf8" },
  )
  const duration = Number.parseFloat(proc.stdout?.trim() ?? "")
  if (proc.status !== 0 || Number.isNaN(duration)) {
    throw new Error(`ffprobe could not read a duration from ${input}`)
  }
  return duration
}

function extractFrame(input, timestamp, output) {
  const proc = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(timestamp),
      "-i",
      input,
      "-frames:v",
      "1",
      "-y",
      output,
    ],
    { encoding: "utf8" },
  )
  return proc.status === 0 && existsSync(output)
}

async function describeFrames(input, timestamps, options, workDir) {
  const frames = []
  for (const [index, timestamp] of timestamps.entries()) {
    const file = join(workDir, `frame-${String(index + 1).padStart(3, "0")}.png`)
    if (!extractFrame(input, timestamp, file)) {
      process.stderr.write(`WARN: could not extract a frame at ${timestamp}s\n`)
      continue
    }
    const frame = await runWithFallback({
      ollamaUrl: options.ollamaUrl,
      model: options.model,
      prompt: options.prompt,
      encodedImages: [encodeImage(file)],
      timeout: options.timeout,
    })
    frames.push({ timestamp, description: cleanResponse(frame.response) })
  }
  return frames
}

async function summarize(frames, options) {
  const descriptions = frames
    .map((frame) => `[${frame.timestamp.toFixed(2)}s] ${frame.description}`)
    .join("\n")
  const result = await callOllama({
    ollamaUrl: options.ollamaUrl,
    model: options.model,
    prompt: `${SUMMARY_PROMPT}\n\n${descriptions}`,
    encodedImages: [],
    timeout: options.timeout,
  })
  return cleanResponse(result.response)
}

export async function video(argv) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(VIDEO_HELP)
    return 0
  }
  let values
  try {
    values = parseFlags(argv, SPEC).values
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${VIDEO_HELP}`)
    return 2
  }
  if (!values.input) {
    process.stderr.write(VIDEO_HELP)
    return 2
  }
  if (!isAbsolute(values.input)) {
    process.stderr.write("ERROR: video path must be absolute\n")
    return 1
  }
  try {
    if (!statSync(values.input).isFile()) throw new Error("not a file")
  } catch {
    process.stderr.write(`ERROR: video not found: ${values.input}\n`)
    return 1
  }
  if (!hasBinary("ffmpeg") || !hasBinary("ffprobe")) {
    process.stderr.write("ERROR: ffmpeg/ffprobe not found (sudo pacman -S ffmpeg)\n")
    return 1
  }

  const options = {
    model: values.model ?? DEFAULT_MODEL,
    ollamaUrl: values.ollamaUrl ?? DEFAULT_OLLAMA,
    prompt: values.prompt ?? DEFAULT_PROMPT,
    timeout: values.timeout ?? 180,
    frames: values.frames ?? 6,
  }
  const temp = values.keepFrames ? null : mkdtempSync(join(tmpdir(), "video-analysis-"))
  const workDir = values.keepFrames ?? temp
  mkdirSync(workDir, { recursive: true })

  try {
    const duration = probeDuration(values.input)
    const timestamps = planTimestamps(duration, options.frames)
    const frames = await describeFrames(values.input, timestamps, options, workDir)
    if (!frames.length) throw new Error("no frames could be extracted")
    const report = {
      file: basename(values.input),
      path: values.input,
      duration,
      model: options.model,
      frames,
      summary: values.summary ? await summarize(frames, options) : "",
    }
    console.log(formatVideoOutput(report, values.format ?? "markdown"))
    if (values.keepFrames) console.log(`\nframes saved to ${values.keepFrames}`)
    return 0
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`)
    return 1
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true })
  }
}
