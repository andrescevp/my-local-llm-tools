import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const ROOT = new URL("..", import.meta.url).pathname
const DIRS = [
  "skills/convert-files",
  "skills/autoedit-with-gimp",
  "skills/autoedit-with-inkscape",
  "skills/image-background-removal",
  "skills/presentations-generator",
  "src/commands/convert.mjs",
  "src/commands/gimp.mjs",
  "src/commands/gimp",
  "src/commands/inkscape.mjs",
  "src/commands/remove-bg.mjs",
  "src/commands/remove-bg",
  "src/commands/presentation.mjs",
  "src/commands/presentation",
]
const FORBIDDEN = [
  "n8n",
  "Docker",
  "Container Runner",
  "igpt-n8n-stack-toolbox",
  "/input",
  "/output",
  "uv run",
  "pwuser",
  "create_presentation.py",
  "docker-scripts",
  "python-pptx",
  "Jinja2",
  "n8n-vps-stack",
]

function files(path, result = []) {
  const absolute = join(ROOT, path)
  const stat = statSync(absolute)
  if (stat.isFile()) {
    result.push(absolute)
    return result
  }
  for (const entry of readdirSync(absolute)) files(join(path, entry), result)
  return result
}

test("extracted files contain no source-specific references", () => {
  const problems = []
  for (const dir of DIRS) {
    for (const file of files(dir)) {
      if (!/\.(md|mjs|json|ejs)$/.test(file)) continue
      const text = readFileSync(file, "utf8")
      for (const token of FORBIDDEN) {
        if (text.includes(token)) problems.push(`${file}: ${token}`)
      }
    }
  }
  assert.deepEqual(problems, [])
})

test("no scraper dependencies or modules are present", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const name of ["fast-xml-parser", "exceljs"]) assert.equal(deps[name], undefined)
  for (const dir of ["src/commands/bdns", "src/commands/borme", "src/commands/gmaps"]) {
    assert.throws(() => statSync(join(ROOT, dir)))
  }
})
