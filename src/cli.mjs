#!/usr/bin/env node
// Unified CLI for the skills bundled in this repository.
//
// Usage: node src/cli.mjs <command> [args...]
import { comfy } from "./commands/comfy.mjs"
import { image } from "./commands/image.mjs"
import { ocr } from "./commands/ocr.mjs"
import { skill } from "./commands/skill.mjs"
import { speak } from "./commands/speak.mjs"

const COMMANDS = { comfy, image, ocr, skill, speak }

const HELP = `Usage: node src/cli.mjs <command> [args...]

Commands:
  skill validate <SKILL.md>                         validate a skill file
  skill triggers <queries.json> <skill> [runs]      measure trigger rates
  skill evals <evals.json> <SKILL.md> <dir> [--baseline]
                                                    run skill evaluations
  comfy <command> [args...]                         drive the local ComfyUI server
  image --image PATH [options]                      analyze images locally
  ocr --image PATH [options]                        extract text from images
  speak [options] [text]                            Spanish TTS via piper
`

async function main(argv) {
  const [command, ...args] = argv
  if (!command || command === "-h" || command === "--help") {
    process.stdout.write(HELP)
    return 0
  }
  const handler = COMMANDS[command]
  if (!handler) {
    process.stderr.write(`unknown command: ${command}\n\n${HELP}`)
    return 2
  }
  return handler(args)
}

process.exit(await main(process.argv.slice(2)))
