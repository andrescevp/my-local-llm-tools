import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { extname, join } from "node:path"

import { runCommand } from "../../lib/exec.mjs"

export function macrosDir(env = process.env, home = homedir()) {
  return env.GIMP_MACROS_DIR || join(home, ".mllt", "gimp", "macros")
}

export function listMacros(dir = macrosDir()) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /\.(py|scm)$/.test(name))
    .sort()
    .map((name) => ({ name: name.replace(/\.(py|scm)$/, ""), file: join(dir, name) }))
}

const TEMPLATE = `# name: {name}
# description: Special-case GIMP macro
# params: text:string
import gi
gi.require_version("Gimp", "3.0")
from gi.repository import Gimp, Gio

img = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path({input}))
d = img.get_selected_drawables()[0]
# Add your GIMP operations here. Example:
# d.brightness_contrast(10, 5)
Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, img, Gio.File.new_for_path({output}))
print("ok")
`

export function newMacro(name, { dir = macrosDir(), force = false } = {}) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    throw new Error("macro name must be kebab-case")
  }
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${name}.py`)
  if (existsSync(file) && !force) throw new Error(`macro already exists: ${file}`)
  writeFileSync(file, TEMPLATE.replaceAll("{name}", name), "utf8")
  return file
}

function schemeString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

export function renderMacro(source, { input, output, params = {}, extension = ".py" }) {
  const quote = extension === ".scm" ? schemeString : (value) => JSON.stringify(String(value))
  let rendered = source.replaceAll("{input}", quote(input)).replaceAll("{output}", quote(output))
  for (const [key, value] of Object.entries(params)) {
    if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`invalid macro param: ${key}`)
    rendered = rendered.replaceAll(`{param:${key}}`, quote(value))
  }
  const unknown = rendered.match(/\{param:([a-z0-9-]+)\}/g) ?? []
  if (unknown.length) throw new Error(`missing macro params: ${unknown.join(", ")}`)
  return rendered
}

export function runMacro(name, options) {
  const file = listMacros(options.dir).find((entry) => entry.name === name)?.file
  if (!file) throw new Error(`macro not found: ${name}`)
  const extension = extname(file)
  const source = readFileSync(file, "utf8")
  const code = renderMacro(source, {
    input: options.input,
    output: options.output,
    params: options.params,
    extension,
  })
  const interpreter = extension === ".scm" ? "plug-in-script-fu-eval" : "python-fu-eval"
  return runCommand("gimp", ["-i", "--batch-interpreter", interpreter, "-b", code, "--quit"], {
    timeout: options.timeout ?? 180000,
  })
}
