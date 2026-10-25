---
name: setup
description: >
  Use this skill when installing, checking, or diagnosing the harness —
  detecting Node/pnpm, Docker, Ollama, ComfyUI, Tesseract, ffmpeg, and piper;
  writing the per-machine manifest; planning confirmed installs; and reporting
  which skills can run. Trigger on "setup this machine", "doctor", "missing
  dependency", "Ollama or ComfyUI URL", or "why can't this skill run?" — run
  `pnpm cli doctor --skill <name>` first.
license: MIT
compatibility: opencode, copilot, antigravity
allowed-tools: bash, read
metadata:
  audience: developers
  workflow: environment-setup
---

# Setup and diagnostics

Single source of truth for dependencies. Every other skill delegates install
instructions here and **reads the manifest** to decide whether it can run.

## Commands

```bash
pnpm cli setup                        # detect, write manifest + ComfyUI facts
pnpm cli setup --install              # print the install plan only
pnpm cli setup --install --yes        # execute the safe, unattended steps
pnpm cli doctor                       # live diagnostics, writes nothing
pnpm cli doctor --skill ocr           # exit 1 if ocr requirements are missing
pnpm cli doctor --skill ocr --cached  # manifest-only check (no network)
pnpm cli doctor --json                # machine-readable diagnostics
pnpm cli doctor --strict              # fail on optional gaps too
```

Existing servers: pass `--ollama-url URL` and/or `--comfy-url URL`. Defaults are
`http://127.0.0.1:11434` and `http://127.0.0.1:8188`.

## Manifest

Written by `setup` to a per-user config directory:

| OS | Path |
|---|---|
| Linux | `${XDG_CONFIG_HOME:-~/.config}/my-local-llm-tools/manifest.json` |
| macOS | `~/Library/Application Support/my-local-llm-tools/manifest.json` |
| Windows | `%APPDATA%\my-local-llm-tools\manifest.json` |

Override with `MY_LOCAL_LLM_TOOLS_CONFIG_DIR`. The manifest contains:

- `plugin`: `my-local-llm-tools`; `schema`: manifest version.
- `platform`: OS, arch, release.
- `hosts`: `ollama` and `comfyui` base URLs.
- `models`: `ollama.available/required/missing` and the local ComfyUI model files.
- `paths`: `tesseract`, `ffmpeg`, `ffprobe`, `piper` binaries.
- `tools`: node, pnpm, docker, tesseract (+ languages), ffmpeg, ffprobe, piper,
  voice model, each with its resolved `path`.
- `ollama`: host, reachability, version, models.
- `comfyui`: host, reachability, version, GPU, VRAM (GiB).
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
| `comfyui-server` | ComfyUI reachable | 8 GB VRAM for local generation |
| `speak` | piper + Laura `es_MX` voice model | — |
| `openai-api-usage` | — | OpenAI key or compatible server |
| `create-skill`, `create-agent`, `autoskills` | Node only | — |

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
- **piper + voice** — <https://github.com/rhasspy/piper/releases>; set
  `PIPER_BIN`/`PIPER_VOICE` if installed outside PATH.
- **ComfyUI** — Docker is preferred. If the user already runs an instance, pass
  `--comfy-url`; otherwise install from <https://comfy.org/download>. Local
  generation needs a GPU with **at least 8 GB VRAM**; below that, skip ComfyUI
  and warn that local image/video generation will not work properly.
  - Docker: isolated, reproducible, easy to reset, GPU via `--gpus all`; heavier
    image and needs Docker + the NVIDIA container toolkit.
  - Local: native performance and simpler model/file access; dependency drift
    and manual upgrades.

## ComfyUI instance facts

`setup` regenerates `instance_facts.json` next to the manifest from the running
ComfyUI instance and the local install:

- `versions` and `device` from `/system_stats`.
- `models` from `COMFY_MODELS` (default `~/ComfyUI/models`).
- `workflows` from `COMFY_WORKFLOWS` (default
  `~/ComfyUI/user/default/workflows`).
- `custom_nodes` and `node_count` from the install and `/object_info`.

The file is **not tracked in git**; `comfy workflows` reads it from the config
directory. Rerun `setup` after adding models, workflows, or custom nodes.

## Cross-platform notes

- Node paths come from `node:os`; no fixed `/tmp`, `/proc`, or `which`.
- `pnpm` runs all scripts; on Windows the plugin link uses a junction.
- Audio playback: `pw-play`/`paplay`/`aplay` (Linux), `afplay` (macOS),
  PowerShell `SoundPlayer` (Windows).
- Install hints differ per OS; the command picks the matching hint.

## Troubleshooting

| Symptom | Action |
|---|---|
| `doctor` exits 1 | Fix the `fail` lines; `setup --install` prints the plan |
| Ollama unreachable | Start it, or `setup --ollama-url http://host:11434` |
| Missing models | `setup --install --yes` pulls them, or `ollama pull <model>` |
| ComfyUI unreachable | Start Docker/local ComfyUI, then rerun `setup` |
| VRAM warning | Local generation below 8 GB is unsupported; use an external instance |
| Tesseract missing | OCR still works via PaddleOCR; correction passes lose the fallback |
| Stale skills readiness | Rerun `setup` to refresh the manifest |

## Validation checklist

- [ ] `setup` writes the manifest and prints the path
- [ ] `doctor --skill <name>` exits 0 only when requirements are met
- [ ] No other skill contains installation commands — they point here
- [ ] ComfyUI facts are generated outside the repo
- [ ] Commands work on Linux, macOS, and Windows
