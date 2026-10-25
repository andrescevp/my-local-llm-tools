---
name: llamacpp-server
description: >
  Use this skill to run or query a local llama.cpp HTTP server (llama-server)
  with GGUF models — detect the binary, list local .gguf files, start a managed
  server on port 8080 with GPU offload and context settings, check health/logs,
  send OpenAI-compatible chat/completion requests, and stop only the process this
  skill started. Trigger on "run llama.cpp", "start llama-server", "serve this
  GGUF", "use a local GGUF model", "llama.cpp OpenAI endpoint", or "stop the local
  llama server".
license: MIT
compatibility: opencode, copilot, antigravity
allowed-tools: bash, read
metadata:
  audience: developers
  workflow: local-inference
---

# llama.cpp Server (local, GGUF)

Run `llama-server` from llama.cpp as a local OpenAI-compatible endpoint. This
skill is deliberately conservative: it starts and stops **only** servers it
recorded itself, and never kills an unknown PID.

> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Run the CLI as `node "$SKILL_DIR/../../src/cli.mjs" llamacpp ...`.

## Current machine state

At extraction time `llama-server` is **not installed** and no local `.gguf`
chat models were found. `doctor` reports this and exits 1. Use `install` for
options, then re-run `doctor`. Ollama is already available on `:11434`; use
the `ollama-server` skill when you do not specifically need llama.cpp.

## Core rules

- Default bind: `127.0.0.1:8080`; default context `4096`; default `-ngl 99`.
- The server is "managed" only when started by this CLI: PID, port, model,
  alias, and log path are written to
  `${XDG_STATE_HOME:-~/.local/state}/llamacpp-server/server-<port>.json`.
- `stop` verifies `/proc/<pid>/cmdline` contains `llama-server` and the port.
  It refuses anything else. Never `pkill` a server you did not start.
- `/health` returns **503 while the model is loading**; wait, do not restart
  in a loop. Startup can take tens of seconds on an 8 GB GPU.
- No automatic model downloads. Ask before downloading multi-GB files.
- API keys are passed to `llama-server` but never written to the state file;
  they are still visible in the process list, so bind to localhost.
- 8 GB VRAM (RTX 3070): prefer Q4_K_M 7–8B models, `-ngl 99`, ctx 4096–8192.
  Larger models/contexts spill to RAM and become very slow.

## Quick start

```bash
cli() { node "$SKILL_DIR/../../src/cli.mjs" llamacpp "$@"; }

cli doctor                     # binary, GPU, model dirs, port
cli models                     # discover local .gguf files
cli install                    # pacman / AUR / source options

# Start (model path or unique filename from `models`)
cli start ~/models/qwen2.5-7b-instruct-q4_k_m.gguf \
  --ctx 8192 --ngl 99 --jinja

cli status
cli logs -n 80
cli chat --prompt "Explain GGUF quantization briefly" --max-tokens 256
cli stop
```

Extra llama-server flags go through `--arg` (repeatable):

```bash
cli start model.gguf --arg --flash-attn --arg on --arg --no-mmap
```

## CLI reference

| Command | Purpose |
|---|---|
| `doctor` | Binary/version, GPU, model dirs, port state; exit 1 if binary missing |
| `models` | Recursively list `.gguf` files with sizes; `--dir`, `--filter`, `--json` |
| `install` | Print Arch/AUR/source install commands (does not execute) |
| `start MODEL` | Launch managed server; `--ctx`, `--ngl`, `--threads`, `--alias`, `--jinja`, `--port`, `--host`, `--wait`, `--no-wait`, `--arg` |
| `status` | Managed servers, PID liveness, `/health` code, endpoint, log |
| `logs` | Tail the managed log (`-n`, `--port`) |
| `chat` | `/v1/chat/completions`; `--system`, `--message role=content`, `--model`, `--api-key` |
| `complete` | `/v1/completions` |
| `stop` | SIGTERM the managed PID, then optional `--force` SIGKILL; `--all` |

`--json` is accepted before or after the subcommand where supported.
A model can be passed as a path or as a unique filename/stem found under the
model directories.

## Model discovery

Default directories (searched recursively, max depth 4):

- `$LLAMACPP_MODEL_DIRS` (colon-separated, highest priority)
- `~/.cache/llama.cpp`
- `~/models`
- `~/workspace/models`
- `~/workspace/my-local-llms/extra_models`

Add more with `--dir DIR` on `models`, `start`, or `doctor`. Only `.gguf`
files are considered; `mmproj-*.gguf` vision projectors are listed too and can
be passed with `--arg --mmproj --arg /path/mmproj.gguf`.

## Install options

```bash
# Arch/CachyOS repository (verify the binary name after install)
sudo pacman -S llama-cpp
llama-server --version

# CUDA build from AUR (package name may vary)
paru -S llama.cpp-cuda

# From source, CUDA enabled
git clone https://github.com/ggml-org/llama.cpp
cmake -B llama.cpp/build -S llama.cpp -DGGML_CUDA=ON
cmake --build llama.cpp/build -j
export LLAMA_SERVER_BIN="$PWD/llama.cpp/build/bin/llama-server"
```

The CLI also looks in `/usr/bin`, `/usr/local/bin`, `~/llama.cpp/build/bin`,
`~/workspace/llama.cpp/build/bin`, and
`~/workspace/llamacpp-aot/build/bin`.

## API surface

Once running, the endpoint is OpenAI-compatible:

| Endpoint | Use |
|---|---|
| `GET /health` | `200 {"status":"ok"}` or `503` while loading |
| `GET /v1/models` | Loaded model/alias |
| `POST /v1/chat/completions` | Chat messages |
| `POST /v1/completions` | Raw text completion |
| `GET /props` | Server/model properties |
| `GET /slots` | Slot state (if enabled) |

Base URL: `http://127.0.0.1:8080/v1`. If `--api-key` was used, send
`Authorization: Bearer <key>`; the CLI reads `LLAMACPP_API_KEY`.

## Workflow

1. `doctor` — confirm binary, GPU, model dirs, and a free port.
2. `models` — pick a GGUF; ask before downloading anything.
3. `start` with conservative `--ctx`/`--ngl`; watch `--wait` and logs.
4. `status` — confirm health 200 before sending requests.
5. `chat`/`complete` — validate output; watch VRAM with `nvidia-smi`.
6. `stop` — graceful SIGTERM; use `--force` only if it really hangs.

## Troubleshooting

| Symptom | Action |
|---|---|
| `binary MISSING` | Run `install`; set `LLAMA_SERVER_BIN`; re-run `doctor` |
| `port already in use` | Check `ss -ltnp 'sport = :8080'`; use another `--port` |
| Health stays 503 | Model still loading; `logs`; wait longer |
| Process exits immediately | `logs -n 30`; wrong quant/arch, missing CUDA libs, OOM |
| CUDA OOM | Lower `--ctx`, `--ngl`, use a smaller quant/model |
| Garbage output | Use `--jinja` and the model's correct chat template |
| `stop` refuses PID | It is not a managed server; do not force-kill it |
| Slow generation | Model partly on CPU; lower ctx or use smaller quant |

## Gotchas

- `-ngl 99` offloads all layers only if they fit; llama.cpp silently keeps the
  rest on CPU.
- Context memory grows with `--ctx`; 8192 is usually safe for 7–8B Q4 on 8 GB,
  16384 may not be.
- `--alias` is the name clients should use; without it the model path stem is
  used.
- Do not start two servers on the same port; the CLI refuses when the port is
  already open.
- The state file records the PID; deleting it manually makes `stop` unable to
  find the process (you would then stop it yourself).
- llama.cpp moves fast: use `llama-server --help` to confirm flags before
  adding exotic `--arg` values.

## Validation checklist

- [ ] Skill name matches directory: `llamacpp-server`
- [ ] `doctor` reports binary, GPU, dirs, port
- [ ] `start` refuses an occupied port and unmanaged PIDs
- [ ] `stop` verifies the managed cmdline before signalling
- [ ] `chat` uses the OpenAI-compatible `/v1` endpoint
- [ ] Main `SKILL.md` stays under 250 lines
