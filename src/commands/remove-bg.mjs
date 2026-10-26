import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import sharp from "sharp"

import { parseFlags } from "../lib/args.mjs"
import { gimp } from "./gimp.mjs"
import {
  alphaBounds,
  applyAlpha,
  centerOnCanvas,
  cropRgba,
  maskToAlpha,
  padRgba,
} from "./remove-bg/composite.mjs"
import { resizeMask, resolveModel, runModel } from "./remove-bg/model.mjs"

const SPEC = {
  "--input": { key: "input" },
  "--output": { key: "output" },
  "--out-dir": { key: "outDir" },
  "--padding": { key: "padding", type: "int" },
  "--canvas-size": { key: "canvasSize", type: "int" },
  "--threshold": { key: "threshold", type: "number" },
  "--variants": { key: "variants", type: "int" },
  "--pick": { key: "pick", type: "int" },
  "--gimp-refine": { key: "gimpRefine", type: "boolean" },
  "--model": { key: "model" },
  "--force": { key: "force", type: "boolean" },
  "--timeout": { key: "timeout", type: "int" },
}

export const REMOVE_BG_HELP = `Usage: node src/cli.mjs remove-bg --input FILE (--output FILE | --out-dir DIR) [options]

Options:
  --padding N        Transparent padding (default: 20)
  --canvas-size N    Center on a square canvas of this size
  --threshold N      Alpha threshold (default: 0.5)
  --variants N       Emit N candidates with soft/balanced/hard masks
  --pick N           Copy candidate N to --output
  --gimp-refine      Mild GIMP blur refinement
  --model PATH       U2Net ONNX model (default: ~/.mllt/models/u2net.onnx)
  --force            Overwrite output
  --timeout SECONDS  GIMP timeout
`

function alphaFor(mask, mode, threshold, width, height) {
  if (mode === "soft") return Uint8Array.from(mask, (value) => Math.round(value * 255))
  return maskToAlpha(mask, width, height, {
    threshold,
    softness: mode === "balanced" ? 0.15 : 0,
  })
}

function compose(rgba, width, height, mask, options) {
  const alpha = alphaFor(mask, options.mode, options.threshold, width, height)
  const composited = applyAlpha(rgba, alpha)
  const bounds = alphaBounds(alpha, width, height)
  const cropped = cropRgba(composited, width, height, bounds)
  const padded = padRgba(cropped.buffer, cropped.width, cropped.height, options.padding)
  return options.canvasSize
    ? centerOnCanvas(padded.buffer, padded.width, padded.height, options.canvasSize)
    : padded
}

async function writePng(buffer, width, height, path) {
  await sharp(buffer, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(path)
}

function refine(path, values) {
  const args = ["blur", "--input", path, "--output", path, "--radius", "0.3", "--force"]
  if (values.timeout) args.push("--timeout", String(values.timeout))
  return gimp(args, { log: () => {}, warn: () => {} }) === 0
}

export async function removeBg(argv, { log = console.log, warn = console.warn } = {}) {
  if (argv.includes("-h") || argv.includes("--help")) {
    log(REMOVE_BG_HELP)
    return 0
  }
  let values
  try {
    values = parseFlags(argv, SPEC).values
  } catch (error) {
    warn(`${error.message}\n\n${REMOVE_BG_HELP}`)
    return 2
  }
  if (!values.input || (!values.output && !values.outDir)) {
    warn(REMOVE_BG_HELP)
    return 2
  }
  const input = resolve(values.input)
  if (!existsSync(input)) {
    warn(`ERROR: input not found: ${input}`)
    return 2
  }
  const model = resolveModel({ path: values.model })
  if (!model.ok) {
    warn(`ERROR: ${model.error}`)
    warn("Run: node src/cli.mjs setup --install")
    return 3
  }

  const padding = values.padding ?? 20
  const threshold = values.threshold ?? 0.5
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const mask320 = await runModel(model.path, input)
  const mask = await resizeMask(mask320, image.info.width, image.info.height)

  const modes = ["soft", "balanced", "hard"]
  const variants = Math.max(1, values.variants ?? 1)
  if (variants === 1) {
    const output = resolve(values.output)
    if (existsSync(output) && !values.force) {
      warn(`ERROR: output already exists: ${output} (use --force)`)
      return 2
    }
    mkdirSync(dirname(output), { recursive: true })
    const result = compose(image.data, image.info.width, image.info.height, mask, {
      mode: "balanced",
      threshold,
      padding,
      canvasSize: values.canvasSize,
    })
    await writePng(result.buffer, result.width, result.height, output)
    if (values.gimpRefine && !refine(output, values)) {
      warn("WARN: GIMP refinement failed")
    }
    log(`Created: ${output}`)
    return 0
  }

  const outDir = resolve(values.outDir)
  mkdirSync(outDir, { recursive: true })
  const candidates = []
  for (let index = 0; index < variants; index += 1) {
    const candidate = join(outDir, `candidate-${index + 1}.png`)
    const result = compose(image.data, image.info.width, image.info.height, mask, {
      mode: modes[index % modes.length],
      threshold,
      padding,
      canvasSize: values.canvasSize,
    })
    await writePng(result.buffer, result.width, result.height, candidate)
    if (values.gimpRefine) refine(candidate, values)
    candidates.push({
      index: index + 1,
      path: candidate,
      params: {
        mode: modes[index % modes.length],
        threshold,
        padding,
        canvasSize: values.canvasSize ?? null,
      },
    })
  }
  writeFileSync(
    join(outDir, "candidates.json"),
    `${JSON.stringify({ operation: "remove-bg", input, model: model.path, candidates }, null, 2)}\n`,
  )
  log(join(outDir, "candidates.json"))
  if (values.pick) {
    const selected = candidates.find((candidate) => candidate.index === values.pick)
    if (!selected || !values.output) {
      warn("ERROR: --pick N requires a valid candidate and --output")
      return 2
    }
    mkdirSync(dirname(resolve(values.output)), { recursive: true })
    copyFileSync(selected.path, resolve(values.output))
    log(`Picked: ${resolve(values.output)}`)
  }
  if (!values.pick && values.output) {
    warn("WARN: --output ignored without --pick when using --variants")
  }
  return candidates.length && candidates.every((candidate) => statSync(candidate.path).size > 0)
    ? 0
    : 4
}
