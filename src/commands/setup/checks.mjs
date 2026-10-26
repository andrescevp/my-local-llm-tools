import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { homedir, release } from "node:os"
import { join } from "node:path"

import { binaryVersion, commandPath, hasCommand, runCommand } from "../../lib/exec.mjs"
import { probeLibreOffice, resolveLibreOffice } from "../../lib/libreoffice.mjs"
import { voiceStatus } from "../../lib/piper.mjs"
import { scanModels } from "./facts.mjs"
import { evaluateFeatures } from "./features.mjs"

export const PLUGIN_NAME = "my-local-llm-tools"
export const OLLAMA_MODELS = ["minicpm-v4.6:latest", "MedAIBase/PaddleOCR-VL:0.9b"]
export const DEFAULT_OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"
export const DEFAULT_COMFY = process.env.COMFY_BASE ?? "http://127.0.0.1:8188"

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
    docker: binaryVersion("docker"),
    tesseract: { ...tesseract, languages: tesseractLanguages() },
    ffmpeg: binaryVersion("ffmpeg", ["-version"]),
    ffprobe: binaryVersion("ffprobe", ["-version"]),
    piper: { ok: Boolean(piper), version: piper ? "found" : "", path: piper },
    voice_model: { ok: voice.exists, path: voice.path },
    libreoffice,
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

export async function detectComfy(url = DEFAULT_COMFY) {
  const host = url.replace(/\/+$/, "")
  const result = {
    host,
    reachable: false,
    version: "",
    python: "",
    gpu: "",
    vram_gb: 0,
    gpu_ok: false,
  }
  try {
    const stats = await fetchJson(`${host}/system_stats`)
    const system = stats.system ?? {}
    const device = (stats.devices ?? [])[0] ?? {}
    result.version = system.comfyui_version ?? ""
    result.python = system.python_version ?? ""
    result.gpu = device.name ?? ""
    result.vram_gb = device.vram_total ? Number((device.vram_total / 1024 ** 3).toFixed(1)) : 0
    result.gpu_ok = result.vram_gb >= 7.5
    result.reachable = true
  } catch (error) {
    result.error = error.message
  }
  return result
}

export function detectGpu() {
  if (hasCommand("nvidia-smi")) {
    const result = runCommand(
      "nvidia-smi",
      ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
      { timeout: 5000 },
    )
    const first = `${result.stdout ?? ""}`.trim().split("\n")[0] ?? ""
    const [name, total] = first.split(",").map((part) => part.trim())
    const vram = Number(total) / 1024
    if (result.status === 0 && name && Number.isFinite(vram)) {
      return { ok: true, name, vram_gb: Number(vram.toFixed(1)), source: "nvidia-smi" }
    }
  }
  if (process.platform === "darwin" && hasCommand("system_profiler")) {
    const result = runCommand("system_profiler", ["SPDisplaysDataType"], { timeout: 20000 })
    const match = /VRAM \(Total\): (\d+)\s*(MB|GB)/.exec(result.stdout ?? "")
    if (match) {
      const gb = Number(match[1]) / (match[2] === "MB" ? 1024 : 1)
      return {
        ok: true,
        name: "macOS GPU",
        vram_gb: Number(gb.toFixed(1)),
        source: "system_profiler",
      }
    }
  }
  return { ok: false, name: "", vram_gb: 0, source: "" }
}

export async function collect({ ollamaUrl = DEFAULT_OLLAMA, comfyUrl = DEFAULT_COMFY } = {}) {
  const tools = detectTools()
  const gpu = detectGpu()
  const ollama = await detectOllama(ollamaUrl)
  const comfyui = await detectComfy(comfyUrl)
  const features = evaluateFeatures({ tools, ollama, comfyui })
  const warnings = []
  if (!ollama.reachable) warnings.push(`Ollama unreachable at ${ollama.host}`)
  else if (ollama.models.missing.length)
    warnings.push(`Missing Ollama models: ${ollama.models.missing.join(", ")}`)
  if (!comfyui.reachable) warnings.push(`ComfyUI unreachable at ${comfyui.host}`)
  else if (!comfyui.gpu_ok)
    warnings.push(`ComfyUI VRAM ${comfyui.vram_gb} GiB (< 8 GB): image/video generation may fail`)
  if (!gpu.ok) warnings.push("GPU not detected; ComfyUI local generation needs at least 8 GB VRAM")
  else if (gpu.vram_gb < 7.5)
    warnings.push(
      `GPU VRAM ${gpu.vram_gb} GiB (< 8 GB): local ComfyUI generation is not recommended`,
    )
  if (!tools.tesseract.ok) warnings.push("Tesseract not found (OCR fallback unavailable)")
  if (!tools.libreoffice.ok) warnings.push("LibreOffice not found (convert-files unavailable)")
  if (!tools.gimp.ok) warnings.push("GIMP not found (autoedit-with-gimp unavailable)")
  if (!tools.inkscape.ok) warnings.push("Inkscape not found (autoedit-with-inkscape unavailable)")
  if (!tools.playwright.ok)
    warnings.push("Playwright Chromium missing (presentation PDF unavailable)")
  if (!tools.u2net_model.ok)
    warnings.push("U2Net model missing (image-background-removal unavailable)")

  const models = { ollama: ollama.models, comfyui: scanModels() }
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
    hosts: { ollama: ollama.host, comfyui: comfyui.host },
    models,
    paths,
    tools,
    gpu,
    ollama,
    comfyui,
    features,
    warnings,
  }
}
