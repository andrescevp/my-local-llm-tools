# cheap-ai-winth-local-tools

Local-first, low-cost AI toolbelt for OpenCode V2. Nine skills that use
software already on this machine — no cloud APIs, no per-token billing, no
image uploads. Tooling is JavaScript (ESM) and dependencies are managed with
`pnpm`; every skill is authored and versioned here.

```
Ollama :11434   ComfyUI :8188   llama.cpp :8080 (optional)
```

## Skills

| Skill | What it does | Local dependency |
|---|---|---|
| `image-analysis` | Describe, compare, and inspect images with a local vision model | Ollama + `minicpm-v4.6` |
| `ocr` | Extract text/tables/structure from documents; Tesseract-assisted corrections | Ollama + `PaddleOCR-VL`, optional Tesseract |
| `autoskills` | Analyze a project, propose skills, author them via `create-skill` | local FS + Node |
| `create-skill` | Create, update, and evaluate skills; defines the validator | Node + `yaml` |
| `create-agent` | Create, optimize, and validate agent profiles | local FS |
| `openai-api-usage` | Call OpenAI and compatible APIs (llama.cpp, Ollama, vLLM) | OpenAI key or local `/v1` server |
| `video-analysis` | Sample frames and describe/summarize local videos | `ffmpeg` + Ollama + `minicpm-v4.6` |
| `speak` | Speak text aloud in Spanish (Laura `es_MX`) | `piper` + voice model |
| `comfyui-server` | Generate video, image, music, and voice via verified workflows | ComfyUI on `:8188` |

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
| Tesseract | `5.5.3` with `eng` + `spa` data; optional OCR correction context |

No Python runtime is required: all skill tooling is Node.js.

## Usage

```bash
# Unified CLI
pnpm cli skill validate skills/create-skill/SKILL.md
pnpm cli speak "Hola, soy Laura"

# OpenAI-compatible API (OpenAI, Ollama, llama.cpp, vLLM)
export OPENAI_BASE_URL="http://127.0.0.1:11434/v1"
export OPENAI_API_KEY="ollama"   # ignored by Ollama
curl -sS "$OPENAI_BASE_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{"model":"minicpm-v4.6:latest","messages":[{"role":"user","content":"Hola"}]}'

# Vision / OCR
pnpm cli image --image /abs/shot.png
pnpm cli ocr --image /abs/page.png

# Video
pnpm cli video --input /abs/clip.mp4 --frames 12 --summary

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
│   ├── ocr/
│   ├── openai-api-usage/
│   ├── speak/
│   └── video-analysis/
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

- Model deletion is never automatic; ask before removing anything.
- Multi-GB downloads only on explicit request.
- API keys are read from the environment and never persisted or logged.
- Prefer localhost binds; local servers need no auth only on loopback.
- Never read or print `.env*`, credentials, or tokens.

## Ports

| Service | Default | Notes |
|---|---|---|
| Ollama | `127.0.0.1:11434` | systemd system service |
| ComfyUI | `127.0.0.1:8188` | single owner; user service |
| llama.cpp | `127.0.0.1:8080` | optional OpenAI-compatible server |
