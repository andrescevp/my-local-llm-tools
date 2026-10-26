import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join, resolve } from "node:path"

import { parseFlags } from "../lib/args.mjs"
import { runCommand } from "../lib/exec.mjs"
import { buildConvertArgs, probeLibreOffice, resolveLibreOffice } from "../lib/libreoffice.mjs"

const SPEC = {
  "--input": { key: "input", list: true },
  "--to": { key: "to" },
  "--out": { key: "out" },
  "--filter": { key: "filter" },
  "--timeout": { key: "timeout", type: "int" },
}

export const CONVERT_HELP = `Usage: node src/cli.mjs convert --input FILE [--input FILE...] --to FORMAT [options]

Options:
  --input PATH       Input file (repeatable, required)
  --to FORMAT        Target extension, e.g. pdf, html, csv, txt
  --out DIR          Output directory (default: input directory)
  --filter NAME      LibreOffice export filter name
  --timeout SECONDS  Conversion timeout (default: 120)
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

  if (!values.input?.length || !values.to) {
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
