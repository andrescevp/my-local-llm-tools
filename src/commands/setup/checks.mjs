import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { homedir, release } from "node:os"
import { join } from "node:path"

import { binaryVersion, commandPath, hasCommand, runCommand } from "../../lib/exec.mjs"
import { resolveImageMagick } from "../../lib/imagemagick.mjs"
import { probeLibreOffice, resolveLibreOffice } from "../../lib/libreoffice.mjs"
import { voiceStatus } from "../../lib/piper.mjs"
import { evaluateFeatures } from "./features.mjs"

export const PLUGIN_NAME = "my-local-llm-tools"
export const OLLAMA_MODELS = ["minicpm-v4.6:latest", "MedAIBase/PaddleOCR-VL:0.9b"]
export const DEFAULT_OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"

async function fetchJson(url, timeout = 2500) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function tesseractLanguages() {
  if (!hasCommand("tesseract")) return []
  const result = runCommand("tesseract", ["--list-langs"], { timeout: 10000 })
  return `${result.stdout ?? ""}`
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[a-z]{2,3}(_[A-Z]+)?$/.test(line))
}

function detectPlaywright() {
  try {
    const require = createRequire(import.meta.url)
    const pkg = require("playwright/package.json")
    const { chromium } = require("playwright")
    const path = chromium.executablePath()
    return {
      ok: existsSync(path),
      version: pkg.version ?? "",
      path,
      error: existsSync(path) ? "" : "Playwright Chromium is not installed",
    }
  } catch (error) {
    return { ok: false, version: "", path: "", error: error.message }
  }
}

function detectChrome() {
  const names =
    process.platform === "win32"
      ? ["chrome", "msedge"]
      : process.platform === "darwin"
        ? ["google-chrome", "chromium"]
        : ["google-chrome-stable", "google-chrome", "chromium", "microsoft-edge"]
  for (const name of names) {
    const found = binaryVersion(name, ["--version"])
    if (found.ok) return { ...found, source: "system" }
  }
  return { ok: false, version: "", path: "", error: "no system Chrome/Chromium found" }
}

function detectU2net() {
  const path =
    process.env.TOOLBOX_U2NET_MODEL ||
    process.env.U2NET_MODEL ||
    join(homedir(), ".mllt", "models", "u2net.onnx")
  return { ok: existsSync(path), path }
}

export function detectTools() {
  const tesseract = binaryVersion("tesseract")
  const piper = commandPath("piper")
  const voice = voiceStatus()
  const office = resolveLibreOffice()
  const libreoffice = office.ok
    ? { ...probeLibreOffice(office.path), source: office.source }
    : { ok: false, version: "", path: "", error: office.error, source: "" }
  return {
    node: { ok: true, version: process.version, path: process.execPath },
    pnpm: binaryVersion("pnpm"),
    uv: binaryVersion("uv", ["--version"]),
    php: binaryVersion("php", ["--version"]),
    phpenv: binaryVersion("phpenv", ["--version"]),
    docker: binaryVersion("docker"),
    tesseract: { ...tesseract, languages: tesseractLanguages() },
    ffmpeg: binaryVersion("ffmpeg", ["-version"]),
    ffprobe: binaryVersion("ffprobe", ["-version"]),
    piper: { ok: Boolean(piper), version: piper ? "found" : "", path: piper },
    voice_model: { ok: voice.exists, path: voice.path },
    libreoffice,
    imagemagick: resolveImageMagick(),
    hyprwhspr: binaryVersion("hyprwhspr", ["--version"]),
    gimp: binaryVersion("gimp", ["--version"]),
    inkscape: binaryVersion("inkscape", ["--version"]),
    potrace: binaryVersion("potrace", ["--version"]),
    pdftoppm: binaryVersion("pdftoppm", ["-v"]),
    chrome: detectChrome(),
    playwright: detectPlaywright(),
    u2net_model: detectU2net(),
  }
}

export async function detectOllama(url = DEFAULT_OLLAMA) {
  const host = url.replace(/\/+$/, "")
  const result = {
    host,
    reachable: false,
    version: "",
    models: { available: [], required: [...OLLAMA_MODELS], missing: [...OLLAMA_MODELS] },
  }
  try {
    const version = await fetchJson(`${host}/api/version`)
    const tags = await fetchJson(`${host}/api/tags`)
    result.version = version.version ?? ""
    const available = (tags.models ?? []).map((model) => model.name).filter(Boolean)
    result.models = {
      available,
      required: [...OLLAMA_MODELS],
      missing: OLLAMA_MODELS.filter((model) => !available.includes(model)),
    }
    result.reachable = true
  } catch (error) {
    result.error = error.message
  }
  return result
}

export async function collect({ ollamaUrl = DEFAULT_OLLAMA } = {}) {
  const tools = detectTools()
  const ollama = await detectOllama(ollamaUrl)
  const features = evaluateFeatures({ tools, ollama })
  const warnings = []
  if (!ollama.reachable) warnings.push(`Ollama unreachable at ${ollama.host}`)
  else if (ollama.models.missing.length)
    warnings.push(`Missing Ollama models: ${ollama.models.missing.join(", ")}`)
  if (!tools.tesseract.ok) warnings.push("Tesseract not found (OCR fallback unavailable)")
  if (!tools.uv?.ok) warnings.push("uv not found (Python environments unavailable)")
  if (!tools.php?.ok) warnings.push("PHP not found (PHP environments unavailable)")
  if (!tools.ffmpeg.ok || !tools.ffprobe.ok)
    warnings.push("ffmpeg/ffprobe not found (video analysis and media conversion unavailable)")
  if (!tools.libreoffice.ok) warnings.push("LibreOffice not found (convert-files unavailable)")
  if (!tools.imagemagick?.ok) warnings.push("ImageMagick not found (image conversion unavailable)")
  if (!tools.hyprwhspr?.ok) warnings.push("hyprwhspr not found (transcript-audio unavailable)")
  if (!tools.gimp.ok) warnings.push("GIMP not found (autoedit-with-gimp unavailable)")
  if (!tools.inkscape.ok) warnings.push("Inkscape not found (autoedit-with-inkscape unavailable)")
  if (!tools.playwright.ok)
    warnings.push("Playwright Chromium missing (presentation PDF unavailable)")
  if (!tools.u2net_model.ok)
    warnings.push("U2Net model missing (image-background-removal unavailable)")

  const models = { ollama: ollama.models }
  const paths = {
    tesseract: tools.tesseract.path ?? "",
    ffmpeg: tools.ffmpeg.path ?? "",
    ffprobe: tools.ffprobe.path ?? "",
    piper: tools.piper.path ?? "",
  }
  return {
    schema: 3,
    plugin: PLUGIN_NAME,
    generated_at: new Date().toISOString(),
    platform: { os: process.platform, arch: process.arch, release: release() },
    ok: tools.node.ok && tools.pnpm.ok,
    libre_office_path: tools.libreoffice.path ?? "",
    hosts: { ollama: ollama.host },
    models,
    paths,
    tools,
    ollama,
    features,
    warnings,
  }
}
