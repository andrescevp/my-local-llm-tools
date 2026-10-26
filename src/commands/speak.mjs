import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { hasCommand } from "../lib/exec.mjs"
import { voiceStatus } from "../lib/piper.mjs"

const PLAY_WAV = join(tmpdir(), "speak_output.wav")

const USAGE = `Usage: node src/cli.mjs speak [options] [text]

Convert text to speech using piper-tts in the system language
(English fallback) and play audio.

Options:
  -f FILE   Read text from file
  -s SECS   Sentence silence in seconds (default: 0.3)
  -l SCALE  Length/speed scale (default: 1.1; higher=slower)
  -v VOL    Volume multiplier (default: 1.0)
  -o FILE   Output WAV to file only (no playback)
  -q        Quiet — suppress piper stderr warnings
  -h        Show this help

If no text or file is given, reads from stdin.
`

export function parseArgs(argv) {
  const options = {
    file: "",
    sentenceSilence: "0.3",
    lengthScale: "1.1",
    volume: "1.0",
    output: "",
    quiet: false,
    help: false,
    text: "",
  }
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case "-f":
        index += 1
        options.file = argv[index] ?? ""
        break
      case "-s":
        index += 1
        options.sentenceSilence = argv[index] ?? "0.3"
        break
      case "-l":
        index += 1
        options.lengthScale = argv[index] ?? "1.1"
        break
      case "-v":
        index += 1
        options.volume = argv[index] ?? "1.0"
        break
      case "-o":
        index += 1
        options.output = argv[index] ?? ""
        break
      case "-q":
        options.quiet = true
        break
      case "-h":
        options.help = true
        break
      default:
        if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`)
        positional.push(arg)
    }
  }
  options.text = positional.join(" ")
  return options
}

function audioEnv() {
  if (process.platform !== "linux") return process.env
  const runtime = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`
  return {
    ...process.env,
    XDG_RUNTIME_DIR: runtime,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ?? `unix:path=${runtime}/bus`,
    PULSE_SERVER: process.env.PULSE_SERVER ?? `unix:${runtime}/pulse/native`,
    PULSE_RUNTIME_PATH: process.env.PULSE_RUNTIME_PATH ?? `${runtime}/pulse`,
  }
}

function findPlayer(env) {
  if (process.platform === "darwin") return hasCommand("afplay") ? "afplay" : ""
  if (process.platform === "win32") return hasCommand("powershell") ? "powershell" : ""
  if (hasCommand("pw-play") && existsSync(`${env.XDG_RUNTIME_DIR}/pipewire-0`)) return "pw-play"
  if (hasCommand("paplay")) return "paplay"
  if (hasCommand("aplay")) return "aplay"
  return ""
}

function play(wav, player, env) {
  if (player === "afplay") {
    return spawnSync("afplay", [wav], { env, stdio: "ignore" }).status === 0
  }
  if (player === "powershell") {
    const command = `(New-Object Media.SoundPlayer '${wav.replaceAll("'", "''")}').PlaySync()`
    return (
      spawnSync("powershell", ["-NoProfile", "-Command", command], { env, stdio: "ignore" })
        .status === 0
    )
  }
  const candidates = []
  if (player === "pw-play") candidates.push(["pw-play", [wav]])
  candidates.push(
    ["paplay", [wav]],
    ["aplay", ["-q", wav]],
    ["aplay", ["-q", "-D", "default", wav]],
    ["aplay", ["-q", "-D", "hw:0,0", wav]],
  )
  for (const [command, args] of candidates) {
    if (!hasCommand(command)) continue
    const result = spawnSync(command, args, { env, stdio: "ignore" })
    if (result.status === 0) return true
  }
  return false
}

export function speak(argv) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`)
    return 2
  }
  if (options.help) {
    process.stdout.write(USAGE)
    return 0
  }

  const voice = voiceStatus()
  if (!voice.exists) {
    process.stderr.write(
      `ERROR: no piper voice for ${voice.locale} (${voice.voice}) at ${voice.path}\n`,
    )
    process.stderr.write(
      "Run 'node src/cli.mjs voice ensure' or 'node src/cli.mjs setup --install'.\n",
    )
    return 1
  }

  const MODEL = voice.path

  const piper =
    (process.env.PIPER_BIN && existsSync(process.env.PIPER_BIN) ? process.env.PIPER_BIN : "") ||
    (hasCommand("piper") ? "piper" : "") ||
    (process.platform === "linux" && existsSync("/opt/piper-tts/piper")
      ? "/opt/piper-tts/piper"
      : "")
  if (!piper) {
    process.stderr.write(
      "ERROR: piper not found. Run 'node src/cli.mjs setup' to see install options.\n",
    )
    return 1
  }

  const env = audioEnv()
  const player = options.output ? "" : findPlayer(env)
  if (!options.output && !player) {
    process.stderr.write(
      "ERROR: no audio player found. Run 'node src/cli.mjs doctor' for diagnostics.\n",
    )
    return 1
  }

  let text = options.text
  if (!options.file && !text) {
    if (process.stdin.isTTY) {
      process.stderr.write(USAGE)
      return 2
    }
    text = readFileSync(0, "utf8")
  }

  const workDir = mkdtempSync(join(tmpdir(), "speak-"))
  const wav = join(workDir, "speak_output.wav")
  const args = [
    "-m",
    MODEL,
    "--length-scale",
    options.lengthScale,
    "--sentence-silence",
    options.sentenceSilence,
    "--volume",
    options.volume,
    "-f",
    wav,
  ]
  if (options.file) args.push("-i", options.file)

  try {
    const result = spawnSync(piper, args, {
      env,
      input: options.file ? undefined : `${text}\n`,
      stdio: options.quiet ? ["pipe", "ignore", "ignore"] : ["pipe", "inherit", "inherit"],
    })
    if (result.status !== 0) {
      process.stderr.write(`ERROR: piper failed with status ${result.status ?? "unknown"}\n`)
      return result.status || 1
    }

    if (options.output) {
      copyFileSync(wav, options.output)
      console.log(`Saved to ${options.output}`)
      return 0
    }

    copyFileSync(wav, PLAY_WAV)
    play(PLAY_WAV, player, env)
    console.log(PLAY_WAV)
    return 0
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}
