import { spawnSync } from "node:child_process"

import { humanSize, printJson } from "../../lib/output.mjs"
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  discoverModels,
  findBinary,
  httpJson,
  modelDirs,
  modelStem,
  readState,
} from "./server.mjs"

export { logs, start, status, stop } from "./process.mjs"

const ROLES = ["system", "user", "assistant"]

export function parseMessage(value) {
  const equals = value.indexOf("=")
  if (equals < 0) throw new Error("message must use role=content")
  const role = value.slice(0, equals)
  if (!ROLES.includes(role)) throw new Error("role must be system, user, or assistant")
  return { role, content: value.slice(equals + 1) }
}

function latestState(options) {
  return readState(options.port) ?? {}
}

function endpoint(options) {
  if (options.url) return options.url.replace(/\/+$/, "")
  const state = latestState(options)
  return `${state.host ?? DEFAULT_HOST}:${state.port ?? options.port}`
}

function endpointUrl(options) {
  const value = endpoint(options)
  return value.startsWith("http") ? value : `http://${value}`
}

function modelName(options) {
  if (options.model) return options.model
  const state = latestState(options)
  return state.alias || modelStem(state.model ?? "local")
}

export function doctor(options) {
  const binary = findBinary(options.binary)
  console.log(`binary       : ${binary ?? "MISSING"}`)
  if (binary) {
    const version = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 15000 })
    const lines = (version.stdout || version.stderr || "").split("\n").filter(Boolean)
    console.log(`version      : ${lines[0] ?? "unknown"}`)
  }
  const pacman = spawnSync("pacman", ["-Q", "llama-cpp"], { encoding: "utf8" })
  console.log(`pacman       : ${pacman.status === 0 ? pacman.stdout.trim() : "not installed"}`)
  const gpu = spawnSync(
    "nvidia-smi",
    ["--query-gpu=name,memory.total,memory.used", "--format=csv,noheader"],
    { encoding: "utf8" },
  )
  console.log(`gpu          : ${gpu.status === 0 ? gpu.stdout.trim() : "nvidia-smi unavailable"}`)
  for (const directory of modelDirs(options.dir)) {
    console.log(`models       : ${directory} (${discoverModels([directory]).length} gguf)`)
  }
  const state = readState(DEFAULT_PORT)
  console.log(`port ${DEFAULT_PORT}    : ${state ? `managed pid ${state.pid}` : "free/unmanaged"}`)
  if (!binary) {
    console.log("\nInstall with: sudo pacman -S llama-cpp   (or 'install' for source builds)")
    return 1
  }
  return 0
}

export function models(options) {
  const dirs = modelDirs(options.dir)
  let found = discoverModels(dirs)
  if (options.filter) {
    const needle = options.filter.toLowerCase()
    found = found.filter((model) => model.path.toLowerCase().includes(needle))
  }
  if (options.json) {
    printJson(found)
    return 0
  }
  if (!found.length) {
    console.log("No .gguf files found. Searched:")
    for (const directory of dirs) console.log(`  - ${directory}`)
    return 0
  }
  for (const model of found) console.log(`${humanSize(model.size).padStart(9)}  ${model.path}`)
  return 0
}

export async function chat(options) {
  const messages = (options.message ?? []).map((message) => ({ ...message }))
  if (options.system) messages.unshift({ role: "system", content: options.system })
  messages.push({ role: "user", content: options.prompt })
  const payload = {
    model: modelName(options),
    messages,
    stream: false,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  }
  const data = await httpJson(
    endpointUrl(options),
    "/v1/chat/completions",
    payload,
    options.apiKey,
    options.timeout,
  )
  if (options.json) {
    printJson(data)
    return 0
  }
  const message = data.choices?.[0]?.message ?? {}
  console.log(String(message.content || message.reasoning_content || "").trim())
  return 0
}

export async function complete(options) {
  const payload = {
    model: modelName(options),
    prompt: options.prompt,
    stream: false,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  }
  const data = await httpJson(
    endpointUrl(options),
    "/v1/completions",
    payload,
    options.apiKey,
    options.timeout,
  )
  if (options.json) {
    printJson(data)
    return 0
  }
  console.log(String(data.choices?.[0]?.text ?? "").trim())
  return 0
}

export function install() {
  console.log("Arch/CachyOS package : sudo pacman -S llama-cpp")
  console.log("CUDA build (AUR)    : paru -S llama.cpp-cuda")
  console.log("From source         :")
  console.log("  git clone https://github.com/ggml-org/llama.cpp")
  console.log("  cmake -B llama.cpp/build -S llama.cpp -DGGML_CUDA=ON")
  console.log("  cmake --build llama.cpp/build -j")
  console.log("  export LLAMA_SERVER_BIN=$PWD/llama.cpp/build/bin/llama-server")
  return 0
}
