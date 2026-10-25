import { parseFlags } from "../lib/args.mjs"
import * as commands from "./llamacpp/commands.mjs"
import { DEFAULT_HOST, DEFAULT_PORT } from "./llamacpp/server.mjs"

const HELP = `Usage: node src/cli.mjs llamacpp [--json] <command> [args...]

Commands:
  doctor [--binary B] [--dir D]           binary, GPU, model dirs, port
  models [--dir D] [--filter TEXT]        list local .gguf files
  install                                 print install options
  start MODEL [options]                   start a managed llama-server
  stop [--port P] [--all] [--force]       stop only managed servers
  status [--port P]                       managed servers and health
  logs [-n LINES] [--port P]              tail the managed log
  chat --prompt TEXT [options]            OpenAI-compatible chat
  complete --prompt TEXT [options]        OpenAI-compatible completion
`

const DIR = { "--dir": { key: "dir", list: true } }
const START = {
  "--binary": { key: "binary" },
  ...DIR,
  "--host": { key: "host" },
  "--port": { key: "port", type: "int" },
  "--ctx": { key: "ctx", type: "int" },
  "--ngl": { key: "ngl", type: "int" },
  "--threads": { key: "threads", type: "int" },
  "--alias": { key: "alias" },
  "--api-key": { key: "apiKey" },
  "--jinja": { key: "jinja", type: "boolean" },
  "--arg": { key: "arg", list: true },
  "--wait": { key: "wait", type: "int" },
  "--no-wait": { key: "noWait", type: "boolean" },
}
const STOP = {
  "--port": { key: "port", type: "int" },
  "--all": { key: "all", type: "boolean" },
  "--force": { key: "force", type: "boolean" },
  "--timeout": { key: "timeout", type: "int" },
}
const LOGS = {
  "--port": { key: "port", type: "int" },
  "-n": { key: "lines", type: "int" },
  "--lines": { key: "lines", type: "int" },
}
const INFERENCE = {
  "--prompt": { key: "prompt" },
  "--model": { key: "model" },
  "--url": { key: "url" },
  "--port": { key: "port", type: "int" },
  "--api-key": { key: "apiKey" },
  "--temperature": { key: "temperature", type: "number" },
  "--max-tokens": { key: "maxTokens", type: "int" },
  "--timeout": { key: "timeout", type: "int" },
}
const CHAT = {
  ...INFERENCE,
  "--system": { key: "system" },
  "--message": { key: "message", list: true },
}
const COMPLETE = { ...INFERENCE }

function splitJson(argv) {
  return { json: argv.includes("--json"), rest: argv.filter((token) => token !== "--json") }
}

function defaults(values) {
  return { host: DEFAULT_HOST, port: DEFAULT_PORT, ...values }
}

export async function llamacpp(argv) {
  const { json, rest } = splitJson(argv)
  const [action, ...args] = rest
  if (!action || action === "-h" || action === "--help") {
    process.stdout.write(HELP)
    return action ? 0 : 2
  }

  try {
    switch (action) {
      case "doctor":
        return commands.doctor({
          ...parseFlags(args, { "--binary": { key: "binary" }, ...DIR }).values,
          json,
        })
      case "models":
        return commands.models({
          ...parseFlags(args, { ...DIR, "--filter": { key: "filter" } }).values,
          json,
        })
      case "install":
        return commands.install()
      case "start": {
        const { values, positionals } = parseFlags(args, START)
        const model = positionals[0]
        if (!model) throw new Error("model is required")
        return await commands.start({
          ...defaults({ ctx: 4096, ngl: 99, wait: 90, ...values }),
          model,
        })
      }
      case "stop": {
        const { values } = parseFlags(args, STOP)
        return await commands.stop({
          ...values,
          port: values.port ?? DEFAULT_PORT,
          timeout: values.timeout ?? 10,
        })
      }
      case "status":
        return await commands.status({
          ...parseFlags(args, { "--port": { key: "port", type: "int" } }).values,
          json,
        })
      case "logs": {
        const { values } = parseFlags(args, LOGS)
        return commands.logs({ port: values.port ?? DEFAULT_PORT, lines: values.lines ?? 60 })
      }
      case "chat": {
        const { values } = parseFlags(args, CHAT)
        if (!values.prompt) throw new Error("--prompt is required")
        return await commands.chat({
          ...defaults({ temperature: 0.7, maxTokens: 512, timeout: 180, ...values }),
          message: (values.message ?? []).map(commands.parseMessage),
          apiKey: values.apiKey ?? process.env.LLAMACPP_API_KEY,
          json,
        })
      }
      case "complete": {
        const { values } = parseFlags(args, COMPLETE)
        if (!values.prompt) throw new Error("--prompt is required")
        return await commands.complete({
          ...defaults({ temperature: 0.7, maxTokens: 512, timeout: 180, ...values }),
          apiKey: values.apiKey ?? process.env.LLAMACPP_API_KEY,
          json,
        })
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
