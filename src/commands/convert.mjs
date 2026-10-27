import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join, resolve } from "node:path"

import { parseFlags } from "../lib/args.mjs"
import { runCommand } from "../lib/exec.mjs"
import { buildConvertArgs, probeLibreOffice, resolveLibreOffice } from "../lib/libreoffice.mjs"
import { imageKind } from "./convert/image.mjs"
import { convertImages } from "./convert/image-run.mjs"
import { hasMediaOptions, mediaKind, mediaOutputKind } from "./convert/media.mjs"
import { convertMedia } from "./convert/media-run.mjs"

const SPEC = {
  "--input": { key: "input", list: true },
  "--to": { key: "to" },
  "--out": { key: "out" },
  "--filter": { key: "filter" },
  "--timeout": { key: "timeout", type: "int" },
  "--start": { key: "start" },
  "--end": { key: "end" },
  "--duration": { key: "duration" },
  "--frames": { key: "frames", type: "int" },
  "--at": { key: "at" },
  "--scale": { key: "scale" },
  "--crop": { key: "crop" },
  "--rotate": { key: "rotate", type: "int" },
  "--fps": { key: "fps", type: "number" },
  "--mute": { key: "mute", type: "boolean" },
  "--volume": { key: "volume", type: "number" },
  "--normalize": { key: "normalize", type: "boolean" },
  "--codec": { key: "codec" },
  "--audio-codec": { key: "audioCodec" },
  "--crf": { key: "crf", type: "int" },
  "--preset": { key: "preset" },
  "--bitrate": { key: "bitrate" },
  "--audio-bitrate": { key: "audioBitrate" },
  "--sample-rate": { key: "sampleRate", type: "int" },
  "--channels": { key: "channels", type: "int" },
  "--resize": { key: "resize" },
  "--flip": { key: "flip" },
  "--grayscale": { key: "grayscale", type: "boolean" },
  "--quality": { key: "quality", type: "int" },
  "--strip": { key: "strip", type: "boolean" },
  "--background": { key: "background" },
  "--auto-orient": { key: "autoOrient", type: "boolean" },
  "--trim": { key: "trim", type: "boolean" },
}

export const CONVERT_HELP = `Usage: node src/cli.mjs convert --input FILE [--input FILE...] (--to FORMAT | --frames N | --at TIME) [options]

Documents (LibreOffice):
  --filter NAME      LibreOffice export filter name

Images (ImageMagick):
  --to FORMAT        Target: jpg, png, webp, tiff, bmp, gif, avif, pdf
  --resize WxH       Resize an image, for example 800x600
  --crop WxH+X+Y     Crop an image
  --rotate DEGREES   Rotate an image
  --flip horizontal|vertical
  --grayscale        Convert to grayscale
  --quality N        JPEG/WebP quality (1-100)
  --strip            Remove image metadata
  --background COLOR Flatten transparency onto a color
  --auto-orient      Apply EXIF orientation
  --trim             Trim uniform borders

Media (ffmpeg):
  --to FORMAT        Target extension: mp4, webm, mp3, wav, flac, gif, ...
  --frames N         Extract N evenly spaced frames (1-200)
  --at TIME          Extract one frame at an absolute time
  --start TIME       Start time (seconds or HH:MM:SS)
  --end TIME         End time (absolute)
  --duration TIME    Duration from start
  --scale W:H        Resize video, for example 1280:-2
  --crop W:H:X:Y     Crop video
  --rotate DEGREES   90, 180, or 270
  --fps N            Output video frame rate
  --mute             Remove audio from video
  --volume FACTOR    Audio gain, for example 1.5
  --normalize        Loudness-normalize audio
  --codec NAME       Video codec
  --audio-codec NAME Audio codec
  --crf N            Video quality (lower is better)
  --preset NAME      Encoder preset
  --bitrate RATE     Video bitrate, or audio bitrate for audio output
  --audio-bitrate RATE Audio bitrate in video output
  --sample-rate HZ   Audio sample rate
  --channels N       Audio channel count

Common:
  --input PATH       Input file (repeatable, required)
  --out DIR          Output directory (default: input directory)
  --timeout SECONDS  Timeout (default: 120 documents, 600 media)
  -h, --help         Show this help
`

function targetPath(input, outDir, to) {
  return join(outDir, `${basename(input, extname(input))}.${to}`)
}

export function convert(
  argv,
  {
    run = runCommand,
    resolveOffice = resolveLibreOffice,
    probe = probeLibreOffice,
    mkdtemp = mkdtempSync,
    remove = rmSync,
    log = console.log,
    warn = console.warn,
  } = {},
) {
  if (argv.includes("-h") || argv.includes("--help")) {
    log(CONVERT_HELP)
    return 0
  }

  let values
  try {
    values = parseFlags(argv, SPEC).values
  } catch (error) {
    warn(`${error.message}\n\n${CONVERT_HELP}`)
    return 2
  }

  if (!values.input?.length) {
    warn(CONVERT_HELP)
    return 2
  }
  if (values.to) values.to = values.to.replace(/^\./, "").toLowerCase()
  const image = values.input.some((raw) => Boolean(imageKind(raw)))
  if (image) {
    return convertImages(values, {
      run,
      log,
      warn,
      timeout: (values.timeout ?? 120) * 1000,
    })
  }
  const media = values.input.some((raw) => Boolean(mediaKind(raw))) || hasMediaOptions(values)
  if (media) {
    if (values.filter) {
      warn("ERROR: --filter is LibreOffice-only; remove it for media conversions")
      return 2
    }
    return convertMedia(values, {
      run,
      log,
      warn,
      timeout: (values.timeout ?? 600) * 1000,
    })
  }
  if (values.to && mediaOutputKind(values.to)) {
    warn("ERROR: media targets require an audio or video input")
    return 2
  }
  if (
    ["resize", "flip", "grayscale", "quality", "strip", "background", "autoOrient", "trim"].some(
      (key) => values[key] !== undefined,
    )
  ) {
    warn("ERROR: image options require an image input")
    return 2
  }
  if (!values.to) {
    warn(CONVERT_HELP)
    return 2
  }

  const office = resolveOffice()
  if (!office.ok) {
    warn(`ERROR: ${office.error}`)
    warn("Run: node src/cli.mjs setup --install")
    return 3
  }
  const probed = probe(office.path)
  if (!probed.ok) {
    warn(`ERROR: LibreOffice at ${office.path} is not runnable: ${probed.error}`)
    return 3
  }

  const timeout = (values.timeout ?? 120) * 1000
  for (const raw of values.input) {
    const input = resolve(raw)
    if (!existsSync(input) || !statSync(input).isFile()) {
      warn(`ERROR: input not found: ${input}`)
      return 2
    }
    const outDir = values.out ? resolve(values.out) : dirname(input)
    mkdirSync(outDir, { recursive: true })
    const expected = targetPath(input, outDir, values.to)
    if (existsSync(expected)) {
      warn(`ERROR: output already exists: ${expected}`)
      return 2
    }

    const profile = mkdtemp(join(tmpdir(), "mllt-lo-profile-"))
    try {
      const filter = values.filter ? `${values.to}:${values.filter}` : values.to
      const result = run(
        office.path,
        buildConvertArgs({ filter, outDir, profileDir: profile, input }),
        {
          timeout,
        },
      )
      if (result.status !== 0) {
        warn(`ERROR: LibreOffice failed for ${input}`)
        warn(`${result.stderr ?? ""}`.trim())
        return 4
      }
      if (!existsSync(expected) || statSync(expected).size === 0) {
        warn(`ERROR: LibreOffice produced no output for ${input}`)
        return 4
      }
      log(`Converted: ${input} -> ${expected}`)
    } finally {
      remove(profile, { recursive: true, force: true })
    }
  }
  return 0
}
