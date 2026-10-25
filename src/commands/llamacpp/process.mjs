import { spawn } from "node:child_process"
import { closeSync, mkdirSync, openSync } from "node:fs"
import { join } from "node:path"

import {
  baseUrl,
  buildServeCommand,
  DEFAULT_HOST,
  DEFAULT_PORT,
  findBinary,
  health,
  isManaged,
  LlamaError,
  listStates,
  modelDirs,
  modelStem,
  pidAlive,
  portOpen,
  readState,
  removeState,
  resolveModel,
  STATE_ROOT,
  tailLog,
  writeState,
} from "./server.mjs"

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms))
}

function timestamp() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export async function start(options) {
  const binary = findBinary(options.binary)
  if (!binary) {
    throw new LlamaError(
      "llama-server not found (run 'doctor'; install with: sudo pacman -S llama-cpp)",
    )
  }
  const model = resolveModel(options.model, modelDirs(options.dir))
  const state = readState(options.port)
  if (state && pidAlive(state.pid)) {
    throw new LlamaError(
      `a managed server is already running on port ${options.port} (pid ${state.pid})`,
    )
  }
  if (state) removeState(options.port)
  if (await portOpen(options.host, options.port)) {
    throw new LlamaError(
      `port ${options.port} is already in use by an unmanaged process; choose another --port`,
    )
  }

  const extra = [...(options.arg ?? [])]
  if (options.jinja) extra.push("--jinja")
  const alias = options.alias || modelStem(model)
  const command = buildServeCommand({ ...options, binary, model, alias, extra })
  mkdirSync(STATE_ROOT, { recursive: true })
  const log = join(STATE_ROOT, `server-${options.port}.log`)
  const fd = openSync(log, "a")
  const child = spawn(binary, command.slice(1), { detached: true, stdio: ["ignore", fd, fd] })
  child.unref()
  closeSync(fd)
  writeState(options.port, {
    pid: child.pid,
    port: options.port,
    host: options.host,
    model,
    alias,
    log,
    started_at: timestamp(),
  })
  console.log(`started pid=${child.pid} port=${options.port} model=${model}`)

  if (options.noWait) {
    console.log(`endpoint: ${baseUrl(options.host, options.port)}/v1`)
    return 0
  }
  const deadline = Date.now() + options.wait * 1000
  while (Date.now() < deadline) {
    if (!pidAlive(child.pid)) {
      console.error("ERROR: llama-server exited during startup\n")
      console.error(tailLog(log, 30))
      removeState(options.port)
      return 1
    }
    const { status } = await health(options.host, options.port)
    if (status === 200) {
      console.log(`health: ok (${baseUrl(options.host, options.port)})`)
      console.log(`endpoint: ${baseUrl(options.host, options.port)}/v1`)
      return 0
    }
    await sleep(500)
  }
  console.log(`still loading after ${options.wait}s; check: llamacpp logs --port ${options.port}`)
  return 0
}

export async function stop(options) {
  const ports = options.all ? listStates().map((state) => state.port) : [options.port]
  let failed = 0
  for (const port of ports) {
    if (!port) continue
    const state = readState(port)
    if (!state) {
      console.log(`no managed server for port ${port}`)
      continue
    }
    const pid = state.pid
    if (!pidAlive(pid)) {
      removeState(port)
      console.log(`stale state removed for port ${port}`)
      continue
    }
    if (!isManaged(pid, port)) {
      console.error(`REFUSED: pid ${pid} on port ${port} is not a managed llama-server`)
      failed += 1
      continue
    }
    process.kill(pid, "SIGTERM")
    const deadline = Date.now() + options.timeout * 1000
    while (Date.now() < deadline && pidAlive(pid)) await sleep(200)
    if (pidAlive(pid)) {
      if (!options.force) {
        console.error(`pid ${pid} did not exit; re-run with --force to SIGKILL`)
        failed += 1
        continue
      }
      process.kill(pid, "SIGKILL")
    }
    removeState(port)
    console.log(`stopped port ${port} (pid ${pid})`)
  }
  return failed ? 1 : 0
}

export async function status(options) {
  let states = listStates()
  if (options.port) states = states.filter((state) => state.port === options.port)
  if (options.json) {
    console.log(JSON.stringify(states, null, 2))
    return 0
  }
  if (!states.length) {
    console.log("No managed server. Start one with: node src/cli.mjs llamacpp start <model.gguf>")
    return 0
  }
  for (const state of states) {
    const host = state.host ?? DEFAULT_HOST
    const port = state.port ?? DEFAULT_PORT
    const { status: code } = await health(host, port)
    const alive = pidAlive(state.pid)
    console.log(`port=${port} pid=${state.pid} alive=${alive} health=${code ?? "down"}`)
    console.log(`  model   : ${state.model}`)
    console.log(`  endpoint: ${baseUrl(host, port)}/v1`)
    console.log(`  log     : ${state.log}`)
  }
  return 0
}

export function logs(options) {
  const state = readState(options.port)
  if (!state) throw new LlamaError(`no managed server for port ${options.port}`)
  console.log(tailLog(state.log ?? "", options.lines))
  return 0
}
