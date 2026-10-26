import { existsSync, mkdirSync, statSync } from "node:fs"
import { dirname, extname, resolve } from "node:path"

import { parseFlags } from "../lib/args.mjs"
import { loadConfig } from "./presentation/config.mjs"
import { renderHtml } from "./presentation/html.mjs"
import { renderPdf } from "./presentation/pdf.mjs"
import { renderPptx } from "./presentation/pptx/engine.mjs"
import { applyOverrides, listThemes, loadTheme } from "./presentation/theme.mjs"

const SPEC = {
  "--input": { key: "input" },
  "-o": { key: "output" },
  "--output": { key: "output" },
  "-t": { key: "theme" },
  "--theme": { key: "theme" },
  "-T": { key: "template" },
  "--template": { key: "template" },
  "--page-size": { key: "pageSize" },
  "--margin": { key: "margin" },
  "--list-themes": { key: "listThemes", type: "boolean" },
  "--list-templates": { key: "listTemplates", type: "boolean" },
  "--force": { key: "force", type: "boolean" },
}

export const PRESENTATION_HELP = `Usage: node src/cli.mjs presentation --input CONFIG.json --output FILE [options]

Options:
  --input FILE        JSON config (or pass it as the first positional argument)
  --output, -o FILE   Output .pptx, .html, or .pdf
  --theme, -t SPEC    Theme name, JSON path, or inline JSON
  --template, -T SPEC Template name, .ejs path, or inline EJS
  --page-size SIZE    PDF page size (default: A4)
  --margin SIZE       PDF margin (default: 20mm)
  --list-themes       List built-in themes
  --list-templates    List built-in templates
  --force             Overwrite an existing output
  -h, --help          Show this help
`

export async function presentation(argv, { log = console.log, warn = console.warn } = {}) {
  if (argv.includes("-h") || argv.includes("--help")) {
    log(PRESENTATION_HELP)
    return 0
  }
  let values
  try {
    values = parseFlags(argv, SPEC)
  } catch (error) {
    warn(`${error.message}\n\n${PRESENTATION_HELP}`)
    return 2
  }
  values = values.values
  const input = values.input || values.positionals?.[0]

  if (values.listThemes) {
    for (const theme of listThemes()) log(`${theme.name.padEnd(12)} ${theme.description}`)
    return 0
  }
  if (values.listTemplates) {
    log("reveal\nslides")
    return 0
  }
  if (!input || !values.output) {
    warn(PRESENTATION_HELP)
    return 2
  }

  let config
  try {
    config = loadConfig(resolve(input))
  } catch (error) {
    warn(`ERROR: ${error.message}`)
    return 2
  }
  const output = resolve(values.output)
  if (existsSync(output) && !values.force) {
    warn(`ERROR: output already exists: ${output} (use --force)`)
    return 2
  }
  mkdirSync(dirname(output), { recursive: true })

  let theme
  try {
    theme = loadTheme(values.theme || config.theme || "default")
    if (config.theme_overrides) theme = applyOverrides(theme, config.theme_overrides)
  } catch (error) {
    warn(`ERROR: ${error.message}`)
    return 2
  }

  const ext = extname(output).toLowerCase()
  try {
    if (ext === ".html") {
      renderHtml({
        config,
        theme,
        template: values.template || config.template,
        outputPath: output,
      })
    } else if (ext === ".pdf") {
      await renderPdf({
        config,
        theme,
        template: values.template || config.template,
        outputPath: output,
        pageSize: values.pageSize || "A4",
        margin: values.margin || "20mm",
      })
    } else if (ext === ".pptx") {
      await renderPptx({ config, theme, outputPath: output })
    } else {
      warn(`ERROR: unsupported output extension: ${ext}`)
      return 2
    }
  } catch (error) {
    warn(`ERROR: ${error.message}`)
    return 4
  }
  if (!existsSync(output) || statSync(output).size === 0) {
    warn(`ERROR: no output produced: ${output}`)
    return 4
  }
  log(`Created: ${output}`)
  return 0
}
