import { binaryVersion, commandPath } from "./exec.mjs"

export function resolveImageMagick() {
  if (commandPath("magick")) {
    const modern = binaryVersion("magick", ["-version"])
    if (modern.ok && /ImageMagick/i.test(modern.version)) {
      return { ...modern, source: "magick" }
    }
  }
  const legacy = binaryVersion("convert", ["-version"])
  if (legacy.ok && /ImageMagick/i.test(legacy.version)) {
    return { ...legacy, source: "convert" }
  }
  return {
    ok: false,
    version: "",
    path: "",
    source: "",
    error: "ImageMagick not found",
  }
}

export function imagemagickHint(platform) {
  if (platform === "darwin") return "brew install imagemagick"
  if (platform === "win32") return "winget install ImageMagick.ImageMagick"
  return "sudo pacman -S imagemagick (or your distro package)"
}
