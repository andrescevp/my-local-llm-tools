---
name: setup
description: >
  Use this skill when installing, checking, or diagnosing the harness —
  detecting Node/pnpm, Docker, Ollama, Tesseract, ffmpeg, and piper; writing
  the per-machine manifest; planning confirmed installs; and reporting which
  skills can run. Trigger on "setup this machine", "doctor", "missing
  dependency", "Ollama URL", or "why can't this skill run?" — run
  `pnpm cli doctor --skill <name>` first.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: environment-setup
---

# Setup and diagnostics

Single source of truth for dependencies. Every other skill delegates install
instructions here and **reads the manifest** to decide whether it can run.

## Commands

```bash
pnpm cli setup                        # detect and write the manifest
pnpm cli setup --install              # print the install plan only
pnpm cli setup --install --yes        # execute the safe, unattended steps
pnpm cli doctor                       # live diagnostics, writes nothing
pnpm cli doctor --skill ocr           # exit 1 if ocr requirements are missing
pnpm cli doctor --skill ocr --cached  # manifest-only check (no network)
pnpm cli doctor --json                # machine-readable diagnostics
pnpm cli doctor --strict              # fail on optional gaps too
```

Existing server: pass `--ollama-url URL` (default `http://127.0.0.1:11434`).

## Manifest

Written by `setup` to a per-user config directory:

| OS | Path |
|---|---|
| Linux | `~/.mllt/manifest.json` |
| macOS | `~/.mllt/manifest.json` |
| Windows | `%USERPROFILE%\.mllt\manifest.json` |

Override with `MY_LOCAL_LLM_TOOLS_CONFIG_DIR`. The manifest contains:

- `plugin`: `my-local-llm-tools`; `schema`: manifest version.
- `platform`: OS, arch, release.
- `hosts`: `ollama` base URL.
- `models`: `ollama.available/required/missing`.
- `libre_office_path`: resolved LibreOffice binary.
- `paths`: `tesseract`, `ffmpeg`, `ffprobe`, `piper` binaries.
- `tools`: node, pnpm, docker, tesseract (+ languages), ffmpeg, ffprobe, piper,
  voice model, LibreOffice, GIMP, Inkscape, Potrace, `pdftoppm`, Chrome,
  Playwright, and the U2Net model, each with its resolved `path`.
- `ollama`: host, reachability, version, models.
- `features`: per-skill `ok` plus the requirements that passed or failed.
- `warnings`: human-readable gaps.

Skills check `features.<name>.ok` (or run `doctor --skill <name> --cached`)
before doing work. A stale manifest is diagnostic, not authoritative — `doctor`
without `--cached` probes live services.

The formal schema is `src/commands/setup/manifest.schema.json` (JSON Schema
2020-12). `writeManifest` and `readManifest` validate against it; an invalid or
outdated manifest is rejected with `invalid manifest: …` and must be regenerated
with `setup`.

Registered skill IDs are namespaced as `my-local-llm-tools:<skill>`; use that
ID when invoking the skill tool.

## Skill requirements

| Skill | Requires | Optional |
|---|---|---|
| `image-analysis` | Ollama + `minicpm-v4.6:latest` | — |
| `ocr` | Ollama + `MedAIBase/PaddleOCR-VL:0.9b` | Tesseract |
| `video-analysis` | Ollama + `minicpm-v4.6:latest`, ffmpeg, ffprobe | — |
| `speak` | piper + system-language voice model | English fallback |
| `openai-api-usage` | — | OpenAI key or compatible server |
| `ccreate-skill`, `ccreate-agent`, `autoskills` | Node only | — |
| `convert-files` | LibreOffice | — |
| `autoedit-with-gimp` | GIMP | — |
| `autoedit-with-inkscape` | Inkscape | Potrace for vectorize |
| `image-background-removal` | U2Net ONNX model | GIMP for refine |
| `presentations-generator` | Node | Playwright for PDF |
| `use-my-browser` | Playwright | system Chrome/Chromium |
| `use-my-browser-learn` | Node + linkedom | — |
| `use-my-browser-record` | Playwright | system Chrome/Chromium |

## Install policy

`setup --install` always prints the plan first. **Nothing runs without
`--yes`**, and every action is announced before execution.

Safe automated steps (`--yes`):

- `pnpm install` when `node_modules` is missing.
- `ollama pull <model>` for the required models.

Manual steps (the command prints the exact URL/command; it never runs package
managers as root):

- **pnpm** — <https://pnpm.io/installation>
- **Ollama** — <https://ollama.com/download>. Ask for an existing URL first; if
  the user has an instance, pass `--ollama-url` and skip installation. The
  models are CPU-friendly, so no GPU is required.
- **Tesseract** — OCR fallback. Linux: distro package + `tesseract-data-eng`,
  `tesseract-data-spa`; macOS: `brew install tesseract tesseract-lang`; Windows:
  UB Mannheim installer.
- **ffmpeg/ffprobe** — required by `video-analysis`; install from
  <https://ffmpeg.org/download.html> or the platform package manager.
- **piper + voice** — <https://github.com/rhasspy/piper/releases>; setup
  downloads the voice for the system language into `~/.mllt/piper-voices`, or
  English when the language is unavailable. Set `PIPER_BIN`/`PIPER_VOICE` for
  custom installs; `voice ensure` refreshes the voice.
- **LibreOffice** — system package first; portable fallback under
  `~/.mllt/libreoffice` (macOS: `LibreOffice.app`).
- **GIMP** — install from the OS package manager; used by
  `autoedit-with-gimp` and optional background refinement.
- **Inkscape + Potrace** — Inkscape for SVG export/edit; Potrace for
  `inkscape vectorize`.
- **Playwright Chromium** — run `pnpm exec playwright install chromium` for
  presentation PDF output and browser fallback.
- **System Chrome/Chromium** — optional; the browser skills prefer it and fall
  back to Playwright Chromium.
- **U2Net model** — place `u2net.onnx` at `~/.mllt/models/u2net.onnx` or set
  `TOOLBOX_U2NET_MODEL`; it is never downloaded automatically.
## Cross-platform notes

- Node paths come from `node:os`; no fixed `/tmp`, `/proc`, or `which`.
- `pnpm` runs all scripts; on Windows the plugin link uses a junction.
- Audio playback: `pw-play`/`paplay`/`aplay` (Linux), `afplay` (macOS),
  PowerShell `SoundPlayer` (Windows).
- Install hints differ per OS; the command picks the matching hint.
- Windows: use PowerShell or cmd for `pnpm`/`node` commands. Use WSL2 or Git
  Bash only if `wsl --status` or `bash --version` succeeds and the user already
  works there. Copy-paste commands: `references/windows.md`.

## Troubleshooting

| Symptom | Action |
|---|---|
| `doctor` exits 1 | Fix the `fail` lines; `setup --install` prints the plan |
| Ollama unreachable | Start it, or `setup --ollama-url http://host:11434` |
| Missing models | `setup --install --yes` pulls them, or `ollama pull <model>` |
| Tesseract missing | OCR still works via PaddleOCR; correction passes lose the fallback |
| Stale skills readiness | Rerun `setup` to refresh the manifest |

## Validation checklist

- [ ] `setup` writes the manifest and prints the path
- [ ] `doctor --skill <name>` exits 0 only when requirements are met
- [ ] No other skill contains installation commands — they point here
- [ ] Commands work on Linux, macOS, and Windows
