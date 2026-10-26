#!/usr/bin/env node
// Unified CLI for the skills bundled in this repository.
//
// Usage: node src/cli.mjs <command> [args...]
import { browser } from "./commands/browser.mjs"
import { comfy } from "./commands/comfy.mjs"
import { convert } from "./commands/convert.mjs"
import { doctor } from "./commands/doctor.mjs"
import { gimp } from "./commands/gimp.mjs"
import { image } from "./commands/image.mjs"
import { inkscape } from "./commands/inkscape.mjs"
import { install } from "./commands/install.mjs"
import { ocr } from "./commands/ocr.mjs"
import { presentation } from "./commands/presentation.mjs"
import { removeBg } from "./commands/remove-bg.mjs"
import { setup } from "./commands/setup.mjs"
import { skill } from "./commands/skill.mjs"
import { speak } from "./commands/speak.mjs"
import { validate } from "./commands/validate.mjs"
import { video } from "./commands/video.mjs"
import { voice } from "./commands/voice.mjs"

const COMMANDS = {
  browser,
  comfy,
  convert,
  doctor,
  gimp,
  image,
  inkscape,
  install,
  ocr,
  presentation,
  "remove-bg": removeBg,
  setup,
  skill,
  speak,
  validate,
  video,
  voice,
}

const HELP = `Usage: node src/cli.mjs <command> [args...]

Commands:
  skill validate <SKILL.md>                         validate a skill file
  skill triggers <queries.json> <skill> [runs]      measure trigger rates
  skill evals <evals.json> <SKILL.md> <dir> [--baseline]
                                                    run skill evaluations
  comfy <command> [args...]                         drive the local ComfyUI server
  image --image PATH [options]                      analyze images locally
  ocr --image PATH [options]                        extract text from images
  video --input PATH [options]                      analyze a local video
  speak [options] [text]                            system-language TTS via piper
  setup [options]                                   detect deps + write machine manifest
  doctor [options]                                  diagnose the harness (read-only)
  install [--dry-run]                               link the plugin into OpenCode
  validate [repo-root]                              validate the harness statically
  convert --input FILE --to FORMAT                  convert files with LibreOffice
  gimp <operation> --input FILE --output FILE       edit images with GIMP
  inkscape <command> --input FILE                   operate on SVG/vector files
  presentation --input JSON --output FILE           generate PPTX/HTML/PDF
  remove-bg --input FILE --output FILE              remove an image background
  voice ensure|status [--lang LOCALE]               manage piper voices
  browser session|open|extract|download|page       use an isolated browser session
  browser learn|record|replay                       learn selectors and record actions
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
