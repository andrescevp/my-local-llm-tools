import { existsSync } from "node:fs"
import { join } from "node:path"

import { hasCommand, runCommand } from "../../lib/exec.mjs"
import { voiceStatus } from "../../lib/piper.mjs"
import { detectPackageManager, packageCommand } from "./packages.mjs"

const OLLAMA_URL = "https://ollama.com/download"
const PIPER_URL = "https://github.com/rhasspy/piper/releases"
function commandHint(tool, platform, manager, fallback) {
  return packageCommand(tool, platform, manager) || fallback
}

function libreofficeHint(platform, manager) {
  const command = packageCommand("libreoffice", platform, manager)
  const portable =
    platform === "darwin"
      ? "copy LibreOffice.app to ~/.mllt"
      : platform === "win32"
        ? "extract a portable copy to %USERPROFILE%\\.mllt\\libreoffice"
        : "extract the AppImage to ~/.mllt/libreoffice"
  return command
    ? `${command}\nPortable fallback: ${portable}`
    : `Install LibreOffice (${portable})`
}

function hyprwhsprHint(platform) {
  return platform === "linux"
    ? "Install hyprwhspr from the AUR, then run: hyprwhspr setup"
    : "hyprwhspr is Linux/Hyprland-only; transcript-audio is unavailable on this OS"
}

export function planInstall(
  manifest,
  root,
  platform = process.platform,
  { manager = detectPackageManager(platform) } = {},
) {
  const actions = []
  const { tools, ollama } = manifest
  const add = (action) => actions.push(action)

  if (!tools.pnpm.ok) {
    if (hasCommand("corepack")) {
      const corepack = platform === "win32" ? "corepack.cmd" : "corepack"
      add({
        id: "corepack",
        kind: "command",
        description: "Enable Corepack",
        command: corepack,
        args: ["enable"],
      })
      add({
        id: "pnpm",
        kind: "command",
        description: "Install pnpm via Corepack",
        command: corepack,
        args: ["prepare", "pnpm@latest", "--activate"],
      })
    } else {
      add({
        id: "pnpm",
        kind: "manual",
        description: "Install pnpm (Node package manager)",
        detail: "Install Corepack, then run: corepack prepare pnpm@latest --activate",
        url: "https://pnpm.io/installation",
      })
    }
  } else if (!existsSync(join(root, "node_modules"))) {
    add({
      id: "deps",
      kind: "command",
      description: "Install Node dependencies",
      command: "pnpm",
      args: ["install"],
    })
  }

  if (!tools.uv?.ok) {
    add({
      id: "uv",
      kind: "command",
      description: "Install uv (Python environment manager)",
      command: platform === "win32" ? "powershell" : "sh",
      args:
        platform === "win32"
          ? ["-NoProfile", "-Command", "irm https://astral.sh/uv/install.ps1 | iex"]
          : ["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
      url: "https://docs.astral.sh/uv/getting-started/installation/",
    })
  }

  if (!tools.php?.ok) {
    add({
      id: "php",
      kind: "manual",
      description: "Install PHP (PHP environment)",
      detail: commandHint("php", platform, manager, "Install PHP for this OS"),
      url: "https://www.php.net/downloads.php",
    })
  }

  if (!tools.phpenv?.ok) {
    add({
      id: "phpenv",
      kind: "manual",
      description: "Install phpenv (PHP version manager)",
      detail:
        platform === "win32"
          ? "phpenv is Unix-oriented; use the PHP package directly on Windows"
          : "git clone https://github.com/phpenv/phpenv.git ~/.phpenv",
      url: "https://github.com/phpenv/phpenv",
    })
  }

  if (!ollama.reachable) {
    add({
      id: "ollama",
      kind: "manual",
      description: `Install and start Ollama, or pass --ollama-url if you already have an instance`,
      detail:
        commandHint("ollama", platform, manager, "Download Ollama from the official site") +
        `\nDefault host: ${ollama.host}`,
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
      detail: commandHint(
        "tesseract",
        platform,
        manager,
        "Install Tesseract from the official installation guide",
      ),
      url: "https://tesseract-ocr.github.io/tessdoc/Installation.html",
    })
  }

  if (!tools.ffmpeg.ok || !tools.ffprobe.ok) {
    add({
      id: "ffmpeg",
      kind: "manual",
      description: "Install ffmpeg/ffprobe (video analysis and media conversion)",
      detail: commandHint("ffmpeg", platform, manager, "Install ffmpeg/ffprobe for this OS"),
      url: "https://ffmpeg.org/download.html",
    })
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
      description: "Install LibreOffice (convert-files documents)",
      detail: libreofficeHint(platform, manager),
      url: "https://www.libreoffice.org/download/download-libreoffice/",
    })
  }
  if (!tools.imagemagick?.ok) {
    add({
      id: "imagemagick",
      kind: "manual",
      description: "Install ImageMagick (convert-files images)",
      detail: commandHint("imagemagick", platform, manager, "Install ImageMagick for this OS"),
      url: "https://imagemagick.org/script/download.php",
    })
  }
  if (!tools.hyprwhspr?.ok) {
    add({
      id: "hyprwhspr",
      kind: "manual",
      description: "Install hyprwhspr (transcript-audio)",
      detail: hyprwhsprHint(platform),
      url: "https://github.com/goodroot/hyprwhspr",
    })
  }
  if (!tools.gimp?.ok) {
    add({
      id: "gimp",
      kind: "manual",
      description: "Install GIMP (autoedit-with-gimp)",
      detail: commandHint("gimp", platform, manager, "Install GIMP for this OS"),
      url: "https://www.gimp.org/downloads/",
    })
  }
  if (!tools.inkscape?.ok) {
    add({
      id: "inkscape",
      kind: "manual",
      description: "Install Inkscape (autoedit-with-inkscape)",
      detail: commandHint("inkscape", platform, manager, "Install Inkscape for this OS"),
      url: "https://inkscape.org/release/",
    })
  }
  if (!tools.potrace?.ok) {
    add({
      id: "potrace",
      kind: "manual",
      description: "Install Potrace (bitmap vectorization)",
      detail: commandHint("potrace", platform, manager, "Install Potrace for this OS"),
      url: "https://potrace.sourceforge.net/",
    })
  }
  if (!tools.pdftoppm?.ok) {
    add({
      id: "poppler",
      kind: "manual",
      description: "Install Poppler (PDF page rendering)",
      detail: commandHint("poppler", platform, manager, "Install Poppler for this OS"),
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
