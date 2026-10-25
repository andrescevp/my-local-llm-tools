---
name: ollama-server
description: >
  Use this skill when managing or querying the local Ollama server — checking
  health/version, listing installed or loaded models, generating text or vision
  answers, chatting, computing embeddings, pulling or inspecting models, and
  unloading from VRAM. Trigger on "is Ollama up?", "list Ollama models", "run a
  local model", "ask minicpm about this image", "embed this text locally", "pull
  this model", or "unload the model". Uses 127.0.0.1:11434 and never sends data
  to a cloud provider.
license: MIT
compatibility: opencode, copilot, antigravity
allowed-tools: bash, read
metadata:
  audience: developers
  workflow: local-inference
---

# Ollama Server (local)

Operate the Ollama instance that already runs on this box. Everything stays
local: prompts, images, and embeddings never leave the machine.

> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Run the CLI as `python3 "$SKILL_DIR/scripts/ollama_server.py" ...`.

## Core rules

- Default endpoint: `http://127.0.0.1:11434` (override with `--url` or `OLLAMA_URL`).
- On this machine Ollama is a **system** service (`ollama.service`) running as
  user `ollama`; models live under `/var/lib/ollama`. Never edit that directory
  by hand.
- Local-first: no cloud APIs, no telemetry, no uploading images to third parties.
- Do **not** delete models unless the user explicitly asks; `rm` requires `--yes`.
- `pull` uses the network — only run it when the user asks for that model.
- First inference after a cold start loads weights into VRAM and can take
  30–120 s; use a generous timeout.
- Prefer the dedicated `image-analysis` and `ocr` skills for vision/OCR work;
  they already handle model fallbacks and prompt templates.

## Quick start

```bash
CLI="$SKILL_DIR/scripts/ollama_server.py"

python3 "$CLI" status                  # service, version, model counts
python3 "$CLI" models                  # installed models + capabilities
python3 "$CLI" ps                      # loaded models and VRAM use

# Text generation
python3 "$CLI" generate minicpm-v4.6:latest \
  --prompt "Summarize this screenshot" --image /abs/path/shot.png

# Chat with a system prompt
python3 "$CLI" chat qwen3:8b \
  --system "Answer in Spanish, concise." --prompt "¿Qué es Ollama?"

# Embeddings
python3 "$CLI" embed nomic-embed-text-v2-moe:latest --text "hola mundo"

# Metadata / lifecycle
python3 "$CLI" show minicpm-v4.6:latest
python3 "$CLI" unload minicpm-v4.6:latest
```

`--json` works before or after the subcommand and prints the raw API payload
where supported.

## CLI reference

| Command | Purpose |
|---|---|
| `status` | Version, service state, installed/loaded counts |
| `models` | Name, size, family, params, quant, context, capabilities |
| `ps` | Loaded models, size, VRAM, expiry |
| `show MODEL` | Details, parameters, modelfile, capabilities |
| `pull MODEL` | Download a model (network required) |
| `generate MODEL -p TEXT` | One-shot `/api/generate`; `--image`, `--system`, `--format json` |
| `chat MODEL -p TEXT` | One-shot `/api/chat`; `--message role=content`, `--system`, `--image` |
| `embed MODEL --text TEXT` | `/api/embed`; repeat `--text`, or use `--file` |
| `unload MODEL` | Request immediate unload (`keep_alive: 0`) |
| `rm MODEL --yes` | Delete a model from disk |
| `service` | systemd state and start/stop/log commands |

Useful flags: `--temperature`, `--num-ctx`, `--num-predict`, `--keep-alive`,
`--timeout` (seconds). Images must be **absolute** paths.

## API surface used

| Endpoint | Method | Use |
|---|---|---|
| `/api/version` | GET | Server version |
| `/api/tags` | GET | Installed models |
| `/api/ps` | GET | Loaded models |
| `/api/show` | POST | Model metadata |
| `/api/pull` | POST | Download (streaming NDJSON) |
| `/api/generate` | POST | Text/vision generation |
| `/api/chat` | POST | Chat completion |
| `/api/embed` | POST | Embeddings |
| `/api/delete` | DELETE | Remove a model |

## Model roles on this machine

| Need | Suggested model |
|---|---|
| General vision / describe images | `minicpm-v4.6:latest` |
| OCR / document text | `MedAIBase/PaddleOCR-VL:0.9b` (see `ocr` skill) |
| Embeddings | `nomic-embed-text-v2-moe:latest` or `all-minilm:latest` |
| General text chat | any installed completion model (check `models`) |

The OCR model may be published without an `mmproj` and reject image input;
`image-analysis` falls back to `minicpm-v4.6` automatically. Do not "fix" this
by reinstalling models unless the user asks.

## Workflow

1. Run `status`; if the service is down, report it and the exact start command.
2. Run `models` and confirm the requested model exists (or ask before pulling).
3. Generate/chat/embed with an explicit timeout; first call may be slow.
4. Validate output for missing regions, hallucinated text, or truncation.
5. Optionally `unload` when the user wants VRAM back; otherwise `keep_alive`
   lets Ollama evict on its own.

## Troubleshooting

| Symptom | Action |
|---|---|
| `Cannot reach Ollama` | `sudo systemctl start ollama`; check `service` |
| `model not found` | `models`; ask before `pull` |
| Very slow first token | Cold load; wait or raise `--timeout` |
| Empty/truncated answer | Raise `--num-predict`; check context |
| OCR model rejects image | Use `image-analysis` fallback or `minicpm-v4.6` |
| Out of VRAM | `ps`; `unload` idle models or reduce `--num-ctx` |
| HTTP 500 from model | `journalctl -u ollama -n 100 --no-pager` |

## Gotchas

- `OLLAMA_HOST` is the server **bind** address; for clients use `--url` or
  `OLLAMA_URL`.
- The service runs as `ollama` with `HOME=/var/lib/ollama`; do not look for
  models in `~/.ollama`.
- Model names are case-sensitive; use the exact string from `models`.
- Concurrent requests queue; a large generation can block a quick query.
- `unload` only evicts from memory; it never deletes files.
- Never `pkill ollama` — it is a systemd service.

## Validation checklist

- [ ] Skill name matches directory: `ollama-server`
- [ ] `status` reports endpoint, version, service state
- [ ] `models` shows capabilities and sizes
- [ ] `generate`/`chat` accept absolute images only
- [ ] `rm` refuses without `--yes`
- [ ] Main `SKILL.md` stays under 250 lines
