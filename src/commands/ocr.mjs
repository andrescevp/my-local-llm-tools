import { DEFAULT_OCR_PROMPT, DEFAULT_OLLAMA, OCR_MODEL } from "../lib/vision.mjs"
import { runVisionCommand } from "./vision-command.mjs"

export const OCR_HELP = `Usage: node src/cli.mjs ocr --image PATH [--image PATH...] [options]

Options:
  --image PATH       Absolute input image (repeatable, required)
  --prompt TEXT      Instruction prompt
  --model NAME       Ollama model (default: ${OCR_MODEL})
  --ollama-url URL   Ollama base URL (default: ${DEFAULT_OLLAMA})
  --format FORMAT    markdown | json | raw (default: markdown)
  --timeout SECONDS  Request timeout (default: 120)
`

export function ocr(argv) {
  return runVisionCommand(argv, {
    help: OCR_HELP,
    model: OCR_MODEL,
    url: DEFAULT_OLLAMA,
    prompt: DEFAULT_OCR_PROMPT,
  })
}
