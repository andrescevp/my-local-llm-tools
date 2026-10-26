---
name: convert-files
description: >
  Use this skill when converting documents between formats with local
  LibreOffice — docx/odt to PDF or HTML, xlsx to CSV, pptx to PDF, or batch
  conversions. Trigger on "convert this file", "docx to pdf", "xlsx to csv", or
  "LibreOffice convert". Gate with doctor --skill convert-files --cached; for
  reading office documents into text use read-document.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: document-conversion
---

# Convert files with LibreOffice

Use `pnpm cli convert` for format-to-format conversion. It wraps local
LibreOffice headless; it does not upload files or require a container.

## Requirements

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill convert-files --cached
```

If LibreOffice is missing, run `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" setup`
and follow the LibreOffice hint (system package first, `~/.mllt` portable
fallback).

## Workflow

- [ ] Confirm the input path and desired output format.
- [ ] Check that the output path does not exist (the CLI refuses overwrites).
- [ ] Run the conversion.
- [ ] Verify the printed output path and file size.

## Commands

```bash
# Single file
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" convert \
  --input /abs/report.docx --to pdf --out /abs/out

# Multiple inputs
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" convert \
  --input /abs/a.docx --input /abs/b.odt --to pdf --out /abs/out

# Explicit LibreOffice filter
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" convert \
  --input /abs/data.xlsx --to csv --filter "Text - txt - csv (StarCalc)"
```

From the repository root, `pnpm cli convert ...` is equivalent.

## Format examples

| Input | `--to` | Notes |
|---|---|---|
| `.docx`, `.odt`, `.rtf` | `pdf`, `html`, `txt` | Writer documents |
| `.xlsx`, `.ods` | `csv`, `pdf` | Spreadsheet; first sheet unless a filter says otherwise |
| `.pptx`, `.odp` | `pdf` | Presentation |
| `.svg` | `pdf` | Via LibreOffice Draw |

The target extension is determined by `--to`; LibreOffice must know the filter.

## Limits

- Password-protected files may prompt or time out; unlock them first.
- Fonts can differ from Microsoft Office; embed fonts for exact rendering.
- Converted output is verified for existence and non-zero size.
- The CLI uses an isolated LibreOffice profile and a bounded timeout.
- For text extraction, Markdown/CSV reading, OCR, or image analysis inside
  office documents, use `read-document` instead.

## Troubleshooting

| Symptom | Action |
|---|---|
| Exit `3` | LibreOffice missing; run `setup` |
| Exit `4` | Conversion failed; read the stderr line and check the input |
| Exit `2` | Missing flags or output already exists |
| No output | Try an explicit `--filter`, or open the input manually |

## Validation checklist

- [ ] `doctor --skill convert-files --cached` passes
- [ ] Input exists and output is non-empty
- [ ] No input file was modified
- [ ] Output extension matches `--to`
