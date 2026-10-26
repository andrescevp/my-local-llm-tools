import { parseFlags } from "../lib/args.mjs"
import { collect, DEFAULT_COMFY, DEFAULT_OLLAMA } from "./setup/checks.mjs"
import { manifestPath, readManifest } from "./setup/manifest.mjs"

const SPEC = {
  "--ollama-url": { key: "ollamaUrl" },
  "--comfy-url": { key: "comfyUrl" },
  "--skill": { key: "skill" },
  "--json": { key: "json", type: "boolean" },
  "--strict": { key: "strict", type: "boolean" },
  "--cached": { key: "cached", type: "boolean" },
}

export const DOCTOR_HELP = `Usage: node src/cli.mjs doctor [options]

Diagnose the harness without writing the manifest.

Options:
  --ollama-url URL   Ollama URL to probe (default: ${DEFAULT_OLLAMA})
  --comfy-url URL    ComfyUI URL to probe (default: ${DEFAULT_COMFY})
  --skill NAME       Only check one skill (exit 1 when not ready)
  --json             Print the diagnostic manifest as JSON
  --strict           Fail on optional gaps (tesseract, docker, ComfyUI, models)
  --cached           Read the manifest instead of probing live services
`

function line(label, ok, detail) {
  console.log(`${label.padEnd(14)} ${ok ? "ok  " : "warn"} ${detail}`)
}

function printFeature(name, feature) {
  const missing = feature.requires.filter((item) => !item.ok).map((item) => item.requirement)
  const optional = feature.optional.filter((item) => !item.ok).map((item) => item.requirement)
  const detail = missing.length ? `missing: ${missing.join(", ")}` : "ready"
  console.log(`  ${name.padEnd(18)} ${feature.ok ? "ok  " : "fail"} ${detail}`)
  if (optional.length) console.log(`${" ".repeat(22)}optional: ${optional.join(", ")}`)
}

export async function doctor(argv) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(DOCTOR_HELP)
    return 0
  }
  let values
  try {
    values = parseFlags(argv, SPEC).values
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${DOCTOR_HELP}`)
    return 2
  }

  let manifest
  if (values.cached) {
    try {
      manifest = readManifest()
    } catch (error) {
      process.stderr.write(`cannot read ${manifestPath()}: ${error.message}\n`)
      process.stderr.write("run: node src/cli.mjs setup\n")
      return 1
    }
  } else {
    manifest = await collect({
      ollamaUrl: values.ollamaUrl ?? DEFAULT_OLLAMA,
      comfyUrl: values.comfyUrl ?? DEFAULT_COMFY,
    })
  }

  if (values.skill) {
    const feature = manifest.features[values.skill]
    if (!feature) {
      process.stderr.write(`unknown skill: ${values.skill}\n`)
      return 2
    }
    printFeature(values.skill, feature)
    return feature.ok ? 0 : 1
  }

  if (values.json) {
    console.log(JSON.stringify(manifest, null, 2))
  } else {
    if (values.cached) console.log(`Manifest      ${manifestPath()} (${manifest.generated_at})`)
    console.log(`Platform       ${manifest.platform.os} ${manifest.platform.arch}`)
    line("node", manifest.tools.node.ok, manifest.tools.node.version)
    line("pnpm", manifest.tools.pnpm.ok, manifest.tools.pnpm.version || "missing")
    line(
      "docker",
      manifest.tools.docker.ok,
      manifest.tools.docker.version || "not found (optional)",
    )
    line(
      "ollama",
      manifest.ollama.reachable && !manifest.ollama.models.missing.length,
      `${manifest.ollama.host} ${manifest.ollama.reachable ? `(${manifest.ollama.models.available.length} models)` : "unreachable"}`,
    )
    if (manifest.ollama.models.missing.length)
      console.log(`               missing: ${manifest.ollama.models.missing.join(", ")}`)
    line(
      "comfyui",
      manifest.comfyui.reachable,
      manifest.comfyui.reachable
        ? `${manifest.comfyui.host} ${manifest.comfyui.vram_gb} GiB (${manifest.comfyui.version})`
        : `${manifest.comfyui.host} unreachable`,
    )
    if (manifest.comfyui.reachable && !manifest.comfyui.gpu_ok) {
      console.log(`               warning: VRAM ${manifest.comfyui.vram_gb} GiB < 8 GB`)
    }
    line(
      "tesseract",
      manifest.tools.tesseract.ok,
      manifest.tools.tesseract.version || "not found (optional)",
    )
    line(
      "ffmpeg",
      manifest.tools.ffmpeg.ok && manifest.tools.ffprobe.ok,
      manifest.tools.ffmpeg.version || "missing",
    )
    line(
      "piper",
      manifest.tools.piper.ok && manifest.tools.voice_model.ok,
      `${manifest.tools.piper.version || "missing"}${manifest.tools.voice_model.ok ? "" : " (voice missing)"}`,
    )
    line(
      "libreoffice",
      manifest.tools.libreoffice.ok,
      manifest.tools.libreoffice.path || "missing (optional)",
    )
    line("gimp", manifest.tools.gimp.ok, manifest.tools.gimp.version || "missing (optional)")
    line(
      "chrome",
      manifest.tools.chrome?.ok,
      manifest.tools.chrome?.path || "missing (Playwright Chromium fallback)",
    )
    line(
      "inkscape",
      manifest.tools.inkscape.ok,
      manifest.tools.inkscape.version || "missing (optional)",
    )
    line(
      "playwright",
      manifest.tools.playwright.ok,
      manifest.tools.playwright.path || "browser missing (optional)",
    )
    line(
      "u2net",
      manifest.tools.u2net_model.ok,
      manifest.tools.u2net_model.path || "model missing (optional)",
    )
    const gpu = manifest.gpu ?? { ok: false, name: "", vram_gb: 0 }
    line("gpu", gpu.ok, gpu.ok ? `${gpu.name} ${gpu.vram_gb} GiB` : "not detected (optional)")
    console.log("\nSkills:")
    for (const [name, feature] of Object.entries(manifest.features)) printFeature(name, feature)
    if (manifest.warnings.length) {
      console.log("\nWarnings:")
      for (const warning of manifest.warnings) console.log(`  - ${warning}`)
    }
  }

  const coreFailed = !manifest.tools.node.ok || !manifest.tools.pnpm.ok
  const featuresFailed = Object.values(manifest.features).some((feature) => !feature.ok)
  const strictFailed =
    values.strict &&
    (manifest.ollama.models.missing.length > 0 ||
      !manifest.tools.tesseract.ok ||
      !manifest.tools.docker.ok ||
      !manifest.comfyui.reachable)
  return coreFailed || featuresFailed || strictFailed ? 1 : 0
}
