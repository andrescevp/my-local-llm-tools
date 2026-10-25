---
name: ocr
description: >
  Use this skill when extracting text or structure from documents, reports,
  tables, forms, or scans with a local OCR vision model — producing markdown or
  JSON from text, tables, labels, annotations, with prompt templates and
  confidence notes. Use it directly for documents/tables/reports or explicit
  OCR requests; for general image understanding start with image-analysis. Runs
  MedAIBase/PaddleOCR-VL:0.9b on local Ollama, with Tesseract as complementary
  evidence for correction passes.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: multimodal-extraction
---

> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Run the CLI as `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" ocr ...`.

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
- **Tesseract is complementary evidence**, not the primary extractor: the CLI
  feeds its raw text to PaddleOCR-VL as context during correction passes
- Return source-qualified output:
  - extracted content
  - uncertain segments / low-confidence interpretation notes
  - optional normalized JSON when requested

## Requirements

Check `doctor --skill ocr --cached` before running. It reads the generated manifest and
probes Ollama/Tesseract; if it fails, run `setup`.

## Workflow

Progress:
- [ ] 1) Confirm input image path(s) and requested output shape (text/markdown/json)
- [ ] 2) Verify Ollama service and model availability
- [ ] 3) Run extraction with the CLI
- [ ] 3b) If the user reports errors/missing data, run a correction pass with
  `--previous` + `--feedback` (Tesseract auto-enabled)
- [ ] 4) Validate completeness (headings, totals, labels, legends, units)
- [ ] 5) Return result + uncertainty notes

### 1) Verify readiness

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill ocr
```

If it fails, run `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" setup`; Tesseract is
optional and only affects correction passes.

### 2) Run OCR extraction

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" ocr \
  --image "/absolute/path/to/image.png" \
  --prompt "Extract all visible text and preserve structure in markdown." \
  --format markdown
```

### 3) Multi-image extraction (batch)

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" ocr \
  --image "/abs/page-1.png" \
  --image "/abs/page-2.png" \
  --prompt "Extract text from all pages and keep page boundaries."
```

### 4) Correction pass (user reports errors or missing data)

Save the first output, then re-run with the previous extraction and the user's
feedback. Tesseract is enabled automatically and its raw text is added to the
prompt as evidence:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" ocr \
  --image "/abs/page.png" \
  --previous /tmp/extraction.md \
  --feedback "Falta la fila 3; el total correcto es 1.240" \
  --format markdown
```

- `--tesseract` forces a Tesseract pass on a first extraction.
- `--no-tesseract` disables it even in a correction pass.
- `--tesseract-lang` defaults to `spa+eng`; `--psm` defaults to `3`.
- The final answer is still PaddleOCR-VL's; Tesseract never overrides the image.

## Tesseract complementary pass

Tesseract is optional; `doctor --skill ocr` reports it as an optional gap. If it
is missing, run `setup` for the platform-specific install hint.

```bash
tesseract --list-langs
```

Use Tesseract for names, numbers, and spellings where PaddleOCR may have
dropped or misread data. It returns raw text only — layout and table structure
are lost, so it is context, not the final output.

- **Enable when**: the user reports a wrong total, a missing row, truncated
  text, or two runs disagree.
- **Skip when**: the page is a complex table, handwriting, or the required
  language data is not installed.
- If both sources disagree, inspect the region at higher resolution and report
  the uncertainty instead of silently picking one.
- PSM presets: `3` auto, `4` single column, `6` uniform block, `11` sparse text.

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

- `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" ocr --image PATH ...`
  - Calls local Ollama `/api/generate` with base64-encoded images
  - Defaults to model `MedAIBase/PaddleOCR-VL:0.9b`
  - Supports one or many `--image` flags
  - Correction flags: `--previous FILE`, `--feedback TEXT`, `--tesseract`,
    `--no-tesseract`, `--tesseract-lang LANGS`, `--psm N`

## Gotchas

- Low-resolution images cause missing punctuation and merged characters; upsample before OCR when possible.
- Rotated captures may degrade extraction; rotate to upright orientation first.
- For dense tables, ask for "row-by-row extraction" explicitly.
- If an image is a PDF page screenshot, include page number in prompt for traceability.
- Tesseract loses table layout; never replace the PaddleOCR result with its raw text.
- Missing languages fail with `Failed loading language`; install `tesseract-data-<lang>`.
- Tesseract PSM changes segmentation: try `6` for blocks and `11` for sparse text.
- In a correction pass, keep the previous extraction and feedback specific
  (row names, totals) so the model can reconcile instead of re-guessing.

## Validation checklist

- [ ] Skill name matches directory: `ocr`
- [ ] Uses local Ollama endpoint (no external OCR API)
- [ ] Model default is `MedAIBase/PaddleOCR-VL:0.9b`
- [ ] Extraction output includes uncertainty notes when ambiguity exists
- [ ] Correction passes use Tesseract as complementary context
