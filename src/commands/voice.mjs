import { parseFlags } from "../lib/args.mjs"
import { ensureVoice, systemLocale, voiceStatus } from "../lib/piper.mjs"

const SPEC = {
  "--lang": { key: "lang" },
  "--force": { key: "force", type: "boolean" },
  "--json": { key: "json", type: "boolean" },
}

export const VOICE_HELP = `Usage: node src/cli.mjs voice <ensure|status> [options]

Commands:
  ensure   Download the piper voice for the system language (English fallback)
  status   Show the resolved locale, voice, and path

Options:
  --lang LOCALE  Override the system locale (e.g. es-MX, en-US)
  --force        Re-download even when the voice exists
  --json         Print machine-readable output
  -h, --help     Show this help
`

export async function voice(argv, { log = console.log, warn = console.warn } = {}) {
  if (argv.includes("-h") || argv.includes("--help")) {
    log(VOICE_HELP)
    return 0
  }
  const [action, ...rest] = argv
  let values
  try {
    values = parseFlags(rest, SPEC).values
  } catch (error) {
    warn(`${error.message}\n\n${VOICE_HELP}`)
    return 2
  }
  const locale = values.lang || systemLocale()

  if (action === "status") {
    const status = voiceStatus({ locale })
    log(
      values.json
        ? JSON.stringify(status, null, 2)
        : `${status.locale} ${status.voice} ${status.path}`,
    )
    return 0
  }

  if (action === "ensure") {
    try {
      const result = await ensureVoice({
        locale,
        force: values.force,
        log: (line) => log(line),
      })
      log(
        values.json
          ? JSON.stringify(result, null, 2)
          : `${result.downloaded ? "Downloaded" : "Voice already present"}: ${result.model}`,
      )
      return 0
    } catch (error) {
      warn(`ERROR: ${error.message}`)
      return 1
    }
  }

  warn(VOICE_HELP)
  return 2
}
