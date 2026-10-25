import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { humanSize, printJson, printModelText, printTable } from "../../lib/output.mjs"
import {
  buildChatPayload,
  buildGeneratePayload,
  normalizeUrl,
  OllamaError,
  requestJson,
  streamJson,
  summarizeModel,
} from "./client.mjs"

export function readPrompt(value) {
  if (value) return value
  if (!process.stdin.isTTY) {
    const text = readFileSync(0, "utf8").trim()
    if (text) return text
  }
  throw new OllamaError("no prompt provided (use --prompt or pipe text on stdin)")
}

export function serviceState() {
  const proc = spawnSync("systemctl", ["is-active", "ollama"], {
    encoding: "utf8",
    timeout: 3000,
  })
  return proc.stdout?.trim() || "unknown"
}

function requireModel(positionals) {
  if (!positionals[0]) throw new Error("model is required")
  return positionals[0]
}

export async function status({ url, json }) {
  const version = await requestJson(url, "/api/version", "GET", undefined, 5)
  const tags = await requestJson(url, "/api/tags", "GET", undefined, 10)
  const running = await requestJson(url, "/api/ps", "GET", undefined, 10)
  const state = serviceState()
  if (json) {
    printJson({
      endpoint: normalizeUrl(url),
      version,
      service: state,
      models: tags.models ?? [],
      running: running.models ?? [],
    })
    return 0
  }
  console.log(`Endpoint : ${normalizeUrl(url)}`)
  console.log(`Version  : ${version.version ?? "?"}`)
  console.log(`Service  : ${state}`)
  console.log(`Models   : ${(tags.models ?? []).length}`)
  console.log(`Loaded   : ${(running.models ?? []).length}`)
  for (const model of running.models ?? []) {
    console.log(
      `  - ${model.name ?? "?"}  ${humanSize(model.size)} (VRAM ${humanSize(model.size_vram)})`,
    )
  }
  return 0
}

export async function models({ url, json }) {
  const data = await requestJson(url, "/api/tags", "GET", undefined, 15)
  const rows = (data.models ?? []).map(summarizeModel)
  if (json) {
    printJson(rows)
    return 0
  }
  printTable(
    ["NAME", "SIZE", "FAMILY", "PARAMS", "QUANT", "CTX", "CAPS"],
    rows.map((row) => [
      row.name,
      humanSize(row.size),
      row.family,
      row.params,
      row.quant,
      row.context,
      row.capabilities.join(","),
    ]),
  )
  return 0
}

export async function ps({ url, json }) {
  const data = await requestJson(url, "/api/ps", "GET", undefined, 10)
  if (json) {
    printJson(data.models ?? [])
    return 0
  }
  printTable(
    ["NAME", "SIZE", "VRAM", "EXPIRES"],
    (data.models ?? []).map((model) => [
      model.name ?? "?",
      humanSize(model.size),
      humanSize(model.size_vram),
      String(model.expires_at ?? "-"),
    ]),
  )
  return 0
}

export async function show({ url, json, model }) {
  const data = await requestJson(url, "/api/show", "POST", { model }, 20)
  if (json) {
    printJson(data)
    return 0
  }
  const details = data.details ?? {}
  console.log(`Model: ${model}`)
  console.log(`Family: ${details.family ?? "?"}`)
  console.log(`Capabilities: ${(data.capabilities ?? []).join(", ") || "-"}`)
  console.log(`Parameters: ${details.parameter_size ?? "?"}`)
  console.log(`Quantization: ${details.quantization_level ?? "?"}`)
  if (data.modelfile) {
    console.log("\n--- Modelfile ---")
    console.log(String(data.modelfile).trim())
  }
  return 0
}

export async function pull({ url, model }) {
  console.log(`Pulling ${model} (network access required)...`)
  let last
  for await (const event of streamJson(url, "/api/pull", { model, stream: true })) {
    if (event.error) throw new OllamaError(String(event.error))
    const statusText = event.status ?? ""
    if (statusText && statusText !== last) {
      console.log(statusText)
      last = statusText
    }
  }
  console.log(`Ready: ${model}`)
  return 0
}

export async function generate(options) {
  const payload = buildGeneratePayload({ ...options, prompt: readPrompt(options.prompt) })
  const data = await requestJson(options.url, "/api/generate", "POST", payload, options.timeout)
  if (options.json) printJson(data)
  else printModelText(data.response, data.thinking)
  return 0
}

export async function chat(options) {
  let prompt = options.prompt
  if (prompt === undefined && !(options.message ?? []).length) prompt = readPrompt(undefined)
  const payload = buildChatPayload({ ...options, prompt })
  const data = await requestJson(options.url, "/api/chat", "POST", payload, options.timeout)
  if (options.json) printJson(data)
  else printModelText(data.message?.content, data.message?.thinking)
  return 0
}

export async function embed(options) {
  const texts = [...(options.text ?? [])]
  if (options.file) texts.push(readFileSync(resolve(options.file), "utf8"))
  if (!texts.length) texts.push(readPrompt(undefined))
  const data = await requestJson(
    options.url,
    "/api/embed",
    "POST",
    { model: options.model, input: texts },
    options.timeout,
  )
  if (options.json) {
    printJson(data)
    return 0
  }
  for (const [index, vector] of (data.embeddings ?? []).entries()) {
    console.log(`input[${index}]: ${vector.length} dims; first 5: ${vector.slice(0, 5)}`)
  }
  return 0
}

export async function unload({ url, model }) {
  const data = await requestJson(url, "/api/generate", "POST", { model, keep_alive: 0 }, 30)
  console.log(`Unload requested for ${model}: ${data.done ?? "ok"}`)
  return 0
}

export async function rm({ url, model, yes }) {
  if (!yes) throw new OllamaError("refusing to delete a model without --yes")
  await requestJson(url, "/api/delete", "DELETE", { model }, 60)
  console.log(`Deleted: ${model}`)
  return 0
}

export function service() {
  const state = serviceState()
  console.log(`Service: ${state}`)
  console.log("Start  : sudo systemctl start ollama")
  console.log("Stop   : sudo systemctl stop ollama")
  console.log("Status : systemctl status ollama --no-pager")
  console.log("Logs   : journalctl -u ollama -n 100 --no-pager")
  return state === "active" ? 0 : 1
}

export { requireModel }
