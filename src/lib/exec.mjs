import { spawnSync } from "node:child_process"

const isWindows = process.platform === "win32"

/** Cross-platform `which`/`where`. */
export function hasCommand(name) {
  const finder = isWindows ? "where" : "which"
  return spawnSync(finder, [name], { encoding: "utf8" }).status === 0
}

/** Cross-platform command runner with a captured or inherited stdio. */
export function runCommand(command, args = [], options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout ?? 60000,
    stdio: options.stdio ?? "pipe",
    env: options.env ?? process.env,
    cwd: options.cwd,
  })
}

export function binaryVersion(command, args = ["--version"]) {
  if (!hasCommand(command)) return { ok: false, version: "", error: "not found" }
  const result = runCommand(command, args, { timeout: 15000 })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  return {
    ok: result.status === 0,
    version: output.split("\n")[0] ?? "",
    error: result.status === 0 ? "" : (output.split("\n")[0] ?? `exit ${result.status}`),
  }
}
