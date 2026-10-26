import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { commandPath, runCommand } from "./exec.mjs"

function portableCandidates(home, platform) {
  if (platform === "darwin") {
    return [
      join(home, "LibreOffice.app", "Contents", "MacOS", "soffice"),
      join(home, "Applications", "LibreOffice.app", "Contents", "MacOS", "soffice"),
    ]
  }
  if (platform === "win32") {
    return [join(home, "libreoffice", "program", "soffice.exe")]
  }
  return [join(home, "libreoffice", "program", "soffice"), join(home, "soffice.AppImage")]
}

function systemCandidates(platform, env, which) {
  if (platform === "darwin") {
    return [which("soffice"), "/Applications/LibreOffice.app/Contents/MacOS/soffice"]
  }
  if (platform === "win32") {
    return [
      which("soffice"),
      join(env.ProgramFiles ?? "C:\\Program Files", "LibreOffice", "program", "soffice.exe"),
      join(
        env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
        "LibreOffice",
        "program",
        "soffice.exe",
      ),
      join(
        env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
        "Programs",
        "LibreOffice",
        "program",
        "soffice.exe",
      ),
    ]
  }
  return [which("soffice"), "/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice"]
}

export function resolveLibreOffice({
  env = process.env,
  platform = process.platform,
  home = homedir(),
  exists = existsSync,
  which = commandPath,
} = {}) {
  const override = String(env.LIBREOFFICE_BIN ?? "").trim()
  if (override) {
    return exists(override)
      ? { ok: true, path: override, source: "env" }
      : { ok: false, path: override, source: "env", error: "LIBREOFFICE_BIN does not exist" }
  }

  for (const candidate of systemCandidates(platform, env, which).filter(Boolean)) {
    if (exists(candidate)) return { ok: true, path: candidate, source: "system" }
  }

  const portableHome = env.LIBREOFFICE_HOME || join(home, ".mllt")
  for (const candidate of portableCandidates(portableHome, platform)) {
    if (exists(candidate)) return { ok: true, path: candidate, source: "lih" }
  }

  return {
    ok: false,
    path: "",
    source: "",
    error: "LibreOffice not found (checked system, PATH, and ~/.mllt)",
  }
}

export function probeLibreOffice(path, { run = runCommand } = {}) {
  if (!path) return { ok: false, version: "", path, error: "not found" }
  const result = run(path, ["--version"], { timeout: 15000 })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  return {
    ok: result.status === 0,
    version: output.split("\n")[0] ?? "",
    path,
    error: result.status === 0 ? "" : (output.split("\n")[0] ?? `exit ${result.status}`),
  }
}

export function buildConvertArgs({ filter, outDir, profileDir, input }) {
  return [
    "--headless",
    "--norestore",
    "--nolockcheck",
    "--nodefault",
    "--nofirststartwizard",
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    "--convert-to",
    filter,
    "--outdir",
    outDir,
    input,
  ]
}
