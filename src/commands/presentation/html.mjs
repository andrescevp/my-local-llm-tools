import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import ejs from "ejs"

import { copyAssets } from "./assets.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATES = join(HERE, "templates")

export function listTemplates() {
  return ["reveal", "slides"]
}

function inline(value) {
  const text = String(value ?? "")
  return (
    text.includes("<%") ||
    text.trimStart().startsWith("<!DOCTYPE") ||
    text.trimStart().startsWith("<html")
  )
}

function templateSource(spec) {
  const value = String(spec || "reveal")
  if (inline(value)) return value
  const candidate = existsSync(value) ? value : join(TEMPLATES, `${value}.ejs`)
  return readFileSync(candidate, "utf8")
}

export function renderHtml({ config, theme, template, outputPath }) {
  const assets = copyAssets(outputPath)
  const source = templateSource(template)
  const html = ejs.render(source, { config, theme, assets })
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, html, "utf8")
  return outputPath
}
