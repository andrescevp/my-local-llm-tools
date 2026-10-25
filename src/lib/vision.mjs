import { readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { extname, isAbsolute } from "node:path"

export const DEFAULT_MODEL = "minicpm-v4.6:latest"
export const OCR_MODEL = "MedAIBase/PaddleOCR-VL:0.9b"
export const DEFAULT_OLLAMA = "http://127.0.0.1:11434"

export const DEFAULT_ANALYZE_PROMPT =
  "Analyze this image in detail. Describe its content, subjects, context, " +
  "and any notable details. Be concise, structured, and objective."
export const DEFAULT_OCR_PROMPT =
  "Extract all visible text from the provided image(s). " +
  "Preserve structure and return concise markdown."

const NON_IMAGE_MIME = {
  ".txt": "text/plain",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".md": "text/markdown",
}

export function autodetectMode(model) {
  const lowered = String(model).toLowerCase()
  return lowered.includes("paddleocr") || lowered.includes("ocr") ? "ocr" : "analyze"
}

export function resolvePrompt(mode, prompt) {
  if (prompt) return prompt
  return autodetectMode(mode) === "ocr" ? DEFAULT_OCR_PROMPT : DEFAULT_ANALYZE_PROMPT
}

export function isVisionError(error) {
  const message = String(error?.message ?? error).toLowerCase()
  return message.includes("image input is not supported") || message.includes("mmproj")
}

export function encodeImage(rawPath) {
  const path = String(rawPath).replace(/^~(?=$|\/)/, homedir())
  if (!isAbsolute(path)) throw new Error(`Image path must be absolute: ${rawPath}`)
  try {
    if (!statSync(path).isFile()) throw new Error("not a file")
  } catch {
    throw new Error(`Image not found: ${path}`)
  }
  const mime = NON_IMAGE_MIME[extname(path).toLowerCase()]
  if (mime && !mime.startsWith("image/")) {
    throw new Error(`File is not a recognized image: ${path}`)
  }
  return readFileSync(path).toString("base64")
}

export async function callOllama({ ollamaUrl, model, prompt, encodedImages, timeout }) {
  const payload = {
    model,
    prompt,
    stream: false,
    options: { temperature: 0 },
  }
  if (encodedImages?.length) payload.images = encodedImages
  let response
  try {
    response = await fetch(`${ollamaUrl.replace(/\/+$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout * 1000),
    })
  } catch (error) {
    throw new Error(`Cannot reach Ollama at ${ollamaUrl}: ${error.message}`)
  }
  const raw = await response.text()
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${raw}`)
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON from Ollama: ${raw.slice(0, 500)}`)
  }
}

export async function runWithFallback(options, call = callOllama) {
  try {
    return await call(options)
  } catch (error) {
    if (isVisionError(error) && options.model !== DEFAULT_MODEL) {
      process.stderr.write(
        `WARN: model ${options.model} lacks vision support (missing mmproj); ` +
          `falling back to ${DEFAULT_MODEL}\n`,
      )
      return call({ ...options, model: DEFAULT_MODEL })
    }
    throw error
  }
}

export function cleanResponse(value) {
  const text = String(value ?? "")
  const marker = text.lastIndexOf("</think>")
  return (marker >= 0 ? text.slice(marker + "</think>".length) : text).trim()
}

export function formatOutput(data, format) {
  const raw = String(data.response ?? "")
  const text = cleanResponse(raw)
  if (format === "raw") return raw
  if (format === "json") {
    return JSON.stringify(
      {
        model: data.model,
        done: data.done,
        response: text,
        eval_count: data.eval_count,
        total_duration: data.total_duration,
      },
      null,
      2,
    )
  }
  return text
}

export function encodeImages(paths) {
  return paths.map((path) => encodeImage(path))
}
