import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseFlags } from "../lib/args.mjs"
import { factsPath } from "../lib/config.mjs"
import { BASE, getBytes, getJson, OUTDIR, postJson } from "./comfy/client.mjs"
import { applyOverrides, loadPrompt } from "./comfy/workflows.mjs"

const FACTS = factsPath()

const HELP = `Usage: node src/cli.mjs comfy <command> [args...]

Commands:
  status                         server health, versions, queue, output dir
  nodes [FILTER]                 registered node types
  info NODE                      required/optional inputs for a node type
  workflows [NAME]               known workflows from instance_facts.json
  submit WF [NODE.PARAM=VALUE…]  queue a workflow (--check-only, --wait-min)
  wait PID [--timeout-min N]     wait for a prompt id
  run WF [NODE.PARAM=VALUE…]     submit + wait + print outputs
  outputs [--dir DIR]            list generated files
  fetch FILE [--out PATH]        download an output via /view
`

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms))
}

async function waitFor(options) {
  const deadline = Date.now() + options.timeoutMin * 60 * 1000
  while (Date.now() < deadline) {
    await sleep(5000)
    const history = await getJson(`/history/${options.pid}`)
    if (!(options.pid in history)) continue
    const entry = history[options.pid]
    const status = entry.status ?? {}
    console.log(`STATUS: ${status.status_str} completed=${status.completed}`)
    for (const message of status.messages ?? []) {
      if (message[0] === "execution_error" || message[0] === "execution_interrupted") {
        console.log("ERROR:", JSON.stringify(message[1]).slice(0, 4000))
        return 1
      }
    }
    for (const [nodeId, output] of Object.entries(entry.outputs ?? {})) {
      for (const [kind, items] of Object.entries(output)) {
        if (!["images", "gifs", "videos", "audio"].includes(kind)) continue
        console.log(`OUTPUT node ${nodeId} (${kind}):`)
        for (const item of items) {
          const subfolder = item.subfolder || ""
          console.log(`  ${subfolder ? `${subfolder}/` : ""}${item.filename}`)
        }
      }
    }
    return 0
  }
  console.log("TIMEOUT waiting for execution")
  return 1
}

export async function status() {
  let stats
  try {
    stats = await getJson("/system_stats", 5)
  } catch (error) {
    console.log(
      `DOWN: ${BASE} unreachable (${error.message}) — start it (see SKILL.md) or check the service`,
    )
    return 1
  }
  const system = stats.system ?? {}
  console.log(`UP: ${BASE}`)
  console.log(
    `  comfyui ${system.comfyui_version ?? "n/a"}  python ${system.python_version ?? "n/a"}  ` +
      `torch ${system.torch_version ?? "n/a"}  cuda ${system.cuda_version ?? "n/a"}`,
  )
  const device = (stats.devices ?? [])[0]
  if (device) {
    console.log(
      `  device: ${device.name ?? "n/a"}  ` +
        `vram_total ${((device.vram_total ?? 0) / 2 ** 30).toFixed(1)} GiB  ` +
        `vram_free ${((device.vram_free ?? 0) / 2 ** 30).toFixed(1)} GiB`,
    )
  }
  const queue = await getJson("/queue")
  console.log(
    `  queue: ${(queue.queue_running ?? []).length} running, ${(queue.queue_pending ?? []).length} pending`,
  )
  if (existsSync(OUTDIR))
    console.log(`  output dir ${OUTDIR}: ${readdirSync(OUTDIR).length} file(s)`)
  return 0
}

export async function nodes(filter) {
  const objectInfo = await getJson("/object_info")
  const names = Object.keys(objectInfo)
    .filter((name) => !filter || name.includes(filter))
    .sort()
  console.log(`${names.length} node type(s)`)
  for (const name of names) console.log(" ", name)
  return 0
}

export async function info(node) {
  const objectInfo = await getJson("/object_info")
  const spec = objectInfo[node]
  if (!spec) {
    console.error(`node ${node} NOT registered (see: nodes)`)
    return 1
  }
  for (const section of ["required", "optional"]) {
    for (const [name, definition] of Object.entries(spec.input?.[section] ?? {})) {
      let description = Array.isArray(definition) ? definition[0] : definition
      if (Array.isArray(description)) {
        description = [...description.slice(0, 8), ...(description.length > 8 ? ["..."] : [])]
      }
      console.log(`  [${section}] ${name}: ${JSON.stringify(description)}`)
    }
  }
  return 0
}

export function workflows() {
  let entries = []
  try {
    entries = JSON.parse(readFileSync(FACTS, "utf8")).workflows ?? []
  } catch {
    entries = []
  }
  if (!entries.length) {
    console.log("no instance facts found; run: node src/cli.mjs setup")
    return 1
  }
  for (const entry of entries) console.log(`  ${entry.name}  (${entry.size_bytes} B)`)
  return 0
}

export async function submit(options) {
  const objectInfo = await getJson("/object_info")
  const prompt = loadPrompt(options.workflow, objectInfo)
  applyOverrides(prompt, options.overrides ?? [])
  for (const [nodeId, node] of Object.entries(prompt)) {
    console.log(`  node ${nodeId}: ${node.class_type}`)
  }
  let response
  try {
    response = await postJson("/prompt", {
      prompt,
      client_id: "comfyui-server-client",
    })
  } catch (error) {
    console.log(
      `VALIDATION FAILED (HTTP ${error.status ?? "?"}):\n${(error.detail ?? error.message).slice(0, 4000)}`,
    )
    return 1
  }
  console.log(`Prompt accepted: ${response.prompt_id}`)
  if (options.checkOnly) {
    console.log("CHECK-ONLY: validation passed (prompt queued).")
    return 0
  }
  return waitFor({ pid: response.prompt_id, timeoutMin: options.waitMin })
}

export function outputs(dir) {
  const target = dir || OUTDIR
  if (!existsSync(target)) {
    console.error(`no output dir at ${target}`)
    return 1
  }
  for (const name of readdirSync(target).sort()) {
    const path = join(target, name)
    if (statSync(path).isFile()) console.log(`  ${name}  (${statSync(path).size} B)`)
  }
  return 0
}

export async function fetchFile(file, out) {
  const slash = file.lastIndexOf("/")
  const subfolder = slash >= 0 ? file.slice(0, slash) : ""
  const name = slash >= 0 ? file.slice(slash + 1) : file
  const query = `filename=${encodeURIComponent(name)}&type=output${
    subfolder ? `&subfolder=${encodeURIComponent(subfolder)}` : ""
  }`
  let data
  try {
    data = await getBytes(`/view?${query}`, 120)
  } catch (error) {
    console.log(
      `fetch failed (HTTP ${error.status ?? "?"}): ${(error.detail ?? error.message).slice(0, 400)}`,
    )
    return 1
  }
  const target = out || name
  writeFileSync(target, data)
  console.log(`saved ${target} (${data.length} B)`)
  return 0
}

function workflowOptions(parsed) {
  const { values, positionals } = parsed
  const workflow = positionals[0]
  if (!workflow) throw new Error("workflow is required")
  return {
    workflow,
    overrides: positionals.slice(1),
    checkOnly: Boolean(values.checkOnly),
    waitMin: values.waitMin ?? 20,
  }
}

export async function comfy(argv) {
  const [action, ...args] = argv
  if (!action || action === "-h" || action === "--help") {
    process.stdout.write(HELP)
    return action ? 0 : 2
  }
  try {
    switch (action) {
      case "status":
        return await status()
      case "nodes":
        return await nodes(parseFlags(args, {}).positionals[0])
      case "info": {
        const node = parseFlags(args, {}).positionals[0]
        if (!node) throw new Error("node is required")
        return await info(node)
      }
      case "workflows":
        return workflows()
      case "submit":
        return await submit(
          workflowOptions(
            parseFlags(args, {
              "--check-only": { key: "checkOnly", type: "boolean" },
              "--wait-min": { key: "waitMin", type: "int" },
            }),
          ),
        )
      case "wait": {
        const { values, positionals } = parseFlags(args, {
          "--timeout-min": { key: "timeoutMin", type: "int" },
        })
        const pid = positionals[0]
        if (!pid) throw new Error("prompt id is required")
        return await waitFor({ pid, timeoutMin: values.timeoutMin ?? 20 })
      }
      case "run":
        return await submit(
          workflowOptions(parseFlags(args, { "--wait-min": { key: "waitMin", type: "int" } })),
        )
      case "outputs":
        return outputs(parseFlags(args, { "--dir": { key: "dir" } }).values.dir)
      case "fetch": {
        const { values, positionals } = parseFlags(args, { "--out": { key: "out" } })
        const file = positionals[0]
        if (!file) throw new Error("file is required")
        return await fetchFile(file, values.out)
      }
      default:
        process.stderr.write(`unknown command: ${action}\n\n${HELP}`)
        return 2
    }
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`)
    return 1
  }
}
