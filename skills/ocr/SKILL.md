---
name: ocr
description: >
  Use this skill when extracting text or structure from screenshots, scanned
  pages, PDF page images, whiteboards, charts, diagrams, or UI captures with a
  local OCR-capable vision model — producing markdown or JSON from text, tables,
  labels, and annotations, with prompt templates and confidence notes. Trigger on
  "extract text from this screenshot", "read this chart and list percentages",
  "OCR this scanned invoice", or "parse labels from a chart". Uses Ollama with
  MedAIBase/PaddleOCR-VL:0.9b.
license: MIT
compatibility: opencode, copilot, antigravity
allowed-tools: bash, read
metadata:
  audience: developers
  workflow: multimodal-extraction
---

> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Run the CLI as `node "$SKILL_DIR/../../src/cli.mjs" ocr ...`.

# OCR with Local Ollama (PaddleOCR-VL)

Extract text and structure from images/documents through a local Ollama instance so agents can "see" technical visuals safely (no external upload).

## Core rules

- Default model: `MedAIBase/PaddleOCR-VL:0.9b`
- Default Ollama endpoint: `http://127.0.0.1:11434`
- Keep processing local-first; do not upuse user images to third-party APIs
- Use deterministic extraction defaults (`temperature=0`)
- Return source-qualified output:
  - extracted content
  - uncertain segments / low-confidence interpretation notes
  - optional normalized JSON when requested

## Workflow

Progress:
- [ ] 1) Confirm input image path(s) and requested output shape (text/markdown/json)
- [ ] 2) Verify Ollama service and model availability
- [ ] 3) Run extraction using bundled script
- [ ] 4) Validate completeness (headings, totals, labels, legends, units)
- [ ] 5) Return result + uncertainty notes

### 1) Verify environment

```bash
ollama --version
ollama list | rg "MedAIBase/PaddleOCR-VL:0.9b" || ollama pull MedAIBase/PaddleOCR-VL:0.9b
```

### 2) Run OCR extraction

```bash
node "$SKILL_DIR/../../src/cli.mjs" ocr \
  --image "/absolute/path/to/image.png" \
  --prompt "Extract all visible text and preserve structure in markdown." \
  --format markdown
```

### 3) Multi-image extraction (batch)

```bash
node "$SKILL_DIR/../../src/cli.mjs" ocr \
  --image "/abs/page-1.png" \
  --image "/abs/page-2.png" \
  --prompt "Extract text from all pages and keep page boundaries."
```

## Output conventions

- **Default**: clean markdown preserving natural sections
- **If requested**: JSON with stable keys, e.g. `title`, `sections`, `table_rows`, `labels`
- For charts: include explicit metric-value pairs and cite where each came from (legend, axis, slice label)
- Mark uncertain reads with `uncertain: true` or a short note

## Reference triggers

Use these references only when needed:

| Reference | When to use | File |
|-----------|-------------|------|
| Prompt templates | User needs task-specific prompts (invoice, chart, diagram, handwriting) | `references/prompt-templates.md` |
| Output contracts | User requests strict JSON schema or post-processing structure | `references/output-contracts.md` |
| Troubleshooting | Model/service errors, timeout, poor recognition quality | `references/troubleshooting.md` |

## CLI

- `node "$SKILL_DIR/../../src/cli.mjs" ocr --image PATH ...`
  - Calls local Ollama `/api/generate` with base64-encoded images
  - Defaults to model `MedAIBase/PaddleOCR-VL:0.9b`
  - Supports one or many `--image` flags

## Gotchas

- Low-resolution images cause missing punctuation and merged characters; upsample before OCR when possible.
- Rotated captures may degrade extraction; rotate to upright orientation first.
- For dense tables, ask for "row-by-row extraction" explicitly.
- If an image is a PDF page screenshot, include page number in prompt for traceability.

## Validation checklist

- [ ] Skill name matches directory: `ocr`
- [ ] Uses local Ollama endpoint (no external OCR API)
- [ ] Model default is `MedAIBase/PaddleOCR-VL:0.9b`
- [ ] Extraction output includes uncertainty notes when ambiguity exists
- [ ] Main `SKILL.md` stays under 250 lines
