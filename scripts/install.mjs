#!/usr/bin/env node
// Install the harness as an OpenCode V2 plugin.
//
// Skills are registered by index.ts (no file copies). The plugin directory is
// symlinked into the OpenCode plugins directory, which is auto-loaded.
//
// Usage:
//   node scripts/install.mjs            install (idempotent symlink)
//   node scripts/install.mjs --dry-run  preview only
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { hasCommand } from "../src/lib/exec.mjs"

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const dryRun = process.argv.includes("--dry-run")
const configHome =
  process.platform === "win32"
    ? (process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"))
    : (process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"))
const pluginsDir = process.env.OPENCODE_PLUGINS_DIR ?? join(configHome, "opencode", "plugins")
const destination = join(pluginsDir, "my-local-llm-tools")
const legacy = join(pluginsDir, "cheap-ai-winth-local-tools")

function step(message) {
  console.log(`\n\x1b[1;32m==>\x1b[0m ${message}`)
}

function info(message) {
  console.log(`    ${message}`)
}

step("OpenCode")
if (hasCommand("opencode")) {
  info("opencode found in PATH")
} else {
  info("opencode not found — install it before restarting the client")
}

if (existsSync(join(pluginsDir, "my-utils-harness"))) {
  info("note: my-utils-harness overlaps autoskills, comfyui-server,")
  info("image-analysis, and ocr. dev-harness-skills may overlap others.")
  info("OpenCode resolves duplicate skill IDs by load order — enable only one")
  info("of the overlapping plugins, or disable the duplicate IDs in opencode.jsonc.")
}

if (dryRun) {
  info(`would link: ${destination} -> ${repoRoot}`)
  console.log("\nDry run complete — nothing changed.")
  process.exit(0)
}

mkdirSync(pluginsDir, { recursive: true })
if (lstatSync(legacy, { throwIfNoEntry: false })?.isSymbolicLink()) {
  unlinkSync(legacy)
  info(`removed legacy symlink: ${legacy}`)
}
const existing = lstatSync(destination, { throwIfNoEntry: false })
if (existing?.isSymbolicLink()) {
  unlinkSync(destination)
} else if (existing) {
  console.error(`refusing to replace non-symlink: ${destination}`)
  process.exit(1)
}
symlinkSync(repoRoot, destination, process.platform === "win32" ? "junction" : "dir")
info(`linked: ${destination} -> ${repoRoot}`)

console.log(`
Installed. Restart OpenCode so the plugin is loaded.
Verify statically with: pnpm validate`)
