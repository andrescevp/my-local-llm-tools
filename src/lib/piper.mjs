import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
const FALLBACK = { id: "en_US-lessac-medium", locale: "en-US", language: "en", fallback: true }

const CATALOG = [
  { id: "en_US-lessac-medium", locale: "en-US", language: "en", default: true },
  { id: "en_GB-alba-medium", locale: "en-GB", language: "en" },
  { id: "es_ES-davefx-medium", locale: "es-ES", language: "es", default: true },
  { id: "es_MX-ald-medium", locale: "es-MX", language: "es" },
  { id: "es_AR-daniela-high", locale: "es-AR", language: "es" },
  { id: "fr_FR-siwis-medium", locale: "fr-FR", language: "fr", default: true },
  { id: "de_DE-thorsten-medium", locale: "de-DE", language: "de", default: true },
  { id: "it_IT-paola-medium", locale: "it-IT", language: "it", default: true },
  { id: "pt_BR-faber-medium", locale: "pt-BR", language: "pt", default: true },
  { id: "ca_ES-upc_ona-medium", locale: "ca-ES", language: "ca", default: true },
  { id: "nl_NL-alex-medium", locale: "nl-NL", language: "nl", default: true },
  { id: "pl_PL-darkman-medium", locale: "pl-PL", language: "pl", default: true },
  { id: "ru_RU-dmitri-medium", locale: "ru-RU", language: "ru", default: true },
  { id: "uk_UA-ukrainian_tts-medium", locale: "uk-UA", language: "uk", default: true },
  { id: "tr_TR-dfki-medium", locale: "tr-TR", language: "tr", default: true },
  { id: "ar_JO-kareem-medium", locale: "ar-JO", language: "ar", default: true },
  { id: "hi_IN-pratham-medium", locale: "hi-IN", language: "hi", default: true },
  { id: "zh_CN-huayan-medium", locale: "zh-CN", language: "zh", default: true },
  { id: "ja_JP-hi_fi_captain-medium", locale: "ja-JP", language: "ja", default: true },
  { id: "ko_KR-kss-medium", locale: "ko-KR", language: "ko", default: true },
]

function normalizeLocale(value) {
  const raw = String(value ?? "")
    .split(":")[0]
    .split(".")[0]
    .split("@")[0]
    .trim()
  if (!raw || raw === "C" || raw === "POSIX") return ""
  const [language, region] = raw.replace("_", "-").split("-")
  if (!language) return ""
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase()
}

/** Resolve the system locale, preferring explicit environment variables. */
export function systemLocale(env = process.env) {
  const raw =
    env.MLLT_LANG || env.PIPER_LANG || env.LANGUAGE || env.LC_ALL || env.LC_MESSAGES || env.LANG
  const normalized = normalizeLocale(raw)
  if (normalized) return normalized
  return normalizeLocale(Intl.DateTimeFormat().resolvedOptions().locale) || "en-US"
}

export function voiceForLocale(locale = systemLocale()) {
  const normalized = normalizeLocale(locale) || "en-US"
  const exact = CATALOG.find((voice) => voice.locale === normalized)
  if (exact) return { ...exact, fallback: false }
  const language = normalized.split("-")[0]
  const preferred = CATALOG.find((voice) => voice.language === language && voice.default)
  return preferred ? { ...preferred, fallback: false } : { ...FALLBACK }
}

export function voicesDir(env = process.env, home = homedir()) {
  return env.MLLT_VOICES_DIR || join(home, ".mllt", "piper-voices")
}

function legacyDirs(env = process.env, home = homedir()) {
  return [
    join(home, ".local", "share", "piper-voices"),
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "piper-voices") : "",
    join(home, "Library", "Application Support", "piper-voices"),
  ].filter(Boolean)
}

function candidatesFor(voice, env, home) {
  const dirs = [voicesDir(env, home), ...legacyDirs(env, home)]
  return dirs.map((dir) => ({
    id: voice.id,
    path: join(dir, `${voice.id}.onnx`),
    fallback: voice.fallback,
  }))
}

export function voiceCandidates(locale = systemLocale(), env = process.env, home = homedir()) {
  const preferred = voiceForLocale(locale)
  const paths = [
    env.PIPER_VOICE,
    ...candidatesFor(preferred, env, home).map((candidate) => candidate.path),
    ...(preferred.id === FALLBACK.id
      ? []
      : candidatesFor(FALLBACK, env, home).map((candidate) => candidate.path)),
  ]
  if (preferred.locale === "es-MX") {
    paths.push(...legacyDirs(env, home).map((dir) => join(dir, "es_MX-laura-high.onnx")))
  }
  return paths.filter(Boolean)
}

/** Resolve the preferred voice path for the current locale. */
export function voiceStatus({ locale = systemLocale(), env = process.env, home = homedir() } = {}) {
  const preferred = voiceForLocale(locale)
  const candidates = candidatesFor(preferred, env, home)
  if (preferred.locale === "es-MX") {
    candidates.push(
      ...legacyDirs(env, home).map((dir) => ({
        id: "es_MX-laura-high",
        path: join(dir, "es_MX-laura-high.onnx"),
        fallback: false,
      })),
    )
  }
  if (preferred.id !== FALLBACK.id) candidates.push(...candidatesFor(FALLBACK, env, home))
  const found = candidates.find((candidate) => existsSync(candidate.path))
  return {
    locale: normalizeLocale(locale) || "en-US",
    voice: found?.id ?? preferred.id,
    path: found?.path ?? candidates[0].path,
    exists: Boolean(found),
    fallback: found?.fallback ?? preferred.fallback,
  }
}

export function voiceModelPath(locale = systemLocale(), env = process.env, home = homedir()) {
  return voiceStatus({ locale, env, home }).path
}

function relativePath(id) {
  const match = /^([a-z]{2}_[A-Z]{2})-([a-z0-9_-]+)-([a-z_]+)$/.exec(id)
  if (!match) throw new Error(`invalid piper voice id: ${id}`)
  const [, locale, name, quality] = match
  const family = locale.split("_")[0]
  return `${family}/${locale}/${name}/${quality}/${id}`
}

export async function downloadVoice(
  id,
  { dir = voicesDir(), fetchImpl = fetch, log = () => {} } = {},
) {
  mkdirSync(dir, { recursive: true })
  const base = relativePath(id)
  for (const suffix of [".onnx", ".onnx.json"]) {
    const target = join(dir, `${id}${suffix}`)
    const url = `${HF_BASE}/${base}${suffix}`
    log(`Downloading ${url}`)
    const response = await fetchImpl(url)
    if (!response.ok) throw new Error(`download failed (${response.status}) for ${url}`)
    writeFileSync(target, Buffer.from(await response.arrayBuffer()))
  }
  return { id, dir, model: join(dir, `${id}.onnx`), config: join(dir, `${id}.onnx.json`) }
}

/** Download the system-language voice, falling back to English. */
export async function ensureVoice({
  locale = systemLocale(),
  dir,
  force = false,
  fetchImpl = fetch,
  log = () => {},
} = {}) {
  const targetDir = dir || voicesDir()
  const selected = voiceForLocale(locale)
  const model = join(targetDir, `${selected.id}.onnx`)
  const config = join(targetDir, `${selected.id}.onnx.json`)
  if (!force && existsSync(model) && existsSync(config)) {
    return { ...selected, dir: targetDir, model, config, downloaded: false }
  }
  if (selected.fallback) {
    log(`No voice catalog entry for ${locale}; using English ${selected.id}`)
  }
  const result = await downloadVoice(selected.id, { dir: targetDir, fetchImpl, log })
  return { ...selected, ...result, downloaded: true }
}
