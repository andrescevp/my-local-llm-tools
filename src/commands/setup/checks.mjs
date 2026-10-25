import { existsSync } from "node:fs"
import { release } from "node:os"

import { binaryVersion, hasCommand, runCommand } from "../../lib/exec.mjs"
import { voiceModelPath } from "../../lib/piper.mjs"
import { evaluateFeatures } from "./features.mjs"

export const OLLAMA_MODELS = ["minicpm-v4.6:latest", "MedAIBase/PaddleOCR-VL:0.9b"]
export const DEFAULT_OLLAMA = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"
export const DEFAULT_COMFY = process.env.COMFY_BASE ?? "http://127.0.0.1:8188"
export const VOICE_MODEL = voiceModelPath()

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

export function detectTools() {
  const tesseract = binaryVersion("tesseract")
  return {
    node: { ok: true, version: process.version },
    pnpm: binaryVersion("pnpm"),
    docker: binaryVersion("docker"),
    tesseract: { ...tesseract, languages: tesseractLanguages() },
    ffmpeg: binaryVersion("ffmpeg", ["-version"]),
    ffprobe: binaryVersion("ffprobe", ["-version"]),
    piper: { ok: hasCommand("piper"), version: hasCommand("piper") ? "found" : "" },
    voice_model: { ok: existsSync(VOICE_MODEL), path: VOICE_MODEL },
  }
}

export async function detectOllama(url = DEFAULT_OLLAMA) {
  const base = url.replace(/\/+$/, "")
  const result = {
    url: base,
    reachable: false,
    version: "",
    models: [],
    missing: [...OLLAMA_MODELS],
  }
  try {
    const version = await fetchJson(`${base}/api/version`)
    const tags = await fetchJson(`${base}/api/tags`)
    result.version = version.version ?? ""
    result.models = (tags.models ?? []).map((model) => model.name).filter(Boolean)
    result.missing = OLLAMA_MODELS.filter((model) => !result.models.includes(model))
    result.reachable = true
  } catch (error) {
    result.error = error.message
  }
  return result
}

export async function detectComfy(url = DEFAULT_COMFY) {
  const base = url.replace(/\/+$/, "")
  const result = {
    url: base,
    reachable: false,
    version: "",
    python: "",
    gpu: "",
    vram_gb: 0,
    gpu_ok: false,
  }
  try {
    const stats = await fetchJson(`${base}/system_stats`)
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
  const comfy = await detectComfy(comfyUrl)
  const features = evaluateFeatures({ tools, ollama, comfy })
  const warnings = []
  if (!ollama.reachable) warnings.push(`Ollama unreachable at ${ollama.url}`)
  else if (ollama.missing.length)
    warnings.push(`Missing Ollama models: ${ollama.missing.join(", ")}`)
  if (!comfy.reachable) warnings.push(`ComfyUI unreachable at ${comfy.url}`)
  else if (!comfy.gpu_ok)
    warnings.push(`ComfyUI VRAM ${comfy.vram_gb} GiB (< 8 GB): image/video generation may fail`)
  if (!gpu.ok) warnings.push("GPU not detected; ComfyUI local generation needs at least 8 GB VRAM")
  else if (gpu.vram_gb < 7.5)
    warnings.push(
      `GPU VRAM ${gpu.vram_gb} GiB (< 8 GB): local ComfyUI generation is not recommended`,
    )
  if (!tools.tesseract.ok) warnings.push("Tesseract not found (OCR fallback unavailable)")
  return {
    schema: 1,
    generated_at: new Date().toISOString(),
    platform: { os: process.platform, arch: process.arch, release: release() },
    ok: tools.node.ok && tools.pnpm.ok,
    tools,
    gpu,
    ollama,
    comfy,
    features,
    warnings,
  }
}
