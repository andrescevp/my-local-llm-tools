---
name: presentations-generator
description: >
  Use this skill when generating a PPTX, HTML, or PDF presentation from JSON —
  11 slide types, 8 chart types, 4 themes, EJS templates, offline assets, and
  local rendering. Trigger on "generate a presentation", "make a slide deck",
  "create a PPTX from this JSON", "turn this data into slides", or "build a PDF
  report". Gate with doctor --skill presentations-generator --cached.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: presentation-generation
---

# Presentations generator

Generate a presentation from one JSON config. Output extension selects the
engine: `.pptx` (PptxGenJS), `.html` (reveal.js), or `.pdf` (Playwright
Chromium).

## Requirements

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill presentations-generator --cached
```

PPTX/HTML need Node only; PDF also needs Playwright Chromium.

## Workflow

- [ ] Ask for the output format, theme, and slide outline if unclear.
- [ ] Write a JSON config with at least one slide.
- [ ] Run the CLI and inspect the printed output path.
- [ ] For PDF, verify fonts/charts after rendering.
- [ ] Never overwrite an existing deck without `--force`.

## Commands

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" presentation \
  --input /abs/config.json --output /abs/deck.pptx

node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" presentation \
  --input /abs/config.json --output /abs/deck.html --theme corporate

node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" presentation \
  --input /abs/config.json --output /abs/report.pdf \
  --page-size A4 --margin 15mm

node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" presentation --list-themes
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" presentation --list-templates
```

## Config

```json
{
  "title": "Quarterly Report",
  "author": "Local Toolbelt",
  "date": "2026-10-26",
  "theme": "corporate",
  "template": "reveal",
  "theme_overrides": { "colors": { "accent": "#FF6600" } },
  "slides": [
    { "type": "title", "title": "Welcome", "subtitle": "Generated locally" },
    { "type": "bullets", "title": "Key points", "items": ["A", "B"] },
    { "type": "chart", "title": "Revenue", "chart_type": "bar",
      "labels": ["Q1", "Q2"],
      "datasets": [{ "label": "Actual", "data": [10, 20], "color": "#0066CC" }] }
  ]
}
```

- `theme`: name (`default`, `corporate`, `light`, `dark`), JSON path, or inline
  JSON string.
- `template`: name (`reveal`, `slides`), `.ejs` path, or inline EJS.
- `theme_overrides`: deep-merged into the theme.
- `theme`/`template` CLI flags win over config values.

## Slide types

| Type | Fields |
|---|---|
| `title` | `title`, `subtitle` |
| `section` | `title`, `subtitle` |
| `bullets` | `title`, `items` |
| `text` | `title`, `body` |
| `image` | `title`, `src`, `caption` |
| `gallery` | `title`, `images` |
| `video` | `title`, `src`, `poster` |
| `table` | `title`, `headers`, `rows` |
| `columns` | `title`, `columns: [{ title, items }]` |
| `chart` | `title`, `chart_type`, `labels`, `datasets` |
| `closing` | `title`, `subtitle` |

Chart types: `bar`, `column`, `line`, `pie`, `doughnut`, `area`,
`bar_stacked`, `line_markers`.

## Themes and templates

Built-in themes live in `src/commands/presentation/themes`; templates in
`src/commands/presentation/templates`. HTML/PDF assets are copied into
`<output>-assets/` so decks work offline.

Custom templates are EJS files. They receive:

| Variable | Meaning |
|---|---|
| `config` | Full presentation config |
| `theme` | Merged theme object |
| `assets` | Relative asset directory |

## Gotchas

- Inline themes/templates must be JSON/EJS strings; escape quotes in JSON.
- PPTX always uses the built-in engine; `--template` affects HTML/PDF only.
- PPTX tables should keep rows aligned with headers.
- Charts need matching `labels`/`data` lengths.
- Video in PPTX falls back to a poster if media embedding is unavailable.
- PDF rendering waits for `networkidle`; local assets keep it offline.
- Output paths must be writable; the CLI refuses collisions without `--force`.

## Validation checklist

- [ ] `doctor --skill presentations-generator --cached` passes
- [ ] Config has at least one slide and valid types
- [ ] Output extension is `.pptx`, `.html`, or `.pdf`
- [ ] Charts/tables have consistent data
- [ ] Deck opened and inspected
