---
name: autoedit-with-inkscape
description: >
  Use this skill when working with SVG/vector files locally — export to
  PNG/PDF/EPS/PS, query geometry, clean/plain SVG, rotate/flip/to-path, or
  vectorize a bitmap with Potrace. Trigger on "convert SVG to PNG", "export
  this vector", "clean this SVG", "trace this logo", or "vectorize this image".
  Gate with doctor --skill autoedit-with-inkscape --cached.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: vector-editing
---

# Auto-edit vectors with Inkscape

Use `pnpm cli inkscape` for SVG/vector operations. The CLI maps flags to a
fixed whitelist of Inkscape actions; arbitrary `--actions` are not accepted.

## Requirements

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill autoedit-with-inkscape --cached
```

Inkscape is required; Potrace is optional and only needed for `vectorize`.

## Operations

### Export / convert

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" inkscape export \
  --input /abs/in.svg --output /abs/out.png --dpi 300
```

| Flag | Meaning |
|---|---|
| `--dpi N` | Raster resolution (default 96; use 300 for print) |
| `--page N` | Export a specific page |
| `--area drawing\|page\|x0:y0:x1:y1` | Export area |
| `--id ID` | Export only an object |
| `--width N`, `--height N` | Raster dimensions |
| `--background HEX`, `--background-opacity N` | Background |

Supported extensions include PNG, PDF, EPS, PS, EMF, WMF, and ODG. The output
extension selects the format.

### Query

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" inkscape query \
  --input /abs/in.svg --json
```

Returns object IDs, positions, and dimensions.

### Clean

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" inkscape clean \
  --input /abs/in.svg --output /abs/clean.svg
```

Writes plain SVG without editor metadata.

### Edit

Whitelisted actions only:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" inkscape edit \
  --input /abs/in.svg --output /abs/out.svg --rotate 90

node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" inkscape edit \
  --input /abs/in.svg --output /abs/out.svg --flip horizontal

node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" inkscape edit \
  --input /abs/in.svg --output /abs/out.svg --fit-canvas selection
```

Supported edits: rotate 90/180/270, flip horizontal/vertical, object-to-path,
text-to-path, and fit-canvas. There is no arbitrary action string.

### Vectorize

Bitmap → single-colour SVG with Potrace:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" inkscape vectorize \
  --input /abs/logo.png --output /abs/logo.svg --threshold 0.5 --turdsize 2
```

Multiple candidates:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" inkscape vectorize \
  --input /abs/logo.png --out-dir /abs/candidates --variants 3
# inspect candidates.json, then:
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" inkscape vectorize \
  --input /abs/logo.png --output /abs/logo.svg --pick 2
```

`--variants` changes threshold/turd-size. Vectorization is single-colour; use
Inkscape or another tool for multi-colour tracing.

## Limits

- Inkscape 1.x flag names only.
- Default raster DPI is 96; set 300 for print.
- Complex SVGs can render differently depending on fonts and filters.
- Vectorization works best on high-contrast logos and line art.
- For raster editing, use `autoedit-with-gimp`; for background removal, use
  `image-background-removal`.

## Validation checklist

- [ ] `doctor --skill autoedit-with-inkscape --cached` passes
- [ ] Output exists and is non-empty
- [ ] Export dimensions/format match the request
- [ ] Vectorization candidates were inspected before `--pick`
