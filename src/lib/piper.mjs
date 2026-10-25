import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const FILE = "es_MX-laura-high.onnx"

export function voiceCandidates() {
  return [
    process.env.PIPER_VOICE,
    join(homedir(), ".local", "share", "piper-voices", FILE),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "piper-voices", FILE) : "",
    join(homedir(), "Library", "Application Support", "piper-voices", FILE),
  ].filter(Boolean)
}

/** First existing voice model, or the preferred default path. */
export function voiceModelPath() {
  const candidates = voiceCandidates()
  return candidates.find((path) => existsSync(path)) ?? candidates[0]
}
