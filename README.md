# my-local-llm-tools

Local-first, low-cost AI toolbelt for OpenCode V2. Nineteen skills that use
software already on this machine — no cloud APIs, no per-token billing, no
image uploads. Tooling is JavaScript (ESM) and dependencies are managed with
`pnpm`; every skill is authored and versioned here.

```
Ollama :11434   llama.cpp :8080 (optional)
```

## Skills

| Skill | What it does | Local dependency |
|---|---|---|
| `image-analysis` | Describe, compare, and inspect images with a local vision model | Ollama + `minicpm-v4.6` |
| `ocr` | Extract text/tables/structure from documents; Tesseract-assisted corrections | Ollama + `PaddleOCR-VL`, optional Tesseract |
| `autoskills` | Analyze a project, propose skills, author them via `ccreate-skill` | local FS + Node |
| `ccreate-skill` | Create, update, and evaluate skills; defines the validator | Node + `yaml` |
| `ccreate-agent` | Create, optimize, and validate agent profiles | local FS |
| `execute-command` | Run commands with bounded logs, preserved exit codes, and searchable output | shell + `head`/`tail` |
| `openai-api-usage` | Call OpenAI and compatible APIs (llama.cpp, Ollama, vLLM) | OpenAI key or local `/v1` server |
| `setup` | Detect dependencies, write the machine manifest, diagnose the harness | Node + pnpm |
| `video-analysis` | Sample frames and describe/summarize local videos | `ffmpeg` + Ollama + `minicpm-v4.6` |
| `speak` | Speak text aloud in the system language (English fallback) | `piper` + voice model |
| `transcript-audio` | Transcribe audio/video, with chunking for long recordings | `hyprwhspr` + ffmpeg |
| `convert-files` | Convert/edit documents, images, audio, and video | LibreOffice + ImageMagick + ffmpeg |
| `autoedit-with-gimp` | Resize, convert, optimize, and edit images; custom macros | GIMP |
| `autoedit-with-inkscape` | Export/clean/edit SVG and vectorize bitmaps | Inkscape, optional Potrace |
| `image-background-removal` | Remove image backgrounds locally with U2Net | U2Net ONNX + sharp |
| `presentations-generator` | Generate PPTX/HTML/PDF from JSON | Node, Playwright for PDF |
| `use-my-browser` | Persistent isolated browser for extraction/downloads | Playwright, system Chrome optional |
| `use-my-browser-learn` | Learn/teach CSS selectors for repeatable extraction | linkedom + SQLite |
| `use-my-browser-record` | Record and replay browser workflows | Playwright + SQLite |

Skill tooling lives in one CLI: `src/cli.mjs`. Registered skill IDs are
namespaced as `my-local-llm-tools:<skill>` (for example
`my-local-llm-tools:ocr`). `autoskills` delegates naming, frontmatter,
description limits, and validation to `ccreate-skill`.

## Install (OpenCode V2)

```bash
pnpm install
pnpm harness:install          # symlink into the global plugins directory
# restart OpenCode
```

Alternatively, configure the local directory explicitly in `opencode.jsonc`:

```jsonc
{
  "plugins": ["/absolute/path/to/my-local-llm-tools"]
}
```

Use **one** installation method. Configuring the directory while it is also
symlinked under `~/.config/opencode/plugins/` loads the plugin twice. A
`plugins/` directory next to a project `opencode.jsonc` is not auto-discovered;
point the config at it explicitly. After editing files inside the repo, restart
OpenCode — local dependencies outside watched config directories may not hot
reload.

The plugin discovers skills from `skills/*/SKILL.md` at load time and injects a
compact inventory into each session. Hosts and per-skill readiness come from the
machine manifest written by `setup`; when that manifest is missing or invalid,
the injected context warns to run `setup`. No agents are installed as files.

### Claude Code

The same directory is a Claude Code plugin via `.claude-plugin/plugin.json`:

```bash
pnpm install
claude plugin validate .
claude --plugin-dir .
```

Claude Code prefixes plugin skills automatically (`/my-local-llm-tools:ocr`).
Skills use the standard `${CLAUDE_PLUGIN_ROOT}` reference; Claude Code
substitutes it natively and the OpenCode plugin renders it with the real path
when it registers each skill. The same files work in both hosts.

### Windows

Use PowerShell (`pwsh` or `powershell`) or `cmd.exe` for `pnpm`, `node`, and
`claude`:

```powershell
pnpm install
pnpm harness:install
claude plugin validate .
claude --plugin-dir .
```

Use WSL2 or Git Bash **only when installed and configured**:

```powershell
wsl --status        # must succeed
Get-Command bash    # Git Bash
bash --version
```

Copy-paste Windows examples: `skills/setup/references/windows.md`.

### Coexistence with `my-utils-harness`

`my-utils-harness` (if installed) also registers `autoskills`,
`image-analysis`, and `ocr`. `dev-harness-skills` may register
other overlapping IDs. OpenCode resolves duplicate skill IDs by plugin load
order, so the text that wins is not deterministic across machines. Keep only one
of the overlapping plugins enabled, or disable the duplicate IDs explicitly:

```jsonc
{
  "plugins": ["*", "-my-utils-harness"]
}
```

The install command prints a reminder when it detects another harness.

## Development

```bash
pnpm validate    # static harness validation
pnpm typecheck   # OpenCode plugin API types
pnpm test        # node:test suites
pnpm qa          # lint + typecheck + deps + duplication + tests + validate + security
```

### Setup and diagnostics

```bash
pnpm cli setup                  # detect deps + write the machine manifest
pnpm cli setup --install        # show the install plan (no changes)
pnpm cli setup --install --yes  # run pnpm install / ollama pull
pnpm cli doctor                 # live diagnostics, writes nothing
pnpm cli doctor --skill ocr     # exit 1 if the skill cannot run
```

The manifest lives at `~/.mllt/manifest.json` (`%USERPROFILE%\.mllt` on
Windows) and includes the Ollama host, available models, and resolved tool
paths, plus per-skill readiness. It is validated against
`src/commands/setup/manifest.schema.json` on write and read. `setup --install`
prints package-manager commands for missing system binaries; it never runs
`sudo` or a package manager automatically.

### QA toolchain

| Tool | Command | Config |
|---|---|---|
| Biome | `pnpm lint` / `pnpm lint:fix` | `biome.json` |
| TypeScript | `pnpm typecheck` | `tsconfig.json` |
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
| uv | Python environment manager; official installer through `setup` |
| PHP | `8.4.21` (via `phpenv`); PHP package from the platform manager |
| Supported OS | Linux, macOS, Windows (Node paths and audio backends adapt) |
| Ollama | `0.40.10`, systemd `ollama.service`, `127.0.0.1:11434` |
| Ollama models | `minicpm-v4.6`, `MedAIBase/PaddleOCR-VL:0.9b`, `all-minilm`, `nomic-embed-text-v2-moe` |
| Piper | `~/.local/bin/piper` + system-language voice in `~/.mllt/piper-voices` |
| hyprwhspr | System speech-to-text service; file transcription and long-audio chunking |
| Tesseract | `5.5.3` with `eng` + `spa` data; optional OCR correction context |
| LibreOffice | `/usr/sbin/soffice`; converts documents |
| ImageMagick | `/usr/sbin/magick`; converts and edits images |
| ffmpeg/ffprobe | Video/audio conversion, frames, and media inspection |
| GIMP | `3.2.6`; batch image editing and macros |
| Inkscape + Potrace | `1.4.4` + Potrace `1.16`; SVG export/editing/vectorization |
| Playwright | Chromium cached under `~/.cache/ms-playwright`; presentation PDF |

No Python runtime is required by skill tooling: all skill tooling is Node.js.
`setup` also installs `uv` for general Python environment management. GIMP batch
mode uses GIMP's own embedded Python-Fu interpreter, not a project Python script.

## Usage

```bash
# Unified CLI
pnpm cli skill validate skills/ccreate-skill/SKILL.md
pnpm cli speak "Hello, this is the system voice"

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

# Transcription
pnpm cli transcribe --input /abs/interview.mp4 --out /abs/interview.transcript.md

# Documents, images, and media
pnpm cli convert --input /abs/report.docx --to pdf --out /abs/out
pnpm cli convert --input /abs/photo.png --to webp --resize 800x600 --out /abs/out
pnpm cli convert --input /abs/photo.tiff --to jpg --quality 85 --out /abs/out
pnpm cli convert --input /abs/clip.mp4 --to mp3 --out /abs/out
pnpm cli convert --input /abs/clip.mp4 --frames 12 --out /abs/out
pnpm cli convert --input /abs/clip.mp4 --to mp4 \
  --start 10 --duration 5 --scale 1280:-2 --mute --out /abs/out
pnpm cli gimp resize --input /abs/in.png --output /abs/out.png --width 1200
pnpm cli inkscape export --input /abs/logo.svg --output /abs/logo.png --dpi 300
pnpm cli inkscape vectorize --input /abs/logo.png --output /abs/logo.svg
pnpm cli remove-bg --input /abs/product.jpg --output /abs/product.png

# Presentations
pnpm cli presentation --input /abs/deck.json --output /abs/deck.pptx
pnpm cli presentation --input /abs/deck.json --output /abs/deck.html
pnpm cli presentation --input /abs/deck.json --output /abs/deck.pdf

# Browser
pnpm cli browser session status
pnpm cli browser open --url https://example.com
pnpm cli browser extract --url https://example.com --selector main
pnpm cli browser page --url https://example.com --out /abs/pages/example
pnpm cli browser learn add --url https://example.com --field title --value "Example Domain"
pnpm cli browser record start --name demo --url https://example.com
pnpm cli browser replay --name demo
```

PowerShell equivalent for the OpenAI-compatible request:

```powershell
$env:OPENAI_BASE_URL = "http://127.0.0.1:11434/v1"
$env:OPENAI_API_KEY = "ollama"
$body = '{"model":"minicpm-v4.6:latest","messages":[{"role":"user","content":"Hola"}]}'
Invoke-RestMethod -Method Post -Uri "$env:OPENAI_BASE_URL/chat/completions" `
  -Headers @{ Authorization = "Bearer $env:OPENAI_API_KEY" } `
  -ContentType "application/json" -Body $body
```

Each `SKILL.md` invokes the CLI through `${CLAUDE_PLUGIN_ROOT}/src/cli.mjs`.
Claude Code substitutes the placeholder; the OpenCode plugin renders it at
registration. From the repo root, `pnpm cli` is equivalent.

## Layout

```
.
├── index.ts                  # OpenCode V2 plugin: register skills + context
├── package.json
├── src/
│   ├── cli.mjs               # single CLI for all skill and repo tooling
│   ├── commands/             # one module per domain (install, validate, setup, ...)
│   └── lib/                  # shared helpers (skills discovery, exec, config, ...)
├── skills/
│   ├── autoskills/
│   ├── autoedit-with-gimp/
│   ├── autoedit-with-inkscape/
│   ├── convert-files/
│   ├── ccreate-agent/
│   ├── ccreate-skill/
│   ├── execute-command/
│   ├── image-analysis/
│   ├── image-background-removal/
│   ├── ocr/
│   ├── openai-api-usage/
│   ├── presentations-generator/
│   ├── setup/
│   ├── speak/
│   ├── transcript-audio/
│   ├── use-my-browser/
│   ├── use-my-browser-learn/
│   ├── use-my-browser-record/
│   └── video-analysis/
├── tests/                    # node:test suites
├── AGENTS.md
└── README.md
```

## Authoring

- Every skill lives in `skills/<name>/` and is edited here — there is no copy
  or sync step from another checkout.
- Skills are discovered from `skills/*/SKILL.md` at plugin load; adding,
  renaming, or removing a directory is enough (no manifest step).
- For a new skill, load `ccreate-skill` and follow its workflow.
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
| llama.cpp | `127.0.0.1:8080` | optional OpenAI-compatible server |
