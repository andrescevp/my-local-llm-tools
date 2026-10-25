# cheap-ai-winth-local-tools

Local-first, low-cost AI toolbelt for OpenCode V2. Nine skills that use
software already on this machine — no cloud APIs, no per-token billing, no
image uploads. Every skill is authored and versioned here; the repository does
not sync from any external checkout.

```
Ollama :11434   ComfyUI :8188   llama.cpp :8080 (managed)
```

## Skills

| Skill | What it does | Local dependency |
|---|---|---|
| `image-analysis` | Describe, compare, and inspect images with a local vision model | Ollama + `minicpm-v4.6` |
| `ocr` | Extract text/tables/structure from screenshots and documents | Ollama + `PaddleOCR-VL` |
| `autoskills` | Analyze a project, propose skills, author them via `create-skill` | local FS + Python |
| `create-skill` | Create, update, and evaluate skills; ships the validator | Python + `uv` |
| `create-agent` | Create, optimize, and validate agent profiles | local FS |
| `speak` | Speak text aloud in Spanish (Laura `es_MX`) | `piper` + voice model |
| `comfyui-server` | Generate video, image, music, and voice via verified workflows | ComfyUI on `:8188` |
| `ollama-server` | Manage/query Ollama: status, models, generate, chat, embed, unload | Ollama on `:11434` |
| `llamacpp-server` | Run/query a managed `llama-server` with local GGUF files | `llama-server` binary (optional) |

`autoskills` delegates naming, frontmatter, description limits, progressive
disclosure, and validation to `create-skill` — it only covers project analysis
and proposals.

## Install (OpenCode V2)

```bash
cd ~/workspace/cheap-ai-winth-local-tools
./scripts/install.sh          # symlink into ~/.config/opencode/plugins/
# restart OpenCode
```

The plugin registers skills from `skills/manifest.json` and injects a compact
inventory into each session. No agents are installed as files.

### Coexistence with `my-utils-harness`

`my-utils-harness` (if installed) also registers `autoskills`,
`comfyui-server`, `image-analysis`, and `ocr`. OpenCode may see duplicate skill
ids. Keep only one of the two plugins enabled, or remove the overlapping
skills from one of them. `install.sh` prints a reminder when it detects the
other harness.

Validate without starting OpenCode:

```bash
python3 scripts/build_manifest.py   # regenerate skills/manifest.json
python3 scripts/validate.py
bash scripts/test.sh
```

## Requirements on this machine

| Component | State at extraction |
|---|---|
| Ollama | `0.40.10`, systemd `ollama.service`, `127.0.0.1:11434` |
| Ollama models | `minicpm-v4.6`, `MedAIBase/PaddleOCR-VL:0.9b`, `all-minilm`, `nomic-embed-text-v2-moe` |
| ComfyUI | user service `comfyui.service`, `127.0.0.1:8188` |
| Piper | `~/.local/bin/piper` + `es_MX-laura-high.onnx` |
| llama.cpp | **not installed**; `llamacpp-server doctor` reports it and `install` prints options |
| Python | 3.14 (stdlib only for the bundled CLIs) |
| uv | required only by `create-skill`'s validator (PEP 723) |

## Usage

```bash
# Ollama
python3 "$PWD/skills/ollama-server/scripts/ollama_server.py" status
python3 "$PWD/skills/ollama-server/scripts/ollama_server.py" models
python3 "$PWD/skills/ollama-server/scripts/ollama_server.py" generate \
  minicpm-v4.6:latest --prompt "Describe this screenshot" --image /abs/shot.png

# llama.cpp (after installing llama-server)
python3 "$PWD/skills/llamacpp-server/scripts/llamacpp_server.py" doctor
python3 "$PWD/skills/llamacpp-server/scripts/llamacpp_server.py" start \
  ~/models/model.gguf --ctx 8192 --ngl 99 --jinja
python3 "$PWD/skills/llamacpp-server/scripts/llamacpp_server.py" chat \
  --prompt "Hola" --max-tokens 128
python3 "$PWD/skills/llamacpp-server/scripts/llamacpp_server.py" stop

# Skill authoring
uv run skills/create-skill/scripts/validate_skill.py skills/<name>/SKILL.md
```

Each `SKILL.md` uses `$SKILL_DIR` for bundled files. The skill loader reports
that path; when running manually, set it to the skill folder or use `$PWD`.

## Layout

```
.
├── index.ts                  # OpenCode V2 plugin: register skills + context
├── package.json
├── skills/
│   ├── autoskills/           # project analysis + proposals (uses create-skill)
│   ├── comfyui-server/       # + instance_facts.json
│   ├── create-agent/
│   ├── create-skill/         # + validator, references, eval scripts
│   ├── image-analysis/
│   ├── llamacpp-server/
│   ├── ocr/
│   ├── ollama-server/
│   └── speak/
├── scripts/
│   ├── build_manifest.py     # regenerate skills/manifest.json
│   ├── install.sh            # symlink plugin into OpenCode
│   ├── test.sh               # unittest suites
│   └── validate.py           # static harness validation
├── tests/
├── AGENTS.md
└── README.md
```

## Authoring skills

- Every skill lives in `skills/<name>/` and is edited here — there is no copy
  or sync step from another checkout.
- `skills/manifest.json` is generated: run `python3 scripts/build_manifest.py`
  after adding, renaming, or removing a skill. Never edit it by hand.
- For a new skill, load `create-skill` and follow its workflow.
- Limits enforced by the bundled validator: frontmatter description 1-500
  characters, main `SKILL.md` at most 250 lines (target 200).

## Safety

- Models are never deleted automatically; `ollama-server rm` requires `--yes`.
- Multi-GB downloads only on explicit request.
- `llamacpp-server stop` verifies the recorded PID/cmdline before signalling;
  unknown processes are never killed.
- API keys are not persisted to state files. Prefer localhost binds.
- Never read or print `.env*`, credentials, or tokens.

## Ports

| Service | Default | Notes |
|---|---|---|
| Ollama | `127.0.0.1:11434` | systemd system service |
| ComfyUI | `127.0.0.1:8188` | single owner; user service |
| llama.cpp | `127.0.0.1:8080` | started/stopped by `llamacpp-server` |

The llama.cpp server is optional: `llamacpp-server doctor` tells you whether a
binary is available, and `install` prints the Arch/AUR/source options.
