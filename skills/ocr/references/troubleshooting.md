> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Resolve the script/reference paths below against it.

# OCR Troubleshooting (Local Ollama)

## Ollama unreachable

Symptoms:
- `Cannot reach Ollama at http://127.0.0.1:11434`

Checks:
```bash
curl -s http://127.0.0.1:11434/api/tags
```

If unavailable, start Ollama service/process and retry.

## Model not found

Symptoms:
- HTTP error mentioning unknown model

Fix:
```bash
ollama pull MedAIBase/PaddleOCR-VL:0.9b
ollama list | rg "MedAIBase/PaddleOCR-VL:0.9b"
```

## Poor OCR quality

Try in order:
1. Use a more explicit prompt (table/chart/diagram specific)
2. Increase image resolution before OCR
3. Correct rotation/skew
4. Crop to region of interest and rerun
5. Run per-page/per-section instead of giant combined images

## Timeout on large images

Use a larger timeout:
```bash
node "$SKILL_DIR/../../src/cli.mjs" ocr --image "/abs/img.png" --timeout 300
```

Or split into smaller crops/pages.
