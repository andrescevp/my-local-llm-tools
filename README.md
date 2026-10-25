# cheap-ai-winth-local-tools

Local-first, low-cost AI toolbelt for OpenCode V2. Nine skills that use
software already on this machine — no cloud APIs, no per-token billing, no
image uploads. Tooling is JavaScript (ESM) and dependencies are managed with
`pnpm`; every skill is authored and versioned here.

```
Ollama :11434   ComfyUI :8188   llama.cpp :8080 (managed)
```

## Skills

| Skill | What it does | Local dependency |
|---|---|---|
| `image-analysis` | Describe, compare, and inspect images with a local vision model | Ollama + `minicpm-v4.6` |
| `ocr` | Extract text/tables/structure from screenshots and documents | Ollama + `PaddleOCR-VL` |
| `autoskills` | Analyze a project, propose skills, author them via `create-skill` | local FS + Node |
| `create-skill` | Create, update, and evaluate skills; defines the validator | Node + `yaml` |
| `create-agent` | Create, optimize, and validate agent profiles | local FS |
| `speak` | Speak text aloud in Spanish (Laura `es_MX`) | `piper` + voice model |
| `comfyui-server` | Generate video, image, music, and voice via verified workflows | ComfyUI on `:8188` |
| `ollama-server` | Manage/query Ollama: status, models, generate, chat, embed, unload | Ollama on `:11434` |
| `llamacpp-server` | Run/query a managed `llama-server` with local GGUF files | `llama-server` binary (optional) |

Skill tooling lives in one CLI: `src/cli.mjs`. `autoskills` delegates naming,
frontmatter, description limits, and validation to `create-skill`.

## Install (OpenCode V2)

```bash
pnpm install
pnpm harness:install          # symlink into ~/.config/opencode/plugins/
# restart OpenCode
```

The plugin registers skills from `skills/manifest.json` and injects a compact
inventory into each session. No agents are installed as files.

### Coexistence with `my-utils-harness`

`my-utils-harness` (if installed) also registers `autoskills`,
`comfyui-server`, `image-analysis`, and `ocr`. OpenCode may see duplicate skill
ids. Keep only one of the two plugins enabled, or remove the overlapping
skills from one of them. `install.mjs` prints a reminder when it detects the
other harness.

## Development

```bash
pnpm manifest    # regenerate skills/manifest.json
pnpm validate    # static harness validation
pnpm test        # node:test suites
pnpm qa          # lint + deps + duplication + tests + validate + security
```

### QA toolchain

| Tool | Command | Config |
|---|---|---|
| Biome | `pnpm lint` / `pnpm lint:fix` | `biome.json` |
| dependency-cruiser | `pnpm deps` | `.dependency-cruiser.cjs` |
| jscpd | `pnpm dup` | `.jscpd.json` |
| osv-scanner | `osv-scanner scan source -r .` | `pnpm-lock.yaml` |
| semgrep | `semgrep --config .semgrep.yml --error .` | `.semgrep.yml` |

`pnpm qa` chains all of them.

## Requirements on this machine

| Component | State at extraction |
|---|---|
| Node.js | `24.18.0` (via `nvm`) |
| pnpm | `11.9.0` |
| Ollama | `0.40.10`, systemd `ollama.service`, `127.0.0.1:11434` |
| Ollama models | `minicpm-v4.6`, `MedAIBase/PaddleOCR-VL:0.9b`, `all-minilm`, `nomic-embed-text-v2-moe` |
| ComfyUI | user service `comfyui.service`, `127.0.0.1:8188` |
| Piper | `~/.local/bin/piper` + `es_MX-laura-high.onnx` |
| llama.cpp | **not installed**; `llamacpp-server doctor` reports it and `install` prints options |

No Python runtime is required: all skill tooling is Node.js.

## Usage

```bash
# Unified CLI
pnpm cli skill validate skills/create-skill/SKILL.md
pnpm cli speak "Hola, soy Laura"

# Ollama
pnpm cli ollama status
pnpm cli ollama models
pnpm cli ollama generate minicpm-v4.6:latest \
  --prompt "Describe this screenshot" --image /abs/shot.png

# llama.cpp (after installing llama-server)
pnpm cli llamacpp doctor
pnpm cli llamacpp start ~/models/model.gguf --ctx 8192 --ngl 99 --jinja

# Vision / OCR
pnpm cli image --image /abs/shot.png
pnpm cli ocr --image /abs/page.png

# ComfyUI
pnpm cli comfy status
pnpm cli comfy run ltxv_t2v_8gb.json 20.seed=12345
```

Each `SKILL.md` invokes the CLI at `$SKILL_DIR/../../src/cli.mjs`. The skill
loader reports `$SKILL_DIR`; from the repo root, `pnpm cli` is equivalent.

## Layout

```
.
├── index.ts                  # OpenCode V2 plugin: register skills + context
├── package.json
├── src/
│   ├── cli.mjs               # single CLI for all skill tooling
│   └── commands/             # one module per domain
├── skills/
│   ├── autoskills/
│   ├── comfyui-server/
│   ├── create-agent/
│   ├── create-skill/
│   ├── image-analysis/
│   ├── llamacpp-server/
│   ├── ocr/
│   ├── ollama-server/
│   └── speak/
├── scripts/
│   ├── build_manifest.mjs    # regenerate skills/manifest.json
│   ├── install.mjs           # symlink plugin into OpenCode
│   └── validate.mjs          # static harness validation
├── tests/                    # node:test suites
├── AGENTS.md
└── README.md
```

## Authoring

- Every skill lives in `skills/<name>/` and is edited here — there is no copy
  or sync step from another checkout.
- `skills/manifest.json` is generated: run `pnpm manifest` after adding,
  renaming, or removing a skill. Never edit it by hand.
- For a new skill, load `create-skill` and follow its workflow.
- New executable behavior goes in `src/commands/<domain>.mjs`, wired through
  `src/cli.mjs`; do not add per-skill scripts.
- Limits enforced by the CLI validator: frontmatter description 1-500
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
