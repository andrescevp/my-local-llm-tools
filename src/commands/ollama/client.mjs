import { readFileSync } from "node:fs"
import { extname, isAbsolute, resolve } from "node:path"

export const DEFAULT_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"
export const DEFAULT_TIMEOUT = 120
export const ROLES = ["system", "user", "assistant", "tool"]

const MIME_BY_EXTENSION = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".txt": "text/plain",
  ".json": "application/json",
  ".pdf": "application/pdf",
}

export class OllamaError extends Error {}

export function normalizeUrl(url) {
  return url.replace(/\/+$/, "")
}

export function parseMessage(value) {
  const equals = value.indexOf("=")
  if (equals < 0) throw new Error("message must use role=content")
  const role = value.slice(0, equals)
  if (!ROLES.includes(role)) throw new Error(`role must be one of: ${ROLES.join(", ")}`)
  return { role, content: value.slice(equals + 1) }
}

export function summarizeModel(raw) {
  const details = raw.details ?? {}
  return {
    name: raw.name ?? "?",
    size: raw.size,
    family: details.family ?? "-",
    params: details.parameter_size ?? "-",
    quant: details.quantization_level ?? "-",
    context: details.context_length ?? "-",
    capabilities: raw.capabilities ?? [],
  }
}

export function encodeImages(paths = []) {
  return paths.map((raw) => {
    const path = resolve(raw)
    if (!isAbsolute(raw)) throw new OllamaError(`Image path must be absolute: ${raw}`)
    let bytes
    try {
      bytes = readFileSync(path)
    } catch {
      throw new OllamaError(`Image not found: ${path}`)
    }
    const mime = MIME_BY_EXTENSION[extname(path).toLowerCase()]
    if (mime && !mime.startsWith("image/")) {
      throw new OllamaError(`Not a recognized image: ${path}`)
    }
    return bytes.toString("base64")
  })
}

async function request(url, path, method, payload, timeout) {
  const target = `${normalizeUrl(url)}${path}`
  let response
  try {
    response = await fetch(target, {
      method,
      headers: { "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout * 1000),
    })
  } catch (error) {
    throw new OllamaError(
      `Cannot reach Ollama at ${normalizeUrl(url)} (${error.cause?.code ?? error.message}). ` +
        "Start it with: sudo systemctl start ollama",
    )
  }
  if (!response.ok) {
    const detail = await response.text()
    throw new OllamaError(`HTTP ${response.status} for ${target}: ${detail.slice(0, 500)}`)
  }
  return response
}

export async function requestJson(url, path, method = "GET", payload, timeout = DEFAULT_TIMEOUT) {
  const response = await request(url, path, method, payload, timeout)
  const body = await response.text()
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new OllamaError(`Invalid JSON from Ollama: ${body.slice(0, 300)}`)
  }
}

export async function* streamJson(url, path, payload, timeout = 600) {
  const response = await request(url, path, "POST", payload, timeout)
  const decoder = new TextDecoder()
  let buffer = ""
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline = buffer.indexOf("\n")
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (line) yield parseLine(line)
      newline = buffer.indexOf("\n")
    }
  }
  const tail = buffer.trim()
  if (tail) yield parseLine(tail)
}

function parseLine(line) {
  try {
    return JSON.parse(line)
  } catch {
    throw new OllamaError(`Invalid streaming JSON: ${line.slice(0, 300)}`)
  }
}

function buildOptions(options) {
  const result = {}
  if (options.temperature !== undefined) result.temperature = options.temperature
  if (options.numCtx !== undefined) result.num_ctx = options.numCtx
  if (options.numPredict !== undefined) result.num_predict = options.numPredict
  return result
}

export function buildGeneratePayload(options) {
  const payload = { model: options.model, prompt: options.prompt, stream: false }
  const built = buildOptions(options)
  if (Object.keys(built).length) payload.options = built
  if (options.system) payload.system = options.system
  const images = encodeImages(options.image ?? [])
  if (images.length) payload.images = images
  if (options.format) payload.format = options.format
  if (options.keepAlive !== undefined) payload.keep_alive = options.keepAlive
  return payload
}

export function buildChatPayload(options) {
  const messages = (options.message ?? []).map((message) => ({ ...message }))
  if (options.system) messages.unshift({ role: "system", content: options.system })
  if (options.prompt) messages.push({ role: "user", content: options.prompt })
  if (!messages.length) throw new OllamaError("provide --prompt or --message role=content")

  const images = encodeImages(options.image ?? [])
  if (images.length) {
    const lastUser = messages.findLast((message) => message.role === "user")
    if (lastUser) lastUser.images = images
    else messages.push({ role: "user", content: "", images })
  }

  const payload = { model: options.model, messages, stream: false }
  const built = buildOptions(options)
  if (Object.keys(built).length) payload.options = built
  if (options.keepAlive !== undefined) payload.keep_alive = options.keepAlive
  return payload
}
