import { spawnSync } from "node:child_process"
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { createConnection } from "node:net"
import { homedir } from "node:os"
import { basename, extname, join, resolve } from "node:path"

export const DEFAULT_HOST = "127.0.0.1"
export const DEFAULT_PORT = 8080
const HOME = homedir()
export const DEFAULT_MODEL_DIRS = [
  join(HOME, ".cache", "llama.cpp"),
  join(HOME, "models"),
  join(HOME, "workspace", "models"),
  join(HOME, "workspace", "my-local-llms", "extra_models"),
]
export const STATE_ROOT = join(
  process.env.XDG_STATE_HOME ?? join(HOME, ".local", "state"),
  "llamacpp-server",
)
const BINARY_CANDIDATES = [
  "/usr/bin/llama-server",
  "/usr/local/bin/llama-server",
  join(HOME, "llama.cpp", "build", "bin", "llama-server"),
  join(HOME, "workspace", "llama.cpp", "build", "bin", "llama-server"),
  join(HOME, "workspace", "llamacpp-aot", "build", "bin", "llama-server"),
]

export class LlamaError extends Error {}

export function normalizeClientHost(host) {
  if (host === "0.0.0.0" || host === "*") return "127.0.0.1"
  if (host === "::") return "::1"
  return host
}

export function baseUrl(host, port) {
  const target = normalizeClientHost(host)
  return target.includes(":") ? `http://[${target}]:${port}` : `http://${target}:${port}`
}

function which(name) {
  const result = spawnSync("which", [name], { encoding: "utf8" })
  return result.status === 0 ? result.stdout.trim() : ""
}

function executable(path) {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function findBinary(explicit) {
  const candidates = []
  if (explicit) candidates.push(resolve(explicit.replace(/^~(?=$|\/)/, HOME)))
  const env = process.env.LLAMA_SERVER_BIN
  if (env) candidates.push(resolve(env.replace(/^~(?=$|\/)/, HOME)))
  const found = which("llama-server")
  if (found) candidates.push(found)
  candidates.push(...BINARY_CANDIDATES)
  return candidates.find(executable) ?? null
}

export function modelDirs(extra = []) {
  const raw = [...extra]
  const env = process.env.LLAMACPP_MODEL_DIRS ?? ""
  if (env) raw.push(...env.split(":").filter(Boolean))
  raw.push(...DEFAULT_MODEL_DIRS)
  const seen = new Set()
  const result = []
  for (const item of raw) {
    const path = resolve(item.replace(/^~(?=$|\/)/, HOME))
    if (seen.has(path)) continue
    seen.add(path)
    result.push(path)
  }
  return result
}

function walk(dir, base, depth, found) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (depth < 4) walk(path, base, depth + 1, found)
    } else if (entry.name.toLowerCase().endsWith(".gguf")) {
      try {
        found.set(path, { path, size: statSync(path).size })
      } catch {
        // unreadable file: ignore
      }
    }
  }
}

export function discoverModels(dirs) {
  const found = new Map()
  for (const raw of dirs) {
    const base = resolve(raw.replace(/^~(?=$|\/)/, HOME))
    if (!existsSync(base)) continue
    walk(base, base, 0, found)
  }
  return [...found.values()].sort((a, b) =>
    a.path.toLowerCase().localeCompare(b.path.toLowerCase()),
  )
}

export function resolveModel(value, dirs) {
  if (existsSync(value)) return value
  const matches = discoverModels(dirs).filter((model) => {
    const name = basename(model.path).toLowerCase()
    return (
      name === value.toLowerCase() || modelStem(model.path).toLowerCase() === value.toLowerCase()
    )
  })
  if (matches.length === 1) return matches[0].path
  if (matches.length > 1) {
    throw new LlamaError(
      `ambiguous model '${value}': ${matches.map((model) => model.path).join(", ")}`,
    )
  }
  throw new LlamaError(`model not found: ${value} (use 'models' to list GGUF files)`)
}

export function buildServeCommand(options) {
  const command = [
    options.binary,
    "-m",
    options.model,
    "--host",
    options.host,
    "--port",
    String(options.port),
    "-c",
    String(options.ctx),
    "-ngl",
    String(options.ngl),
  ]
  if (options.threads) command.push("-t", String(options.threads))
  if (options.alias) command.push("--alias", options.alias)
  if (options.apiKey) command.push("--api-key", options.apiKey)
  command.push(...(options.extra ?? []))
  return command
}

export function statePath(port) {
  return join(STATE_ROOT, `server-${port}.json`)
}

export function writeState(port, state) {
  mkdirSync(STATE_ROOT, { recursive: true })
  writeFileSync(statePath(port), `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

export function readState(port) {
  try {
    const data = JSON.parse(readFileSync(statePath(port), "utf8"))
    return data && typeof data === "object" ? data : null
  } catch {
    return null
  }
}

export function listStates() {
  if (!existsSync(STATE_ROOT)) return []
  return readdirSync(STATE_ROOT)
    .filter((name) => /^server-\d+\.json$/.test(name))
    .sort()
    .flatMap((name) => {
      try {
        const data = JSON.parse(readFileSync(join(STATE_ROOT, name), "utf8"))
        return data && typeof data === "object" ? [data] : []
      } catch {
        return []
      }
    })
}

export function removeState(port) {
  try {
    unlinkSync(statePath(port))
  } catch {
    // already gone
  }
}

export function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(Number(pid), 0)
    return true
  } catch {
    return false
  }
}

export function procCmdline(pid) {
  if (!pid) return ""
  try {
    return readFileSync(`/proc/${Number(pid)}/cmdline`, "utf8")
      .replaceAll("\0", " ")
      .trim()
  } catch {
    return ""
  }
}

export function isManaged(pid, port) {
  if (!pidAlive(pid)) return false
  const line = procCmdline(pid)
  return line.includes("llama-server") && line.includes(String(port))
}

export function portOpen(host, port) {
  return new Promise((done) => {
    const socket = createConnection({ host: normalizeClientHost(host), port: Number(port) })
    const finish = (value) => {
      socket.destroy()
      done(value)
    }
    socket.setTimeout(300)
    socket.once("connect", () => finish(true))
    socket.once("timeout", () => finish(false))
    socket.once("error", () => finish(false))
  })
}

export async function health(host, port) {
  try {
    const response = await fetch(`${baseUrl(host, port)}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return { status: response.status, body: await response.text() }
  } catch (error) {
    return { status: null, body: error.message }
  }
}

export async function httpJson(url, path = "", payload, apiKey, timeout = 120) {
  const headers = { "Content-Type": "application/json" }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  let response
  try {
    response = await fetch(`${url.replace(/\/+$/, "")}${path}`, {
      method: payload === undefined ? "GET" : "POST",
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout * 1000),
    })
  } catch (error) {
    throw new LlamaError(`Cannot reach ${url}: ${error.message}`)
  }
  const body = await response.text()
  if (!response.ok) throw new LlamaError(`HTTP ${response.status}: ${body.slice(0, 500)}`)
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new LlamaError(`Invalid JSON: ${body.slice(0, 300)}`)
  }
}

export function tailLog(path, lines = 60) {
  try {
    const content = readFileSync(path, "utf8")
    return content.split("\n").slice(-lines).join("\n")
  } catch (error) {
    throw new LlamaError(`Cannot read log ${path}: ${error.message}`)
  }
}

export function modelStem(path) {
  return basename(path, extname(path))
}
