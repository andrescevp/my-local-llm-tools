---
name: image-background-removal
description: >
  Use this skill when removing the background from a product photo or image
  locally — U2Net ONNX foreground detection, transparent PNG, padding, square
  canvas, multiple candidates, optional GIMP edge refinement. Trigger on
  "remove the background", "cut out this product", "transparent PNG", or
  "background remover". Gate with
  doctor --skill image-background-removal --cached.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: image-background-removal
---

# Remove image backgrounds locally

Use `pnpm cli remove-bg` for local U2Net inference. No cloud upload and no
Python `rembg` process.

## Requirements

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill image-background-removal --cached
```

The model is rembg's default **`u2net`** (`u2net.onnx`), stored at
`~/.mllt/models/u2net.onnx` or pointed to by `TOOLBOX_U2NET_MODEL`. The CLI does
not download it automatically.

## Workflow

- [ ] Confirm the input image and whether the result is for a marketplace
      (square canvas) or general use.
- [ ] Choose padding and canvas size.
- [ ] Run one result, or generate candidates and compare them.
- [ ] Verify transparency and edges in an image viewer.
- [ ] Keep the original input untouched.

## Commands

```bash
# Single output
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" remove-bg \
  --input /abs/product.jpg --output /abs/product.png --padding 30

# Square marketplace canvas
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" remove-bg \
  --input /abs/product.jpg --output /abs/product.png --padding 40 --canvas-size 1080

# Multiple candidates for user selection
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" remove-bg \
  --input /abs/product.jpg --out-dir /abs/candidates --variants 3

# Pick the chosen candidate
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" remove-bg \
  --input /abs/product.jpg --output /abs/product.png --pick 2

# Optional GIMP edge refinement
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" remove-bg \
  --input /abs/product.jpg --output /abs/product.png --gimp-refine
```

`--variants` writes `candidate-1.png`, `candidate-2.png`, … and
`candidates.json` with parameters. Compare them visually; the CLI does not
delete candidates automatically.

## Model and dependencies

| Item | Value |
|---|---|
| Model | `u2net.onnx` (rembg default) |
| Runtime | `onnxruntime-node` |
| Image processing | `sharp` |
| Optional refinement | local GIMP |

Missing model or runtime exits `3` with a `setup` hint.

## Limits

- U2Net is CPU-heavy on large images; cap dimensions when batching.
- Semi-transparent edges are preserved, but fine hair/fur may need manual
  refinement.
- Fully transparent inputs keep their original size with padding.
- Single image at a time; batch loops belong to the calling agent.
- Background removal is not OCR; use `ocr` for text in images.

## Validation checklist

- [ ] `doctor --skill image-background-removal --cached` passes
- [ ] Output is a valid PNG with transparency
- [ ] Edges and subject are acceptable at 100% zoom
- [ ] Candidates were compared before `--pick`
- [ ] Original file is unchanged
