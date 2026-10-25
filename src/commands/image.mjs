import { autodetectMode, DEFAULT_MODEL, DEFAULT_OLLAMA, resolvePrompt } from "../lib/vision.mjs"
import { runVisionCommand } from "./vision-command.mjs"

export const IMAGE_HELP = `Usage: node src/cli.mjs image --image PATH [--image PATH...] [options]

Options:
  --image PATH       Absolute input image (repeatable, required)
  --prompt TEXT      Instruction prompt (default depends on mode)
  --model NAME       Ollama model (default: ${DEFAULT_MODEL})
  --mode MODE        auto | analyze | ocr (default: auto)
  --ollama-url URL   Ollama base URL (default: ${DEFAULT_OLLAMA})
  --format FORMAT    markdown | json | raw (default: markdown)
  --timeout SECONDS  Request timeout (default: 120)
`

export function image(argv) {
  return runVisionCommand(argv, {
    help: IMAGE_HELP,
    model: DEFAULT_MODEL,
    url: DEFAULT_OLLAMA,
    promptFor: (values, model) =>
      resolvePrompt(
        (values.mode ?? "auto") === "auto" ? autodetectMode(model) : values.mode,
        values.prompt,
      ),
  })
}
