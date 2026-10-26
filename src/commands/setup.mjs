import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { parseFlags } from "../lib/args.mjs"
import { collect, DEFAULT_OLLAMA } from "./setup/checks.mjs"
import { applyPlan, formatPlan, planInstall } from "./setup/install.mjs"
import { writeManifest } from "./setup/manifest.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

const SPEC = {
  "--ollama-url": { key: "ollamaUrl" },
  "--install": { key: "install", type: "boolean" },
  "--yes": { key: "yes", type: "boolean" },
  "--json": { key: "json", type: "boolean" },
}

export const SETUP_HELP = `Usage: node src/cli.mjs setup [options]

Detect dependencies, write the machine manifest, and optionally install.

Options:
  --ollama-url URL   Existing Ollama URL (default: ${DEFAULT_OLLAMA})
  --install          Print the install plan (requires --yes to execute)
  --yes              Confirm unattended installs (pnpm install, ollama pull)
  --json             Print the manifest as JSON
`

function statusLine(label, ok, detail) {
  console.log(`${label.padEnd(12)} ${ok ? "ok  " : "warn"} ${detail}`)
}

function printSummary(manifest, target) {
  console.log(`Manifest     ${target}`)
  console.log(`Platform     ${manifest.platform.os} ${manifest.platform.arch}`)
  statusLine("node", manifest.tools.node.ok, manifest.tools.node.version)
  statusLine("pnpm", manifest.tools.pnpm.ok, manifest.tools.pnpm.version || "missing")
  statusLine(
    "docker",
    manifest.tools.docker.ok,
    manifest.tools.docker.version || "not found (optional)",
  )
  const modelInfo =
    `${manifest.ollama.reachable ? "reachable" : "unreachable"} ${manifest.ollama.host}` +
    (manifest.ollama.reachable ? ` (${manifest.ollama.models.available.length} models)` : "")
  statusLine("ollama", manifest.ollama.reachable, modelInfo)
  if (manifest.ollama.models.missing.length)
    console.log(`             missing: ${manifest.ollama.models.missing.join(", ")}`)
  statusLine(
    "tesseract",
    manifest.tools.tesseract.ok,
    manifest.tools.tesseract.version || "not found (optional)",
  )
  statusLine("ffmpeg", manifest.tools.ffmpeg.ok, manifest.tools.ffmpeg.version || "not found")
  statusLine(
    "libreoffice",
    manifest.tools.libreoffice.ok,
    manifest.tools.libreoffice.path || "not found (convert-files unavailable)",
  )
  statusLine("gimp", manifest.tools.gimp.ok, manifest.tools.gimp.version || "not found (optional)")
  statusLine(
    "chrome",
    manifest.tools.chrome?.ok,
    manifest.tools.chrome?.path || "not found (Playwright Chromium fallback)",
  )
  statusLine(
    "inkscape",
    manifest.tools.inkscape.ok,
    manifest.tools.inkscape.version || "not found (optional)",
  )
  statusLine(
    "playwright",
    manifest.tools.playwright.ok,
    manifest.tools.playwright.path || "browser missing (PDF unavailable)",
  )
  statusLine(
    "u2net",
    manifest.tools.u2net_model.ok,
    manifest.tools.u2net_model.path || "model missing (remove-bg unavailable)",
  )
  for (const warning of manifest.warnings) console.log(`warning      ${warning}`)
  console.log("\nSkills:")
  for (const [name, feature] of Object.entries(manifest.features)) {
    console.log(`  ${name.padEnd(18)} ${feature.ok ? "ok" : "not ready"}`)
  }
}

export async function setup(argv) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(SETUP_HELP)
    return 0
  }
  let values
  try {
    values = parseFlags(argv, SPEC).values
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${SETUP_HELP}`)
    return 2
  }

  const urls = {
    ollamaUrl: values.ollamaUrl ?? DEFAULT_OLLAMA,
  }

  if (values.install) {
    const manifest = await collect(urls)
    const actions = planInstall(manifest, ROOT)
    console.log(formatPlan(actions))
    if (actions.length && !values.yes) {
      const target = writeManifest(manifest)
      console.log(`\nManifest written: ${target}`)
      console.log("Plan only — re-run with --yes to execute the installable steps.")
      return 2
    }
    if (actions.length && !applyPlan(actions)) return 1
  }

  const manifest = await collect(urls)
  const target = writeManifest(manifest)

  if (values.json) {
    console.log(JSON.stringify({ manifest, manifest_path: target }, null, 2))
  } else {
    printSummary(manifest, target)
    console.log("\nRun 'node src/cli.mjs doctor' for diagnostics.")
  }
  return manifest.ok ? 0 : 1
}
