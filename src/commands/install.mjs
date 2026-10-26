import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { parseFlags } from "../lib/args.mjs"
import { hasCommand } from "../lib/exec.mjs"

const SPEC = {
  "--dry-run": { key: "dryRun", type: "boolean" },
}

export const INSTALL_HELP = `Usage: node src/cli.mjs install [options]

Link this repository into the OpenCode plugins directory.

Options:
  --dry-run   Preview the link without changing anything
  -h, --help  Show this help
`

function configHome(env, platform, home) {
  if (platform === "win32") return env.APPDATA ?? join(home, "AppData", "Roaming")
  if (platform === "darwin") return join(home, "Library", "Application Support")
  return env.XDG_CONFIG_HOME ?? join(home, ".config")
}

function pluginsDir(env, platform, home) {
  return env.OPENCODE_PLUGINS_DIR ?? join(configHome(env, platform, home), "opencode", "plugins")
}

export function install(
  argv,
  {
    root = resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
    env = process.env,
    platform = process.platform,
    home = homedir(),
    hasOpencode = hasCommand("opencode"),
    log = console.log,
    warn = console.warn,
  } = {},
) {
  if (argv.includes("-h") || argv.includes("--help")) {
    log(INSTALL_HELP)
    return 0
  }

  let values
  try {
    values = parseFlags(argv, SPEC).values
  } catch (error) {
    warn(`${error.message}\n\n${INSTALL_HELP}`)
    return 2
  }

  const plugins = pluginsDir(env, platform, home)
  const destination = join(plugins, "my-local-llm-tools")
  const legacy = join(plugins, "cheap-ai-winth-local-tools")

  log("\n==> OpenCode")
  log(
    hasOpencode
      ? "    opencode found in PATH"
      : "    opencode not found — install it before restarting the client",
  )

  if (existsSync(join(plugins, "my-utils-harness"))) {
    log("    note: my-utils-harness overlaps autoskills, comfyui-server,")
    log("    image-analysis, and ocr. dev-harness-skills may overlap others.")
    log("    OpenCode resolves duplicate skill IDs by load order — enable only one")
    log("    of the overlapping plugins, or disable the duplicate IDs in opencode.jsonc.")
  }

  if (values.dryRun) {
    log(`    would link: ${destination} -> ${root}`)
    log("\nDry run complete — nothing changed.")
    return 0
  }

  mkdirSync(plugins, { recursive: true })
  const legacyStat = lstatSync(legacy, { throwIfNoEntry: false })
  if (legacyStat?.isSymbolicLink()) {
    unlinkSync(legacy)
    log(`    removed legacy symlink: ${legacy}`)
  }

  const existing = lstatSync(destination, { throwIfNoEntry: false })
  if (existing?.isSymbolicLink()) {
    unlinkSync(destination)
  } else if (existing) {
    warn(`refusing to replace non-symlink: ${destination}`)
    return 1
  }

  symlinkSync(root, destination, platform === "win32" ? "junction" : "dir")
  log(`    linked: ${destination} -> ${root}`)
  log("\nInstalled. Restart OpenCode so the plugin is loaded.")
  log("Verify statically with: pnpm validate")
  return 0
}
