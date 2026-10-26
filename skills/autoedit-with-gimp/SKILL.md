---
name: autoedit-with-gimp
description: >
  Use this skill when editing or optimizing raster images with local GIMP —
  resize, convert, compress, crop, rotate, flip, blur, sharpen, color
  adjustments, text/watermark, borders, or custom GIMP macros. Trigger on
  "resize this image", "convert to webp", "optimize this PNG", "add a
  watermark", or "edit this photo". Gate with
  doctor --skill autoedit-with-gimp --cached.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: image-editing
---

# Auto-edit images with GIMP

Use `pnpm cli gimp` for deterministic GIMP 3 batch edits. Operations are a
fixed whitelist; arbitrary Scheme is not accepted.

## Requirements

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill autoedit-with-gimp --cached
```

GIMP must be in `PATH`. If missing, run `setup` and follow the GIMP hint.

## Workflow

- [ ] Confirm input path, output path, and target format.
- [ ] Choose the smallest operation that achieves the result.
- [ ] Run the command; use `--force` only to replace an existing output.
- [ ] Inspect the output dimensions/format and verify the file is non-empty.

## Operations

| Operation | Useful flags |
|---|---|
| `resize` | `--width`, `--height` |
| `convert` | output extension controls format |
| `optimize` | output extension; use `convert` for quality |
| `crop` | `--x`, `--y`, `--width`, `--height` |
| `rotate` | `--angle 90\|180\|270` |
| `flip` | `--direction horizontal\|vertical` |
| `blur` | `--radius` |
| `sharpen` | `--amount`, `--radius` |
| `grayscale` | — |
| `brightness-contrast` | `--brightness`, `--contrast` |
| `hue-saturation` | `--hue`, `--saturation`, `--lightness` |
| `levels` | `--black`, `--white`, `--gamma` |
| `sepia` | — |
| `vignette` | `--radius`, `--softness` |
| `autocrop` | — |
| `text` | `--text`, `--font`, `--size`, `--x`, `--y` |
| `border` | `--border` |

## Examples

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" gimp resize \
  --input /abs/in.png --output /abs/out.png --width 1200 --height 800

node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" gimp convert \
  --input /abs/in.png --output /abs/out.webp

node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" gimp brightness-contrast \
  --input /abs/in.png --output /abs/out.png --brightness 10 --contrast 5

node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" gimp text \
  --input /abs/in.png --output /abs/out.png \
  --text "Sample" --size 48 --x 40 --y 40
```

## Custom macros

Macros are trusted local files in `~/.mllt/gimp/macros` (override with
`GIMP_MACROS_DIR`). A macro uses `{input}`, `{output}`, and optional
`{param:name}` placeholders.

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" gimp macro new watermark
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" gimp macro list
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" gimp macro run watermark \
  --input /abs/in.png --output /abs/out.png --param text=Demo
```

Macros execute with your user privileges. Review them before running; never run
untrusted macros.

## Limits

- GIMP startup is slow; use a generous `--timeout`.
- Text and border results depend on installed fonts and image dimensions.
- The CLI uses Python-Fu internally for GIMP 3; you do not need a Python
  project or a separate Python script.
- For background removal, use `image-background-removal` instead.

## Validation checklist

- [ ] `doctor --skill autoedit-with-gimp --cached` passes
- [ ] Output exists, is non-empty, and has the expected format
- [ ] Input file was not modified
- [ ] Macro name/path is trusted and reviewed
