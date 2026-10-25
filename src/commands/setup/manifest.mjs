import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import { manifestPath } from "../../lib/config.mjs"
import { assertManifest } from "./schema.mjs"

export function writeManifest(manifest) {
  assertManifest(manifest)
  const target = manifestPath()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  return target
}

export function readManifest() {
  const data = JSON.parse(readFileSync(manifestPath(), "utf8"))
  return assertManifest(data)
}

export { manifestPath }
