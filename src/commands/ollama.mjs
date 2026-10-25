import { parseFlags, splitGlobals } from "../lib/args.mjs"
import { DEFAULT_TIMEOUT, DEFAULT_URL, parseMessage } from "./ollama/client.mjs"
import * as commands from "./ollama/commands.mjs"

const HELP = `Usage: node src/cli.mjs ollama [--url URL] [--json] <command> [args...]

Commands:
  status                                  health, version, model counts
  models                                  list installed models
  ps                                      list loaded models
  service                                 systemd service state and hints
  show <model>                            model metadata
  pull <model>                            download a model (network)
  generate <model> -p PROMPT [options]    one-shot text/vision generation
  chat <model> [--message role=text]      one-shot chat completion
  embed <model> [--text TEXT] [--file F]  text embeddings
  unload <model>                          unload a model from memory
  rm <model> --yes                        delete a model
`

const IMAGE_OPTIONS = {
  "--system": { key: "system" },
  "--image": { key: "image", list: true },
  "--temperature": { key: "temperature", type: "number" },
  "--num-ctx": { key: "numCtx", type: "int" },
  "--num-predict": { key: "numPredict", type: "int" },
  "--keep-alive": { key: "keepAlive" },
  "--timeout": { key: "timeout", type: "int" },
}

const GENERATE = {
  "-p": { key: "prompt" },
  "--prompt": { key: "prompt" },
  "--format": { key: "format" },
  ...IMAGE_OPTIONS,
}

const CHAT = {
  "-p": { key: "prompt" },
  "--prompt": { key: "prompt" },
  "--message": { key: "message", list: true },
  ...IMAGE_OPTIONS,
}

const EMBED = {
  "--text": { key: "text", list: true },
  "--file": { key: "file" },
  "--timeout": { key: "timeout", type: "int" },
}

function modelAndFlags(args, spec) {
  const { values, positionals } = parseFlags(args, spec)
  const model = positionals[0]
  if (!model) throw new Error("model is required")
  return { ...values, model, timeout: values.timeout ?? DEFAULT_TIMEOUT }
}

function base(args, spec = {}) {
  const { values, positionals } = parseFlags(args, spec)
  const model = positionals[0]
  if (!model) throw new Error("model is required")
  return { values, model }
}

export async function ollama(argv) {
  const { rest, url = DEFAULT_URL, json } = splitGlobals(argv)
  const [action, ...args] = rest
  if (!action || action === "-h" || action === "--help") {
    process.stdout.write(HELP)
    return action ? 0 : 2
  }

  try {
    switch (action) {
      case "status":
        return await commands.status({ url, json })
      case "models":
        return await commands.models({ url, json })
      case "ps":
        return await commands.ps({ url, json })
      case "service":
        return commands.service()
      case "show":
        return await commands.show({ url, json, model: base(args).model })
      case "pull":
        return await commands.pull({ url, model: base(args).model })
      case "generate":
        return await commands.generate({ url, json, ...modelAndFlags(args, GENERATE) })
      case "chat": {
        const options = modelAndFlags(args, CHAT)
        options.message = (options.message ?? []).map(parseMessage)
        return await commands.chat({ url, json, ...options })
      }
      case "embed":
        return await commands.embed({ url, json, ...modelAndFlags(args, EMBED) })
      case "unload":
        return await commands.unload({ url, model: base(args).model })
      case "rm": {
        const { values, model } = base(args, { "--yes": { key: "yes", type: "boolean" } })
        return await commands.rm({ url, model, yes: Boolean(values.yes) })
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
