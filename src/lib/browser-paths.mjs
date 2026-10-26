import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { configDir } from "./config.mjs"

export function browserHome(env = process.env) {
  return join(configDir(env), "browser")
}

export function profileDir(name = "default", env = process.env) {
  return join(browserHome(env), "profiles", name)
}

export function recordingsDir(env = process.env) {
  return join(browserHome(env), "recordings")
}

export function downloadsDir(env = process.env) {
  return join(browserHome(env), "downloads")
}

export function selectorDbPath(env = process.env) {
  return join(browserHome(env), "selectors.sqlite")
}

export function ensureBrowserDirs(env = process.env) {
  for (const dir of [
    browserHome(env),
    join(browserHome(env), "profiles"),
    recordingsDir(env),
    downloadsDir(env),
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}

export function recordingPath(name, env = process.env) {
  return join(recordingsDir(env), `${name}.json`)
}

export function listRecordings(env = process.env) {
  if (!existsSync(recordingsDir(env))) return []
  return readdirSync(recordingsDir(env))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name: name.slice(0, -5), path: join(recordingsDir(env), name) }))
}

export function readRecording(name, env = process.env) {
  return JSON.parse(readFileSync(recordingPath(name, env), "utf8"))
}

export function writeRecording(recording, env = process.env) {
  ensureBrowserDirs(env)
  const target = recordingPath(recording.name, env)
  writeFileSync(target, `${JSON.stringify(recording, null, 2)}\n`, "utf8")
  return target
}
