---
name: ocr
description: >
  Use this skill when extracting text or structure from documents, reports,
  tables, forms, screenshots, or scanned pages with a local OCR vision model —
  producing markdown or JSON from text, tables, labels, and annotations, with
  prompt templates and confidence notes. Use it directly for
  documents/tables/reports or explicit OCR requests; for general image
  understanding start with image-analysis, then run ocr for the text-heavy
  detail. Defaults to MedAIBase/PaddleOCR-VL:0.9b on local Ollama.
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

## Responsibility split

- **Direct use** for documents, reports, tables, forms, invoices, or any
  explicit "extract text / OCR this" request.
- **After a general pass** when the user asked what an image *is* but it also
  contains dense text: `image-analysis` first (minicpm), then this skill for the
  exact text/tables.
- Do not use OCR for scene description, photo understanding, or UI layout
  questions where no text extraction is needed.

## Core rules

- Default model: `MedAIBase/PaddleOCR-VL:0.9b`
- Default Ollama endpoint: `http://127.0.0.1:11434`
- Keep processing local-first; do not upload user images to third-party APIs
- Use deterministic extraction defaults (`temperature=0`)
- Return source-qualified output:
  - extracted content
  - uncertain segments / low-confidence interpretation notes
  - optional normalized JSON when requested

## Workflow

Progress:
- [ ] 1) Confirm input image path(s) and requested output shape (text/markdown/json)
- [ ] 2) Verify Ollama service and model availability
- [ ] 3) Run extraction with the CLI
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
