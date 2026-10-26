# Plan — Codex compatibility (plugin-native, cross-host)

- **Plan slug:** `codex-compat`
- **Status:** In progress (Phase 0 Codex validated; native upload; Claude pending)
- **Date:** 2026-10-25
- **Requirements:** [`sdd.md`](./sdd.md)
- **Phase 0 findings:** [`phase0-findings.md`](./phase0-findings.md)
- **Scope:** native upload, host context, metadata, validation, docs
- **Out of scope:** MCP server, skill renames, moving `skills/`, OpenCode API
  rewrite, new runtime dependencies, marketplace catalogs, changes to the
  deprecated `scripts/` directory, removing `skills/manifest.json` /
  `scripts/build_manifest.mjs` (tracked separately in `docs/TODO.md`)

## 0. Guiding decisions

1. The repository root is the plugin root. `skills/` stays where it is.
2. Installation is native: the plugin is uploaded to OpenCode, Claude Code, or
   Codex through each host's plugin flow. There is no install script, no
   marketplace catalog, and no per-host build.
3. `scripts/` is deprecated and is neither modified nor used by this plan.
   Skill tooling stays in `src/`; verification stays in `tests/` and each
   host's native validator.
4. Codex uses `.codex-plugin/plugin.json` with `skills` only (no hooks).
   `.claude-plugin/plugin.json` and `index.ts` remain in place. Do not add a
   root `plugin.json`: in Codex 0.164.0 it changes manifest precedence.
5. Phase 0 findings are recorded in `phase0-findings.md`. Codex is validated;
   Claude path mapping is pending `openclaude`.
6. Every phase keeps the repository green in OpenCode and Claude Code.
7. Namespacing is native: OpenCode uses `index.ts`, Claude Code uses its plugin
   prefix, and Codex uses `<plugin>:<skill>` (validated `probe:probe`). No
   skill-name prefix is applied and no skill is renamed.
8. Path resolution is a skill-level contract: every script-using skill uses
   `MLLT_PLUGIN_ROOT` and `MLLT_SKILL_DIR`. OpenCode renders both in
   `index.ts`; Claude Code maps them from `${CLAUDE_PLUGIN_ROOT}` /
   `${CLAUDE_SKILL_DIR}`; Codex derives them from the absolute `SKILL.md` path.
   No hooks and no generated per-host build.
9. Hooks are not used for path resolution, context injection, rename, or content
   transformation. The repository remains the single source of truth.
10. The machine manifest written by the `setup` skill is the single source of
    environment context (hosts, models, tools, readiness). OpenCode injects it
    from `index.ts`; Codex reads it via `AGENTS.md` and Claude via `CLAUDE.md`.
    No host hardcodes endpoints, model lists, or readiness.
    `skills/manifest.json` remains the OpenCode registration metadata and is
    out of scope for this plan.

## 1. Requirements snapshot

| Area | IDs |
|---|---|
| Cross-host invariants | XH-01, XH-02, XH-03, XH-04, XH-05, XH-06 |
| Codex packaging and runtime | CX-01, CX-02, CX-03, CX-04, CX-05, CX-06, CX-07, CX-08, CX-09, CX-10, CX-11, CX-12 |
| Validation and docs | QA-01, QA-02, QA-03, QA-04 |

## 2. Phase 0 — Verification spike (no production changes)

**Objective:** resolve the three unknowns that determine the implementation
shape. All experiments use an isolated `CODEX_HOME` under `/tmp/opencode/`.

### 0.1 Codex plugin spike (historical)

Phase 0 used a throwaway plugin and a local marketplace only as a test harness
under `/tmp/opencode/codex-spike/`. The marketplace is **not** part of the
distribution. Findings are recorded in `phase0-findings.md`.

- **D1 — Native upload layout.** Confirm the directory shape each host accepts
  natively: `.codex-plugin/plugin.json` with `skills`, plus `skills/` and
  `src/`. The marketplace path experiment is historical and out of scope.
- **D2 — Root token.** Confirmed: Codex does not substitute
  `${CLAUDE_PLUGIN_ROOT}` or `${PLUGIN_ROOT}` in installed `SKILL.md`. Use the
  `MLLT_*` path contract from 1.5.
- **D3 — Namespace.** Confirmed: Codex lists plugin skills as
  `<plugin>:<skill>` (`probe:probe`). No skill-name prefix is applied.
- **D5 — Hook spike.** Historical only: hooks can load and rewrite paths, but
  they are rejected in favor of the `MLLT_*` contract. No hook is part of the
  distribution.

- **Acceptance:** the native upload artifact contains the manifest, skills, and
  source; no marketplace file is required.
- **Validation:** upload through the host's native flow and run
  `codex debug prompt-input "probe"` to reproduce the findings. No marketplace
  or installer command is involved.

### 0.2 Choose the distribution shape

- **Files:** `docs/plans/codex-compat/phase0-findings.md`.
- **Decision matrix:**
  - The repository remains the single plugin root.
  - Distribution is the repository root uploaded through each host's native
    flow, containing `.codex-plugin/plugin.json`,
    `.claude-plugin/plugin.json`, `skills/`, `src/`, `package.json`, and the
    CLI modules. No marketplace file and no installer.
  - If D2 resolves a token, document it. If not, use the `MLLT_*` contract
    from 1.5.
  - No generated per-host build.
- **Acceptance:** the native upload layout is defined and contains no
  marketplace file or install script.
- **Dependency:** 0.1.

**Phase 0 results (Codex, via `opencodex`):**

| Gate | Result |
|---|---|
| D1 | Native upload artifact must include `.codex-plugin/plugin.json` with `skills`; the marketplace experiment is historical and not part of the distribution |
| D2 | Codex does not substitute either token in installed `SKILL.md`; use the `MLLT_*` path contract |
| D3 | Codex namespaces plugin skills as `probe:probe`; no skill-name prefix |
| D5 | Hook spike is historical: hooks load and can rewrite paths, but the plan rejects them in favor of the skill-level `MLLT_*` contract; no per-host builds |

**Phase 0 exit criteria:** D1-D3 answered; D5 hook spike closed as historical.
Path resolution is now the `MLLT_*` contract; Claude execution remains pending
`openclaude`.

## 3. Phase 1 — P0: native upload and path contract

**Objective:** each host accepts the native upload and every script-using skill
resolves its CLI through `MLLT_*`.

### 1.1 Extract the skill renderer (TDD)

- **Files:** `src/lib/render.mjs` (new), `index.ts`, `tests/render.test.mjs`
  (new).
- **Steps:**
  1. Write tests for `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_SKILL_DIR}`,
     `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`, `$MLLT_PLUGIN_ROOT`,
     `${MLLT_PLUGIN_ROOT}`, `$MLLT_SKILL_DIR`, and `${MLLT_SKILL_DIR}`
     replacement, including Windows backslash normalization.
  2. Move `renderSkillContent` from `index.ts` to `src/lib/render.mjs`; export
     `renderSkillContent` and `renderTree`.
  3. Import it from `index.ts`; keep behavior identical.
- **Acceptance:** existing `tests/plugin.test.mjs` passes unchanged; new tests
  cover the eight tokens; `index.ts` stays under 300 lines.
- **Validation:** `pnpm test`.
- **Requirements:** XH-01, XH-02, CX-04.

### 1.2 Add the Codex compatibility manifest

- **Files:** `.codex-plugin/plugin.json` (new), `package.json`,
  `.claude-plugin/plugin.json`.
- **Content:** kebab-case `name`, `version`, `description`, and
  `"skills": "./skills/"`. No `hooks` entry: path resolution is handled by the
  skill-level `MLLT_*` contract.
- **Do not add a root `plugin.json`:** Phase 0 validated `.codex-plugin` as the
  manifest Codex reads; a root manifest changes precedence in 0.164.0.
- **Steps:** copy the version from `package.json`; add a consistency check
  later in 3.4.
- **Acceptance:** `.codex-plugin/plugin.json` parses; `name` matches the
  repository and OpenCode ID; version equals the other two manifests; `skills`
  points to an existing directory.
- **Validation:** `node -e "JSON.parse(require('fs').readFileSync('.codex-plugin/plugin.json'))"`;
  `pnpm test`.
- **Requirements:** CX-01, QA-03.

### 1.2a Make the setup machine manifest the context source

- **Files:** `src/lib/machine-manifest.mjs` (new), `src/lib/context.mjs` (new),
  `index.ts`, `tests/context.test.mjs` (new),
  `tests/machine_manifest.test.mjs` (new).
- **Source:** the manifest written by `src/commands/setup/manifest.mjs` at
  `manifestPath()` (schema 2). `skills/manifest.json` remains the OpenCode
  registration metadata and is not used for context.
- **Reader:** `src/lib/machine-manifest.mjs` exports a dependency-free
  `readMachineManifestSafe()` that resolves `manifestPath()`, parses the JSON,
  and returns `{ manifest, path, error }`. It must not require Ajv or any
  package dependency so `index.ts` can read it without Ajv.
- **Formatter:** `src/lib/context.mjs` exports
  `compactContext(manifest, { host, pluginRoot })`. It renders a compact block
  with:
  - manifest path and `generated_at`;
  - Ollama host and reachability;
  - Ollama available/missing models (count plus required names);
  - tesseract/ffmpeg/ffprobe/piper/voice readiness;
  - per-skill readiness from `manifest.features`;
  - warnings;
  - the CLI command for the current host;
  - a stale notice when `generated_at` is older than seven days.
- **Refactor `index.ts`:** remove the `SUMMARIES` map and the hardcoded
  endpoints. Call `readMachineManifestSafe()` and `compactContext(...)`, append
  the OpenCode invocation line, and inject the block. If the manifest is
  missing, inject a short notice with the expected path and
  `pnpm cli setup`.
- **Acceptance:** `index.ts` has no endpoint literals or per-skill summary map;
  the context block is derived from a fixture machine manifest; a missing
  manifest produces the setup notice instead of throwing.
- **Validation:** `pnpm test`; run `pnpm cli setup` and confirm the block
  reflects the real hosts and readiness.
- **Dependency:** 1.1.
- **Requirements:** XH-05, CX-12.

### 1.3 Verify the native upload layout

- **Files:** `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`,
  `index.ts`, `skills/`, `src/`, `package.json`.
- **Content:** the repository root is the upload artifact. Each host's native
  plugin flow uploads it directly; no `scripts/` installer, no marketplace, no
  packaging script.
- **Checklist:**
  - `.codex-plugin/plugin.json` exposes `skills`;
  - `.claude-plugin/plugin.json` is valid;
  - `index.ts` is the OpenCode entry;
  - `src/` contains the CLI and its dependencies are declared in
    `package.json`;
  - no marketplace file and no hook file are required.
- **Acceptance:** the artifact is accepted by each host's native upload flow;
  `claude plugin validate .` passes; OpenCode registers the plugin; Codex lists
  the skills after upload.
- **Validation:** native upload in each host; `claude plugin validate .`;
  `codex debug prompt-input "smoke"` after the host installs it.
- **Dependency:** 1.2.
- **Requirements:** CX-02, CX-03.

### 1.4 Document native upload per host

- **Files:** `README.md`, `AGENTS.md`, `CLAUDE.md`.
- **Content:**
  - OpenCode: upload/install the plugin through the host flow; `index.ts`
    registers the skills and injects the setup manifest context.
  - Claude Code: upload/install the plugin; `${CLAUDE_PLUGIN_ROOT}` is native.
  - Codex: upload/install the private plugin; no marketplace or installer.
  - No `scripts/install.mjs`, no `pnpm harness:install`, no `codex plugin add`.
- **Acceptance:** each host has a one-page upload/install path; no deprecated
  `scripts/` command appears in the docs.
- **Validation:** manual read-through; `claude plugin validate .`.
- **Dependency:** 1.3.
- **Requirements:** XH-02, XH-03, CX-02, CX-03.

### 1.5 Add the MLLT path contract to script-using skills

- **Files:** `skills/image-analysis/SKILL.md`, `skills/ocr/SKILL.md`,
  `skills/video-analysis/SKILL.md`, `skills/speak/SKILL.md`,
  `skills/autoskills/SKILL.md`,
  `skills/ccreate-skill/SKILL.md`, `skills/setup/SKILL.md`,
  `src/lib/render.mjs`, `index.ts`, `tests/path_contract.test.mjs` (new),
  `AGENTS.md`, `README.md`.
- **Do not add hooks** and do not create per-host builds.
- **Skill directive (short block in each script-using skill):**
  - **Claude Code:** `export MLLT_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"` and
    `export MLLT_SKILL_DIR="${CLAUDE_SKILL_DIR}"`.
  - **OpenCode:** `index.ts` replaces `$MLLT_PLUGIN_ROOT` and
    `$MLLT_SKILL_DIR` in the registered content.
  - **Codex:** use the absolute `SKILL.md` path from the skill catalog;
    `MLLT_SKILL_DIR` is its directory and `MLLT_PLUGIN_ROOT` is two levels up.
  - Run commands with quoted variables:
    `node "$MLLT_PLUGIN_ROOT/src/cli.mjs" ...`.
- **Command rewrite:** replace `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_SKILL_DIR}`
  in command bodies with `$MLLT_PLUGIN_ROOT` / `$MLLT_SKILL_DIR`. Keep the
  `${CLAUDE_*}` tokens only in the Claude mapping line.
- **Renderer:** `renderSkillContent` replaces `$MLLT_PLUGIN_ROOT`,
  `${MLLT_PLUGIN_ROOT}`, `$MLLT_SKILL_DIR`, and `${MLLT_SKILL_DIR}` with the
  absolute paths for OpenCode. It must leave no `MLLT_*` placeholder in the
  registered content.
- **Acceptance:** all eight script-using skills declare the contract; command
  bodies use `$MLLT_*`; OpenCode renders both paths; Codex runs a command after
  deriving/exporting the variables; no hooks or build directories exist.
- **Validation:** `pnpm test`; feed a fixture skill through the renderer; run
  `opencodex exec` in an isolated `CODEX_HOME` with the derived variables;
  `claude plugin validate .`.
- **Dependency:** 1.1, 1.2a.
- **Requirements:** CX-04, CX-11, XH-06.

### 1.6 Codex smoke test

- **Files:** `docs/plans/codex-compat/phase1-findings.md` (evidence only).
- **Steps:** upload the repository/zip through Codex's native plugin flow in an
  isolated home, run `codex debug prompt-input "smoke"`, confirm all 10 skills
  are listed with paths, then run a script-using skill with
  `MLLT_PLUGIN_ROOT` and `MLLT_SKILL_DIR` derived from the installed
  `SKILL.md` path.
- **Acceptance:** all 10 skills listed; the OCR skill runs through the
  `MLLT_*` contract; no duplicate stale skill shadows the plugin version; no
  hook is required.
- **Validation:** command output pasted into the findings file.
- **Dependency:** 1.2, 1.3, 1.4, 1.5.

**Phase 1 exit criteria:** Codex installs the plugin, sees 10
`<plugin>:<skill>` entries, and executes the CLI through the `MLLT_*` path
contract; OpenCode tests and Claude validation remain green.

## 4. Phase 2 — P1: host context and awareness

**Objective:** Codex and Claude Code receive the same operational context from
the setup machine manifest, and the repository guides agents appropriately per
host.

### 2.1 Restructure `AGENTS.md`

- **Files:** `AGENTS.md`, `CLAUDE.md` (new, short pointer to `AGENTS.md` and
  the setup manifest).
- **Content:**
  - A host matrix: discovery path, install command, path contract, context
    source.
  - The `MLLT_PLUGIN_ROOT` / `MLLT_SKILL_DIR` contract: OpenCode renders,
    Claude maps from `CLAUDE_*`, Codex derives from the `SKILL.md` path.
  - A pointer to the setup machine manifest at `manifestPath()` as the source
    of hosts, models, tools, and readiness; do not duplicate that inventory.
  - Stable safety rules and the CLI entry point.
  - Codex-specific notes: `$skill` / `/skills`, `.agents/skills` is not the
    plugin path, sandbox network access for localhost, `CODEX_HOME` for
    isolated tests.
  - Keep the existing OpenCode V2 API constraints and repository rules.
- **Acceptance:** `AGENTS.md` stays under 32 KiB; the path contract is
  unambiguous for the three hosts; `CLAUDE.md` points to `AGENTS.md` and the
  manifest; no hooks are referenced.
- **Validation:** `wc -c AGENTS.md`; `codex debug prompt-input "smoke"` includes
  the path contract and manifest pointer; `claude` loads the `CLAUDE.md`
  pointer.
- **Requirements:** CX-05, CX-12, XH-02, XH-03, XH-05, XH-06.

### 2.2 Document the Codex catalog budget

- **Files:** `README.md`, `AGENTS.md`.
- **Content:** document that Codex may shorten skill descriptions when the
  catalog exceeds its context budget. No description rewrite is performed in
  this plan because `skills/manifest.json` regeneration depends on the
  deprecated `scripts/` tooling.
- **Acceptance:** the budget limitation and mitigation are documented; no
  `SKILL.md` descriptions change.
- **Validation:** manual read-through; `pnpm test`.
- **Requirements:** CX-06.

### 2.3 Resolve duplicate-name and namespace behavior

- **Files:** `README.md`, `AGENTS.md`.
- **Steps:**
  - Use the Phase 0 result (D3) to document that plugin skills are namespaced
    as `<plugin>:<skill>`.
  - Document that native upload is the supported path and that
    `~/.agents/skills` copies are not used.
  - Do not rename skills.
- **Acceptance:** no silent duplicate; the chosen behavior is documented and
  testable.
- **Validation:** `codex debug prompt-input` shows one entry per skill.
- **Dependency:** 0.1 (D3).
- **Requirements:** CX-06, XH-01.

### 2.4 Add Codex subagent guidance to `ccreate-agent`

- **Files:** `skills/ccreate-agent/SKILL.md`,
  `skills/ccreate-agent/references/codex-subagents.md` (new).
- **Content:**
  - Host routing: OpenCode/Claude Markdown profiles vs Codex TOML.
  - Codex paths: `~/.codex/agents/` (personal), `.codex/agents/` (project).
  - Minimal TOML example with `name`, `description`,
    `developer_instructions`, and optional `model` / `model_reasoning_effort`.
  - Validation guidance: confirm the agent file loads with `codex` and does not
    duplicate an existing name.
- **Acceptance:** `ccreate-agent` routes by host; the reference exists and is
  linked; `SKILL.md` stays at most 250 lines.
- **Validation:** `pnpm cli skill validate skills/ccreate-agent/SKILL.md`.
- **Requirements:** CX-07.

### 2.5 Teach `autoskills` about Codex artifacts

- **Files:** `skills/autoskills/SKILL.md`,
  `skills/autoskills/references/skill-generation.md` if needed.
- **Content:** add `.codex/config.toml`, `.codex/agents/*.toml`,
  `.codex/skills/`, and `.codex-plugin/plugin.json` to the scan list; propose
  host-appropriate target layouts:
  - OpenCode: `.opencode/skills/` or plugin registration.
  - Claude: `.claude/skills/` or plugin.
  - Codex: `.agents/skills/` for standalone or the native upload plugin layout.
- **Acceptance:** the scan list includes Codex artifacts; no host is presented
  as the only option.
- **Validation:** `pnpm cli skill validate skills/autoskills/SKILL.md`.
- **Requirements:** CX-08.

### 2.6 No-hook and path-contract policy

- **Files:** `AGENTS.md`, `CLAUDE.md`, `README.md`.
- **Content:**
  - State that the repository uses no Codex/Claude hooks and no per-host build
    for path resolution or context.
  - Document the `MLLT_*` contract as the only path mechanism.
  - Explain that OpenCode injects the setup manifest from `index.ts`; Codex and
    Claude read the manifest on demand via the `AGENTS.md` / `CLAUDE.md`
    pointer.
  - Document the failure mode: if `MLLT_*` is unset, the agent must resolve it
    before running commands; no hook will fix it.
- **Acceptance:** no `hooks/` files exist; the contract is documented for the
  three hosts; OpenCode and Claude behavior is unchanged.
- **Validation:** `pnpm test`; `codex debug prompt-input`; `claude plugin
  validate .`.
- **Dependency:** 1.5, 2.1.
- **Requirements:** CX-04, CX-05, CX-11, CX-12, XH-05, XH-06.

**Phase 2 exit criteria:** Codex and Claude Code can reach the setup machine
manifest through the documented pointers, descriptions fit the catalog budget,
duplicates are addressed, no hooks are used, and both authoring skills
understand Codex.

## 5. Phase 3 — P2: consistency, validation, docs

**Objective:** make compatibility enforceable and documented.

### 3.1 Normalize optional frontmatter

- **Files:** `skills/*/SKILL.md`.
- **Decision:** either remove `compatibility` (it is optional and currently
  describes clients, not environment) or rewrite it as environment
  requirements. Use `metadata.hosts: codex, claude, opencode` for host
  coverage.
- **`allowed-tools`:** remove it or normalize to the space-separated form; do
  not leave Claude-only comma-separated values presented as cross-host.
- **Acceptance:** consistent across all 10 skills; validator allows the chosen
  shape.
- **Validation:** `pnpm cli skill validate skills/*/SKILL.md` (loop),
  `pnpm test`.
- **Requirements:** XH-02, XH-03, CX-09.

### 3.2 Remove host-specific wording

- **Files:** `skills/speak/SKILL.md`, `skills/setup/SKILL.md`, `index.ts`,
  `README.md`.
- **Content:** replace "when opencode needs", "the skill tool", and similar
  host-specific phrases with host-neutral wording ("the agent", "load the
  skill").
- **Acceptance:** no host-specific wording in shared instructions; Codex and
  Claude users are not told to use an OpenCode-only tool.
- **Validation:** `grep -Rni "opencode\|skill tool" skills/` reviewed.
- **Requirements:** CX-05, CX-09.

### 3.3 Optional Codex presentation metadata

- **Files:** `skills/speak/agents/openai.yaml` (new, optional).
- **Content:** `policy.allow_implicit_invocation: false` for skills with
  side effects; optional `interface.display_name` and `short_description`.
- **Acceptance:** files parse as YAML; the skills still validate.
- **Validation:** a YAML parser test; `pnpm test`.
- **Requirements:** CX-06.

### 3.4 Add harness contract tests

- **Files:** `tests/harness_contract.test.mjs` (new).
- **Checks:**
  - `.codex-plugin/plugin.json` exists, parses, has `skills`, kebab-case
    `name`, and a version equal to `package.json` and `.claude-plugin`.
  - the native upload artifact contains `.codex-plugin/plugin.json`, `skills/`,
    and `src/`; no `marketplace.json` or installer script is required.
  - every `SKILL.md` name equals its directory.
  - every script-using skill contains the `MLLT_*` path contract and no
    `${CLAUDE_PLUGIN_ROOT}` / `${PLUGIN_ROOT}` in command bodies.
  - no `hooks/` directory exists.
  - the catalog budget limitation is documented; no description rewrite is
    required.
- **Acceptance:** a deliberate mismatch fails the tests; the normal tree
  passes.
- **Validation:** `pnpm test`; mutate a copy in a temp dir to prove failure.
- **Requirements:** QA-01, QA-03, CX-01, CX-02.

### 3.5 Add Codex compatibility tests

- **Files:** `tests/codex_compat.test.mjs` (new).
- **Cases:**
  - manifest parse and version sync;
  - native upload layout (manifest, skills, source; no marketplace or
    installer);
  - renderer output for `$MLLT_PLUGIN_ROOT` / `$MLLT_SKILL_DIR` (and braced
    forms);
  - every script-using skill has the path contract;
  - no `hooks/` files or hook references;
  - `ccreate-agent` Codex reference exists;
  - no host-specific wording in shared instructions.
- **Acceptance:** tests fail before the implementation and pass after; they do
  not require Codex, network, or models.
- **Validation:** `pnpm test`.
- **Requirements:** QA-02.

### 3.6 Documentation and license

- **Files:** `README.md`, `package.json`, `LICENSE` (new), `docs/plans/index.md`.
- **Content:**
  - Native upload section per host: OpenCode, Claude Code, and Codex upload the
    plugin through their own flow; verify with each host's native validator or
    `codex debug prompt-input`.
  - `MLLT_PLUGIN_ROOT` / `MLLT_SKILL_DIR` contract and per-host resolution.
  - Updated layout tree with `.codex-plugin/plugin.json`, `AGENTS.md`, and
    `CLAUDE.md`. No `hooks/`, marketplace, or `scripts/` install tree.
  - Remove references to deprecated `pnpm harness:install`, `scripts/install.mjs`,
    and marketplace commands.
  - Windows notes for Codex.
  - `LICENSE` (MIT) and `"license": "MIT"` in `package.json`.
  - Plan index entry with status.
- **Acceptance:** a new user can install on all three hosts from the README
  alone; license is consistent with `.claude-plugin/plugin.json`; no hook,
  marketplace, installer script, or per-host build is documented.
- **Validation:** manual read-through; `claude plugin validate .`.
- **Requirements:** CX-09, QA-04.

### 3.7 Full regression matrix

- **Files:** `docs/plans/codex-compat/review.md` (evidence).
- **Commands:**

```bash
pnpm test
claude plugin validate .

# Upload the repository/plugin through each host's native flow, then verify
# Codex discovery. Replace <installed-plugin> with the path the host reports.
codex debug prompt-input "smoke"

# Derive the MLLT paths from the installed SKILL.md and run one script-using
# skill. No hook trust, marketplace, or install script is involved.
export MLLT_SKILL_DIR="<installed-plugin>/skills/ocr"
export MLLT_PLUGIN_ROOT="$(cd "$MLLT_SKILL_DIR/../.." && pwd)"
node "$MLLT_PLUGIN_ROOT/src/cli.mjs" ocr --help
```

- **Acceptance:** all commands pass; the prompt lists all 10 repo skills; one
  CLI command from the installed plugin executes via `MLLT_*`; no hooks,
  marketplace, or installer script are involved.
- **Requirements:** XH-02, XH-03, CX-03, CX-04, QA-01, QA-02, QA-03.

**Phase 3 exit criteria:** compatibility is enforced by tests and documented;
all three hosts pass the regression matrix.

## 6. Requirements to sub-task mapping

| Requirement | Sub-tasks |
|---|---|
| XH-01 | 1.1, 1.2, 2.3 |
| XH-02 | 1.1, 1.4, 2.1, 2.6, 3.1, 3.7 |
| XH-03 | 1.2, 2.1, 3.1, 3.6, 3.7 |
| XH-04 | 1.4, 3.3 (no MCP, no new runtime deps) |
| XH-05 | 1.2a, 2.1, 2.6 |
| XH-06 | 1.5, 2.1, 3.4, 3.5 |
| CX-01 | 1.2, 3.4 |
| CX-02 | 1.3, 3.4 |
| CX-03 | 1.4, 1.6, 3.7 |
| CX-04 | 0.1, 1.1, 1.5, 1.6 |
| CX-05 | 2.1, 2.6, 3.2, 3.6 |
| CX-06 | 0.1, 2.2, 2.3, 3.3, 3.4 |
| CX-07 | 2.4 |
| CX-08 | 2.5 |
| CX-09 | 3.1, 3.2, 3.6 |
| CX-10 | 2.6 |
| CX-11 | 1.5, 2.6, 3.4, 3.7 |
| CX-12 | 1.2a, 2.1, 2.6 |
| QA-01 | 3.4 |
| QA-02 | 3.5 |
| QA-03 | 1.2, 3.4, 3.5 |
| QA-04 | 3.6 |

## 7. Risks and rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| Native upload layout not recognized by a host | Plugin not discovered | Validate each host's upload flow in 1.3/1.6; document the accepted layout |
| Codex does not substitute tokens | Phase 0 confirmed; use the `MLLT_*` path contract | Revert the skill directive if a native token becomes available |
| Codex derives the wrong `MLLT_*` values | CLI commands fail | Validate with `opencodex`; keep the derivation instruction explicit |
| Claude does not follow the `MLLT_*` mapping | CLI commands fail | Keep the mapping block next to the command; validate with `openclaude` |
| `MLLT_*` placeholders leak into a host | Commands use literal placeholders | Renderer/tests assert no unresolved `MLLT_*` in OpenCode output |
| A root `plugin.json` changes manifest precedence | Plugin not discovered | Keep only `.codex-plugin/plugin.json` for Codex; revalidate if a root manifest is added |
| Setup manifest missing or stale | Context shows wrong hosts/readiness | Point to `pnpm cli setup`; document refresh; agent reads on demand |
| Duplicate names shadow plugin | Phase 0 confirmed `<plugin>:<skill>` namespacing | Disable the plugin or remove the global copies with user approval |
| Version drift | Contract tests enforce equality | Fix the manifest; no runtime impact |
| Sandbox blocks localhost | Document network access and approval | User enables network only for the session |

Rollback is additive: Phase 1 adds files and an optional installer flag;
Phase 2 changes documentation and descriptions; Phase 3 adds validation and
tests. No database, no migrations, no destructive commands.

## 8. Execution notes

- Run Phase 0 entirely under `/tmp/opencode/` with an isolated `CODEX_HOME`.
- Do not touch `~/.codex/config.toml` or `~/.agents/skills` without explicit
  user approval.
- For each sub-task: write the test first when code is involved, implement,
  run the smallest validation, then the phase gate.
- Keep `skills/` at the root and keep the three manifests version-synchronized.
- Do not add hooks or generated per-host builds; path resolution is the
  `MLLT_*` contract.
- After each phase, record evidence in the plan or a findings file and update
  the status.

## 9. Definition of done

- [ ] Phase 0 decisions recorded (D1, D2, D3, D5); Codex validated with
      `opencodex`, Claude pending `openclaude`.
- [ ] `.codex-plugin/plugin.json` (with `skills`, no hooks) added; the native
      upload artifact contains the plugin, skills, and source; no marketplace
      catalog or install script exists.
- [ ] Every script-using skill declares `MLLT_PLUGIN_ROOT` and `MLLT_SKILL_DIR`;
      OpenCode renders both; Claude maps both; Codex derives both.
- [ ] `AGENTS.md` / `CLAUDE.md` cover the three hosts and point to the setup
      machine manifest as the context source.
- [ ] `index.ts` injects the setup machine manifest context (no hardcoded
      endpoints or `SUMMARIES` map).
- [ ] No hooks and no generated per-host builds exist.
- [ ] The Codex catalog budget limitation and namespace strategy are
      documented; no description rewrite is required.
- [ ] `ccreate-agent` and `autoskills` understand Codex.
- [ ] Codex namespacing verified as `<plugin>:<skill>`; no skill-name prefix
      or OpenCode/Claude regression.
- [ ] Harness tests enforce Codex compatibility and the path contract.
- [ ] README, layout, Windows notes, and license updated.
- [ ] `pnpm test`, `claude plugin validate .`, and the Codex native-upload
      smoke test pass.
