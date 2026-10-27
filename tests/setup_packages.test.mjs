import assert from "node:assert/strict"
import test from "node:test"
import { planInstall } from "../src/commands/setup/install.mjs"
import { detectPackageManager, packageCommand } from "../src/commands/setup/packages.mjs"

test("detects the first available package manager", () => {
  const linux = detectPackageManager("linux", (name) => name === "apt-get")
  assert.deepEqual(linux, { id: "apt", command: "apt-get" })
  const windows = detectPackageManager("win32", (name) => name === "winget")
  assert.deepEqual(windows, { id: "winget", command: "winget" })
  assert.equal(
    detectPackageManager("darwin", () => false),
    null,
  )
})

test("builds Linux package-manager commands", () => {
  assert.equal(
    packageCommand("ffmpeg", "linux", { id: "apt", command: "apt-get" }),
    "sudo apt-get install -y ffmpeg",
  )
  assert.equal(
    packageCommand("libreoffice", "linux", { id: "pacman", command: "pacman" }),
    "sudo pacman -S --needed libreoffice-fresh",
  )
  assert.equal(
    packageCommand("poppler", "linux", { id: "dnf", command: "dnf" }),
    "sudo dnf install -y poppler-utils",
  )
})

test("builds macOS and Windows commands", () => {
  assert.equal(
    packageCommand("libreoffice", "darwin", { id: "brew", command: "brew" }),
    "brew install --cask libreoffice",
  )
  assert.equal(
    packageCommand("gimp", "win32", { id: "winget", command: "winget" }),
    "winget install --id GIMP.GIMP -e",
  )
  assert.equal(
    packageCommand("potrace", "win32", { id: "choco", command: "choco" }),
    "choco install potrace -y",
  )
})

test("falls back when a package manager has no mapping", () => {
  assert.equal(packageCommand("potrace", "win32", { id: "winget", command: "winget" }), "")
  assert.equal(packageCommand("unknown", "linux", { id: "apt", command: "apt-get" }), "")
})

test("planInstall installs uv and prepares pnpm through Corepack", () => {
  const manifest = {
    tools: {
      pnpm: { ok: false },
      uv: { ok: false },
      php: { ok: false },
      phpenv: { ok: false },
      tesseract: { ok: true },
      ffmpeg: { ok: true },
      ffprobe: { ok: true },
      piper: { ok: true },
      voice_model: { ok: true },
      libreoffice: { ok: true },
      imagemagick: { ok: true },
      hyprwhspr: { ok: true },
      gimp: { ok: true },
      inkscape: { ok: true },
      potrace: { ok: true },
      pdftoppm: { ok: true },
      playwright: { ok: true },
      u2net_model: { ok: true },
    },
    ollama: {
      reachable: true,
      host: "http://127.0.0.1:11434",
      models: { available: [], required: [], missing: [] },
    },
  }
  const actions = planInstall(manifest, "/repo", "linux", {
    manager: { id: "apt", command: "apt-get" },
  })
  assert.equal(actions.find((action) => action.id === "uv").kind, "command")
  assert.equal(actions.find((action) => action.id === "pnpm").kind, "command")
  assert.match(actions.find((action) => action.id === "php").detail, /apt-get install -y php-cli/)
})

test("planInstall uses the detected manager in manual hints", () => {
  const manifest = {
    tools: {
      pnpm: { ok: true },
      tesseract: { ok: false },
      ffmpeg: { ok: false },
      ffprobe: { ok: false },
      piper: { ok: true },
      voice_model: { ok: true },
    },
    ollama: {
      reachable: true,
      host: "http://127.0.0.1:11434",
      models: { available: [], required: [], missing: [] },
    },
  }
  const actions = planInstall(manifest, "/repo", "linux", {
    manager: { id: "apt", command: "apt-get" },
  })
  const tesseract = actions.find((action) => action.id === "tesseract")
  assert.match(tesseract.detail, /apt-get install -y tesseract-ocr/)
  const ffmpeg = actions.find((action) => action.id === "ffmpeg")
  assert.match(ffmpeg.detail, /apt-get install -y ffmpeg/)
})
