# Plan — `read-document` skill (LibreOffice → Markdown/CSV)

- **Plan slug:** `read-document`
- **Status:** Planned (decisions resolved 2026-10-26)
- **Date:** 2026-10-26
- **Requirements:** this document
- **Scope:** new skill, document-conversion CLI, LibreOffice + Poppler
  dependency detection, image analysis for Writer documents, PDF support in
  `ocr`, machine-manifest schema 3 with `libre_office_path`, tests, docs
- **Out of scope:** executing macros or formulas beyond LibreOffice's cached
  values, cloud uploads, GUI automation, recursive directory batches,
  auto-installing LibreOffice/Poppler as root

## Objective

Add an eleventh skill, `read-document`, that lets an agent read binary office
documents by converting them locally first:

1. Writer documents (`.docx`, `.doc`, `.odt`, `.rtf`, `.fodt`) → Markdown.
   Embedded images are extracted and analyzed locally; the analysis is included
   in the Markdown.
2. Spreadsheets (`.xlsx`, `.xls`, `.ods`, `.fods`) → CSV, one file per sheet
   when the installed LibreOffice supports all-sheets export.
3. Presentations (`.pptx`, `.odp`, `.ppt`) → PDF → page images → `ocr`
   (PaddleOCR-VL) → Markdown.

LibreOffice headless is the document converter. It is resolved from the system
first; `~/.mllt` is the portable fallback when no system installation exists.
Poppler's `pdftoppm` renders PDF pages for OCR. `setup`/`doctor` must report
both dependencies and print OS-specific install guidance for Linux, macOS, and
Windows. No package manager is run as root, and `--yes` must not install
LibreOffice or Poppler silently.

## Requirements Snapshot

- **R1 — Skill registration:** `skills/read-document/SKILL.md` exists with valid
  frontmatter (`name: read-document`), a trigger-oriented description of at most
  500 characters, at most 250 lines, and no embedded install commands. It is
  discovered from `skills/read-document/SKILL.md` at load time and appears in
  the plugin's session inventory.
- **R2 — CLI:** `node src/cli.mjs document` (also `pnpm cli document`) accepts
  `--input PATH`, `--out DIR`, `--format auto|markdown|csv`, `--sheet NAME|all`,
  `--timeout SECONDS`, `--json`, `--force`, `--no-image-analysis`,
  `--keep-intermediates`, and `--help`. Exit codes: `0` success, `2`
  usage/invalid input/output collision, `3` LibreOffice missing, `4` conversion,
  OCR, or image analysis failed/timed out/produced empty output.
- **R3 — Input matrix:** Writer formats → Markdown; Calc formats → CSV; Impress
  formats → PDF → OCR → Markdown. `.doc`, `.xls`, `.ppt` are supported through
  LibreOffice filters. Macro-enabled formats (`.docm`, `.dotm`, `.xlsm`,
  `.xltm`, `.pptm`, `.potm`) are rejected by default. `.txt`/`.md`/`.csv`
  inputs are rejected as already text. PDFs are rejected by `read-document`
  with a handoff to `ocr`; `ocr` now accepts PDFs and renders pages to images.
- **R4 — Output contract:** the final `.md`/`.csv` is written **next to the
  input file** by default; `--out DIR` overrides the destination. Intermediates
  (HTML, PDF, page images) go to a unique temporary directory and are removed
  unless `--keep-intermediates` is set. The input file is never modified. If a
  target exists, fail with exit `2` unless `--force`.
- **R5 — LibreOffice resolution:** `LIBREOFFICE_BIN` wins when set. Otherwise
  resolve the **system installation first** (`soffice` on `PATH`, then platform
  defaults), then the portable `~/.mllt` layout (`LIBREOFFICE_HOME` override).
  The resolver is shared by the CLI and `setup`.
- **R6 — Headless execution:** invoke `soffice` with an argv array (no shell),
  `--headless --norestore --nolockcheck --nodefault --nofirststartwizard`, a
  per-run isolated profile via `-env:UserInstallation=file:///...`, a bounded
  timeout, and post-run verification that the expected output exists and is
  non-empty.
- **R7 — Writer pipeline:** export Writer documents to HTML (this is what
  extracts embedded images), convert HTML to Markdown with an **internal
  converter** (no new runtime dependency), and preserve headings, paragraphs,
  lists, links, emphasis, and tables. Strip scripts/styles and unsafe links.
- **R8 — Writer images:** for `.docx`, `.doc`, `.odt`, and `.rtf` documents with
  embedded images, analyze each extracted image with the local
  `minicpm-v4.6:latest` vision model and include the analysis in the Markdown.
  If images are present and the model is unavailable, fail with exit `4` unless
  `--no-image-analysis` is passed (which inserts an explicit skipped marker).
  Images smaller than 8 KB are skipped as icons/logos by default;
  `--analyze-all-images` overrides. Cap analysis at 50 images per document
  (`--max-images`).
- **R9 — Presentation pipeline:** convert `.pptx`/`.odp`/`.ppt` to PDF with
  LibreOffice, render pages with `pdftoppm` at 150 DPI, OCR each page with
  `MedAIBase/PaddleOCR-VL:0.9b`, and write Markdown with `## Slide N` sections.
  Pages with no OCR text get a note suggesting `image-analysis`.
- **R10 — CSV pipeline:** export all sheets when LibreOffice supports the
  all-sheets token; name outputs `<stem>-<sheet>.csv`. `--sheet NAME` selects
  one sheet. If the installed version only exports the first sheet, warn and
  document the limitation.
- **R11 — OCR PDF support:** `ocr --image file.pdf` (and `--pdf file.pdf`)
  renders pages to images with `pdftoppm`, OCRs each page, and emits
  `## Page N` sections. `--dpi` (default 150), `--pdf-pages` (default `all`),
  and `--max-pages` (default 100) control rendering. Missing `pdftoppm` produces
  exit `3` with a setup hint.
- **R12 — Setup integration:** machine manifest schema 3 adds a top-level
  `libre_office_path` (absolute path or `""`), `tools.libreoffice`
  (`ok`/`version`/`path`), and `tools.pdftoppm` (`ok`/`version`/`path`).
  `features["read-document"]` requires `libreoffice` with optional `ollama`,
  `model:minicpm-v4.6:latest`, and `pdftoppm`.
  `features["ocr"].optional` gains `pdftoppm`. `setup`/`doctor` report both
  tools; `setup --install` prints manual, OS-specific actions.
- **R13 — Skill gating:** the skill runs `doctor --skill read-document` before
  converting, and `doctor --skill image-analysis` when images are expected.
  Missing dependencies send the user to `setup`.
- **R14 — Tests and repository integration:** TDD for every new module; unit
  tests inject the runner, filesystem probes, PDF renderer, and vision caller.
  Integration tests skip when `soffice`/`pdftoppm` are absent. No registration
  manifest is involved: discovery is automatic `src/lib/skills.mjs`. Update the
  plugin test expected IDs (11 skills), README, `AGENTS.md`,
  `skills/setup/SKILL.md`, `skills/ocr/SKILL.md`, and `docs/plans/index.md`.

## Scope

**In scope**

- New `read-document` skill and `document` CLI command.
- Shared LibreOffice resolver/probe and Poppler `pdftoppm` resolver/probe.
- Writer → HTML → Markdown with internal converter and image analysis.
- Calc → CSV with multi-sheet handling.
- Impress → PDF → page images → OCR → Markdown.
- PDF input support in the `ocr` command (PDF → images → OCR).
- Machine-manifest schema 3 with `libre_office_path`, `tools.libreoffice`, and
  `tools.pdftoppm`.
- Install hints for Linux, macOS, and Windows.
- Unit, integration (opt-in), and repository-contract tests.
- Documentation updates.

**Out of scope**

- Executing macros or evaluating spreadsheet formulas beyond LibreOffice's
  cached values.
- Cloud uploads or remote OCR/vision APIs; everything stays local.
- GUI automation, directory watching, or batch-converting trees.
- Automatically installing LibreOffice or Poppler with `sudo`/`winget`/`brew`.
- Keeping embedded images by default; only the analysis is embedded in the
  Markdown. `--keep-images` is a possible follow-up, not v1.

## Decisions (resolved 2026-10-26)

1. **`~/.mllt`:** use it only when LibreOffice is not installed system-wide.
   Resolver order is `LIBREOFFICE_BIN` → system (`PATH` + platform defaults) →
   `~/.mllt` portable → error.
2. **HTML→Markdown:** implement an internal converter; do not add `turndown` or
   another runtime dependency.
3. **Presentations:** `.pptx`/`.odp` (and `.ppt`) are converted to PDF first,
   then PDF pages are rendered to images and OCR'd.
4. **Output location:** write final `.md`/`.csv` next to the input document.
   Use temporary directories for intermediates and clean them by default.
5. **Manifest:** bump to schema 3 with a top-level `libre_office_path` field.
6. **PDFs:** `read-document` hands PDFs off to `ocr`; `ocr` renders PDF pages to
   images and runs OCR on them.
7. **Writer images:** extract images via LibreOffice HTML export, analyze them
   with `minicpm-v4.6:latest`, and include the analysis in the Markdown.

## Assumptions and Constraints

- **`~/.mllt` is the plugin's per-user config/resource root.** The portable
  layouts are:
  - Linux/Windows: `~/.mllt/libreoffice/program/soffice[.exe]`
  - macOS: `~/.mllt/LibreOffice.app/Contents/MacOS/soffice`
  - Optional AppImage: `~/.mllt/soffice.AppImage`
  - Poppler: `~/.mllt/poppler/bin/pdftoppm[.exe]`
- **System-first resolution** means a newer `~/.mllt` copy is ignored when a
  system LibreOffice exists. `LIBREOFFICE_BIN` is the escape hatch.
- **Verified on this machine (2026-10-26):** LibreOffice `26.8.1.1` at
  `/usr/sbin/soffice`; `pdftoppm`/`pdftocairo`/`pdfinfo` from Poppler `26.10.0`.
  `md:Markdown` produced Markdown with headings, lists, and a table; the CSV
  filter with `-1` produced `sample-First.csv` and `sample-Second.csv`.
- **Internal converter fidelity:** the converter targets the HTML subset
  LibreOffice emits. Complex constructs (merged table cells, nested tables,
  exotic CSS) may degrade; the plan documents this rather than adding a parser
  dependency.
- **Image analysis is local:** it uses the existing Ollama `minicpm-v4.6`
  model. No image leaves the machine.
- **Schema 3 is breaking for cached manifests:** existing schema-2 manifests
  fail validation until `pnpm cli setup` regenerates them. The plugin already
  warns when the machine manifest is invalid.
- **Repository rules:** ESM JavaScript, `node:test`, pnpm only, files ≤300
  lines, `SKILL.md` ≤250 lines, no per-skill executables, all tooling in `src/`.
- **No cross-platform CI:** macOS/Windows get resolver unit tests plus a manual
  checklist; Linux gets a real integration smoke test.

## Risks and Areas Requiring Care

| Risk | Impact | Mitigation |
|---|---|---|
| Internal HTML→Markdown converter misses LibreOffice markup | Lost headings/tables in converted documents | Fixture-driven tests with real LibreOffice HTML; degrade gracefully; document limits |
| LibreOffice version drift (all-sheets CSV token, filters) | Missing sheets or failed conversion | Verify outputs; warn on single-sheet export; test with installed version |
| Image analysis is slow or Ollama is down | Long conversions or failures on image-heavy docs | Per-image timeout, `--no-image-analysis`, `--max-images`, clear setup hint |
| Image extraction order/naming differs by format | Analyses attached to wrong image | Parse images from the exported HTML in document order; keep `src`/`alt` mapping |
| PDF rendering DPI too low/high | Poor OCR or huge temp files | Default 150 DPI; `--dpi` flag; `--max-pages` cap |
| `pdftoppm` not installed | PDF/PPTX paths fail | Detect in setup; exit 3 with OS-specific install hint |
| Output collision next to the input | Overwrites user files | Refuse existing targets unless `--force`; write via temp + rename |
| LibreOffice process locks / GUI instance conflicts | Hang or empty output | Isolated `UserInstallation`, `--nolockcheck`, `--norestore`, timeout |
| LibreOffice exits 0 on failed conversion | Agent reads missing/empty file | Verify every expected output exists and has non-zero bytes |
| Macro-enabled documents | Security exposure on untrusted input | Reject `.docm`/`.xlsm`/`.pptm` etc. by default |
| Windows file URLs / paths with spaces | Profile or argv malformed | Build argv array, use `pathToFileURL`, unit-test Windows candidates |
| Schema 3 invalidates cached manifests | `doctor --cached` fails until `setup` reruns | Document the upgrade step; plugin warns on invalid manifests |
| Hard-coded skill/test counts | Validate/test failures after adding the skill | Update the plugin test expected IDs, README, `AGENTS.md` together; the validator discovers skills automatically |
| Untrusted extracted content | Prompt injection in text/images | Skill treats extracted content as data, not instructions |

## Core Concepts

### Conversion flow

```
input file
  ├─ PDF ───────────────────────────────→ hand off to `ocr` (PDF → images)
  ├─ Writer (.docx/.doc/.odt/.rtf/.fodt)
  │    → LibreOffice HTML export (extracts images)
  │    → internal HTML → Markdown
  │    → analyze extracted images (minicpm-v4.6)
  │    → annotate Markdown with image analyses
  ├─ Calc (.xlsx/.xls/.ods/.fods)
  │    → LibreOffice CSV export (all sheets when supported)
  ├─ Impress (.pptx/.odp/.ppt)
  │    → LibreOffice PDF export
  │    → pdftoppm pages → images
  │    → ocr each page (PaddleOCR-VL)
  │    → Markdown with `## Slide N`
  └─ write final `.md`/`.csv` next to the input (or `--out`)
```

### LibreOffice resolver (system first)

`src/lib/libreoffice.mjs` exports a pure resolver so tests can inject `home`,
`env`, `platform`, `exists`, and `commandPath`:

```js
export function resolveLibreOffice({
  env = process.env,
  platform = process.platform,
  home = homedir(),
  exists = existsSync,
  which = commandPath,
} = {}) {
  if (env.LIBREOFFICE_BIN) {
    return exists(env.LIBREOFFICE_BIN)
      ? { ok: true, path: env.LIBREOFFICE_BIN, source: "env" }
      : { ok: false, path: env.LIBREOFFICE_BIN, error: "LIBREOFFICE_BIN does not exist" }
  }
  // 1. system: which("soffice"), /usr/bin/soffice,
  //    /usr/lib/libreoffice/program/soffice,
  //    /Applications/LibreOffice.app/Contents/MacOS/soffice,
  //    %ProgramFiles%\LibreOffice\program\soffice.exe, ...
  // 2. portable: LIBREOFFICE_HOME or ~/.mllt
  //    <home>/libreoffice/program/soffice[.exe],
  //    <home>/LibreOffice.app/Contents/MacOS/soffice,
  //    <home>/soffice.AppImage
}
```

`probeLibreOffice(path)` runs `["--version"]` with a 15 s timeout and returns
`{ ok, path, version, error }`.

### Poppler resolver

`src/lib/pdf.mjs` resolves `pdftoppm` in this order: `PDFTOPPM_BIN`;
`~/.mllt/poppler/bin/pdftoppm[.exe]`; platform/PATH. `probePdfRenderer()` runs
`["-v"]` with a short timeout. `renderPdfToImages({ pdfPath, outDir, dpi,
pages, maxPages })` runs:

```js
pdftoppm -png -r 150 -f <first> -l <last> <pdf> <outDir>/page
```

and returns `{ ok, images: [{ path, page }], error }` sorted by page number.
`pdftocairo` is a fallback if `pdftoppm` is absent.

### Headless LibreOffice invocation

Always pass an argv array, never a shell string:

```js
const args = [
  "--headless",
  "--norestore",
  "--nolockcheck",
  "--nodefault",
  "--nofirststartwizard",
  `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
  "--convert-to", filter,
  "--outdir", outDir,
  input,
]
```

Filters:

- Writer HTML: `html:HTML (StarWriter)` (primary; extracts images).
- Calc CSV: `csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1`.
- Impress PDF: `pdf` (LibreOffice selects the Impress PDF export).
- Writer native Markdown: `md:Markdown` is not the primary path because it does
  not expose embedded images; keep it only as a diagnostic fallback if HTML
  export fails on a text-only document.

### Internal HTML → Markdown

No new runtime dependency. The converter is split into pure parse/render steps:

```js
const doc = parseHtml(html)              // token tree, strips script/style
const images = collectImages(doc)        // ordered [{ src, alt, path }]
const analyses = await analyzeImages(images)
const markdown = renderMarkdown(doc, { analyses })
```

Supported constructs: `h1`–`h6`, `p`, `div`, `br`, `hr`, `strong`/`b`,
`em`/`i`, `code`, `pre`, `blockquote`, `ul`/`ol`/`li`, `table`/`tr`/`th`/`td`,
`a href`, `img src/alt`. Strip `<script>`, `<style>`, comments, and
`javascript:` links. Decode common entities (`&amp;`, `&lt;`, `&gt;`,
`&quot;`, `&#39;`, `&nbsp;`, numeric entities). Tables become pipe tables;
merged cells degrade to repeated/empty cells and are noted in the skill docs.
Images are replaced by analysis blocks (or plain text inside table cells).

### Writer images and analysis

LibreOffice HTML export writes embedded images next to the HTML (for example
`image1.png`). The pipeline:

1. Collect images in document order from the HTML.
2. Skip images smaller than 8 KB unless `--analyze-all-images`.
3. Analyze each remaining image with `minicpm-v4.6:latest` and a document-
   figure prompt: describe charts, diagrams, screenshots, and key visible text.
4. Insert the analysis at the image position:
   - block image: a blockquote with `**Image N analysis:** …`;
   - image inside a table: plain `[Image N: …]` text so the table stays valid.
5. If an image analysis fails and `--no-image-analysis` is not set, fail with
   exit `4` and do not write a partial Markdown. With `--no-image-analysis`,
   insert `[Image N: analysis skipped]` and warn.

Image analysis reuses `src/lib/vision.mjs` (`runWithFallback`, `encodeImage`,
`cleanResponse`) with `temperature=0`, local Ollama only.

### Presentation → PDF → OCR

1. LibreOffice converts the presentation to PDF in the temp directory.
2. `pdftoppm` renders pages to PNG at 150 DPI.
3. Each page is OCR'd with `MedAIBase/PaddleOCR-VL:0.9b` (PaddleOCR-VL), using
   a slide-oriented prompt that preserves headings, bullets, tables, and labels.
4. Markdown output:

```markdown
# <document title>

## Slide 1
…OCR text…

## Slide 2
…OCR text…
```

If a slide has no OCR text, emit `> No text detected on this slide; run
image-analysis on the page image for visual details.` The page images are
deleted unless `--keep-intermediates`.

### PDF support in `ocr`

`ocr` expands PDF inputs before the existing vision pipeline:

- `.pdf` in `--image` or `--pdf` → `renderPdfToImages` → one image per page.
- Each page is OCR'd and emitted as `## Page N`.
- `--dpi` (default 150), `--pdf-pages` (default `all`), `--max-pages` (default
  100).
- Missing `pdftoppm` → exit `3` with a `setup --install` hint.
- `--previous`/`--feedback` apply to a single-page PDF; for multi-page PDFs the
  command warns that correction context is applied per page or ignored. Keep
  the exact behavior in the help text.

### CSV strategy

- The all-sheets token (`-1`) writes one file per sheet named
  `<stem>-<sheet>.csv` (verified on 26.8).
- `--sheet NAME` filters the produced files by sheet name; `--sheet all`
  (default) returns every CSV.
- If only one CSV appears and the input is a spreadsheet, warn that the
  installed LibreOffice may not support all-sheets export.
- Sheet index selection is out of v1; `--sheet` accepts a name or `all`.

### Output and exit codes

| Condition | Exit |
|---|---|
| Conversion succeeded, all outputs non-empty | `0` |
| Missing/invalid flags, unsupported extension, output collision, macro-enabled file | `2` |
| LibreOffice or `pdftoppm` missing, `--version`/`-v` fails | `3` |
| Non-zero conversion/OCR/image-analysis status, timeout, missing/empty output | `4` |

Final outputs:

- Writer/Impress: `<input-dir>/<stem>.md`.
- Calc: `<input-dir>/<stem>.csv` (single sheet) or
  `<input-dir>/<stem>-<sheet>.csv` (multiple sheets).
- `--out DIR` writes to `DIR` instead; `DIR` must be a directory.
- Existing targets: fail with exit `2` unless `--force`; write through a temp
  file and `renameSync` so a failed conversion never leaves a partial output.
- Intermediates: `mkdtempSync(join(tmpdir(), "my-local-llm-tools-doc-"))`,
  removed in `finally` unless `--keep-intermediates`.

## Sub-Tasks

### Phase 0 — Decisions and spike

#### Sub-Task 0.1: Resolve product decisions

- **Status:** Completed (2026-10-26)
- **Objective:** Record the user's choices before implementation.
- **Related Requirements:** R3–R12
- **Outcome:** See “Decisions (resolved 2026-10-26)”: system-first LibreOffice
  with `~/.mllt` fallback; internal HTML→Markdown; presentations → PDF → OCR;
  output next to the input; schema 3 with `libre_office_path`; PDFs handled by
  `ocr`; Writer images analyzed and included.
- **Done When:** Decisions are recorded and reflected in this plan.

#### Sub-Task 0.2: Verify conversion filters on the installed LibreOffice

- **Status:** Completed (2026-10-26)
- **Objective:** Confirm the exact filters and output naming before coding.
- **Related Requirements:** R7, R9, R10
- **Outcome:** LibreOffice `26.8.1.1`; `md:Markdown` works; CSV filter with
  `-1` writes `<stem>-<sheet>.csv`; Poppler `26.10.0` provides
  `pdftoppm`/`pdftocairo`/`pdfinfo`.
- **Cautionary Points:** Validate with a real `.docx`/`.xlsx` during Phase 4;
  the minimal ODT fixture may lose table columns/styles.
- **Done When:** Core Concepts reflects verified behavior.

### Phase 1 — Dependency layer

#### Sub-Task 1.1: Add the shared LibreOffice resolver and probe

- **Status:** Pending
- **Objective:** Create `src/lib/libreoffice.mjs` with cross-platform
  system-first resolution, `~/.mllt` fallback, version probing, and argv
  construction.
- **Related Requirements:** R5, R6, R12
- **Dependencies and Preconditions:** None.
- **In Scope for This Sub-Task:** `resolveLibreOffice`, `probeLibreOffice`, and
  `buildConvertArgs`; exported constants for the portable layout.
- **Out of Scope for This Sub-Task:** Poppler, setup reporting, conversions.
- **Instructions:**
  - `LIBREOFFICE_BIN` first; then system (`commandPath("soffice")`,
    `/usr/bin/soffice`, `/usr/lib/libreoffice/program/soffice`,
    `/Applications/LibreOffice.app/Contents/MacOS/soffice`,
    `%ProgramFiles%\LibreOffice\program\soffice.exe`,
    `%ProgramFiles(x86)%\LibreOffice\program\soffice.exe`,
    `%LOCALAPPDATA%\Programs\LibreOffice\program\soffice.exe`); then
    `LIBREOFFICE_HOME`/`~/.mllt` layouts.
  - Probe with `["--version"]`, timeout 15 s; return the first line.
  - `buildConvertArgs({ filter, outDir, profileDir, input })` returns the argv
    array with `pathToFileURL(profileDir).href`.
- **Acceptance Criteria:** Unit tests pass for Linux/macOS/Windows candidate
  lists, override precedence, system-before-`~/.mllt`, missing binary, and paths
  with spaces. No hard-coded `/tmp` or `which`.
- **Cautionary Points:** `LIBREOFFICE_BIN` set but missing must fail loudly.
  Windows environment variable names are case-insensitive but `process.env`
  access is not; use explicit known keys.
- **Implementation Suggestions:** Keep the module dependency-light
  (`node:fs`, `node:os`, `node:path`, `node:url`, `./exec.mjs`). Inject
  `exists`/`which` for tests.
- **Testing Suggestions:** `tests/libreoffice.test.mjs` with fake `exists`/`which`.
- **Done When:** The module is exported, tested, and ≤300 lines.

#### Sub-Task 1.2: Add the Poppler `pdftoppm` resolver and PDF renderer

- **Status:** Pending
- **Objective:** Create `src/lib/pdf.mjs` to resolve/render PDF pages and
  support both `ocr` and presentation conversion.
- **Related Requirements:** R9, R11, R12
- **Dependencies and Preconditions:** Sub-Task 1.1 (shared exec/config style).
- **In Scope for This Sub-Task:** `resolvePdftoppm`, `probePdfRenderer`,
  `renderPdfToImages`, page-range parsing, sorted output, missing-binary error.
- **Out of Scope for This Sub-Task:** OCR itself and presentation conversion.
- **Instructions:** Resolution order: `PDFTOPPM_BIN`;
  `~/.mllt/poppler/bin/pdftoppm[.exe]`; platform/PATH. Use
  `pdftoppm -png -r <dpi> -f <first> -l <last> <pdf> <prefix>`. If `pdftoppm`
  is absent, try `pdftocairo -png`. Return `{ ok, images: [{ path, page }],
  error }`; page numbers come from the output filenames
  (`prefix-01.png` → page 1) sorted numerically.
- **Acceptance Criteria:** Unit tests cover resolution order, argv shape, range
  parsing (`all`, `1-3,5`), output sorting, and missing binary. No shell.
- **Cautionary Points:** `pdftoppm` pads page numbers differently for small/large
  documents; parse with a trailing-number regex. Do not delete a directory you
  did not create.
- **Implementation Suggestions:** Inject `run`/`exists`/`which` for tests.
- **Testing Suggestions:** `tests/pdf.test.mjs` with a fake runner that writes
  `page-01.png`, `page-02.png`.
- **Done When:** The renderer is tested and reusable by `ocr` and `document`.

#### Sub-Task 1.3: Extend the machine manifest to schema 3

- **Status:** Pending
- **Objective:** Add `libre_office_path`, `tools.libreoffice`, and
  `tools.pdftoppm`; wire readiness and setup/doctor output.
- **Related Requirements:** R12
- **Dependencies and Preconditions:** Sub-Tasks 1.1 and 1.2.
- **In Scope for This Sub-Task:**
  - `src/commands/setup/checks.mjs`: detect LibreOffice and `pdftoppm`; add
    `libre_office_path`, `tools.libreoffice`, `tools.pdftoppm`; `schema: 3`;
    warnings for missing tools.
  - `src/commands/setup/features.mjs`: `"read-document": { requires:
    ["libreoffice"], optional: ["ollama", "model:minicpm-v4.6:latest",
    "pdftoppm"] }`; add `pdftoppm` to `ocr.optional`.
  - `src/commands/setup/manifest.schema.json`: `schema` const 3; required
    `libre_office_path` (string), `tools.libreoffice` and `tools.pdftoppm`
    (`$defs/binary`).
  - `src/commands/setup.mjs`/`doctor.mjs`: print LibreOffice and Poppler status.
- **Out of Scope for This Sub-Task:** Install hints, CLI conversion, skill file.
- **Instructions:** Use the resolvers from 1.1/1.2. `libre_office_path` is the
  resolved absolute path or `""`; `tools.libreoffice.path` repeats it for the
  binary record. Do not add `paths.libreoffice` (the top-level field is the
  user-requested contract).
- **Acceptance Criteria:** `setup --json` includes the new fields;
  `features["read-document"].ok` tracks LibreOffice; a schema-2 manifest is
  rejected by `readManifest`.
- **Cautionary Points:** Schema 3 is a breaking cache change; document the
  `pnpm cli setup` step. Keep `features["ocr"]` meaningful for image-only OCR
  when `pdftoppm` is missing.
- **Implementation Suggestions:** Keep binary shapes consistent with
  `$defs/binary` (`ok`, `version`, `path`, optional `error`).
- **Testing Suggestions:** Extend `tests/manifest_schema.test.mjs` with schema 3;
  add setup tests for LibreOffice/Poppler present and absent.
- **Done When:** `setup --json` and schema tests pass with both tools present
  and absent.

#### Sub-Task 1.4: Add OS-specific install hints and diagnostics

- **Status:** Pending
- **Objective:** Make `setup --install`, the setup summary, `doctor`, and the
  setup skill explain LibreOffice and Poppler installation without running
  package managers.
- **Related Requirements:** R12, R13
- **Dependencies and Preconditions:** Sub-Task 1.3.
- **In Scope for This Sub-Task:**
  - `src/commands/setup/install.mjs`: `libreofficeHint(platform)` and
    `popplerHint(platform)`; manual actions `id: "libreoffice"` and
    `id: "poppler"`.
  - `src/commands/setup.mjs`: status lines for LibreOffice and `pdftoppm`.
  - `src/commands/doctor.mjs`: status lines for both.
  - `skills/setup/SKILL.md`: requirement table, manifest fields, install
    policy, troubleshooting.
- **Out of Scope for This Sub-Task:** Executing the hints.
- **Instructions:**
  - LibreOffice: prefer the system package (Linux `pacman`/`apt` examples,
    macOS `brew install --cask libreoffice`, Windows
    `winget install TheDocumentFoundation.LibreOffice`); if unavailable, use
    the portable build under `~/.mllt/libreoffice` (macOS: `LibreOffice.app`).
  - Poppler: Linux `poppler`/`poppler-utils`; macOS `brew install poppler`;
    Windows Poppler for Windows release zip extracted to `~/.mllt/poppler`
    (add `bin` to `PATH` or set `PDFTOPPM_BIN`).
  - Keep actions `kind: "manual"` so `--yes` only prints them.
- **Acceptance Criteria:** `setup --install` prints the matching hints when
  tools are missing; `doctor --skill read-document` exits 1 without
  LibreOffice; no root command is executed.
- **Cautionary Points:** Do not write to another tool's manifest.
  Label distro package names as examples.
- **Implementation Suggestions:** Reuse the existing `add({ kind: "manual",
  description, detail, url })` pattern.
- **Testing Suggestions:** Extend `tests/setup.test.mjs` for both actions.
- **Done When:** Setup/doctor output and the setup skill are consistent on all
  three platforms.

#### Sub-Task 1.5: Migrate schema fixtures and contract tests

- **Status:** Pending
- **Objective:** Update every schema-2 fixture and count expectation before
  adding the new skill.
- **Related Requirements:** R12, R14
- **Dependencies and Preconditions:** Sub-Task 1.3.
- **In Scope for This Sub-Task:**
  - `tests/plugin.test.mjs`: fixture `schema: 3`, `libre_office_path`,
    `tools.libreoffice`, `tools.pdftoppm`.
  - `tests/manifest_schema.test.mjs`: `validManifest()` schema 3 and fields;
    keep `schema: 2` rejected.
  - `tests/setup.test.mjs`: `libreoffice`/`pdftoppm` in every `context()` and
    `planInstall` fixture.
- **Out of Scope for This Sub-Task:** The skill, CLI, and OCR changes.
- **Instructions:** Run the suite after migration; the plugin test still expects
  10 skills until Phase 3.
- **Acceptance Criteria:** All existing tests pass with schema 3; no test relies
  on an optional new field.
- **Cautionary Points:** `writeManifest({ schema: 2 })` must still throw.
- **Implementation Suggestions:** Centralize a `libreoffice`/`pdftoppm` fixture
  object.
- **Testing Suggestions:** `node --test tests/plugin.test.mjs
  tests/manifest_schema.test.mjs tests/setup.test.mjs`.
- **Done When:** The suite is green before the new skill is introduced.

### Phase 2 — Writer pipeline and internal converter

#### Sub-Task 2.1: Add format routing and input validation

- **Status:** Pending
- **Objective:** Classify inputs, reject unsupported/macro-enabled files, and
  map `--format auto|markdown|csv` to a conversion plan.
- **Related Requirements:** R2, R3
- **Dependencies and Preconditions:** None (pure functions).
- **In Scope for This Sub-Task:** `detectFormat(inputPath, requestedFormat)`
  returning `{ kind, extension, format }` or a typed error; Writer/Calc/Impress
  sets; macro-enabled and already-text rejections; PDF → `ocr` hint.
- **Out of Scope for This Sub-Task:** Running LibreOffice.
- **Instructions:**
  - Case-insensitive extensions; reject directories and missing files.
  - `auto`: Writer/Impress → markdown, Calc → csv.
  - `markdown` on Calc → usage error with `--format csv` guidance.
  - `csv` on Writer/Impress/PDF → usage error.
  - Macro-enabled extensions rejected by default; no `--allow-macros` in v1.
  - PDF: error `"PDFs are handled by the ocr skill: ocr --image <file.pdf>"`.
- **Acceptance Criteria:** Unit tests cover `.DOCX`, `.docm`, `.xlsx`, `.ods`,
  `.pptx`, `.pdf`, `.txt`, missing files, and conflicting `--format`.
- **Cautionary Points:** Do not guess from MIME; extension + explicit flag is
  enough. Reject `.csv`/`.md`/`.txt` as already text.
- **Implementation Suggestions:** Export the extension sets for tests/docs.
- **Testing Suggestions:** `tests/document.test.mjs` table-driven cases.
- **Done When:** Routing is pure, tested, and returns actionable messages.

#### Sub-Task 2.2: Implement the internal HTML parser and Markdown renderer

- **Status:** Pending
- **Objective:** Convert LibreOffice HTML to Markdown without adding a runtime
  dependency.
- **Related Requirements:** R7, R8
- **Dependencies and Preconditions:** Sub-Task 2.1.
- **In Scope for This Sub-Task:**
  - `src/commands/document/html-to-markdown.mjs` (split into `html/parse.mjs`
    and `html/render.mjs` if it exceeds 300 lines).
  - Tokenizer/stack parser; entity decoding; strip script/style/comments.
  - Renderer for headings, paragraphs, lists, links, emphasis, code, pre,
    blockquote, hr, and pipe tables.
  - Image collection in document order with `src`/`alt`/resolved path.
- **Out of Scope for This Sub-Task:** Image analysis calls, LibreOffice
  execution, output writing.
- **Instructions:** Target the HTML subset LibreOffice emits. For merged table
  cells, repeat/empty cells rather than dropping content. For images, emit a
  placeholder token that the pipeline replaces with analysis. Sanitize
  `javascript:` links (render text only).
- **Acceptance Criteria:** Fixture tests cover headings, nested lists, tables,
  links, emphasis, code blocks, entities, scripts/styles, and images in order.
  A real LibreOffice HTML export converts without throwing.
- **Cautionary Points:** Do not use regex-only tag stripping for nested lists/
  tables; a stack is required for correct nesting. Avoid unbounded recursion on
  malformed HTML.
- **Implementation Suggestions:** Keep parse and render pure; export both for
  tests. Use small helpers (`decodeEntities`, `inlineText`).
- **Testing Suggestions:** `tests/html_to_markdown.test.mjs` with HTML strings
  copied from a real export.
- **Done When:** The converter is pure, tested, and ≤300 lines per file.

#### Sub-Task 2.3: Add image extraction and analysis to the Writer pipeline

- **Status:** Pending
- **Objective:** Analyze embedded images with `minicpm-v4.6` and embed the
  analysis in the Markdown.
- **Related Requirements:** R8
- **Dependencies and Preconditions:** Sub-Tasks 1.1, 2.2.
- **In Scope for This Sub-Task:**
  - `src/commands/document/images.mjs`: filter by size, call
    `runWithFallback`/`encodeImage`/`cleanResponse` with a document-figure
    prompt, return `{ index, path, analysis }`.
  - Insertion rules for block vs table-cell images.
  - `--no-image-analysis`, `--analyze-all-images`, `--max-images`,
    `--image-model`, `--image-timeout`.
  - Fail with exit `4` if images exist and analysis cannot run, unless
    `--no-image-analysis`.
- **Out of Scope for This Sub-Task:** Keeping image files; OCR of image text.
- **Instructions:** Use local Ollama only. Default prompt: describe charts,
  diagrams, screenshots, and key visible text; be concise and structured.
  Skip images < 8 KB unless `--analyze-all-images`. For table cells, use plain
  `[Image N: …]` text to preserve the table. If the model returns empty, treat
  it as a failure for that image.
- **Acceptance Criteria:** Tests with an injected vision caller cover success,
  skip-small, `--no-image-analysis`, model failure, and max-images. A real
  `.docx` with an image gets an analysis block in the `.md`.
- **Cautionary Points:** Image analysis is slow; process sequentially and
  report progress on stderr. Do not send images to any remote service.
- **Implementation Suggestions:** Keep the vision call injectable; don't import
  the CLI command.
- **Testing Suggestions:** `tests/document_images.test.mjs` and an opt-in
  integration test using a fixture with one image.
- **Done When:** Writer documents with images produce Markdown containing the
  analyses, and text-only documents do not require Ollama.

### Phase 3 — Calc, presentations, and OCR

#### Sub-Task 3.1: Implement the CSV pipeline

- **Status:** Pending
- **Objective:** Convert Calc documents to one CSV per sheet, with sheet
  selection and version fallback.
- **Related Requirements:** R10
- **Dependencies and Preconditions:** Sub-Tasks 1.1 and 2.1.
- **In Scope for This Sub-Task:** `src/commands/document/csv.mjs`; all-sheets
  filter token; output naming/selection; warning when only one CSV appears.
- **Out of Scope for This Sub-Task:** Sheet-index selection, formula evaluation
  beyond LibreOffice's cached values.
- **Instructions:** Use the verified filter string. After conversion, list the
  temp outdir for `<stem>-*.csv` or `<stem>.csv`. `--sheet NAME` selects one;
  `all` returns every CSV sorted by name. If only one file appears, warn.
- **Acceptance Criteria:** Unit tests cover the filter token, multi-file
  selection, single-file fallback, and missing-sheet error.
- **Cautionary Points:** LibreOffice may use `<stem>.csv` for a single sheet and
  `<stem>-<sheet>.csv` for multiple; support both. Sheet names may contain
  spaces/unicode; do not over-constrain the regex.
- **Implementation Suggestions:** Keep discovery pure over a directory listing.
- **Testing Suggestions:** Fake runner writes two CSV files; assert both and
  the selected one.
- **Done When:** Multi-sheet conversion works on this machine and tests cover
  the fallback.

#### Sub-Task 3.2: Add PDF rendering and page OCR to `ocr`

- **Status:** Pending
- **Objective:** Let `ocr` accept PDFs by rendering pages to images and OCR-ing
  each page.
- **Related Requirements:** R9, R11
- **Dependencies and Preconditions:** Sub-Task 1.2.
- **In Scope for This Sub-Task:**
  - `src/commands/ocr.mjs`: detect `.pdf` inputs (in `--image` or `--pdf`),
    render pages with `renderPdfToImages`, OCR each page, emit `## Page N`.
  - New flags: `--pdf`, `--dpi`, `--pdf-pages`, `--max-pages`.
  - Missing `pdftoppm` → exit `3` with setup hint.
  - Update `OCR_HELP` and `skills/ocr/SKILL.md`.
- **Out of Scope for This Sub-Task:** Changing the existing image-only OCR
  behavior or the Tesseract correction semantics beyond PDF expansion.
- **Instructions:** For PDFs, process page by page to keep requests bounded.
  For non-PDF multiple images, keep the current batch behavior. Tesseract
  correction runs on each page image when enabled. `--previous`/`--feedback`
  on multi-page PDFs should warn that correction is applied per page or is
  ignored; document the exact choice in help.
- **Acceptance Criteria:** Unit tests with an injected renderer cover a 3-page
  PDF, page headers, `--pdf-pages` filtering, missing `pdftoppm`, and mixed
  image/PDF inputs. A real PDF integration test skips without `pdftoppm`.
- **Cautionary Points:** Do not pass PDF bytes to Ollama; always render first.
  Clean the page-image temp dir in `finally`.
- **Implementation Suggestions:** Extract a small `ocrPageImages` helper into
  `src/lib/ocr.mjs` (using the existing `runWithFallback`/`encodeImage` helpers)
  so `ocr` and the presentation pipeline share one implementation.
- **Testing Suggestions:** `tests/ocr_pdf.test.mjs`; real integration test with
  a small generated PDF.
- **Done When:** `ocr --image sample.pdf` returns page-separated markdown.

#### Sub-Task 3.3: Implement the presentation pipeline

- **Status:** Pending
- **Objective:** Convert `.pptx`/`.odp`/`.ppt` to PDF, render pages, OCR them,
  and write Markdown next to the input.
- **Related Requirements:** R9
- **Dependencies and Preconditions:** Sub-Tasks 1.1, 1.2, 3.2.
- **In Scope for This Sub-Task:** `src/commands/document/presentation.mjs`;
  LibreOffice PDF export; `renderPdfToImages`; page OCR; `## Slide N` markdown;
  empty-slide notes; intermediate cleanup.
- **Out of Scope for This Sub-Task:** Visual description of slides; that remains
  a handoff to `image-analysis`.
- **Instructions:** Use the OCR model (`MedAIBase/PaddleOCR-VL:0.9b`) with a
  slide prompt. If all pages return empty text, exit `4` with a hint to run
  `image-analysis` on the page images. Keep page images only with
  `--keep-intermediates`.
- **Acceptance Criteria:** Unit tests with fake conversion/rendering/OCR cover
  a 2-slide deck, empty slide, cleanup, and PDF filter. A real `.pptx`/`.odp`
  integration test skips without LibreOffice/Poppler.
- **Cautionary Points:** PDF export may produce a different page size; OCR
  quality depends on DPI. Use 150 DPI default and allow `--dpi`. Do not leave
  `soffice.bin`/`pdftoppm` processes running.
- **Implementation Suggestions:** Reuse the OCR page helper from 3.2 rather than
  spawning the `ocr` CLI.
- **Testing Suggestions:** `tests/document_presentation.test.mjs`.
- **Done When:** A real presentation produces Markdown with one section per
  slide and no leftover intermediates.

#### Sub-Task 3.4: Add the `document` CLI command

- **Status:** Pending
- **Objective:** Wire routing, Writer/Calc/Impress pipelines, output writing,
  flags, JSON, and exit codes into `src/cli.mjs`.
- **Related Requirements:** R2, R4
- **Dependencies and Preconditions:** Sub-Tasks 2.1–3.3.
- **In Scope for This Sub-Task:** `src/commands/document.mjs`; `src/cli.mjs`
  import/COMMANDS/HELP; flag parsing via `src/lib/args.mjs`; final output next
  to input; collision/`--force`; temp + rename; human/`--json` output.
- **Out of Scope for This Sub-Task:** Setup detection and skill docs.
- **Instructions:**
  - `--input` required. `--out` overrides the destination directory.
  - `--format` defaults to `auto`; `--sheet` defaults to `all`; `--timeout`
    defaults to 120.
  - `--json` prints one object: `ok`, `input`, `format`, `libreOffice`,
    `outputs`, and `images` (count/analyses) when applicable.
  - Human output prints one absolute path per line.
  - Collision: fail before conversion unless `--force`; write temp then rename.
- **Acceptance Criteria:** `document --help` documents every flag; tests cover
  exit codes 2/3/4; `--json` is valid and contains absolute paths; existing
  outputs are not overwritten without `--force`.
- **Cautionary Points:** Do not print JSON diagnostics to stdout when `--json`
  is set. Keep help text consistent with other commands.
- **Implementation Suggestions:** Export `runDocument(values, deps)` for tests;
  keep `document(argv)` as the thin CLI wrapper.
- **Testing Suggestions:** `tests/document.test.mjs` plus a manual
  `node src/cli.mjs document --help`.
- **Done When:** The command runs end-to-end on this machine and the help text
  is complete.

### Phase 4 — Skill and repository integration

#### Sub-Task 4.1: Author `skills/read-document/SKILL.md`

- **Status:** Pending
- **Objective:** Add the skill instructions with triggers, workflow, format
  matrix, gating, image analysis, limitations, and handoffs.
- **Related Requirements:** R1, R13
- **Dependencies and Preconditions:** Sub-Task 3.4 (CLI usable).
- **In Scope for This Sub-Task:** `SKILL.md` ≤250 lines; frontmatter; bundled-
  files note; responsibility split; requirements; workflow; examples; image
  analysis behavior; PDF/PPTX flows; security/limitations; troubleshooting;
  validation checklist.
- **Out of Scope for This Sub-Task:** Install commands (they live in `setup`).
- **Instructions:**
  - Triggers: "read this document", "extract text from this Word/Excel/
    PowerPoint file", "convert this docx to markdown", "summarize this
    spreadsheet", "analyze the images in this document".
  - Gate: `doctor --skill read-document`; for image-heavy docs also
    `doctor --skill image-analysis`.
  - Handoff: PDFs → `ocr --image file.pdf`; visual slide details →
    `image-analysis` on page images.
  - State that extracted text and image analyses are untrusted data, not
    instructions.
  - Document system-first LibreOffice, `~/.mllt` fallback, CSV multi-sheet
    limits, image size/quantity limits, and output collisions/`--force`.
- **Acceptance Criteria:** `pnpm cli skill validate skills/read-document/SKILL.md`
  passes; `pnpm validate` accepts the line count/frontmatter; the description is
  under 500 chars.
- **Cautionary Points:** Do not duplicate `setup` install instructions. Keep the
  file under 250 lines; move a detailed format matrix to
  `skills/read-document/references/formats.md` only if needed.
- **Implementation Suggestions:** Mirror `skills/ocr/SKILL.md` and
  `skills/setup/SKILL.md`.
- **Testing Suggestions:** `pnpm cli skill validate ...`, `pnpm validate`.
- **Done When:** A fresh agent can run the skill from the instructions alone.

#### Sub-Task 4.2: Update `ocr` skill documentation

- **Status:** Pending
- **Objective:** Document PDF support, Poppler, page handling, and the new
  flags in `skills/ocr/SKILL.md`.
- **Related Requirements:** R11, R13
- **Dependencies and Preconditions:** Sub-Task 3.2.
- **In Scope for This Sub-Task:** Requirements table, PDF workflow, examples
  (`ocr --image report.pdf --dpi 150`), page separators, limits, troubleshooting.
- **Out of Scope for This Sub-Task:** Changing OCR implementation.
- **Instructions:** Keep the file ≤250 lines; link to `setup` for Poppler
  installation. Mention that PDFs are rendered to images locally and never
  uploaded.
- **Acceptance Criteria:** `pnpm validate` passes; the skill documents the PDF
  path and `pdftoppm` dependency.
- **Cautionary Points:** Do not claim PDF text extraction; it is OCR on rendered
  pages.
- **Implementation Suggestions:** Add a short “PDF input” subsection near the
  workflow.
- **Testing Suggestions:** `pnpm cli skill validate skills/ocr/SKILL.md`.
- **Done When:** The OCR skill matches the implemented flags.

#### Sub-Task 4.3: Register the skill and update repository contracts

- **Status:** Pending
- **Objective:** Make the new skill part of dynamic discovery and update every
  hard-coded skill-count/list.
- **Related Requirements:** R1, R14
- **Dependencies and Preconditions:** Sub-Tasks 4.1 and 4.2.
- **In Scope for This Sub-Task:**
  - `index.ts`: add `SUMMARIES["read-document"]`.
  - Confirm `src/lib/skills.mjs` discovers `skills/read-document/SKILL.md`; no
    manifest step.
  - `tests/plugin.test.mjs`: add `read-document` to the expected IDs and expect
    11 skills; add a context assertion for `read-document` readiness.
  - `AGENTS.md`: "All ten skills" → "All eleven skills".
  - `README.md`: "Ten skills" → "Eleven skills"; add the table row.
- **Out of Scope for This Sub-Task:** CLI/setup logic changes.
- **Instructions:** Run `pnpm validate` and `pnpm test` after each change.
  There is no generated registration file to update.
- **Acceptance Criteria:** `skills/read-document/SKILL.md` is discovered; the
  plugin test registers the 11 expected IDs; `pnpm validate` passes; no stale
  "ten" references in current docs (historical plans may keep their counts).
- **Cautionary Points:** `src/commands/validate.mjs` discovers skills
  automatically; a missing/renamed skill must be fixed in the directory, not in
  a manifest.
- **Implementation Suggestions:** Use `skills/*/SKILL.md` as the source of truth
  for IDs/descriptions.
- **Testing Suggestions:** `pnpm validate && pnpm test`.
- **Done When:** The repository's skill counts and lists are consistent.

#### Sub-Task 4.4: Update project documentation

- **Status:** Pending
- **Objective:** Document discovery, installation, and usage without reading the
  plan.
- **Related Requirements:** R12, R14
- **Dependencies and Preconditions:** Sub-Tasks 4.1–4.3.
- **In Scope for This Sub-Task:** README skill table + examples;
  `AGENTS.md` structure/CLI notes; `skills/setup/SKILL.md` requirement table and
  manifest fields; `docs/plans/index.md`; `src/cli.mjs` help text.
- **Out of Scope for This Sub-Task:** Duplicating the full skill instructions in
  README.
- **Instructions:** Use `create-documentation` for the new public command/module
  if it produces docs outside `docs/plans/`; keep the README concise and link to
  the skill.
- **Acceptance Criteria:** README shows `read-document` and an example command;
  `AGENTS.md` reflects 11 skills; setup docs list LibreOffice/Poppler;
  `pnpm validate` passes.
- **Cautionary Points:** Keep docs under `docs/`; do not create a parallel
  `documentation/` tree.
- **Implementation Suggestions:** Add a “Documents” subsection with
  `pnpm cli document --input ...`.
- **Testing Suggestions:** Markdown link check (manual), `pnpm validate`.
- **Done When:** Docs match the implemented behavior.

### Phase 5 — Verification

#### Sub-Task 5.1: Run the full QA suite

- **Status:** Pending
- **Objective:** Prove the change is green under the repository's quality gates.
- **Related Requirements:** R14
- **Dependencies and Preconditions:** Phases 1–4 complete.
- **In Scope for This Sub-Task:** `pnpm validate`, `pnpm test`, `pnpm typecheck`,
  `pnpm lint`, `pnpm deps`, `pnpm dup`, `pnpm security`, or `pnpm qa`.
- **Out of Scope for This Sub-Task:** Cross-platform manual testing.
- **Instructions:** Run from the repository root and fix failures rather than
  suppressing them. Keep new modules under 300 lines.
- **Acceptance Criteria:** `pnpm qa` exits 0; no new lint/type/dependency/dup
  findings; scanners pass.
- **Cautionary Points:** Security scans may need network; record any command that
  cannot run.
- **Implementation Suggestions:** Fast checks first (`validate`, `test`,
  `typecheck`), scanners last.
- **Testing Suggestions:** Commands above.
- **Done When:** The aggregate gate is green.

#### Sub-Task 5.2: Run the Linux integration smoke test

- **Status:** Pending
- **Objective:** Verify real conversions with LibreOffice, Poppler, and Ollama.
- **Related Requirements:** R5–R11
- **Dependencies and Preconditions:** LibreOffice, Poppler, Ollama, `minicpm-v4.6`,
  and `PaddleOCR-VL` installed.
- **In Scope for This Sub-Task:**
  - `.docx`/`.odt` with an image → Markdown with analysis.
  - `.xlsx`/`.ods` with two sheets → two CSVs.
  - `.pptx`/`.odp` → Markdown with slide sections.
  - `.pdf` via `ocr --image` → page sections.
  - Paths with spaces/unicode; input files unchanged; output collision behavior.
- **Out of Scope for This Sub-Task:** macOS/Windows.
- **Instructions:** Use real sample files if available; otherwise create flat
  ODF/ODP fixtures. Record the LibreOffice/Poppler/PaddleOCR versions.
- **Acceptance Criteria:** Outputs are non-empty and correctly named; analyses
  are present; CSVs match the sheet count; errors are actionable.
- **Cautionary Points:** Image analysis and OCR are slow; use generous timeouts.
  Do not leave LibreOffice/Poppler processes running.
- **Implementation Suggestions:** Add an opt-in integration test that skips when
  tools/models are absent.
- **Testing Suggestions:** `pnpm cli document --input ... --json`,
  `pnpm cli ocr --image ... --format markdown`.
- **Done When:** The Linux smoke test passes and results are recorded.

#### Sub-Task 5.3: Validate macOS and Windows guidance

- **Status:** Pending
- **Objective:** Ensure resolver paths and install hints are correct on the
  other platforms.
- **Related Requirements:** R5, R12
- **Dependencies and Preconditions:** Sub-Tasks 1.1–1.4.
- **In Scope for This Sub-Task:** Platform resolver unit tests; manual review of
  macOS `.app` and Windows `Program Files`/`%LOCALAPPDATA%`/`~/.mllt` paths;
  review of LibreOffice/Poppler hints; document manual status.
- **Out of Scope for This Sub-Task:** Acquiring macOS/Windows machines.
- **Instructions:** Run resolver tests with `platform: "darwin"`/`"win32"`;
  confirm `pathToFileURL` shape for Windows; document exact commands.
- **Acceptance Criteria:** Platform unit tests pass; setup skill contains all
  three OS hints; no `which`/`/tmp` hard-coding.
- **Cautionary Points:** Do not claim a platform was tested if it was not; mark
  it "resolver unit-tested + documented manual steps".
- **Implementation Suggestions:** Add a platform/status table to the review
  notes.
- **Testing Suggestions:** `node --test tests/libreoffice.test.mjs
  tests/pdf.test.mjs`.
- **Done When:** The cross-platform matrix is documented.

#### Sub-Task 5.4: Final review and release note

- **Status:** Pending
- **Objective:** Review the full diff against this plan and produce a short
  upgrade note.
- **Related Requirements:** All
- **Dependencies and Preconditions:** Sub-Tasks 5.1–5.3.
- **In Scope for This Sub-Task:** Review the diff; verify acceptance criteria;
  note the schema-3 migration (`pnpm cli setup`), LibreOffice/Poppler install,
  and image-analysis requirements; recommend a semver bump; update the index.
- **Out of Scope for This Sub-Task:** Publishing or pushing.
- **Instructions:** Use the `final-review` skill/agent if available. Record the
  verdict in `tasks/review.md`.
- **Acceptance Criteria:** All sub-tasks are `Completed`; `pnpm qa` is green;
  the upgrade note explains the machine-manifest regeneration (schema 3) and
  the LibreOffice/Poppler dependencies.
- **Cautionary Points:** Do not mark the plan `Done` while any acceptance
  criterion is unresolved.
- **Implementation Suggestions:** Include the verified versions and fallback
  behavior in the release note.
- **Testing Suggestions:** Re-run `pnpm qa` after final doc edits.
- **Done When:** The plan is signed off and the index status is updated.

## Final Integration & Verification

```bash
pnpm validate
pnpm test
pnpm typecheck
pnpm lint
pnpm cli doctor --skill read-document
pnpm cli setup --json
pnpm qa
```

Manual Linux smoke test:

```bash
pnpm cli document --input /path/to/sample.docx --json
pnpm cli document --input /path/to/sample.xlsx --format csv
pnpm cli document --input /path/to/slides.pptx --json
pnpm cli ocr --image /path/to/report.pdf --format markdown
```

Acceptance checklist:

- [ ] `skills/read-document/SKILL.md` is valid, ≤250 lines, and describes the
      gate, conversions, image analysis, limits, and handoffs.
- [ ] `skills/ocr/SKILL.md` documents PDF input and Poppler.
- [ ] `skills/` contains 11 discoverable `SKILL.md` files and the plugin test
      registers the 11 expected IDs.
- [ ] `document --help` documents every flag and exit code.
- [ ] Writer → HTML → Markdown preserves headings, lists, links, emphasis, and
      tables; images are analyzed and included.
- [ ] Calc → CSV handles one and multiple sheets; `--sheet` filters by name.
- [ ] Presentations → PDF → pages → OCR → Markdown with `## Slide N`.
- [ ] `ocr --image report.pdf` emits `## Page N` sections via `pdftoppm`.
- [ ] LibreOffice resolves system-first, with `~/.mllt` fallback and
      `LIBREOFFICE_BIN` override.
- [ ] `setup`/`doctor` report LibreOffice and Poppler with OS-specific hints.
- [ ] Schema 3 validates `libre_office_path`, `tools.libreoffice`, and
      `tools.pdftoppm`; schema 2 is rejected with a clear message.
- [ ] Outputs are written next to the input; collisions require `--force`.
- [ ] `pnpm qa` passes.
- [ ] Linux integration smoke test passes; macOS/Windows guidance is documented
      as resolver-tested + manual steps.

## Remaining Questions

1. **Image-analysis threshold:** the plan skips images < 8 KB by default and
   caps at 50 per document; confirm those defaults (both are configurable).
2. **Poppler on Windows:** the plan documents the Poppler-for-Windows release
   zip under `~/.mllt/poppler` (or `PATH`); confirm this is acceptable versus a
   Scoop/winget package.
3. **Slide OCR model:** presentations use `PaddleOCR-VL` (text/tables) and hand
   visual descriptions to `image-analysis`; confirm that split.
4. **Output collisions:** default is to refuse existing `.md`/`.csv` targets
   unless `--force`; confirm this is the desired safety behavior.
