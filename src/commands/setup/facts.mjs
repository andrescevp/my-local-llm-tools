import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

import { factsPath } from "../../lib/config.mjs"

const COMFY_HOME = process.env.COMFY_HOME ?? join(homedir(), "ComfyUI")

export function defaultDirs() {
  return {
    workflows: process.env.COMFY_WORKFLOWS ?? join(COMFY_HOME, "user", "default", "workflows"),
    models: process.env.COMFY_MODELS ?? join(COMFY_HOME, "models"),
    customNodes: process.env.COMFY_CUSTOM_NODES ?? join(COMFY_HOME, "custom_nodes"),
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

export function scanWorkflows(dir = defaultDirs().workflows) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => {
      const path = join(dir, name)
      try {
        return [{ name, size_bytes: statSync(path).size, sha256: sha256(path) }]
      } catch {
        return []
      }
    })
}

function walkModels(dir, subdir, depth, found) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory() && depth < 3) {
      walkModels(path, subdir || entry.name, depth + 1, found)
    } else if (entry.isFile() && !entry.name.startsWith(".")) {
      try {
        found.push({
          name: entry.name,
          subdir: subdir || "",
          path,
          size_bytes: statSync(path).size,
        })
      } catch {
        // unreadable model: ignore
      }
    }
  }
}

export function scanModels(dir = defaultDirs().models) {
  if (!existsSync(dir)) return []
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walkModels(join(dir, entry.name), entry.name, 1, found)
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

export function scanCustomNodes(dir = defaultDirs().customNodes) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

async function fetchJson(url, timeout = 15000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function discoverFacts({ url }) {
  const base = url.replace(/\/+$/, "")
  const stats = await fetchJson(`${base}/system_stats`)
  const system = stats.system ?? {}
  const device = (stats.devices ?? [])[0] ?? {}
  const objectInfo = await fetchJson(`${base}/object_info`)
  return {
    generated_at: new Date().toISOString(),
    server: { url: base, running: true },
    versions: {
      comfyui: system.comfyui_version ?? "",
      python: system.python_version ?? "",
      torch: system.torch_version ?? "",
      cuda: system.cuda_version ?? "",
    },
    device: { name: device.name ?? "", vram_total: device.vram_total ?? 0 },
    models: scanModels(),
    custom_nodes: scanCustomNodes(),
    workflows: scanWorkflows(),
    node_count: Object.keys(objectInfo).length,
  }
}

export function writeFacts(facts) {
  const target = factsPath()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(facts, null, 2)}\n`, "utf8")
  return target
}

export function readFacts() {
  try {
    return JSON.parse(readFileSync(factsPath(), "utf8"))
  } catch {
    return null
  }
}

export function factsFile() {
  return factsPath()
}
