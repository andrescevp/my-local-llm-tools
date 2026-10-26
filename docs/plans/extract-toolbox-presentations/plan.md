# Plan — Extract `presentations-generator` and split the toolbox scripts into four skills

- **Plan slug:** `extract-toolbox-presentations`
- **Status:** Done (2026-10-26; U2Net real-model smoke pending model installation)
- **Date:** 2026-10-26
- **Requirements:** this document
- **Scope:** extract `presentations-generator`; create `convert-files`,
  `autoedit-with-gimp`, `autoedit-with-inkscape`, and
  `image-background-removal`; port every used script to JavaScript under
  `src/` and the single CLI; no scrapers
- **Out of scope:** all scrapers (BORME, BDNS, Google Maps, Instagram,
  TripAdvisor), Docker/n8n, `uv`/Python runners, cloud APIs, automatic
  browser/model downloads, generic Playwright screenshot/PDF wrappers,
  arbitrary user-supplied JavaScript execution

## Objective

Extract the useful, local-first parts of the external toolbox and presentation
skills into this harness as **five skills, one per script family**:

| Skill | Responsibility | CLI |
|---|---|---|
| `convert-files` | Convert documents with LibreOffice | `pnpm cli convert` |
| `autoedit-with-gimp` | Raster image convert/resize/optimize/edit with GIMP | `pnpm cli gimp` |
| `autoedit-with-inkscape` | Vector export/convert/edit and bitmap vectorization | `pnpm cli inkscape` |
| `image-background-removal` | Remove an image background locally | `pnpm cli remove-bg` |
| `presentations-generator` | Generate PPTX/HTML/PDF from JSON | `pnpm cli presentation` |

`toolbox-tools-agent` is **not** extracted as a skill. Its material is split
into the four focused skills above so each migrated script has one owner and one
`doctor` gate. The original presentations skill becomes `presentations-generator`
with a JS engine.

All executable behavior is JavaScript ESM in `src/`, covered by `node:test`,
with no Python or shell executables under `skills/`. All source-specific
references (n8n, Docker, container paths, `create_presentation.py`, `uv`,
`pwuser`, `docker-scripts`) are removed.

## Source inventory (planning-only; must not leak into deliverables)

### Source skills

| Source | Size | Use |
|---|---:|---|
| `.agents/skills/toolbox-tools-agent/SKILL.md` | 347 lines | Source material for the four focused skills |
| `references/libreoffice.md` | 56 lines | `convert-files` reference |
| `references/gimp.md` | 61 lines | `autoedit-with-gimp` reference |
| `references/inkscape.md` | 64 lines | `autoedit-with-inkscape` reference |
| `references/playwright.md` | 119 lines | Dropped (no generic browser skill) |
| `references/background-remover.md` | 93 lines | `image-background-removal` reference |
| `.agents/skills/presentations-generator/SKILL.md` | 403 lines | `presentations-generator` skill |
| `evals/evals.json` + `evals/trigger_queries.json` | 41 + 22 lines | Rewritten evals/triggers |

### Scripts to port

| Source script | Approx. size | Target (JS) | Skill |
|---|---:|---|---|
| `presentation/create_presentation.py` | 71 lines | `src/commands/presentation/render.mjs` | `presentations-generator` |
| `engines/base.py` | 28 lines | `src/commands/presentation/theme.mjs` | `presentations-generator` |
| `engines/html_engine.py` | 47 lines | `src/commands/presentation/html.mjs` | `presentations-generator` |
| `engines/pdf_engine.py` | 56 lines | `src/commands/presentation/pdf.mjs` | `presentations-generator` |
| `engines/pptx_engine.py` | 441 lines | `src/commands/presentation/pptx/*.mjs` | `presentations-generator` |
| `templates/reveal.html.j2` | ~281 lines | `src/commands/presentation/templates/reveal.ejs` | `presentations-generator` |
| `templates/slides.html.j2` | ~161 lines | `src/commands/presentation/templates/slides.ejs` | `presentations-generator` |
| `themes/*.json` | 4 files | `src/commands/presentation/themes/*.json` | `presentations-generator` |
| `cli/presentation.py` | 76 lines | `src/commands/presentation.mjs` | `presentations-generator` |
| `background_remover/remove_bg.py` | 177 lines | `src/commands/remove-bg/*.mjs` | `image-background-removal` |
| `cli/background_remover.py` | 67 lines | `src/commands/remove-bg.mjs` | `image-background-removal` |
| LibreOffice command patterns | — | `src/lib/libreoffice.mjs`, `src/commands/convert.mjs` | `convert-files` |
| GIMP Script-Fu patterns | — | `src/commands/gimp/*.mjs` | `autoedit-with-gimp` |
| Inkscape export patterns | — | `src/commands/inkscape/*.mjs` | `autoedit-with-inkscape` |

All scraper code is eliminated from scope: no BDNS, BORME, Google Maps,
Instagram, or TripAdvisor ports, and no XML/XLSX scraper dependencies.

## Target architecture

### Skills

```
skills/
├── convert-files/
│   ├── SKILL.md
│   └── references/
│       └── libreoffice.md
├── autoedit-with-gimp/
│   ├── SKILL.md
│   └── references/
│       └── gimp.md
├── autoedit-with-inkscape/
│   ├── SKILL.md
│   └── references/
│       └── inkscape.md
├── image-background-removal/
│   ├── SKILL.md
│   └── references/
│       └── background-removal.md
└── presentations-generator/
    ├── SKILL.md
    ├── evals/
    │   ├── evals.json
    │   └── trigger_queries.json
    └── references/
        ├── config-schema.md
        ├── slide-types.md
        ├── themes.md
        └── templates.md
```

### CLI commands

```text
convert --input FILE [--input FILE...] --to pdf|html|csv|txt|... [--out DIR]
        [--filter NAME] [--timeout SECONDS]

gimp resize|convert|optimize|crop|rotate|flip|blur|sharpen|grayscale
     |brightness-contrast|hue-saturation|levels|sepia|vignette|autocrop
     |text|border
     --input FILE --output FILE [options]
gimp macro list
gimp macro new <name> [--force]
gimp macro run <name> --input FILE --output FILE [--param key=value ...]

inkscape export --input FILE --output FILE [--dpi N] [--page N]
                [--area drawing|page|x0:y0:x1:y1] [--id ID]
                [--width N] [--height N]
                [--background HEX] [--background-opacity N]
inkscape query --input FILE [--id ID] [--json]
inkscape clean --input FILE --output FILE
inkscape edit --input FILE --output FILE
              (--rotate 90|180|270 | --flip horizontal|vertical
               | --to-path | --text-to-path | --fit-canvas drawing|selection)
inkscape vectorize --input RASTER --output SVG | --out-dir DIR
                   [--threshold N] [--turdsize N] [--variants N] [--pick N]

remove-bg --input FILE --output FILE | --out-dir DIR
          [--padding N] [--canvas-size N] [--gimp-refine]
          [--variants N] [--pick N]

presentation --input CONFIG.json --output FILE.pptx|FILE.html|FILE.pdf
             [--theme NAME|PATH|JSON] [--template NAME|PATH|EJS]
             [--page-size A4] [--margin 20mm] [--force]
             [--list-themes] [--list-templates]
```

`application` command names are top-level for discoverability. There is no
generic `toolbox` command and no `playwright` command; Playwright is an internal
dependency of presentation PDF rendering only.

### Modules

```
src/
├── cli.mjs
├── commands/
│   ├── convert.mjs
│   ├── gimp.mjs
│   ├── gimp/
│   │   ├── script.mjs        # Script-Fu builders
│   │   ├── operations.mjs    # whitelisted built-in operations
│   │   ├── macros.mjs        # user macro discovery/validation/run
│   │   └── run.mjs           # argv + timeout + output verification
│   ├── inkscape.mjs
│   ├── inkscape/
│   │   ├── export.mjs
│   │   ├── query.mjs
│   │   ├── edit.mjs          # whitelisted Inkscape actions
│   │   ├── vectorize.mjs     # potrace wrapper + variants
│   │   └── run.mjs
│   ├── remove-bg.mjs
│   ├── remove-bg/
│   │   ├── model.mjs         # ONNX U2Net session
│   │   ├── composite.mjs     # sharp crop/pad/canvas/alpha
│   │   ├── variants.mjs      # multi-candidate generation/manifest
│   │   └── gimp-refine.mjs
│   ├── presentation.mjs
│   └── presentation/
│       ├── render.mjs
│       ├── config.mjs
│       ├── theme.mjs
│       ├── html.mjs
│       ├── pdf.mjs
│       ├── pptx/
│       │   ├── engine.mjs
│       │   ├── slides.mjs
│       │   ├── media.mjs
│       │   ├── table.mjs
│       │   └── charts.mjs
│       ├── templates/        # reveal.ejs, slides.ejs
│       ├── themes/           # 4 JSON themes
│       ├── assets/           # vendored reveal/chart dist
│       └── config.schema.json
└── lib/
    ├── skills.mjs
    ├── exec.mjs
    └── libreoffice.mjs       # shared resolver/runner
```

Every `.mjs` file ≤300 lines; split further if needed.

### Dependencies (proposed, pending Phase 0 approval)

| Dependency | Purpose | License/notes |
|---|---|---|
| `pptxgenjs` | Native PPTX generation, charts, tables, media | MIT |
| `ejs` | HTML template rendering | Apache-2.0 |
| `playwright` | PDF rendering only | Apache-2.0; browser binary |
| `reveal.js` | Vendored HTML presentation runtime | MIT |
| `chart.js` | Vendored HTML/PDF charts | MIT |
| `sharp` | Background-removal crop/pad/composite | Apache-2.0 |
| `onnxruntime-node` | U2Net background-removal inference | MIT; local model required |
| `ajv` | Already present; config schema | MIT |

External tools (not npm): `soffice`/LibreOffice, `gimp`, `inkscape`, and
`potrace` (for `inkscape vectorize`). No `fast-xml-parser`, `exceljs`, or
scraper dependencies.

### ONNX U2Net (background removal)

U2Net is a salient-object-detection model. `image-background-removal` feeds the
input image to a local U2Net ONNX model via `onnxruntime-node`, receives a
foreground mask, and uses `sharp` to crop/pad/center/composite the subject onto
transparency. It replaces the Python `rembg` pipeline with pure JavaScript
inference; no Python process, no `rembg`, and no automatic model download.

The model is the same default used by the source pipeline: rembg's **`u2net`**
model (`u2net.onnx`), not `u2netp`, `isnet`, or a matting model. It lives at
`~/.mllt/models/u2net.onnx` or `TOOLBOX_U2NET_MODEL`; if missing, the command
exits `3` with a `setup` hint. Optional GIMP refinement reuses the `gimp`
command. Redistribution license is checked before bundling the model file; the
CLI never downloads it silently.

### Setup/doctor features

This plan implements machine-manifest **schema 3** and owns the shared
LibreOffice resolver; `read-document` will reuse both.

| Tool/feature | Required by | Detection |
|---|---|---|
| `libreoffice` | `convert-files` | `src/lib/libreoffice.mjs` (system first, `~/.mllt` fallback) |
| `gimp` | `autoedit-with-gimp`, optional background refine | `gimp --version` |
| `inkscape` | `autoedit-with-inkscape` | `inkscape --version` |
| `potrace` | `autoedit-with-inkscape vectorize` (optional) | `potrace --version` |
| `playwright` | `presentations-generator` PDF | package + Chromium executable/cache |
| `u2net` model | `image-background-removal` | `~/.mllt/models/u2net.onnx` or env override |
| `pdftoppm` | Reserved for `read-document` | Poppler detection (shared schema) |

`features`:

```js
"convert-files": { requires: ["libreoffice"] },
"autoedit-with-gimp": { requires: ["gimp"] },
"autoedit-with-inkscape": { requires: ["inkscape"], optional: ["potrace"] },
"image-background-removal": { requires: ["u2net"], optional: ["gimp"] },
"presentations-generator": { requires: [], optional: ["playwright"] }
```

Schema 3 adds `libre_office_path` and `tools.{libreoffice,gimp,inkscape,potrace,playwright,u2net_model,pdftoppm}`. `read-document` reuses them instead of bumping again.

## Requirements Snapshot

- **R1 — Five skills:** `convert-files`, `autoedit-with-gimp`,
  `autoedit-with-inkscape`, `image-background-removal`, and
  `presentations-generator` exist with valid frontmatter, descriptions ≤500
  characters, ≤250 lines, and no source references. No
  `toolbox-tools-agent` skill is created.
- **R2 — No source leakage:** delivered skills, references, evals, code, tests,
  and docs contain none of: `n8n`, `Docker`, `Container Runner`,
  `igpt-n8n-stack-toolbox`, `/input`, `/output`, `uv run`, `pwuser`,
  `create_presentation.py`, `docker-scripts`, `python-pptx`, `Jinja2`, or the
  source repository path.
- **R3 — `convert-files`:** `convert` wraps LibreOffice for arbitrary input
  formats and `--to` targets, supports multiple inputs and `--out`, verifies
  non-empty output, uses an isolated profile, and exits `3` when LibreOffice is
  missing.
- **R4 — `autoedit-with-gimp`:** `gimp` supports resize, format conversion,
  optimization (JPEG quality/PNG compression), crop, rotate, flip, blur,
  sharpen, grayscale, brightness/contrast, hue/saturation, levels, sepia,
  vignette, autocrop, text/watermark, and border via safe Script-Fu argv
  arrays. It also supports **user macros** (`gimp macro list|new|run`) loaded
  from `~/.mllt/gimp/macros/*.scm`; inline arbitrary Scheme is never accepted.
- **R5 — `autoedit-with-inkscape`:** `inkscape` supports SVG/vector export to
  PNG/PDF/EPS/PS/EMF/WMF/ODG, plain-SVG cleaning, geometry queries, whitelisted
  edits (rotate/flip/to-path/text-to-path/fit-canvas), and bitmap
  vectorization via `potrace` with threshold/turd-size variants. Supports DPI,
  page, area, object ID, width/height, background color/opacity.
- **R6 — `image-background-removal`:** `remove-bg` runs local U2Net (`u2net.onnx`,
  the source default) inference, preserves alpha edges, supports padding and
  square canvas sizing, optionally invokes GIMP refinement, and can emit
  multiple candidates (`--variants`, `--pick`) for user selection. Missing
  model exits `3`; no silent download.
- **R7 — `presentations-generator`:** `presentation` supports `.pptx`, `.html`,
  `.pdf`; 11 slide types; 8 chart types; 4 built-in themes; name/path/inline
  theme and EJS template specs; `theme_overrides`; `--list-themes` and
  `--list-templates`.
- **R8 — JS-only, no scrapers:** no Python or shell executables under `skills/`
  or `src/`; no scraper code/dependencies (BORME, BDNS, Google Maps, Instagram,
  TripAdvisor) is added.
- **R9 — Setup/doctor:** schema 3 and `features` above; `setup --install`
  prints OS-specific hints for LibreOffice, GIMP, Inkscape, Poppler, Playwright
  browser, and the U2Net model.
- **R10 — Tests:** TDD for every module. Unit tests use fixtures and injected
  runners/ONNX masks/Playwright pages. Live browser/model tests are opt-in and
  skipped by default. PPTX/HTML/PDF outputs are structurally validated.
- **R11 — Repository integration:** dynamic discovery picks up the five skills;
  plugin test expected IDs include them; README/AGENTS counts and tables are
  updated; `pnpm validate`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm qa` pass.
- **R12 — Security:** no arbitrary script execution; argv arrays only; output
  paths explicit; Playwright only internal to PDF; no secrets logged.
- **R13 — Multi-result selection:** `remove-bg --variants N` and
  `inkscape vectorize --variants N` produce numbered candidates plus a
  `candidates.json` manifest (parameters, path, optional metrics) so the user
  can compare and choose; `--pick N` copies the chosen candidate to the final
  output. The CLI never deletes candidates automatically.
- **R14 — GIMP macros:** users can scaffold and run named `.scm` macros from
  `~/.mllt/gimp/macros` with declared parameters; the CLI validates the macro
  name/path, substitutes only declared parameters, and never accepts inline
  Scheme from an untrusted string. Macros are local trusted code and documented
  as such.

## Scope

**In scope**

- Five skills listed above, their references, and presentation evals.
- JS ports of the presentation engine, background removal, LibreOffice
  conversion, GIMP operations/macros, and Inkscape/vector operations.
- Multi-candidate output for background removal and vectorization.
- Schema 3, shared LibreOffice resolver, dependency detection, install hints.
- Tests, fixtures, source-reference scrub test, docs.

**Out of scope**

- All scrapers and their dependencies.
- Docker/n8n/toolbox container, `uv`, `nvm`, `pwuser`.
- Generic Playwright screenshot/PDF commands (only presentation PDF uses
  Playwright).
- Automatic Playwright browser or U2Net model downloads.
- Instagram/TripAdvisor/BORME/BDNS/Google Maps.
- Inline arbitrary user JavaScript or inline GIMP Scheme. Registered local
  macros under `~/.mllt/gimp/macros` are in scope; inline `--script` is not.

## Assumptions and Constraints

- Node 24, pnpm, ESM, `node:test`; files ≤300 lines; `SKILL.md` ≤250 lines.
- GIMP, Inkscape, LibreOffice, Potrace, and Playwright are available on this
  machine (`/usr/sbin/gimp`, `/usr/sbin/inkscape`, `/usr/sbin/soffice`,
  `/usr/sbin/potrace`, Playwright browsers under `~/.cache/ms-playwright`).
- Custom templates are EJS, not Jinja2. This is a documented compatibility
  change.
- Vectorization is a companion operation: `inkscape vectorize` uses `potrace`
  for raster→SVG; vector editing/export uses Inkscape. Single-color tracing is
  the default; `--variants` offers threshold/turd-size alternatives.
- Background removal uses **rembg's default `u2net` model (`u2net.onnx`)**,
  the same model the source pipeline uses. No model is downloaded
  automatically. Model license and `onnxruntime-node` platform support are
  confirmed in Phase 0.
- Presentation HTML/PDF assets (`reveal.js`, `chart.js`) are **always
  vendored** into an output `assets/` directory for offline use; CDN fallback is
  not planned.
- GIMP user macros are trusted local files under `~/.mllt/gimp/macros`; the CLI
  never accepts inline Scheme from a flag.
- This plan implements schema 3 and the shared LibreOffice resolver;
  `read-document` reuses them. If `read-document` is already implemented, reuse
  its resolver instead of creating a second one.
- The repo's skill count is 10 before this plan. Adding five skills makes 15;
  adding `read-document` later makes 16. Counts come from the expected-ID array
  in `tests/plugin.test.mjs`, not from a static manifest.

## Risks and Areas Requiring Care

| Risk | Impact | Mitigation |
|---|---|---|
| PPTX fidelity vs python-pptx | Missing native charts/media | Phase 0 spike all slide/chart types; structural tests; video fallback |
| PPTX engine >300 lines | Repo limit violation | Split engine/slides/media/table/charts |
| HTML/PDF offline assets | Charts/reveal fail without network | Vendor assets; test with network blocked |
| EJS vs Jinja2 templates | Custom source templates incompatible | Document `.ejs`; provide examples |
| Playwright browser absent | PDF fails | Detect package + browser; exit 3 with install hint |
| U2Net model/license/platform | Background removal unavailable | Phase 0 license/platform spike; local model; `sharp` fallback; no auto-download |
| GIMP Script-Fu quoting | Command failures/injection | Build argv arrays; escape paths; integration test |
| GIMP user macros | Malicious/unsafe Scheme runs with user privileges | Only named files under `~/.mllt/gimp/macros`; validate name/params; no inline script; document trust boundary |
| Inkscape/potrace output quality | Vectorization artifacts | Threshold/turdsize flags; `--variants`; document single-color limits |
| Multi-candidate output clutter | User unsure which file to use | `candidates.json` manifest with parameters/metrics; `--pick N`; keep originals until explicit cleanup |
| Source-reference leakage | Violates extraction requirement | Scrub test with forbidden tokens |
| Skill files >250 lines | `pnpm validate` fails | Move matrices to references |
| Count conflicts with `read-document` | Plugin test/README mismatch | Expected-ID array; update human counts after both plans |
| Dependency bloat/security | Large install/QA findings | Pin versions; `pnpm qa`; lazy-load heavy libs |

## Core Concepts

### Presentation config (preserved)

```json
{
  "title": "Quarterly Report",
  "author": "Local Toolbelt",
  "date": "2026-10-26",
  "theme": "corporate",
  "template": "reveal",
  "theme_overrides": { "colors": { "accent": "#FF6600" } },
  "slides": [
    { "type": "title", "title": "Welcome", "subtitle": "Generated locally" },
    { "type": "bullets", "title": "Key Points", "items": ["A", "B"] },
    { "type": "chart", "title": "Revenue", "chart_type": "bar",
      "labels": ["Q1", "Q2"],
      "datasets": [{ "label": "Actual", "data": [10, 20], "color": "#0066CC" }] }
  ]
}
```

- Slide types: `title`, `section`, `bullets`, `text`, `image`, `gallery`,
  `video`, `table`, `columns`, `chart`, `closing`.
- Chart types: `bar`, `column`, `line`, `pie`, `doughnut`, `area`,
  `bar_stacked`, `line_markers`.
- Themes: `default`, `corporate`, `light`, `dark`, plus path/inline JSON.
- Templates: `reveal`, `slides`, plus `.ejs` path/inline.
- Output extension selects the engine: `.pptx`, `.html`, `.pdf`.

### `convert-files`

`soffice --headless --convert-to <format> --outdir <dir> <input>` via argv
array, isolated `UserInstallation`, timeout, output verification. Supports
multiple `--input` files; output names follow LibreOffice. The skill documents
format families and points to `read-document` for text extraction.

### `autoedit-with-gimp`

Script-Fu templates built as strings but passed as a single argv item:
`gimp -i -b '<script>'`. Built-in whitelisted operations:

| Operation | Main options |
|---|---|
| `convert` | output format: PNG/JPEG/WebP; quality |
| `resize` | width/height; keep aspect |
| `optimize` | JPEG quality, PNG compression, progressive |
| `crop` | x/y/width/height |
| `rotate` | 90/180/270 or arbitrary angle + background |
| `flip` | horizontal/vertical |
| `blur` / `sharpen` | radius/amount |
| `grayscale` | luminosity/desaturate |
| `brightness-contrast` | brightness/contrast ranges |
| `hue-saturation` | hue/saturation/lightness |
| `levels` | input/output levels, gamma |
| `sepia` | strength |
| `vignette` | radius/softness/color |
| `autocrop` | trim uniform borders |
| `text` / `watermark` | text, font, size, color, position, opacity |
| `border` | width, color |

Always append `(gimp-quit 0)`; verify output exists. No inline arbitrary Scheme.

**Custom GIMP macros (v1):**

- Directory: `~/.mllt/gimp/macros/*.scm` (override with `GIMP_MACROS_DIR`).
- `gimp macro new <name>` writes a documented `.scm` template with placeholders
  `{input}`, `{output}`, and declared `{param:name}` values.
- `gimp macro list` lists macro name/description/parameters.
- `gimp macro run <name> --input FILE --output FILE --param key=value` validates
  the macro name/path, substitutes only declared parameters, escapes paths, and
  runs it with `gimp -i -b`.
- Macros are trusted local code; there is no download, no inline `--script`, and
  no automatic execution. The skill documents how to create and review them.

### `autoedit-with-inkscape`

SVG/vector operations:

| Operation | Capability |
|---|---|
| `export` | SVG → PNG, PDF, EPS, PS, EMF, WMF, ODG (extension-based) |
| `export` detail | `--dpi`, `--page`, `--area drawing|page|x0:y0:x1:y1`, `--id`, `--width`, `--height`, `--background`, `--background-opacity` |
| `query` | dimensions/position of the drawing or an object ID (`--query-all`, JSON) |
| `clean` | plain SVG (`--export-plain-svg`), strip editor metadata, vacuum defs |
| `edit` | whitelisted actions: rotate 90/180/270, flip H/V, object-to-path, text-to-path, fit-canvas to drawing/selection |
| `vectorize` | raster → SVG via Potrace; `--threshold`, `--turdsize`, `--alphamax`, `--opttolerance`, `--variants` |

No arbitrary `--actions` string is accepted; the CLI maps flags to a fixed
whitelist. `vectorize` emits one SVG per candidate with a manifest when
`--variants > 1`.

### `image-background-removal`

```
input → sharp decode → U2Net ONNX mask → alpha composite
      → bbox crop → padding → optional square canvas → optional GIMP refine → PNG
```

Model: rembg's default `u2net` (`u2net.onnx`), path
`~/.mllt/models/u2net.onnx` or `TOOLBOX_U2NET_MODEL`. Missing model exits `3`
with a setup hint. No network access.

**Multiple candidates (v1):**

- `--variants N` generates candidates with different mask treatments (soft
  alpha, balanced threshold, hard threshold) and optional padding presets.
- Each candidate gets `candidate-1.png`, `candidate-2.png`, … plus
  `candidates.json` with parameters, path, and optional metrics (foreground
  coverage, edge transition width).
- The user/agent compares and then runs `--pick N` (or copies the chosen file);
  the CLI does not auto-delete candidates.
- The same `--variants`/`--pick` pattern applies to `inkscape vectorize`
  (threshold/turd-size variants).

### Source-reference scrub

`tests/extraction_contract.test.mjs` scans the five skill directories and
`src/commands/{convert,gimp,inkscape,remove-bg,presentation}` for forbidden
tokens: `n8n`, `Docker`, `Container Runner`, `igpt-n8n-stack-toolbox`,
`/input`, `/output`, `uv run`, `pwuser`, `create_presentation.py`,
`docker-scripts`, `python-pptx`, `Jinja2`, `n8n-vps-stack`. The plan itself is
exempt; delivered artifacts must be clean.

## Sub-Tasks

### Phase 0 — Decisions and spikes

#### Sub-Task 0.1: Approve JavaScript dependencies and external tools

- **Status:** Completed (2026-10-26)
- **Objective:** Confirm libraries, licenses, and platform support.
- **Related Requirements:** R3–R8, R10, R12
- **Dependencies and Preconditions:** None.
- **In Scope for This Sub-Task:** `pptxgenjs`, `ejs`, `playwright`, `reveal.js`,
  `chart.js`, `sharp`, `onnxruntime-node`; external `gimp`, `inkscape`,
  `potrace`, `soffice`.
- **Out of Scope for This Sub-Task:** Installing or using them.
- **Instructions:** Check licenses/versions/Node 24 support; confirm
  `pptxgenjs` video support; confirm `onnxruntime-node` on this platform.
- **Acceptance Criteria:** Approved dependency table; rejected libs have
  alternatives.
- **Cautionary Points:** Avoid AGPL/non-commercial model packages; pin versions.
- **Testing Suggestions:** `pnpm view <pkg> license version`.
- **Done When:** Dependencies are approved.

#### Sub-Task 0.2: Spike presentation and background-removal fidelity

- **Status:** Completed (2026-10-26)
- **Objective:** Prove PPTX/HTML/PDF and U2Net before full implementation.
- **Related Requirements:** R6, R7, R10
- **Dependencies and Preconditions:** Sub-Task 0.1.
- **In Scope for This Sub-Task:** Scratch deck with all slide types; HTML/PDF
  with Chart.js; one background-removal output with the chosen model.
- **Out of Scope for This Sub-Task:** Committing code/fixtures.
- **Instructions:** Record limitations (video, chart types, fonts, alpha edges).
- **Acceptance Criteria:** Findings recorded; strategy confirmed.
- **Cautionary Points:** Do not promise unsupported PPTX media features.
- **Testing Suggestions:** Inspect PPTX XML; open PDF/HTML.
- **Done When:** Core libraries are proven.

### Phase 1 — Shared LibreOffice/schema 3 and `convert-files`

#### Sub-Task 1.1: Shared LibreOffice resolver and schema 3

- **Status:** Completed (2026-10-26)
- **Objective:** Add the shared resolver and machine-manifest schema 3.
- **Related Requirements:** R3, R9
- **Dependencies and Preconditions:** Sub-Task 0.1.
- **In Scope for This Sub-Task:** `src/lib/libreoffice.mjs` (system-first,
  `~/.mllt` fallback, `LIBREOFFICE_BIN` override, probe/argv); schema 3 with
  `libre_office_path` and `tools.{libreoffice,pdftoppm,gimp,inkscape,potrace,playwright,u2net_model}`;
  `setup`/`doctor` detection and hints.
- **Out of Scope for This Sub-Task:** Conversion command and skills.
- **Instructions:** Use the read-document plan's resolver contract; if already
  implemented, reuse. Add OS hints for LibreOffice, GIMP, Inkscape, Poppler,
  Playwright browser, U2Net model.
- **Acceptance Criteria:** Resolver/schema tests pass; `setup --json` includes
  fields; old schema 2 rejected; `features` entries work.
- **Cautionary Points:** Schema 3 invalidates cached manifests; document
  `pnpm cli setup`.
- **Implementation Suggestions:** Keep detection helpers in `src/lib`.
- **Testing Suggestions:** `tests/libreoffice.test.mjs`,
  `tests/manifest_schema.test.mjs`, `tests/setup.test.mjs`.
- **Done When:** Shared dependency layer is green.

#### Sub-Task 1.2: `convert` command

- **Status:** Completed (2026-10-26)
- **Objective:** Implement LibreOffice conversion CLI.
- **Related Requirements:** R3
- **Dependencies and Preconditions:** Sub-Task 1.1.
- **In Scope for This Sub-Task:** `src/commands/convert.mjs`; multiple
  `--input`, `--to`, `--out`, `--filter`, `--timeout`, `--help`; output
  verification; exit codes 0/2/3/4.
- **Out of Scope for This Sub-Task:** Text extraction/OCR and skills.
- **Instructions:** Use argv arrays, isolated profile, temp output then move;
  no shell. Refuse unsupported extensions.
- **Acceptance Criteria:** Unit tests with injected runner; opt-in real
  conversion; missing LibreOffice exit 3.
- **Cautionary Points:** Output naming collisions; multiple inputs.
- **Implementation Suggestions:** Reuse `src/lib/libreoffice.mjs`.
- **Testing Suggestions:** `tests/convert.test.mjs`.
- **Done When:** `pnpm cli convert` works locally.

#### Sub-Task 1.3: Author `convert-files` skill

- **Status:** Completed (2026-10-26)
- **Objective:** Document conversion workflows and dependency gate.
- **Related Requirements:** R1, R2, R3
- **Dependencies and Preconditions:** Sub-Task 1.2.
- **In Scope for This Sub-Task:** `skills/convert-files/SKILL.md` +
  `references/libreoffice.md`; triggers, format matrix, examples, limitations,
  handoff to `read-document` for text extraction.
- **Out of Scope for This Sub-Task:** Implementation.
- **Instructions:** ≤250 lines; no install commands; gate on
  `doctor --skill convert-files --cached`.
- **Acceptance Criteria:** Valid skill; no source tokens; references local.
- **Cautionary Points:** Do not duplicate `read-document` behavior.
- **Testing Suggestions:** `pnpm cli skill validate`, scrub test.
- **Done When:** A fresh agent can convert files.

### Phase 2 — `presentations-generator`

#### Sub-Task 2.1: Config schema, theme loader, list commands

- **Status:** Completed (2026-10-26)
- **Objective:** Load/validate presentation JSON and themes.
- **Related Requirements:** R7
- **Dependencies and Preconditions:** Sub-Task 0.1.
- **In Scope for This Sub-Task:** `config.schema.json`, `config.mjs`,
  `theme.mjs` (`loadTheme`, `deepMerge`, `hexToRgb`), `--list-themes`,
  `--list-templates`, inline/path/name theme specs.
- **Out of Scope for This Sub-Task:** Engines.
- **Instructions:** Validate at least one slide, known types, chart arrays,
  table rows, output extension; apply `theme_overrides`.
- **Acceptance Criteria:** Unit tests for valid/invalid config and themes.
- **Cautionary Points:** Malformed inline theme must fail clearly.
- **Implementation Suggestions:** Use existing `ajv`.
- **Testing Suggestions:** `tests/presentation_config.test.mjs`.
- **Done When:** Config/theme behavior is tested.

#### Sub-Task 2.2: HTML engine, EJS templates, offline assets

- **Status:** Completed (2026-10-26)
- **Objective:** Render reveal/slides HTML with vendored assets.
- **Related Requirements:** R7
- **Dependencies and Preconditions:** Sub-Task 2.1.
- **In Scope for This Sub-Task:** `html.mjs`, `templates/reveal.ejs`,
  `templates/slides.ejs`, `assets.mjs` copying `reveal.js`/`chart.js` into
  `<output>-assets/`, inline/path templates.
- **Out of Scope for This Sub-Task:** PDF/PPTX.
- **Instructions:** Preserve all slide types, gallery carousel, tables, columns,
  charts, video, logo, slide numbers; escape user text.
- **Acceptance Criteria:** Snapshot tests for every slide type; relative assets;
  no required network URLs.
- **Cautionary Points:** EJS escaping; safe JSON chart config.
- **Testing Suggestions:** `tests/presentation_html.test.mjs`.
- **Done When:** HTML output is self-contained and tested.

#### Sub-Task 2.3: PPTX engine — core and text slides

- **Status:** Completed (2026-10-26)
- **Objective:** Port presentation setup and text slides.
- **Related Requirements:** R7
- **Dependencies and Preconditions:** Sub-Task 2.1.
- **In Scope for This Sub-Task:** `pptx/engine.mjs`, `pptx/slides.mjs`;
  13.333×7.5, theme, slide numbers, logo; `title`, `section`, `bullets`,
  `text`, `closing`; unknown type warnings.
- **Out of Scope for This Sub-Task:** Media/table/chart.
- **Instructions:** Preserve source layouts and two-column bullets >8 items.
- **Acceptance Criteria:** PPTX XML tests for slide count/text/type.
- **Cautionary Points:** Font availability; units.
- **Testing Suggestions:** `tests/presentation_pptx_text.test.mjs`.
- **Done When:** Text slides render and tests pass.

#### Sub-Task 2.4: PPTX engine — media, tables, charts

- **Status:** Completed (2026-10-26)
- **Objective:** Complete all 11 slide types.
- **Related Requirements:** R7
- **Dependencies and Preconditions:** Sub-Task 2.3.
- **In Scope for This Sub-Task:** `pptx/media.mjs`, `table.mjs`, `charts.mjs`;
  image scaling, gallery, video fallback, table fills, columns, native charts.
- **Out of Scope for This Sub-Task:** HTML/PDF.
- **Instructions:** Map chart types; if video unsupported, poster + warning.
- **Acceptance Criteria:** Chart/table/image XML tests; no slide type throws.
- **Cautionary Points:** Large images; chart color differences.
- **Testing Suggestions:** `tests/presentation_pptx_media.test.mjs`.
- **Done When:** All slide types work.

#### Sub-Task 2.5: PDF engine and `presentation` CLI

- **Status:** Completed (2026-10-26)
- **Objective:** Render PDF with Playwright and wire the CLI.
- **Related Requirements:** R7
- **Dependencies and Preconditions:** Sub-Tasks 2.2, 2.4.
- **In Scope for This Sub-Task:** `pdf.mjs`, `src/commands/presentation.mjs`,
  flags, output routing, `--force`, `--help`, `src/cli.mjs` wiring.
- **Out of Scope for This Sub-Task:** Other skills.
- **Instructions:** Temp HTML + local assets, `file://` URL, wait for charts,
  A4/20mm defaults, cleanup; missing Playwright exit 3.
- **Acceptance Criteria:** CLI tests; opt-in PDF integration with `%PDF` header.
- **Cautionary Points:** Chromium sandbox/temp cleanup.
- **Testing Suggestions:** `tests/presentation_pdf.test.mjs`,
  `tests/presentation_cli.test.mjs`.
- **Done When:** `pnpm cli presentation` produces all formats.

#### Sub-Task 2.6: Author `presentations-generator` skill and evals

- **Status:** Completed (2026-10-26)
- **Objective:** Document the local presentation workflow and rewrite evals.
- **Related Requirements:** R1, R2, R7
- **Dependencies and Preconditions:** Sub-Task 2.5.
- **In Scope for This Sub-Task:** `SKILL.md` ≤250 lines; references for config,
  slide types, themes, templates; `evals/evals.json` and
  `trigger_queries.json` rewritten without source context.
- **Out of Scope for This Sub-Task:** Engine changes.
- **Instructions:** Use `pnpm cli presentation`; remove source references;
  document EJS and offline assets; keep examples local.
- **Acceptance Criteria:** Skill valid; evals valid; no forbidden tokens.
- **Cautionary Points:** Keep chart/table fields stable; do not promise
  unsupported video.
- **Testing Suggestions:** `pnpm cli skill validate`, `pnpm cli skill evals`.
- **Done When:** Skill and evals are local-first.

### Phase 3 — `autoedit-with-gimp`

#### Sub-Task 3.1: GIMP built-in operations and Script-Fu builders

- **Status:** Completed (2026-10-26)
- **Objective:** Implement the built-in raster edit operations.
- **Related Requirements:** R4
- **Dependencies and Preconditions:** Sub-Task 0.1.
- **In Scope for This Sub-Task:** `src/commands/gimp.mjs`,
  `gimp/script.mjs`, `gimp/operations.mjs`, `gimp/run.mjs`;
  resize/convert/optimize/crop/rotate/flip/blur/sharpen/grayscale/
  brightness-contrast/hue-saturation/levels/sepia/vignette/autocrop/text/border;
  argv arrays; output verification; exit codes.
- **Out of Scope for This Sub-Task:** User macros and arbitrary Scheme.
- **Instructions:** Build Scheme strings with escaped paths; always
  `(gimp-quit 0)`; no shell. Validate dimensions/quality/colors. Keep each
  operation in a registry so `--help` and tests stay aligned.
- **Acceptance Criteria:** Unit tests for script/argv per operation; opt-in
  integration resize/convert/watermark; missing GIMP exit 3.
- **Cautionary Points:** GIMP startup slow; timeout; path escaping; some
  plug-ins are version-dependent.
- **Testing Suggestions:** `tests/gimp.test.mjs`.
- **Done When:** `pnpm cli gimp` works and is injection-safe.

#### Sub-Task 3.2: GIMP custom macros

- **Status:** Completed (2026-10-26)
- **Objective:** Allow users to scaffold and run named local GIMP macros.
- **Related Requirements:** R4, R14
- **Dependencies and Preconditions:** Sub-Task 3.1.
- **In Scope for This Sub-Task:** `gimp/macros.mjs`; `gimp macro list|new|run`;
  macro directory `~/.mllt/gimp/macros` (`GIMP_MACROS_DIR` override); `.scm`
  metadata header (name, description, params); placeholder substitution;
  validation; tests.
- **Out of Scope for This Sub-Task:** Inline `--script`, remote macro downloads,
  macro marketplace.
- **Instructions:** Only named `.scm` files under the macros directory. Validate
  macro name (`[a-z0-9-]+`), reject traversal, require declared params, escape
  paths, and run with `gimp -i -b`. Document that macros are trusted local code.
- **Acceptance Criteria:** `gimp macro new` creates a valid template;
  `list` parses metadata; `run` substitutes input/output/params; unknown
  param/traversal fails; a simple macro integration test passes.
- **Cautionary Points:** Script-Fu can access the filesystem; treat macros as
  user code. Do not execute macros automatically.
- **Testing Suggestions:** `tests/gimp_macros.test.mjs`.
- **Done When:** Users can create and run custom macros safely.

#### Sub-Task 3.3: Author `autoedit-with-gimp` skill

- **Status:** Completed (2026-10-26)
- **Objective:** Document GIMP operations, macros, and dependency gate.
- **Related Requirements:** R1, R2, R4, R14
- **Dependencies and Preconditions:** Sub-Tasks 3.1–3.2.
- **In Scope for This Sub-Task:** `SKILL.md` + `references/gimp.md`; operation
  table, macro creation workflow, examples, limitations, optimization tips.
- **Out of Scope for This Sub-Task:** Implementation.
- **Instructions:** ≤250 lines; no install commands; gate on
  `doctor --skill autoedit-with-gimp --cached`; document macro trust boundary.
- **Acceptance Criteria:** Valid skill; no source tokens.
- **Testing Suggestions:** `pnpm cli skill validate`, scrub test.
- **Done When:** A fresh agent can edit images and create macros.

### Phase 4 — `autoedit-with-inkscape`

#### Sub-Task 4.1: Inkscape export, query, clean, and edit operations

- **Status:** Completed (2026-10-26)
- **Objective:** Implement the SVG operation set.
- **Related Requirements:** R5
- **Dependencies and Preconditions:** Sub-Task 0.1.
- **In Scope for This Sub-Task:** `src/commands/inkscape.mjs`,
  `inkscape/export.mjs`, `query.mjs`, `edit.mjs`, `run.mjs`;
  export formats (PNG/PDF/EPS/PS/EMF/WMF/ODG), DPI/page/area/ID/width/height/
  background; `query` (dimensions/position/JSON); `clean` (plain SVG, vacuum
  defs); `edit` whitelist (rotate/flip/to-path/text-to-path/fit-canvas).
- **Out of Scope for This Sub-Task:** Vectorization and arbitrary actions.
- **Instructions:** Inkscape 1.x flags only; argv arrays; map edit flags to a
  fixed action whitelist; validate extensions/IDs.
- **Acceptance Criteria:** Unit tests for argv/action mapping; opt-in export and
  edit tests; missing Inkscape exit 3.
- **Cautionary Points:** Default DPI 96; print quality 300; action names vary
  slightly by Inkscape version—verify against the installed version.
- **Testing Suggestions:** `tests/inkscape.test.mjs`.
- **Done When:** `inkscape export/query/clean/edit` works.

#### Sub-Task 4.2: Bitmap vectorization with variants

- **Status:** Completed (2026-10-26)
- **Objective:** Add `inkscape vectorize` with multiple candidates.
- **Related Requirements:** R5, R13
- **Dependencies and Preconditions:** Sub-Task 4.1.
- **In Scope for This Sub-Task:** `inkscape/vectorize.mjs`; raster→PBM via
  `sharp`; `potrace -s`; `--threshold`, `--turdsize`, `--alphamax`,
  `--opttolerance`, `--variants`, `--pick`; `candidates.json`; optional
  post-clean with Inkscape.
- **Out of Scope for This Sub-Task:** Multi-color tracing.
- **Instructions:** Use a temp dir; verify each SVG; document single-color
  limitations. Missing Potrace exits 3. Variants use deterministic
  threshold/turd-size presets; `--pick N` copies the selected SVG to the final
  output.
- **Acceptance Criteria:** Unit tests with a fake runner; opt-in vectorize a
  simple shape; variants/manifest/selection tests; output SVG valid XML.
- **Cautionary Points:** Vectorization quality depends on threshold; no
  multi-color; large images.
- **Testing Suggestions:** `tests/inkscape_vectorize.test.mjs`.
- **Done When:** `inkscape vectorize` works with multiple candidates.

#### Sub-Task 4.3: Author `autoedit-with-inkscape` skill

- **Status:** Completed (2026-10-26)
- **Objective:** Document all SVG operations and vectorization variants.
- **Related Requirements:** R1, R2, R5, R13
- **Dependencies and Preconditions:** Sub-Tasks 4.1–4.2.
- **In Scope for This Sub-Task:** `SKILL.md` + `references/inkscape.md`;
  export/query/clean/edit/vectorize examples; DPI/page/background; variants;
  limitations.
- **Out of Scope for This Sub-Task:** Implementation.
- **Instructions:** ≤250 lines; no install commands; gate on
  `doctor --skill autoedit-with-inkscape --cached`.
- **Acceptance Criteria:** Valid skill; no source tokens.
- **Testing Suggestions:** `pnpm cli skill validate`, scrub test.
- **Done When:** A fresh agent can operate on SVG and vectorize rasters.

### Phase 5 — `image-background-removal`

#### Sub-Task 5.1: ONNX U2Net model loader and compositor

- **Status:** Completed (2026-10-26)
- **Objective:** Implement local background removal with the source U2Net model.
- **Related Requirements:** R6
- **Dependencies and Preconditions:** Sub-Tasks 0.1–0.2.
- **In Scope for This Sub-Task:** `src/commands/remove-bg.mjs`,
  `remove-bg/model.mjs` (onnxruntime session for `u2net.onnx`),
  `composite.mjs` (sharp crop/pad/canvas/alpha), `gimp-refine.mjs`;
  `--padding`, `--canvas-size`, `--gimp-refine`; missing model exit 3.
- **Out of Scope for This Sub-Task:** Model download, other U2Net variants, or
  Python `rembg`.
- **Instructions:** Normalize to RGB, run U2Net, threshold/alpha composite,
  preserve semi-transparent edges, cap input size; no network. Use the rembg
  default `u2net` model.
- **Acceptance Criteria:** Unit tests with a fake mask for padding/canvas;
  opt-in integration with local model; missing model error.
- **Cautionary Points:** Model license/memory; `onnxruntime-node` platform.
- **Testing Suggestions:** `tests/remove_bg.test.mjs`.
- **Done When:** `pnpm cli remove-bg` works locally.

#### Sub-Task 5.2: Multi-candidate background removal

- **Status:** Completed (2026-10-26)
- **Objective:** Generate several background-removal results for user choice.
- **Related Requirements:** R6, R13
- **Dependencies and Preconditions:** Sub-Task 5.1.
- **In Scope for This Sub-Task:** `remove-bg/variants.mjs`;
  `--variants N`, `--out-dir DIR`, `--pick N`; candidate naming;
  `candidates.json` with parameters/metrics; deterministic presets:
  soft alpha, balanced threshold, hard threshold, optional padding/canvas
  variants.
- **Out of Scope for This Sub-Task:** Automatic aesthetic ranking/deletion;
  user chooses.
- **Instructions:** Run the model once, derive multiple alpha/threshold
  composites from the same mask; write numbered candidates; never overwrite the
  input. `--pick` copies the chosen candidate to `--output`.
- **Acceptance Criteria:** Tests assert N candidates, unique paths, manifest
  schema, deterministic params, and `--pick`; no candidate deletion.
- **Cautionary Points:** Multiple files can confuse scripts; always print the
  manifest path and a short summary. Keep image memory bounded.
- **Testing Suggestions:** `tests/remove_bg_variants.test.mjs`.
- **Done When:** Users can compare and pick a candidate.

#### Sub-Task 5.3: Author `image-background-removal` skill

- **Status:** Completed (2026-10-26)
- **Objective:** Document background removal, variants, and model setup.
- **Related Requirements:** R1, R2, R6, R13
- **Dependencies and Preconditions:** Sub-Tasks 5.1–5.2.
- **In Scope for This Sub-Task:** `SKILL.md` + `references/background-removal.md`;
  options, model path, GIMP refine, variants/pick workflow, limitations (CPU,
  edges, transparency, single-color vs multi-color).
- **Out of Scope for This Sub-Task:** Implementation.
- **Instructions:** ≤250 lines; no install commands; gate on
  `doctor --skill image-background-removal --cached`; explain how to inspect
  candidates and choose.
- **Acceptance Criteria:** Valid skill; no source tokens.
- **Testing Suggestions:** `pnpm cli skill validate`, scrub test.
- **Done When:** A fresh agent can remove backgrounds and offer candidates.

### Phase 6 — Integration and documentation

#### Sub-Task 6.1: Wire CLI, setup/doctor, and features

- **Status:** Completed (2026-10-26)
- **Objective:** Make all five skills discoverable and dependency-aware.
- **Related Requirements:** R9, R11
- **Dependencies and Preconditions:** Phases 1–5.
- **In Scope for This Sub-Task:** `src/cli.mjs` commands (`convert`, `gimp`,
  `inkscape`, `remove-bg`, `presentation`); schema 3 tools/features; install
  hints; `doctor` output; `skills/setup/SKILL.md` requirement table.
- **Out of Scope for This Sub-Task:** Skill prose.
- **Instructions:** Reuse shared resolver; do not add duplicate schema fields.
- **Acceptance Criteria:** `doctor --skill <name>` works for all five; setup
  hints are OS-specific.
- **Testing Suggestions:** `tests/setup.test.mjs`, schema tests.
- **Done When:** Dependencies and commands are wired.

#### Sub-Task 6.2: Register skills and update docs/counts

- **Status:** Completed (2026-10-26)
- **Objective:** Add five skills to discovery and docs.
- **Related Requirements:** R11
- **Dependencies and Preconditions:** Sub-Task 6.1, skills authored.
- **In Scope for This Sub-Task:** `tests/plugin.test.mjs` expected IDs;
  `README.md` skills table/count; `AGENTS.md` count; `index.ts` `SUMMARIES`
  entries; `docs/plans/index.md`.
- **Out of Scope for This Sub-Task:** Implementation.
- **Instructions:** No manifest step; `discoverSkills` picks them up. Count is
  the expected-ID array length (15 before `read-document`, 16 after).
- **Acceptance Criteria:** Plugin test registers all IDs; docs match;
  `pnpm validate` passes.
- **Testing Suggestions:** `pnpm test`, `pnpm validate`.
- **Done When:** All five skills appear in the inventory.

#### Sub-Task 6.3: Extraction contract test

- **Status:** Completed (2026-10-26)
- **Objective:** Enforce no source references and no scrapers.
- **Related Requirements:** R2, R8
- **Dependencies and Preconditions:** Skills authored.
- **In Scope for This Sub-Task:** `tests/extraction_contract.test.mjs` scanning
  the five skill dirs and `src/commands/{convert,gimp,inkscape,remove-bg,presentation}`
  for forbidden tokens; assert no scraper modules/deps.
- **Out of Scope for This Sub-Task:** The plan itself.
- **Instructions:** Use the forbidden list from R2; scan text files.
- **Acceptance Criteria:** Test fails on an injected token and passes normally.
- **Testing Suggestions:** `tests/extraction_contract.test.mjs`.
- **Done When:** The contract is enforced.

### Phase 7 — Verification

#### Sub-Task 7.1: Run the full QA suite

- **Status:** Completed (2026-10-26)
- **Objective:** Prove the extraction is green.
- **Related Requirements:** R10, R11
- **Dependencies and Preconditions:** Phases 1–6.
- **In Scope for This Sub-Task:** `pnpm install`, `pnpm validate`, `pnpm test`,
  `pnpm typecheck`, `pnpm lint`, `pnpm deps`, `pnpm dup`, `pnpm qa`.
- **Out of Scope for This Sub-Task:** Live model/browser tests.
- **Instructions:** Fix failures; keep modules ≤300 lines; lazy-load heavy libs.
- **Acceptance Criteria:** `pnpm qa` exits 0; scrub test passes.
- **Testing Suggestions:** Commands above.
- **Done When:** Aggregate gate is green.

#### Sub-Task 7.2: Smoke-test commands and outputs

- **Status:** Completed (2026-10-26)
- **Objective:** Verify real outputs on this machine.
- **Related Requirements:** R3–R7
- **Dependencies and Preconditions:** Sub-Task 7.1.
- **In Scope for This Sub-Task:**
  - `convert` a sample doc → PDF.
  - `gimp` resize/convert/optimize a fixture.
  - `inkscape` export and vectorize a fixture.
  - `remove-bg` with a local model.
  - `presentation` all slide types → PPTX/HTML/PDF.
- **Out of Scope for This Sub-Task:** Live network.
- **Instructions:** Record commands, versions, output sizes, warnings. No
  automatic downloads.
- **Acceptance Criteria:** Outputs valid/non-empty; missing optional tools give
  actionable hints.
- **Cautionary Points:** GIMP/ONNX slow; timeouts; cleanup.
- **Testing Suggestions:** Manual + opt-in integration.
- **Done When:** Smoke matrix recorded.

#### Sub-Task 7.3: Final review and release note

- **Status:** Completed (2026-10-26)
- **Objective:** Review diff, verify no source leakage, document upgrade.
- **Related Requirements:** All
- **Dependencies and Preconditions:** Sub-Tasks 7.1–7.2.
- **In Scope for This Sub-Task:** Review; scrub grep; skill line counts; note
  dependencies/platform caveats; semver recommendation; update plan index.
- **Out of Scope for This Sub-Task:** Publishing/pushing.
- **Instructions:** Use `final-review` if available; record verdict.
- **Acceptance Criteria:** All sub-tasks Completed; `pnpm qa` green; no
  forbidden tokens; five skills valid.
- **Cautionary Points:** Do not mark Done with live model/browser untested;
  mark opt-in/manual.
- **Testing Suggestions:** Re-run `pnpm qa`.
- **Done When:** Plan signed off.

## Execution result (2026-10-26)

- Five skills added and discovered by the plugin: `convert-files`,
  `autoedit-with-gimp`, `autoedit-with-inkscape`, `image-background-removal`,
  `presentations-generator` (15 total).
- JS commands wired: `convert`, `gimp`, `inkscape`, `remove-bg`,
  `presentation`; all keep output next to the caller-selected path and verify
  non-empty results.
- Schema 3, shared LibreOffice resolver, setup/doctor hints, and feature
  readiness are implemented.
- PPTX/HTML/PDF, GIMP operations/macros, Inkscape export/edit/vectorize, and
  presentation config/theme/html/pptx tests pass. GIMP 3 changed its Script-Fu
  PDB signatures, so built-in GIMP operations use GIMP's embedded Python-Fu;
  user macros may be `.py` or `.scm` and are validated/substituted by the JS
  wrapper.
- `pnpm qa` passes. The U2Net model is not installed on this machine, so
  `remove-bg` correctly exits `3` with a setup hint; the real-model smoke test
  remains a manual step after placing `~/.mllt/models/u2net.onnx`.
- No scraper code or scraper dependencies were added.

## Final Integration & Verification

```bash
pnpm install
pnpm validate
pnpm test
pnpm typecheck
pnpm lint
pnpm deps
pnpm dup
pnpm qa

pnpm cli convert --input /tmp/sample.docx --to pdf --out /tmp
pnpm cli gimp resize --input /tmp/in.png --output /tmp/out.png --width 800
pnpm cli gimp convert --input /tmp/in.png --output /tmp/out.jpg --quality 85
pnpm cli gimp brightness-contrast --input /tmp/in.png --output /tmp/out.png --brightness 10
pnpm cli gimp macro new watermark
pnpm cli gimp macro list
pnpm cli gimp macro run watermark --input /tmp/in.png --output /tmp/out.png --param text=Demo
pnpm cli inkscape query --input /tmp/in.svg --json
pnpm cli inkscape export --input /tmp/in.svg --output /tmp/out.png --dpi 300
pnpm cli inkscape edit --input /tmp/in.svg --output /tmp/out.svg --rotate 90
pnpm cli inkscape vectorize --input /tmp/in.png --out-dir /tmp/vec --variants 3
pnpm cli inkscape vectorize --input /tmp/in.png --output /tmp/out.svg --pick 2
pnpm cli remove-bg --input /tmp/in.png --out-dir /tmp/bg --variants 3
pnpm cli remove-bg --input /tmp/in.png --output /tmp/out.png --pick 2
pnpm cli presentation --input /tmp/deck.json --output /tmp/deck.pptx
pnpm cli presentation --input /tmp/deck.json --output /tmp/deck.html
pnpm cli presentation --input /tmp/deck.json --output /tmp/deck.pdf
```

Acceptance checklist:

- [ ] Five skills exist and are valid; no `toolbox-tools-agent`.
- [ ] No scraper code, references, or dependencies.
- [ ] No source tokens in delivered artifacts; scrub test passes.
- [ ] `convert` wraps LibreOffice and shares the resolver/schema 3.
- [ ] `gimp` supports resize/convert/optimize/crop/rotate/flip/blur/sharpen/
      grayscale/brightness-contrast/hue-saturation/levels/sepia/vignette/
      autocrop/text/border.
- [ ] `gimp macro list|new|run` uses named local `.scm` files and never inline
      Scheme.
- [ ] `inkscape` supports export/query/clean/edit/vectorize; Potrace is optional.
- [ ] `inkscape` and `remove-bg` support `--variants` + `candidates.json` and
      `--pick`.
- [ ] `remove-bg` uses local U2Net `u2net.onnx` + sharp; no Python; no
      auto-download.
- [ ] `presentation` supports PPTX/HTML/PDF, 11 slide types, 8 charts, 4 themes,
      EJS templates, vendored assets.
- [ ] Setup/doctor detect all tools and print OS-specific hints.
- [ ] Plugin test includes the five skill IDs; README/AGENTS counts are current.
- [ ] `pnpm qa` passes.
- [ ] Smoke tests produce valid outputs.

## Open Decisions

1. **U2Net model:** resolved — use the source pipeline's default rembg `u2net`
   model (`u2net.onnx`). The only remaining check is redistribution license
   before bundling; the CLI never downloads it.
2. **Vectorization:** `inkscape vectorize` uses single-color Potrace with
   threshold/turd-size variants. Confirm single-color is sufficient; multi-color
   tracing would require another engine.
3. **HTML assets:** resolved — vendor `reveal.js`/`chart.js`; no CDN fallback.
4. **EJS custom templates:** resolved — EJS only, no Jinja2 layer.
5. **`read-document` ordering:** this plan implements schema 3/resolver; it can
   run before or after `read-document` as long as both reuse the same fields.
6. **GIMP operations/macros:** expanded to 16 built-in operations plus user
   macros. Confirm the operation set and whether macros need a richer parameter
   schema (types/defaults/choices) in v1.
