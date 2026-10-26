import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const THEMES = join(HERE, "themes")

export function hexToRgb(value) {
  const hex = String(value ?? "").replace(/^#/, "")
  if (!/^[0-9a-f]{6}$/i.test(hex)) return [0, 0, 0]
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
}

export function deepMerge(base, override) {
  for (const [key, value] of Object.entries(override ?? {})) {
    if (base[key] && typeof base[key] === "object" && value && typeof value === "object") {
      deepMerge(base[key], value)
    } else {
      base[key] = value
    }
  }
  return base
}

export function loadTheme(spec = "default") {
  const raw = String(spec ?? "default").trim()
  if (raw.startsWith("{")) return JSON.parse(raw)
  const candidate = resolve(raw)
  if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, "utf8"))
  const builtin = join(THEMES, `${raw}.json`)
  if (existsSync(builtin)) return JSON.parse(readFileSync(builtin, "utf8"))
  return JSON.parse(readFileSync(join(THEMES, "default.json"), "utf8"))
}

export function listThemes() {
  return ["default", "corporate", "light", "dark"].map((name) => {
    try {
      const theme = JSON.parse(readFileSync(join(THEMES, `${name}.json`), "utf8"))
      return { name, description: theme.name ?? name }
    } catch {
      return { name, description: "(invalid)" }
    }
  })
}

export function applyOverrides(theme, overrides) {
  return deepMerge(structuredClone(theme), overrides)
}
