import { existsSync, statSync } from "node:fs"
import { resolve } from "node:path"

import { parseFlags } from "../lib/args.mjs"
import { runCommand } from "../lib/exec.mjs"
import { listMacros, macrosDir, newMacro, runMacro } from "./gimp/macros.mjs"
import { buildScript } from "./gimp/script.mjs"

const OPERATIONS = [
  "resize",
  "convert",
  "optimize",
  "crop",
  "rotate",
  "flip",
  "blur",
  "sharpen",
  "grayscale",
  "brightness-contrast",
  "hue-saturation",
  "levels",
  "sepia",
  "vignette",
  "autocrop",
  "text",
  "border",
]

const SPEC = {
  "--input": { key: "input" },
  "--output": { key: "output" },
  "--width": { key: "width", type: "int" },
  "--height": { key: "height", type: "int" },
  "--x": { key: "x", type: "int" },
  "--y": { key: "y", type: "int" },
  "--angle": { key: "angle" },
  "--direction": { key: "direction" },
  "--brightness": { key: "brightness", type: "number" },
  "--contrast": { key: "contrast", type: "number" },
  "--hue": { key: "hue", type: "number" },
  "--saturation": { key: "saturation", type: "number" },
  "--lightness": { key: "lightness", type: "number" },
  "--black": { key: "black", type: "number" },
  "--white": { key: "white", type: "number" },
  "--gamma": { key: "gamma", type: "number" },
  "--radius": { key: "radius", type: "number" },
  "--amount": { key: "amount", type: "number" },
  "--softness": { key: "softness", type: "number" },
  "--border": { key: "border", type: "int" },
  "--text": { key: "text" },
  "--font": { key: "font" },
  "--size": { key: "size", type: "int" },
  "--param": { key: "param", list: true },
  "--force": { key: "force", type: "boolean" },
  "--timeout": { key: "timeout", type: "int" },
}

export const GIMP_HELP = `Usage: node src/cli.mjs gimp <operation> --input FILE --output FILE [options]

Operations:
  ${OPERATIONS.join(", ")}
  macro list
  macro new <name> [--force]
  macro run <name> --input FILE --output FILE [--param key=value ...]

Options:
  --width N --height N --x N --y N       Geometry
  --angle 90|180|270 --direction h|v     Rotate/flip
  --brightness N --contrast N            Color
  --hue N --saturation N --lightness N   Color
  --black N --white N --gamma N          Levels
  --radius N --amount N --softness N     Filters
  --border N                             Border width
  --text TEXT --font NAME --size N       Text overlay
  --force                                Overwrite output
  --timeout SECONDS                      GIMP timeout (default: 180)
`

function parseParams(values = []) {
  const params = {}
  for (const item of values) {
    const index = item.indexOf("=")
    if (index <= 0) throw new Error(`invalid --param: ${item}`)
    params[item.slice(0, index)] = item.slice(index + 1)
  }
  return params
}

function runGimp(code, timeout, run = runCommand) {
  return run("gimp", ["-i", "--batch-interpreter", "python-fu-eval", "-b", code, "--quit"], {
    timeout,
  })
}

function verifyOutput(output, warn) {
  if (!existsSync(output) || statSync(output).size === 0) {
    warn(`ERROR: GIMP produced no output: ${output}`)
    return false
  }
  return true
}

export function gimp(argv, { run = runCommand, log = console.log, warn = console.warn } = {}) {
  if (argv.includes("-h") || argv.includes("--help")) {
    log(GIMP_HELP)
    return 0
  }

  const [operation, ...rest] = argv
  if (!operation) {
    warn(GIMP_HELP)
    return 2
  }

  if (operation === "macro") {
    const [action, name, ...flags] = rest
    if (action === "list") {
      for (const macro of listMacros()) log(macro.name)
      return 0
    }
    if (action === "new") {
      if (!name) {
        warn("ERROR: macro name required")
        return 2
      }
      try {
        const file = newMacro(name, { force: flags.includes("--force") })
        log(`Created: ${file}`)
        return 0
      } catch (error) {
        warn(`ERROR: ${error.message}`)
        return 2
      }
    }
    if (action === "run") {
      if (!name) {
        warn("ERROR: macro name required")
        return 2
      }
      let values
      try {
        values = parseFlags(flags, SPEC).values
      } catch (error) {
        warn(`${error.message}\n\n${GIMP_HELP}`)
        return 2
      }
      if (!values.input || !values.output) {
        warn("ERROR: --input and --output are required")
        return 2
      }
      const input = resolve(values.input)
      const output = resolve(values.output)
      if (!existsSync(input)) {
        warn(`ERROR: input not found: ${input}`)
        return 2
      }
      try {
        const result = runMacro(name, {
          input,
          output,
          params: parseParams(values.param),
          timeout: (values.timeout ?? 180) * 1000,
        })
        if (result.status !== 0) {
          warn(`ERROR: GIMP macro failed: ${name}`)
          warn(`${result.stderr ?? ""}`.trim())
          return 4
        }
        return verifyOutput(output, warn) ? 0 : 4
      } catch (error) {
        warn(`ERROR: ${error.message}`)
        return 2
      }
    }
    warn(GIMP_HELP)
    return 2
  }

  if (!OPERATIONS.includes(operation)) {
    warn(`unknown GIMP operation: ${operation}\n\n${GIMP_HELP}`)
    return 2
  }

  let values
  try {
    values = parseFlags(rest, SPEC).values
  } catch (error) {
    warn(`${error.message}\n\n${GIMP_HELP}`)
    return 2
  }
  if (!values.input || !values.output) {
    warn("ERROR: --input and --output are required")
    return 2
  }

  const input = resolve(values.input)
  const output = resolve(values.output)
  if (!existsSync(input)) {
    warn(`ERROR: input not found: ${input}`)
    return 2
  }
  if (existsSync(output) && !values.force) {
    warn(`ERROR: output already exists: ${output} (use --force)`)
    return 2
  }

  let code
  try {
    code = buildScript(operation, { ...values, input, output })
  } catch (error) {
    warn(`ERROR: ${error.message}`)
    return 2
  }

  const result = runGimp(code, (values.timeout ?? 180) * 1000, run)
  if (result.status !== 0) {
    warn(`ERROR: GIMP failed for ${operation}`)
    warn(`${result.stderr ?? ""}`.trim())
    return 4
  }
  if (!verifyOutput(output, warn)) return 4
  log(`Created: ${output}`)
  return 0
}
