---
name: image-analysis
description: >
  Use this skill to analyze, describe, or understand images with a local Ollama
  vision model — screenshots, photos, charts, diagrams, scanned pages, or image
  pairs, with multi-image analysis, model auto-detection, deterministic output,
  and markdown/json/raw formats. Trigger on "analyze this image", "describe
  what's in this picture", "what does this screenshot show", or "read this
  chart/diagram", or when visual content must stay local. Uses minicpm-v4.6;
  prefer ocr for pure text extraction.
license: MIT
compatibility: opencode, copilot, antigravity
allowed-tools: bash, read
metadata:
  audience: developers
  workflow: multimodal-analysis
---

> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Run the CLI as `node "$SKILL_DIR/../../src/cli.mjs" image ...`.

# Image Analysis with Local Ollama

Understand and describe images through local Ollama vision models — no
external upload, everything stays on-machine.

## Core rules

- Default model: `minicpm-v4.6:latest`; OCR model: `MedAIBase/PaddleOCR-VL:0.9b`
- Endpoint: `http://127.0.0.1:11434` — local-first, never upload images
- `temperature=0` for deterministic output
- Default mode is auto-detected from the model name (analyze vs ocr)
- **Automatic vision fallback**: if the chosen model cannot accept images
  (PaddleOCR-VL is currently published without mmproj), the script retries
  with `minicpm-v4.6:latest` and prints a WARN on stderr
- Image paths must be absolute

## Workflow

Progress:
- [ ] 1) Confirm image path(s) and requested output (describe/OCR/compare + format)
- [ ] 2) Verify Ollama service and model availability
- [ ] 3) Run analysis with the bundled script
- [ ] 4) Validate completeness (missing areas, hallucinated details)
- [ ] 5) Return result + uncertainty notes when applicable

### 1) Verify environment

```bash
ollama list | rg "minicpm-v4.6|PaddleOCR-VL" || ollama pull minicpm-v4.6:latest
```

### 2) Analyze an image (minicpm default)

```bash
node "$SKILL_DIR/../../src/cli.mjs" image \
  --image "/abs/path/image.png"
```

### 3) OCR mode (PaddleOCR, falls back to minicpm if vision unsupported)

```bash
node "$SKILL_DIR/../../src/cli.mjs" image \
  --image "/abs/path/page.png" --model "MedAIBase/PaddleOCR-VL:0.9b" --mode ocr
```

Note: if the OCR model reports "image input is not supported" (missing
mmproj), the script automatically retries with minicpm-v4.6 and warns on
stderr — extraction still succeeds.

### 4) Compare two images

```bash
node "$SKILL_DIR/../../src/cli.mjs" image \
  --image "/abs/a.png" --image "/abs/b.png" \
  --prompt "Compare these two images: shared elements, differences, which is better and why."
```

### 5) Structured output

```bash
node "$SKILL_DIR/../../src/cli.mjs" image \
  --image "/abs/chart.png" --format json \
  --prompt "Return ONLY a JSON object with chart values, no markdown fences."
```

## Output conventions

- **Default**: concise structured markdown (description, subjects, context)
- **Charts**: report exact value pairs with sources (legend/axis/label)
- **If requested**: JSON with stable keys; Spanish or English as user asks
- Mark uncertain reads explicitly (`uncertain`, or a short note)

## Reference triggers

| Reference | When to use | File |
|-----------|-------------|------|
| Prompt templates | Task-specific analysis: UI, charts, diagrams, photos, comparison, strict JSON | `references/prompt-templates.md` |
| Troubleshooting | Ollama down, model missing, timeouts, hallucinations, poor quality | `references/troubleshooting.md` |

## CLI

- `node "$SKILL_DIR/../../src/cli.mjs" image --image PATH ...`
  - Local Ollama `/api/generate` with base64-encoded images
  - Default model `minicpm-v4.6:latest`; `--mode auto|analyze|ocr`
  - One or many `--image` flags; `--format markdown|json|raw`; `--timeout`

## Gotchas

- First call with minicpm loads weights (GPU): allow extra time or `--timeout 300`
- Dense text: prefer PaddleOCR-VL; minicpm is for understanding, not transcription
- Low-res/rotated images degrade both models; upscale/rotate first
- For strict data extraction append "report only numbers you can see"
- Images over ~4 MP: downscale before sending

## Validation checklist

- [ ] Skill name matches directory: `image-analysis`
- [ ] Uses local Ollama endpoint (no external image API)
- [ ] Default model `minicpm-v4.6:latest` with OCR fallback `MedAIBase/PaddleOCR-VL:0.9b`
- [ ] Tests pass: `pnpm test`
- [ ] Main `SKILL.md` stays under 250 lines