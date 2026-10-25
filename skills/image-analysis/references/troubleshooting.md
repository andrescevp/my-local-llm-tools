> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Resolve the script/reference paths below against it.

# Troubleshooting — Image Analysis

Load this reference when the analyzer errors out, returns garbage, or the
model behaves unexpectedly.

## Ollama service not running

```
ERROR: Cannot reach Ollama at http://127.0.0.1:11434
```

Run the harness diagnostic:

```bash
node "$SKILL_DIR/../../src/cli.mjs" doctor --skill image-analysis
```

If Ollama is down, start it or tell `setup`/`doctor` the URL with
`--ollama-url`; see the `setup` skill for install options.

## Model not found / pulled partially

```
ERROR: Ollama HTTP 404: {"error":"model '...' not found"}
```

Run `doctor --skill image-analysis`; `setup --install --yes` pulls the required
models, or pull them manually with `ollama pull <model>`.

## Model lacks vision support (mmproj missing)

```
ERROR: Ollama HTTP 500: image input is not supported - hint: ... provide the mmproj
```

Known issue: `MedAIBase/PaddleOCR-VL:0.9b` is published on the Ollama registry
with only `completion` capability (its manifest has no projector layer), so it
rejects image input.

Behavior: the CLI detects this error and falls back to `minicpm-v4.6:latest`
automatically (prints `WARN: ... falling back to ...` on stderr).

If you want true OCR-only hardware efficiency, check for a newer/updated
publication of the model:

```bash
ollama show MedAIBase/PaddleOCR-VL:0.9b --modelfile   # must include a VISION line
ollama show MedAIBase/PaddleOCR-VL:0.9b --verbose     # Capabilities must list vision
```

If the upstream model is fixed, refresh it via `setup`.

## Blank or truncated response

- minicpm-v4.6 (1.6 GB, GPU): first call loads weights; allow `--timeout 180`.
- Low-context model (0.9b OCR): keep prompts short, single image per call.
- Huge images (>4 MP): downscale first (ImageMagick):
  ```bash
  magick input.png -resize 1600x1600\> out.png
  ```

## Wrong language / poor wording

- Add language instruction to prompt: `Answer in Spanish.`
- OCR quality: prefer `MedAIBase/PaddleOCR-VL:0.9b` for dense text,
  `minicpm-v4.6` for understanding, not transcription.
- Rotated images: rotate upright before analysis.

## Hallucinated details (model invents content)

- Ask for uncertainty markers: `Mark anything you are unsure about explicitly.`
- For data reading, request: `Report only numbers you can see.`
- Cross-check critical values by re-running with the OCR model.

## Timeouts

Default is 120 s. Increase per call:

```bash
node "$SKILL_DIR/../../src/cli.mjs" image \
  --image "/abs/x.png" --timeout 300
```

## Slow on RTX 3070

- Keep images under 1600px on the longest side.
- One image per request for OCR (0.9b); minicpm handles 2–3 well.
- Avoid `--format json` when only text is needed (smaller payload side is
  fine; format is local).