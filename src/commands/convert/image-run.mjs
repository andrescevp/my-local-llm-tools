import { existsSync, mkdirSync, statSync } from "node:fs"
import { basename, dirname, extname, join, resolve } from "node:path"

import { runCommand } from "../../lib/exec.mjs"
import { resolveImageMagick } from "../../lib/imagemagick.mjs"
import { buildImageArgs, imageKind, validateImageRequest } from "./image.mjs"

function targetPath(input, outDir, to) {
  return join(outDir, `${basename(input, extname(input))}.${to}`)
}

export function convertImages(
  values,
  {
    run = runCommand,
    resolveTool = resolveImageMagick,
    log = console.log,
    warn = console.warn,
    timeout,
  },
) {
  let request
  try {
    request = validateImageRequest({ values })
  } catch (error) {
    warn(`ERROR: ${error.message}`)
    return 2
  }

  const tool = resolveTool()
  if (!tool.ok) {
    warn(`ERROR: ${tool.error}`)
    warn("Run: node src/cli.mjs setup --install")
    return 3
  }

  for (const raw of values.input) {
    const input = resolve(raw)
    if (!existsSync(input) || !statSync(input).isFile()) {
      warn(`ERROR: input not found: ${input}`)
      return 2
    }
    if (!imageKind(input)) {
      warn(`ERROR: not an image input: ${input}`)
      return 2
    }
    const outDir = values.out ? resolve(values.out) : dirname(input)
    mkdirSync(outDir, { recursive: true })
    const expected = targetPath(input, outDir, request.format)
    if (existsSync(expected)) {
      warn(`ERROR: output already exists: ${expected}`)
      return 2
    }

    const result = run(tool.source, buildImageArgs({ input, output: expected, values }), {
      timeout,
    })
    if (result.status !== 0) {
      warn(`ERROR: ImageMagick failed for ${input}`)
      warn(`${result.stderr ?? ""}`.trim())
      return 4
    }
    if (!existsSync(expected) || statSync(expected).size === 0) {
      warn(`ERROR: ImageMagick produced no output for ${input}`)
      return 4
    }
    log(`Converted: ${input} -> ${expected}`)
  }
  return 0
}
