import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import { manifestPath } from "../../lib/config.mjs"

export function writeManifest(manifest) {
  const target = manifestPath()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  return target
}

export function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath(), "utf8"))
  } catch {
    return null
  }
}

export { manifestPath }
