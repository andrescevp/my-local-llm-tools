import { hasCommand } from "../../lib/exec.mjs"

const PACKAGES = {
  tesseract: {
    pacman: "tesseract tesseract-data-eng tesseract-data-spa",
    apt: "tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa",
    dnf: "tesseract tesseract-langpack-eng tesseract-langpack-spa",
    zypper: "tesseract tesseract-ocr-eng tesseract-ocr-spa",
    apk: "tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-spa",
    brew: "tesseract tesseract-lang",
    winget: "UB-Mannheim.TesseractOCR",
    choco: "tesseract",
    scoop: "tesseract",
  },
  ffmpeg: {
    pacman: "ffmpeg",
    apt: "ffmpeg",
    dnf: "ffmpeg",
    zypper: "ffmpeg",
    apk: "ffmpeg",
    brew: "ffmpeg",
    winget: "Gyan.FFmpeg",
    choco: "ffmpeg",
    scoop: "ffmpeg",
  },
  imagemagick: {
    pacman: "imagemagick",
    apt: "imagemagick",
    dnf: "ImageMagick",
    zypper: "ImageMagick",
    apk: "imagemagick",
    brew: "imagemagick",
    winget: "ImageMagick.ImageMagick",
    choco: "imagemagick",
    scoop: "imagemagick",
  },
  libreoffice: {
    pacman: "libreoffice-fresh",
    apt: "libreoffice",
    dnf: "libreoffice",
    zypper: "libreoffice",
    apk: "libreoffice",
    brew: "libreoffice",
    cask: true,
    winget: "TheDocumentFoundation.LibreOffice",
    choco: "libreoffice-fresh",
    scoop: "libreoffice",
  },
  gimp: {
    pacman: "gimp",
    apt: "gimp",
    dnf: "gimp",
    zypper: "gimp",
    apk: "gimp",
    brew: "gimp",
    cask: true,
    winget: "GIMP.GIMP",
    choco: "gimp",
    scoop: "gimp",
  },
  inkscape: {
    pacman: "inkscape",
    apt: "inkscape",
    dnf: "inkscape",
    zypper: "inkscape",
    apk: "inkscape",
    brew: "inkscape",
    cask: true,
    winget: "Inkscape.Inkscape",
    choco: "inkscape",
    scoop: "inkscape",
  },
  potrace: {
    pacman: "potrace",
    apt: "potrace",
    dnf: "potrace",
    zypper: "potrace",
    apk: "potrace",
    brew: "potrace",
    choco: "potrace",
    scoop: "potrace",
  },
  poppler: {
    pacman: "poppler",
    apt: "poppler-utils",
    dnf: "poppler-utils",
    zypper: "poppler-tools",
    apk: "poppler-utils",
    brew: "poppler",
    winget: "oschwartz10612.Poppler",
    choco: "poppler",
    scoop: "poppler",
  },
  php: {
    pacman: "php",
    apt: "php-cli",
    dnf: "php-cli",
    zypper: "php",
    apk: "php",
    brew: "php",
    winget: "PHP.PHP",
    choco: "php",
    scoop: "php",
  },
  ollama: {
    pacman: "ollama",
    brew: "ollama",
    winget: "Ollama.Ollama",
    choco: "ollama",
    scoop: "ollama",
  },
  chrome: {
    pacman: "chromium",
    apt: "chromium",
    dnf: "chromium",
    zypper: "chromium",
    apk: "chromium",
    brew: "google-chrome",
    cask: true,
    winget: "Google.Chrome",
    choco: "googlechrome",
    scoop: "googlechrome",
  },
}

const MANAGERS = {
  linux: [
    ["pacman", "pacman"],
    ["apt", "apt-get"],
    ["dnf", "dnf"],
    ["zypper", "zypper"],
    ["apk", "apk"],
  ],
  darwin: [["brew", "brew"]],
  win32: [
    ["winget", "winget"],
    ["choco", "choco"],
    ["scoop", "scoop"],
  ],
}

export function detectPackageManager(platform = process.platform, has = hasCommand) {
  for (const [id, command] of MANAGERS[platform] ?? []) {
    if (has(command)) return { id, command }
  }
  return null
}

function linuxCommand(manager, packageName) {
  if (manager.id === "pacman") return `sudo pacman -S --needed ${packageName}`
  if (manager.id === "apt") return `sudo apt-get install -y ${packageName}`
  if (manager.id === "dnf") return `sudo dnf install -y ${packageName}`
  if (manager.id === "zypper") return `sudo zypper install -y ${packageName}`
  if (manager.id === "apk") return `sudo apk add ${packageName}`
  return ""
}

export function packageCommand(tool, platform = process.platform, manager = null) {
  const packages = PACKAGES[tool]
  if (!packages) return ""
  if (platform === "darwin") {
    if (!packages.brew) return ""
    return packages.cask ? `brew install --cask ${packages.brew}` : `brew install ${packages.brew}`
  }
  if (platform === "win32") {
    if (!manager) return ""
    if (manager.id === "winget" && packages.winget) {
      return `winget install --id ${packages.winget} -e`
    }
    if (manager.id === "choco" && packages.choco) return `choco install ${packages.choco} -y`
    if (manager.id === "scoop" && packages.scoop) return `scoop install ${packages.scoop}`
    return ""
  }
  if (platform === "linux" && manager) {
    return linuxCommand(manager, packages[manager.id] ?? "")
  }
  return ""
}

export function packageManagerName(platform = process.platform, manager = null) {
  if (!manager) return "package manager not detected"
  if (platform === "darwin") return "Homebrew"
  if (platform === "win32") return manager.id
  return manager.id
}
