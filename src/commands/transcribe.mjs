import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

import { parseFlags } from "../lib/args.mjs"
import { hasCommand, runCommand } from "../lib/exec.mjs"
import { mediaKind, probeDuration } from "./convert/media.mjs"
import {
  buildChunkArgs,
  buildExtractArgs,
  defaultOutputPath,
  formatTranscript,
  planChunks,
} from "./transcribe/plan.mjs"

const SPEC = {
  "--input": { key: "input" },
  "--out": { key: "out" },
  "--format": { key: "format" },
  "--language": { key: "language" },
  "--chunk-seconds": { key: "chunkSeconds", type: "int" },
  "--timeout": { key: "timeout", type: "int" },
  "--keep-audio": { key: "keepAudio" },
  "--clean": { key: "clean", type: "boolean" },
}

export const TRANSCRIBE_HELP = `Usage: node src/cli.mjs transcribe --input PATH [options]

Transcribe an audio or video file with the local hyprwhspr backend. Video input
is converted to mono 16 kHz WAV first. Long recordings are split into sequential
chunks (default: 300 seconds) and transcribed one at a time.

Options:
  --input PATH        Audio or video file (required)
  --out PATH          Transcript path (default: <input>.transcript.md)
  --format FORMAT     md | txt | json (default: md, or inferred from --out)
  --language CODE     Language hint passed to hyprwhspr (for example en, es)
  --chunk-seconds N   Chunk size in seconds (default: 300, range: 30-1800)
  --timeout SECONDS   Timeout per chunk (default: 600)
  --keep-audio DIR    Keep extracted WAV and chunks in DIR
  --clean             Apply hyprwhspr's configured text cleanup
  -h, --help          Show this help
`

function fail(warn, message, code = 2) {
  warn(`ERROR: ${message}`)
  return code
}

function extractAudio(input, output, { run, timeout, warn }) {
  const result = run("ffmpeg", buildExtractArgs({ input, output }), { timeout })
  if (result.status !== 0 || !existsSync(output) || statSync(output).size === 0) {
    warn(`ERROR: ffmpeg could not extract audio from ${input}`)
    warn(`${result.stderr ?? ""}`.trim())
    return false
  }
  return true
}

function transcribeChunk(chunk, { run, timeout, warn, language, clean }) {
  const args = ["transcribe", chunk]
  if (language) args.push("--lang", language)
  if (clean) args.push("--clean")
  const result = run("hyprwhspr", args, { timeout })
  if (result.status !== 0) {
    warn(`ERROR: hyprwhspr failed for ${chunk}`)
    const stderr = `${result.stderr ?? ""}`.trim()
    warn(stderr)
    if (/soundfile/i.test(stderr)) warn("Run: hyprwhspr setup (missing audio dependency)")
    return null
  }
  const text = `${result.stdout ?? ""}`.trim()
  if (!text) {
    warn(`ERROR: hyprwhspr produced no text for ${chunk}`)
    return null
  }
  return text
}

export function transcribe(
  argv,
  { run = runCommand, log = console.log, warn = console.warn, hasBinary = hasCommand } = {},
) {
  if (argv.includes("-h") || argv.includes("--help")) {
    log(TRANSCRIBE_HELP)
    return 0
  }

  let values
  try {
    values = parseFlags(argv, SPEC).values
  } catch (error) {
    warn(`${error.message}\n\n${TRANSCRIBE_HELP}`)
    return 2
  }
  if (!values.input) {
    warn(TRANSCRIBE_HELP)
    return 2
  }

  const input = resolve(values.input)
  if (!existsSync(input) || !statSync(input).isFile()) {
    return fail(warn, `input not found: ${input}`)
  }
  if (!["audio", "video"].includes(mediaKind(input))) {
    return fail(warn, "input must be an audio or video file")
  }
  for (const binary of ["ffmpeg", "ffprobe", "hyprwhspr"]) {
    if (!hasBinary(binary)) {
      return fail(warn, `${binary} not found; run setup or install it`, 3)
    }
  }

  const chunkSeconds = values.chunkSeconds ?? 300
  if (chunkSeconds < 30 || chunkSeconds > 1800) {
    return fail(warn, "--chunk-seconds must be an integer from 30 to 1800")
  }
  const format =
    values.format ??
    (values.out?.endsWith(".json") ? "json" : values.out?.endsWith(".txt") ? "txt" : "md")
  if (!["md", "txt", "json"].includes(format)) {
    return fail(warn, "--format must be md, txt, or json")
  }

  const timeout = (values.timeout ?? 600) * 1000
  const keep = values.keepAudio ? resolve(values.keepAudio) : ""
  const workDir = keep || mkdtempSync(join(tmpdir(), "mllt-transcribe-"))
  mkdirSync(workDir, { recursive: true })
  const audio = join(workDir, "audio.wav")

  try {
    if (!extractAudio(input, audio, { run, timeout, warn })) return 4
    let duration
    try {
      duration = probeDuration(input, run)
    } catch (error) {
      return fail(warn, error.message, 4)
    }
    const chunks = planChunks(duration, chunkSeconds)
    if (!chunks.length) return fail(warn, "input contains no audio duration", 4)

    const result = []
    for (const chunk of chunks) {
      const chunkPath =
        chunks.length === 1
          ? audio
          : join(workDir, `chunk-${String(chunk.index + 1).padStart(3, "0")}.wav`)
      if (chunks.length > 1) {
        const extract = run(
          "ffmpeg",
          buildChunkArgs({ input: audio, output: chunkPath, start: chunk.start, end: chunk.end }),
          { timeout },
        )
        if (extract.status !== 0 || !existsSync(chunkPath)) {
          warn(`ERROR: ffmpeg could not split audio at ${chunk.start}s`)
          warn(`${extract.stderr ?? ""}`.trim())
          return 4
        }
      }
      log(`Transcribing chunk ${chunk.index + 1}/${chunks.length} (${chunk.start}-${chunk.end}s)`)
      const text = transcribeChunk(chunkPath, {
        run,
        timeout,
        warn,
        language: values.language,
        clean: values.clean,
      })
      if (text === null) return 4
      result.push({ start: chunk.start, end: chunk.end, text })
    }

    const output = values.out ? resolve(values.out) : defaultOutputPath(input, format)
    if (existsSync(output)) return fail(warn, `output already exists: ${output}`)
    mkdirSync(dirname(output), { recursive: true })
    const report = { source: input, duration, language: values.language, chunks: result }
    writeFileSync(output, `${formatTranscript(report, format)}\n`, "utf8")
    log(`Transcript: ${output}`)
    if (keep) log(`Audio kept: ${keep}`)
    return 0
  } finally {
    if (!keep) rmSync(workDir, { recursive: true, force: true })
  }
}
