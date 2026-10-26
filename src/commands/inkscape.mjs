import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import sharp from "sharp"

import { parseFlags } from "../lib/args.mjs"
import { commandPath, runCommand } from "../lib/exec.mjs"

const SPEC = {
  "--input": { key: "input" },
  "--output": { key: "output" },
  "--dpi": { key: "dpi", type: "number" },
  "--page": { key: "page", type: "int" },
  "--area": { key: "area" },
  "--id": { key: "id" },
  "--width": { key: "width", type: "int" },
  "--height": { key: "height", type: "int" },
  "--background": { key: "background" },
  "--background-opacity": { key: "backgroundOpacity", type: "number" },
  "--rotate": { key: "rotate" },
  "--flip": { key: "flip" },
  "--to-path": { key: "toPath", type: "boolean" },
  "--text-to-path": { key: "textToPath", type: "boolean" },
  "--fit-canvas": { key: "fitCanvas" },
  "--threshold": { key: "threshold", type: "number" },
  "--turdsize": { key: "turdsize", type: "int" },
  "--alphamax": { key: "alphamax", type: "number" },
  "--opttolerance": { key: "opttolerance", type: "number" },
  "--variants": { key: "variants", type: "int" },
  "--out-dir": { key: "outDir" },
  "--pick": { key: "pick", type: "int" },
  "--json": { key: "json", type: "boolean" },
  "--force": { key: "force", type: "boolean" },
  "--timeout": { key: "timeout", type: "int" },
}

export const INKSCAPE_HELP = `Usage: node src/cli.mjs inkscape <command> [options]

Commands:
  export     SVG -> PNG/PDF/EPS/PS/EMF/WMF/ODG
  query      Geometry/object information
  clean      Plain SVG without editor metadata
  edit       Rotate/flip/to-path/fit-canvas (whitelisted)
  vectorize  Raster -> SVG with Potrace (single colour)

Options:
  --input FILE --output FILE
  --dpi N --page N --area drawing|page|x0:y0:x1:y1 --id ID
  --width N --height N --background HEX --background-opacity N
  --rotate 90|180|270 --flip h|v --to-path --text-to-path
  --fit-canvas drawing|selection
  --threshold N --turdsize N --alphamax N --opttolerance N
  --variants N --out-dir DIR --pick N
  --json --force --timeout SECONDS
`

function checkBinary(name, label) {
  const path = commandPath(name)
  return path ? { ok: true, path } : { ok: false, path: "", error: `${label} not found in PATH` }
}

function verify(path, warn) {
  if (!existsSync(path) || statSync(path).size === 0) {
    warn(`ERROR: no output produced: ${path}`)
    return false
  }
  return true
}

function exportArgs(values, input, output) {
  const args = [input, `--export-filename=${output}`]
  if (values.dpi) args.push(`--export-dpi=${values.dpi}`)
  if (values.page) args.push(`--export-page=${values.page}`)
  if (values.area) args.push(`--export-area=${values.area}`)
  if (values.id) args.push(`--export-id=${values.id}`, "--export-id-only")
  if (values.width) args.push(`--export-width=${values.width}`)
  if (values.height) args.push(`--export-height=${values.height}`)
  if (values.background) args.push(`--export-background=${values.background}`)
  if (values.backgroundOpacity !== undefined) {
    args.push(`--export-background-opacity=${values.backgroundOpacity}`)
  }
  return args
}

function editActions(values) {
  const actions = ["select-all"]
  if (values.rotate) {
    if (values.rotate === "180") actions.push("object-rotate-90-cw", "object-rotate-90-cw")
    else if (values.rotate === "270") actions.push("object-rotate-90-ccw")
    else actions.push("object-rotate-90-cw")
  }
  if (values.flip === "vertical") actions.push("object-flip-vertical")
  if (values.flip === "horizontal") actions.push("object-flip-horizontal")
  if (values.toPath || values.textToPath) actions.push("object-to-path")
  if (values.fitCanvas === "selection") actions.push("fit-canvas-to-selection")
  return actions
}

function parseQuery(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, x, y, width, height] = line.split(",")
      return { id, x: Number(x), y: Number(y), width: Number(width), height: Number(height) }
    })
}

async function vectorizeRaster(input, output, values, potrace, warn) {
  const image = sharp(input).greyscale()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
  const pgm = join(dirname(output), `.${Date.now()}-${process.pid}.pgm`)
  const header = Buffer.from(`P5\n${info.width} ${info.height}\n255\n`)
  writeFileSync(pgm, Buffer.concat([header, data]))
  try {
    const args = ["-s", "-k", String(values.threshold ?? 0.5), "-t", String(values.turdsize ?? 2)]
    if (values.alphamax !== undefined) args.push("-a", String(values.alphamax))
    if (values.opttolerance !== undefined) args.push("-O", String(values.opttolerance))
    args.push("-o", output, pgm)
    const result = runCommand(potrace, args, { timeout: (values.timeout ?? 120) * 1000 })
    if (result.status !== 0) {
      warn(`ERROR: potrace failed: ${`${result.stderr ?? ""}`.trim()}`)
      return false
    }
    return verify(output, warn)
  } finally {
    rmSync(pgm, { force: true })
  }
}

export async function inkscape(argv, { log = console.log, warn = console.warn } = {}) {
  if (argv.includes("-h") || argv.includes("--help")) {
    log(INKSCAPE_HELP)
    return 0
  }
  const [command, ...rest] = argv
  let values
  try {
    values = parseFlags(rest, SPEC).values
  } catch (error) {
    warn(`${error.message}\n\n${INKSCAPE_HELP}`)
    return 2
  }
  if (!values.input) {
    warn("ERROR: --input is required")
    return 2
  }
  const input = resolve(values.input)
  if (!existsSync(input)) {
    warn(`ERROR: input not found: ${input}`)
    return 2
  }
  const binary = checkBinary("inkscape", "Inkscape")
  if (!binary.ok) {
    warn(`ERROR: ${binary.error}`)
    return 3
  }

  if (command === "query") {
    const args = [input, "--query-all"]
    const result = runCommand(binary.path, args, { timeout: (values.timeout ?? 60) * 1000 })
    if (result.status !== 0) {
      warn(`ERROR: inkscape query failed: ${`${result.stderr ?? ""}`.trim()}`)
      return 4
    }
    const rows = parseQuery(result.stdout ?? "")
    log(
      values.json
        ? JSON.stringify(rows, null, 2)
        : rows.map((row) => `${row.id}: ${row.x},${row.y} ${row.width}x${row.height}`).join("\n"),
    )
    return 0
  }

  if (!values.output && !values.outDir) {
    warn("ERROR: --output or --out-dir is required")
    return 2
  }

  if (command === "export" || command === "clean" || command === "edit") {
    const output = resolve(values.output)
    if (existsSync(output) && !values.force) {
      warn(`ERROR: output already exists: ${output} (use --force)`)
      return 2
    }
    mkdirSync(dirname(output), { recursive: true })
    const args = [input]
    if (command === "clean") args.push("--export-plain-svg")
    if (command === "edit") args.push(`--actions=${editActions(values).join(";")}`)
    args.push(...exportArgs(values, input, output).slice(1))
    const result = runCommand(binary.path, args, { timeout: (values.timeout ?? 120) * 1000 })
    if (result.status !== 0) {
      warn(`ERROR: inkscape ${command} failed: ${`${result.stderr ?? ""}`.trim()}`)
      return 4
    }
    if (!verify(output, warn)) return 4
    log(`Created: ${output}`)
    return 0
  }

  if (command === "vectorize") {
    const potrace = checkBinary("potrace", "Potrace")
    if (!potrace.ok) {
      warn(`ERROR: ${potrace.error}`)
      return 3
    }
    const variants = Math.max(1, values.variants ?? 1)
    if (variants === 1) {
      const output = resolve(values.output ?? join(values.outDir, "candidate-1.svg"))
      if (existsSync(output) && !values.force) {
        warn(`ERROR: output already exists: ${output} (use --force)`)
        return 2
      }
      mkdirSync(dirname(output), { recursive: true })
      if (!(await vectorizeRaster(input, output, values, potrace.path, warn))) return 4
      log(`Created: ${output}`)
      return 0
    }
    const outDir = resolve(values.outDir)
    mkdirSync(outDir, { recursive: true })
    const candidates = []
    const thresholds = [0.35, 0.5, 0.65]
    for (let index = 0; index < variants; index += 1) {
      const candidate = join(outDir, `candidate-${index + 1}.svg`)
      const params = {
        ...values,
        threshold: values.threshold ?? thresholds[index % thresholds.length],
      }
      if (!(await vectorizeRaster(input, candidate, params, potrace.path, warn))) return 4
      candidates.push({
        index: index + 1,
        path: candidate,
        params: { threshold: params.threshold },
      })
    }
    writeFileSync(
      join(outDir, "candidates.json"),
      `${JSON.stringify({ operation: "vectorize", input, candidates }, null, 2)}\n`,
    )
    log(join(outDir, "candidates.json"))
    if (values.pick) {
      const selected = candidates.find((candidate) => candidate.index === values.pick)
      if (!selected) {
        warn(`ERROR: no candidate ${values.pick}`)
        return 2
      }
      if (values.output) {
        writeFileSync(resolve(values.output), readFileSync(selected.path))
        log(`Picked: ${resolve(values.output)}`)
      }
    }
    return 0
  }

  warn(`unknown inkscape command: ${command}\n\n${INKSCAPE_HELP}`)
  return 2
}
