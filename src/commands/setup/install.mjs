import { existsSync } from "node:fs"
import { join } from "node:path"

import { runCommand } from "../../lib/exec.mjs"
import { voiceStatus } from "../../lib/piper.mjs"

const OLLAMA_URL = "https://ollama.com/download"
const COMFY_URL = "https://comfy.org/download"
const PIPER_URL = "https://github.com/rhasspy/piper/releases"

function tesseractHint(platform) {
  if (platform === "darwin") return "brew install tesseract tesseract-lang"
  if (platform === "win32")
    return "Install UB Mannheim Tesseract: https://github.com/UB-Mannheim/tesseract/wiki"
  return "sudo pacman -S tesseract tesseract-data-eng tesseract-data-spa (or your distro packages)"
}

function ffmpegHint(platform) {
  if (platform === "darwin") return "brew install ffmpeg"
  if (platform === "win32")
    return "winget install Gyan.FFmpeg (or https://ffmpeg.org/download.html)"
  return "sudo pacman -S ffmpeg (or your distro package)"
}

function libreofficeHint(platform) {
  if (platform === "darwin")
    return "brew install --cask libreoffice (or copy LibreOffice.app to ~/.mllt)"
  if (platform === "win32")
    return "winget install TheDocumentFoundation.LibreOffice (or extract portable to %USERPROFILE%\\.mllt\\libreoffice)"
  return "sudo pacman -S libreoffice-fresh (or extract the AppImage to ~/.mllt/libreoffice)"
}

function gimpHint(platform) {
  if (platform === "darwin") return "brew install --cask gimp"
  if (platform === "win32") return "winget install GIMP.GIMP"
  return "sudo pacman -S gimp (or your distro package)"
}

function inkscapeHint(platform) {
  if (platform === "darwin") return "brew install --cask inkscape"
  if (platform === "win32") return "winget install Inkscape.Inkscape"
  return "sudo pacman -S inkscape (or your distro package)"
}

function popplerHint(platform) {
  if (platform === "darwin") return "brew install poppler"
  if (platform === "win32")
    return "Extract Poppler for Windows to %USERPROFILE%\\.mllt\\poppler and add its bin directory to PATH"
  return "sudo pacman -S poppler (or apt install poppler-utils)"
}

export function planInstall(manifest, root, platform = process.platform) {
  const actions = []
  const { tools, ollama, comfyui } = manifest
  const add = (action) => actions.push(action)

  if (!tools.pnpm.ok) {
    add({
      id: "pnpm",
      kind: "manual",
      description: "Install pnpm (Node package manager)",
      detail: "corepack enable && corepack prepare pnpm@latest --activate",
      url: "https://pnpm.io/installation",
    })
  } else if (!existsSync(join(root, "node_modules"))) {
    add({
      id: "deps",
      kind: "command",
      description: "Install Node dependencies",
      command: "pnpm",
      args: ["install"],
    })
  }

  if (!ollama.reachable) {
    add({
      id: "ollama",
      kind: "manual",
      description: `Install and start Ollama, or pass --ollama-url if you already have an instance`,
      detail: `Default host: ${ollama.host}`,
      url: OLLAMA_URL,
    })
  } else {
    for (const model of ollama.models.missing) {
      add({
        id: `model:${model}`,
        kind: "command",
        description: `Pull Ollama model ${model}`,
        command: "ollama",
        args: ["pull", model],
      })
    }
  }

  if (!tools.tesseract.ok) {
    add({
      id: "tesseract",
      kind: "manual",
      description: "Install Tesseract (OCR fallback)",
      detail: tesseractHint(platform),
      url: "https://tesseract-ocr.github.io/tessdoc/Installation.html",
    })
  }

  if (!tools.ffmpeg.ok || !tools.ffprobe.ok) {
    add({
      id: "ffmpeg",
      kind: "manual",
      description: "Install ffmpeg/ffprobe (video analysis)",
      detail: ffmpegHint(platform),
      url: "https://ffmpeg.org/download.html",
    })
  }

  if (!comfyui.reachable) {
    const gpu = manifest.gpu ?? { ok: false, vram_gb: 0 }
    if (gpu.ok && gpu.vram_gb < 7.5) {
      add({
        id: "comfyui:skip",
        kind: "manual",
        description: `Skip local ComfyUI: GPU ${gpu.name} has ${gpu.vram_gb} GiB (< 8 GB)`,
        detail: "Use an external ComfyUI instance with --comfy-url if one is available",
        url: COMFY_URL,
      })
    } else {
      add({
        id: "comfyui",
        kind: "manual",
        description: tools.docker.ok
          ? "Deploy ComfyUI with Docker (preferred), or install locally; pass --comfy-url when ready"
          : "Install ComfyUI locally (https://comfy.org/download); pass --comfy-url when ready",
        detail:
          gpu.ok && gpu.vram_gb >= 7.5
            ? `GPU detected: ${gpu.name} (${gpu.vram_gb} GiB). Docker is isolated and reproducible; local install is simpler but drifts.`
            : "Requires a GPU with at least 8 GB VRAM for local generation; otherwise skip ComfyUI",
        url: COMFY_URL,
      })
    }
  }

  if (!tools.piper.ok) {
    add({
      id: "piper",
      kind: "manual",
      description: "Install piper-tts",
      detail:
        "Set PIPER_BIN if it lives outside PATH; setup can download the system-language voice afterwards",
      url: PIPER_URL,
    })
  } else if (!tools.voice_model.ok) {
    const voice = voiceStatus()
    add({
      id: "piper-voice",
      kind: "command",
      description: `Download the piper voice for ${voice.locale} (${voice.voice}${voice.fallback ? ", English fallback" : ""})`,
      command: process.execPath,
      args: [join(root, "src", "cli.mjs"), "voice", "ensure"],
    })
  }

  if (!tools.libreoffice?.ok) {
    add({
      id: "libreoffice",
      kind: "manual",
      description: "Install LibreOffice (convert-files)",
      detail: libreofficeHint(platform),
      url: "https://www.libreoffice.org/download/download-libreoffice/",
    })
  }
  if (!tools.gimp?.ok) {
    add({
      id: "gimp",
      kind: "manual",
      description: "Install GIMP (autoedit-with-gimp)",
      detail: gimpHint(platform),
      url: "https://www.gimp.org/downloads/",
    })
  }
  if (!tools.inkscape?.ok) {
    add({
      id: "inkscape",
      kind: "manual",
      description: "Install Inkscape (autoedit-with-inkscape)",
      detail: inkscapeHint(platform),
      url: "https://inkscape.org/release/",
    })
  }
  if (!tools.potrace?.ok) {
    add({
      id: "potrace",
      kind: "manual",
      description: "Install Potrace (bitmap vectorization)",
      detail: "Install potrace from your package manager",
      url: "https://potrace.sourceforge.net/",
    })
  }
  if (!tools.pdftoppm?.ok) {
    add({
      id: "poppler",
      kind: "manual",
      description: "Install Poppler (PDF page rendering)",
      detail: popplerHint(platform),
      url: "https://poppler.freedesktop.org/",
    })
  }
  if (!tools.playwright?.ok) {
    add({
      id: "playwright",
      kind: "manual",
      description: "Install the Playwright Chromium browser (presentation PDF)",
      detail: "pnpm exec playwright install chromium",
      url: "https://playwright.dev/docs/browsers",
    })
  }
  if (!tools.u2net_model?.ok) {
    add({
      id: "u2net",
      kind: "manual",
      description: "Place the U2Net model (image-background-removal)",
      detail: "Save u2net.onnx to ~/.mllt/models/u2net.onnx or set TOOLBOX_U2NET_MODEL",
      url: "https://github.com/danielgatis/rembg",
    })
  }

  return actions
}

export function formatPlan(actions) {
  if (!actions.length) return "Nothing to install."
  return actions
    .map((action, index) => {
      const head = `${index + 1}. ${action.description}`
      if (action.kind === "command")
        return `${head}\n   $ ${action.command} ${action.args.join(" ")}`
      return `${head}\n   ${action.detail}${action.url ? `\n   ${action.url}` : ""}`
    })
    .join("\n")
}

export function applyPlan(actions) {
  let failed = false
  for (const action of actions) {
    if (action.kind !== "command") {
      console.log(
        `\n→ ${action.description}\n   ${action.detail}${action.url ? `\n   ${action.url}` : ""}`,
      )
      continue
    }
    const command =
      process.platform === "win32" && action.command === "pnpm" ? "pnpm.cmd" : action.command
    console.log(`\n$ ${command} ${action.args.join(" ")}`)
    const result = runCommand(command, action.args, { stdio: "inherit", timeout: 30 * 60 * 1000 })
    if (result.status !== 0) {
      console.error(`FAILED: ${command} exited ${result.status}`)
      failed = true
      break
    }
  }
  return !failed
}
