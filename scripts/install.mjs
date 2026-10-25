#!/usr/bin/env node
// Install the harness as an OpenCode V2 plugin.
//
// Skills are registered by index.ts (no file copies). The plugin directory is
// symlinked into the OpenCode plugins directory, which is auto-loaded.
//
// Usage:
//   node scripts/install.mjs            install (idempotent symlink)
//   node scripts/install.mjs --dry-run  preview only
import { spawnSync } from "node:child_process"
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const dryRun = process.argv.includes("--dry-run")
const pluginsDir =
  process.env.OPENCODE_PLUGINS_DIR ?? join(process.env.HOME ?? "", ".config", "opencode", "plugins")
const destination = join(pluginsDir, "cheap-ai-winth-local-tools")

function step(message) {
  console.log(`\n\x1b[1;32m==>\x1b[0m ${message}`)
}

function info(message) {
  console.log(`    ${message}`)
}

step("OpenCode")
const opencode = spawnSync("which", ["opencode"], { encoding: "utf8" })
if (opencode.status === 0) {
  info(`opencode found: ${opencode.stdout.trim()}`)
} else {
  info("opencode not found — install it before restarting the client")
}

if (existsSync(join(pluginsDir, "my-utils-harness"))) {
  info("note: my-utils-harness is also installed; it registers autoskills,")
  info("comfyui-server, image-analysis, and ocr too. Duplicate skill ids may")
  info("conflict — keep only one of the two harnesses enabled if you see it.")
}

if (dryRun) {
  info(`would link: ${destination} -> ${repoRoot}`)
  console.log("\nDry run complete — nothing changed.")
  process.exit(0)
}

mkdirSync(pluginsDir, { recursive: true })
const existing = lstatSync(destination, { throwIfNoEntry: false })
if (existing?.isSymbolicLink()) {
  unlinkSync(destination)
} else if (existing) {
  console.error(`refusing to replace non-symlink: ${destination}`)
  process.exit(1)
}
symlinkSync(repoRoot, destination, "dir")
info(`linked: ${destination} -> ${repoRoot}`)

console.log(`
Installed. Restart OpenCode so the plugin is loaded.
Verify statically with: pnpm validate`)
