# Plan — Remove `scripts/` and `skills/manifest.json`

- **Plan slug:** `remove-scripts-manifest`
- **Status:** Done (2026-10-26)
- **Date:** 2026-10-26
- **Requirements:** this document
- **Scope:** delete the root `scripts/` directory and `skills/manifest.json`;
  migrate install/validation into the single CLI; discover skills dynamically;
  update code, tests, configs, and docs
- **Out of scope:** changing skill content, changing the machine manifest
  (`src/commands/setup/manifest.*`), changing the OpenCode plugin API, adding
  runtime dependencies, rewriting historical plans

## Objective

Remove the two remaining generated/tooling artifacts that duplicate `src/` and
`skills/`:

1. `scripts/` (`build_manifest.mjs`, `install.mjs`, `validate.mjs`) is the
   deprecated tooling directory. Install and validation must move into the
   single CLI at `src/cli.mjs`; manifest generation disappears.
2. `skills/manifest.json` is derived registration metadata. `index.ts` must
   discover `skills/*/SKILL.md` at load time, parse the frontmatter with the
   existing `yaml` dependency, and register the skills directly.

The repository ends with no root `scripts/` directory and no
`skills/manifest.json`, while `pnpm harness:install`, `pnpm validate`, the
plugin registration, and `pnpm qa` keep working.

## Why this is safe

- `skills/manifest.json` has one runtime consumer: `index.ts` (`loadSkills`).
  Everything else that reads it is tooling (`scripts/build_manifest.mjs`,
  `scripts/validate.mjs`) or tests/docs.
- `scripts/install.mjs` and `scripts/validate.mjs` are only invoked by
  `package.json`, never imported by runtime code.
- `scripts/build_manifest.mjs` is only imported by
  `tests/build_manifest.test.mjs`.
- The machine manifest (`~/.mllt/manifest.json`) is a different file and is
  **not** affected by this plan.

## Current usage audit

### `scripts/`

| Script | Purpose | Current callers | Replacement |
|---|---|---|---|
| `scripts/build_manifest.mjs` | Scans `skills/*/SKILL.md`, parses frontmatter, writes `skills/manifest.json` | `pnpm manifest`; `tests/build_manifest.test.mjs` | Delete; `index.ts` discovers skills at load time |
| `scripts/install.mjs` | Symlinks the repo into the OpenCode plugins directory; `--dry-run`; removes legacy link; warns about overlapping harnesses | `pnpm harness:install` | `src/commands/install.mjs`, wired as `pnpm cli install` (package script keeps `pnpm harness:install`) |
| `scripts/validate.mjs` | Static harness checks: expected skills, manifest coverage, package/entry, line limits, no `.py`/`.sh` in skills, hard-coded paths, README/AGENTS | `pnpm validate` | `src/commands/validate.mjs`, wired as `pnpm cli validate` (package script keeps `pnpm validate`) |

### `skills/manifest.json`

| Consumer | How it uses it | Replacement |
|---|---|---|
| `index.ts` (`loadSkills`) | Reads `skills/manifest.json`, iterates `manifest.skills`, reads each `SKILL.md`, renders `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_SKILL_DIR}` | `src/lib/skills.mjs` `discoverSkills(root)` scans sorted directories, parses frontmatter, reads content; `index.ts` renders and registers |
| `scripts/build_manifest.mjs` | Writes the file | Delete |
| `scripts/validate.mjs` | Checks coverage and description equality with frontmatter | Delete; `src/commands/validate.mjs` validates each discovered `SKILL.md` directly |
| `tests/build_manifest.test.mjs` | Imports `build`/`collect`/`parseFrontmatter` | Delete; `tests/skills.test.mjs` tests discovery/frontmatter |
| `tests/plugin.test.mjs` | Indirect: `plugin.setup()` currently reads the real manifest and expects 10 registered skills | Update to expect discovery; the count check remains (10 now, 11 after `read-document`) |
| `AGENTS.md`, `README.md`, `docs/plans/*`, `docs/TODO.md` | Document generation/coverage | Update active docs; leave historical plans as history |

`skills/manifest.json` is **not** read by any host, `package.json`, build
config, or runtime module other than `index.ts`.

## Requirements Snapshot

- **R1 — Remove `scripts/`:** the directory and all three files are deleted; no
  active code, package script, config, or current doc references `scripts/`.
- **R2 — Remove `skills/manifest.json`:** the file is deleted and
  `pnpm manifest` is removed; no runtime or validator code reads it.
- **R3 — Dynamic discovery:** `index.ts` registers skills discovered from
  `skills/*/SKILL.md`, sorted by directory name. Frontmatter `name` and
  `description` are parsed with the existing `yaml` dependency and normalized
  like the old builder. A directory without `SKILL.md`, malformed YAML, or a
  missing description is reported as a warning and skipped at load time;
  `pnpm validate` fails on it.
- **R4 — Install preserved:** `pnpm harness:install` still works and maps to
  `node src/cli.mjs install`. Behavior preserved: idempotent symlink,
  `--dry-run`, refuse to replace a non-symlink, remove the legacy
  `cheap-ai-winth-local-tools` symlink, warn about `my-utils-harness` overlap.
- **R5 — Validation preserved:** `pnpm validate` still works and maps to
  `node src/cli.mjs validate`. It validates every discovered `SKILL.md` via the
  existing `validateSkillFile` (name, description ≤500 chars, ≤250 lines,
  banned sections), package/entry contracts, line limits in `src/`/`tests/`,
  no `.py`/`.sh` under `skills/`, no hard-coded `~/.agents/skills/<name>/`
  paths, and README/AGENTS presence. It also asserts `scripts/` and
  `skills/manifest.json` are absent.
- **R6 — Package/config:** `package.json` drops `manifest`; `validate` and
  `harness:install` point at `src/cli.mjs`; `deps`/`dup` no longer include
  `scripts`. No new dependencies.
- **R7 — Tests:** delete `tests/build_manifest.test.mjs`; add focused tests for
  discovery/frontmatter, install path/symlink behavior, and the repo validator;
  keep `tests/skill_validate.test.mjs`. Update plugin tests where they assume a
  manifest and assert the known skill IDs (not just the count), so removing the
  manifest does not hide a missing skill.
- **R8 — Docs:** update `AGENTS.md`, `README.md`, `docs/plans/index.md`,
  `docs/TODO.md`, and the `read-document` plan's references. Historical
  `codex-compat` plans may keep their historical mentions.
- **R9 — QA:** `pnpm qa` passes; `pnpm validate` and
  `pnpm harness:install --dry-run` work; the OpenCode plugin still registers all
  current skills.
- **R10 — No new dependencies:** use existing `yaml`; no parser/build tool is
  added.
- **R11 — Deterministic registration:** skills register in directory-name order;
  duplicates/unknown directories are handled deterministically.
- **R12 — Reversibility:** the deletion is a normal git change; no generated
  file is needed to build or run the plugin.

## Assumptions and Constraints

- `index.ts` setup may perform synchronous filesystem reads before
  `ctx.skill.transform`; the current code already reads the manifest and
  `SKILL.md` synchronously, so discovery is no slower in practice.
- `discoverSkills` lives in `src/lib/skills.mjs` and is shared by `index.ts` and
  the repo validator. The single-skill validator keeps its own detailed checks.
- The repo validator may import `validateSkillFile` from
  `src/commands/skill/validate.mjs`; all 10 current skills already pass it
  (verified 2026-10-26).
- `scripts/` is deprecated per `docs/plans/codex-compat`; this plan is the
  tracked follow-up in `docs/TODO.md`.
- `docs/plans/read-document` is not implemented yet; it must be updated to the
  dynamic-discovery flow before it is executed.
- No CI workflow exists; `pnpm qa` is the gate.
- Files ≤300 lines; if `src/commands/validate.mjs` grows past that, split it
  into `src/commands/validate/`.

## Risks and Areas Requiring Care

| Risk | Impact | Mitigation |
|---|---|---|
| Malformed skill frontmatter breaks plugin load | Plugin fails to register any skill | Per-skill try/catch; warn and skip; validator fails on the same file |
| A skill is silently omitted | Agent cannot use it | Validator checks every `skills/*/SKILL.md`; plugin warning includes the directory; test count |
| Dynamic order differs from manifest order | Non-deterministic inventory | Sort by directory name; test it |
| `index.ts` imports/deletes the wrong manifest | Machine manifest confused with skills manifest | Keep `src/commands/setup/manifest.*` untouched; remove only `join(root, "skills", "manifest.json")` |
| Install behavior regresses | Users cannot load the plugin | Port code verbatim; test `--dry-run`, symlink, legacy cleanup, non-symlink refusal |
| Validator becomes weaker | Broken skills/docs merge | Reuse `validateSkillFile`; keep line/size/path checks; assert scripts/manifest absence |
| `pnpm deps`/`dup` still reference `scripts/` | QA fails after deletion | Update package scripts in the same change |
| Stale docs reference `pnpm manifest` | Users run a deleted command | Grep and update active docs; historical plans exempt |
| `read-document` plan still assumes manifest | Future implementation contradicts the repo | Update that plan in Sub-Task 4.3 |
| Windows symlink/junction behavior | Install tests fail or differ | Preserve `junction` on win32; unit-test path resolution; document manual check |
| `skills/manifest.json` re-added later | Duplicate source of truth returns | Validator asserts it is absent; AGENTS rule forbids it |

## Core Concepts

### Dynamic skill discovery

`src/lib/skills.mjs`:

```js
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parse } from "yaml"

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/

export function parseSkillFrontmatter(text) {
  const match = FRONTMATTER.exec(text)
  if (!match) return {}
  let data
  try {
    data = parse(match[1]) ?? {}
  } catch {
    return {}
  }
  const fields = {}
  for (const key of ["name", "description"]) {
    if (typeof data[key] === "string" && data[key].trim()) {
      fields[key] = data[key].replace(/\s+/g, " ").trim()
    }
  }
  return fields
}

export function discoverSkills(root) {
  const skillsDir = join(root, "skills")
  const warnings = []
  const skills = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((id) => {
      const path = join(skillsDir, id, "SKILL.md")
      try {
        const content = readFileSync(path, "utf8")
        const meta = parseSkillFrontmatter(content)
        if (!meta.description) {
          warnings.push(`skills/${id}/SKILL.md has no description; skipped`)
          return []
        }
        return [{ id, name: meta.name || id, description: meta.description, path, content }]
      } catch {
        warnings.push(`skills/${id}/SKILL.md is missing or unreadable; skipped`)
        return []
      }
    })
  return { skills, warnings }
}
```

`index.ts` renders `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_SKILL_DIR}` as today and
registers the returned skills. It no longer imports or reads
`skills/manifest.json`.

### CLI commands

`src/cli.mjs` gains:

```text
install [--dry-run]     symlink this repo into the OpenCode plugins directory
validate                validate skills, package, entry, docs, and limits
```

- `package.json`: `harness:install` → `node src/cli.mjs install`;
  `validate` → `node src/cli.mjs validate`.
- `validate` keeps exit code `0`/`1` and prints the same ✓/✗ style.
- `install` keeps its human-readable steps and `--dry-run` exit `0`.

### Repo validator

`src/commands/validate.mjs`:

1. `discoverSkills(root)`; fail if the list is empty.
2. For each skill, run `validateSkillFile(path)` and collect errors/warnings.
3. Check `package.json`: name, version, ESM, `exports["."] === "./index.ts"`,
   `@opencode/plugin` dependency.
4. Check `index.ts`: `Plugin.define`, `ctx.skill.transform`, `ctx.session.hook`,
   `HARNESS_ID`, context marker, `discoverSkills` import, no
   `skills/manifest.json` reference, ≤300 lines.
5. Check `src/**/*.mjs` and `tests/*.mjs` ≤300 lines.
6. Check no `.py`/`.sh` under `skills/`; run `bash -n` on any skill `.sh` if one
   appears.
7. Check no hard-coded `~/.agents/skills/<name>/` paths for discovered skills.
8. Check `README.md` and `AGENTS.md` exist.
9. Check `scripts/` does not exist and `skills/manifest.json` does not exist.
10. Check `package.json` scripts do not contain `scripts/`.

### Install command

Port `scripts/install.mjs` to `src/commands/install.mjs` with the same steps:
resolve the OpenCode plugins directory, print the OpenCode check, warn about
`my-utils-harness`, honor `--dry-run`, create the plugins directory, remove the
legacy symlink, refuse to replace a non-symlink, create the symlink/junction.

## Sub-Tasks

### Phase 0 — Baseline

#### Sub-Task 0.1: Confirm the usage audit

- **Status:** Completed (2026-10-26)
- **Objective:** Verify there are no hidden consumers of `scripts/` or
  `skills/manifest.json`.
- **Related Requirements:** R1, R2
- **Outcome:** Grep found only `index.ts`, `scripts/*`, `tests/build_manifest.test.mjs`,
  the plugin test (indirect), active docs, and historical plans. The machine
  manifest is separate and stays.
- **Done When:** The audit table above is accurate.

#### Sub-Task 0.2: Verify the existing validator accepts all skills

- **Status:** Completed (2026-10-26)
- **Objective:** Ensure the new repo validator can reuse `validateSkillFile`
  without breaking current skills.
- **Related Requirements:** R5
- **Outcome:** All 10 `skills/*/SKILL.md` files pass
  `node src/cli.mjs skill validate <path>`.
- **Done When:** The validator migration has a green baseline.

### Phase 1 — Dynamic discovery

#### Sub-Task 1.1: Add `src/lib/skills.mjs`

- **Status:** Completed (2026-10-26)
- **Objective:** Extract frontmatter parsing and skill discovery into a shared
  module.
- **Related Requirements:** R3, R10, R11
- **Dependencies and Preconditions:** None.
- **In Scope for This Sub-Task:** `parseSkillFrontmatter`, `discoverSkills`,
  optional `renderSkillContent`; stable sort; warnings for missing/unreadable/
  description-less skills.
- **Out of Scope for This Sub-Task:** Changing `index.ts`, deleting the
  manifest, or validating skills.
- **Instructions:** Use the existing `yaml` dependency; normalize `name` and
  `description` whitespace exactly like `scripts/build_manifest.mjs` did.
  Return `{ skills, warnings }`; do not write files. Include `path` and raw
  `content` in each skill record.
- **Acceptance Criteria:** Unit tests pass for two sorted skills, missing
  `SKILL.md`, malformed YAML, missing description, and whitespace normalization.
- **Cautionary Points:** YAML `description: >` folds newlines; normalize with
  `replace(/\s+/g, " ").trim()`. Do not throw on a single malformed skill.
- **Implementation Suggestions:** Keep `renderSkillContent` pure and shared with
  `index.ts`; it replaces `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_SKILL_DIR}` and
  normalizes backslashes.
- **Testing Suggestions:** `tests/skills.test.mjs` with `mkdtempSync` fixtures.
- **Done When:** The module is tested and ≤300 lines.

#### Sub-Task 1.2: Switch `index.ts` to discovery

- **Status:** Completed (2026-10-26)
- **Objective:** Register skills from `discoverSkills` instead of
  `skills/manifest.json`.
- **Related Requirements:** R3, R9, R11
- **Dependencies and Preconditions:** Sub-Task 1.1.
- **In Scope for This Sub-Task:** Replace `loadSkills`'s manifest read with
  `discoverSkills(root)`; log warnings; render content; remove the
  "manifest missing — run pnpm manifest" warning; keep the machine-manifest
  logic untouched.
- **Out of Scope for This Sub-Task:** Deleting the manifest file or changing
  tests that expect a count.
- **Instructions:** Keep `loader` synchronous before `ctx.skill.transform`.
  Ensure the context inventory lists exactly the discovered skills.
- **Acceptance Criteria:** `tests/plugin.test.mjs` registers all current skills
  without a manifest and asserts the known skill IDs; a temp repo with a
  malformed skill logs a warning and still registers the valid ones.
- **Cautionary Points:** Do not confuse `src/commands/setup/manifest.mjs`
  (machine manifest) with the skills manifest.
- **Implementation Suggestions:** Keep `HARNESS_ID` and `CONTEXT_MARKER`
  unchanged.
- **Testing Suggestions:** Run `node --test tests/plugin.test.mjs` and add a
  discovery-warning case.
- **Done When:** The plugin no longer reads `skills/manifest.json`.

#### Sub-Task 1.3: Delete `skills/manifest.json` and `pnpm manifest`

- **Status:** Completed (2026-10-26)
- **Objective:** Remove the generated file and its generation command.
- **Related Requirements:** R2, R6
- **Dependencies and Preconditions:** Sub-Task 1.2.
- **In Scope for This Sub-Task:** `git rm skills/manifest.json`; remove
  `"manifest"` from `package.json`; delete `tests/build_manifest.test.mjs`; add
  `tests/skills.test.mjs` from 1.1; update any test/import that referenced the
  manifest.
- **Out of Scope for This Sub-Task:** Deleting `scripts/` (Phase 4).
- **Instructions:** Run `pnpm test` after deletion. `index.ts` must still
  register all skills.
- **Acceptance Criteria:** `skills/manifest.json` is absent; `pnpm manifest`
  fails as an unknown script; the plugin test passes.
- **Cautionary Points:** Do not delete the machine manifest or its schema.
- **Implementation Suggestions:** Use `git rm` so the deletion is tracked.
- **Testing Suggestions:** `pnpm test`, `node --test tests/skills.test.mjs`.
- **Done When:** No file or command generates registration metadata.

> **Phase 1 result (2026-10-26):** `src/lib/skills.mjs` and
> `tests/skills.test.mjs` added; `index.ts` discovers skills; `skills/manifest.json`
> and `tests/build_manifest.test.mjs` deleted; `pnpm manifest` removed.
> `pnpm test` (74 tests), `pnpm validate`, `pnpm typecheck`, `pnpm lint`,
> `pnpm deps`, `pnpm dup`, and `pnpm qa` pass.

### Phase 2 — Migrate install

#### Sub-Task 2.1: Add `src/commands/install.mjs`

- **Status:** Completed (2026-10-26)
- **Objective:** Move the OpenCode symlink installer into the CLI.
- **Related Requirements:** R4, R6
- **Dependencies and Preconditions:** None.
- **In Scope for This Sub-Task:** Port `scripts/install.mjs`; export
  `install(argv)`; support `--dry-run` and `--help`; resolve repo root from
  `src/commands/install.mjs`; keep the overlap/legacy/non-symlink behavior.
- **Out of Scope for This Sub-Task:** Deleting the old script (Phase 4) or
  changing OpenCode plugin loading.
- **Instructions:** Use `parseFlags` for `--dry-run`; keep `hasCommand` from
  `src/lib/exec.mjs`; compute `pluginsDir` from `OPENCODE_PLUGINS_DIR`,
  `XDG_CONFIG_HOME`/`APPDATA`, and `homedir()` exactly as before. Use
  `junction` on Windows.
- **Acceptance Criteria:** Unit tests with a temp plugins dir cover dry-run (no
  changes), actual symlink creation, legacy symlink removal, and refusal to
  replace a real directory.
- **Cautionary Points:** Symlink tests may need platform guards; skip on
  platforms where symlinks are unavailable. Never remove a non-symlink.
- **Implementation Suggestions:** Export a helper `planInstall(root, env,
  platform)` for tests; keep the console output human-readable.
- **Testing Suggestions:** `tests/install.test.mjs`.
- **Done When:** `node src/cli.mjs install --dry-run` prints the same plan and
  `node src/cli.mjs install` creates the link.

#### Sub-Task 2.2: Wire `install` into `src/cli.mjs` and `package.json`

- **Status:** Completed (2026-10-26)
- **Objective:** Make the new command reachable through the existing workflow.
- **Related Requirements:** R4, R6
- **Dependencies and Preconditions:** Sub-Task 2.1.
- **In Scope for This Sub-Task:** `src/cli.mjs` import/COMMANDS/HELP;
  `package.json` `harness:install` → `node src/cli.mjs install`; README/AGENTS
  command examples.
- **Out of Scope for This Sub-Task:** Removing `scripts/install.mjs`.
- **Instructions:** Keep `pnpm harness:install` as the user-facing command.
- **Acceptance Criteria:** `pnpm harness:install --dry-run` works; `node
  src/cli.mjs --help` lists `install`.
- **Cautionary Points:** `pnpm harness:install --dry-run` must pass the flag
  through to the CLI.
- **Implementation Suggestions:** Add the command next to `setup`/`doctor` in
  the help text.
- **Testing Suggestions:** Manual command + `tests/install.test.mjs`.
- **Done When:** The package workflow uses `src/` only.

### Phase 3 — Migrate validation

#### Sub-Task 3.1: Add `src/commands/validate.mjs`

- **Status:** Completed (2026-10-26)
- **Objective:** Move the repo-level validator into the CLI and remove manifest
  assumptions.
- **Related Requirements:** R5, R6, R9
- **Dependencies and Preconditions:** Sub-Task 1.1, 1.3.
- **In Scope for This Sub-Task:** Port `scripts/validate.mjs`; export
  `validateHarness(root)` and `validate(argv)`; use `discoverSkills` +
  `validateSkillFile`; remove `EXPECTED_SKILLS` and manifest checks; add a
  `skills/manifest.json` absence check (the file is already deleted); update
  line-limit roots to `src/` and `tests/`; keep README/AGENTS/package/index
  checks.
- **Out of Scope for This Sub-Task:** Deleting `scripts/` (Phase 4) or changing
  `validateSkillFile` behavior.
- **Instructions:** Keep the current ✓/✗ output and exit codes. Fail if no
  skills are discovered. Check package scripts for `scripts/` references. Keep
  the shell syntax check for any skill `.sh` (currently none).
- **Acceptance Criteria:** `node src/cli.mjs validate` passes on the current
  repo; a temp fixture with a missing description, a `scripts/` dir, or a
  manifest fails with a clear message.
- **Cautionary Points:** Do not weaken the 300-line/250-line limits. Do not
  make the validator depend on `process.cwd()`; accept a root argument.
- **Implementation Suggestions:** Split into `src/commands/validate/` if it
  exceeds 300 lines. Reuse `lineCount`, `walk`, `check` helpers.
- **Testing Suggestions:** `tests/validate.test.mjs` with temp fixtures.
- **Done When:** `pnpm validate` is equivalent or stronger than before.

#### Sub-Task 3.2: Wire `validate` into `src/cli.mjs` and `package.json`

- **Status:** Completed (2026-10-26)
- **Objective:** Make `pnpm validate` run the new command.
- **Related Requirements:** R5, R6
- **Dependencies and Preconditions:** Sub-Task 3.1.
- **In Scope for This Sub-Task:** `src/cli.mjs` import/COMMANDS/HELP;
  `package.json` `validate` → `node src/cli.mjs validate`.
- **Out of Scope for This Sub-Task:** Deleting `scripts/validate.mjs`.
- **Instructions:** Keep exit code propagation so `pnpm qa` stops on failure.
- **Acceptance Criteria:** `pnpm validate` passes; a deliberately broken fixture
  returns exit 1.
- **Cautionary Points:** `src/cli.mjs` is async; ensure the validator return
  code is propagated.
- **Implementation Suggestions:** Mirror `setup`/`doctor` dispatch.
- **Testing Suggestions:** Manual + `tests/validate.test.mjs`.
- **Done When:** The package workflow uses `src/` only.

### Phase 4 — Delete `scripts/` and update configs

#### Sub-Task 4.1: Delete the `scripts/` directory

- **Status:** Completed (2026-10-26)
- **Objective:** Remove the deprecated scripts after their replacements work.
- **Related Requirements:** R1, R2
- **Dependencies and Preconditions:** Sub-Tasks 2.2, 3.2.
- **In Scope for This Sub-Task:** `git rm scripts/build_manifest.mjs
  scripts/install.mjs scripts/validate.mjs`; remove the empty directory; extend
  `src/commands/validate.mjs` with the `scripts/` absence check now that the
  directory is gone.
- **Out of Scope for This Sub-Task:** Deleting `skills/manifest.json` (done),
  changing `src/commands/setup/`.
- **Instructions:** Run `pnpm validate`, `pnpm test`, and
  `pnpm harness:install --dry-run` after deletion.
- **Acceptance Criteria:** `scripts/` is absent; `pnpm validate` passes with
  the new absence check; no command fails.
- **Cautionary Points:** Do not delete `src/commands/setup/install.mjs` (the
  setup install planner); it is unrelated.
- **Implementation Suggestions:** Use `git rm` for tracked deletions.
- **Testing Suggestions:** `test ! -d scripts`, `pnpm validate`, `pnpm test`.
- **Done When:** The root tooling directory is gone.

#### Sub-Task 4.2: Update package and QA configs

- **Status:** Completed (2026-10-26)
- **Objective:** Remove `scripts` from tool inputs and stale commands.
- **Related Requirements:** R6
- **Dependencies and Preconditions:** Sub-Task 4.1.
- **In Scope for This Sub-Task:** `package.json` `deps` → `depcruise src tests
  index.ts`; `dup` → `jscpd src tests`; remove `manifest`; keep `qa` order.
  Check `biome.json`, `.dependency-cruiser.cjs`, `.jscpd.json`, `tsconfig.json`
  for `scripts` references (none expected beyond package commands).
- **Out of Scope for This Sub-Task:** Changing QA tool versions/configs.
- **Instructions:** Run `pnpm deps`, `pnpm dup`, and `pnpm qa` after editing.
- **Acceptance Criteria:** No config/command references `scripts/`; `pnpm qa`
  passes.
- **Cautionary Points:** `jscpd` and `depcruise` fail loudly on missing paths;
  update before running.
- **Implementation Suggestions:** Keep the `qa` chain unchanged otherwise.
- **Testing Suggestions:** `pnpm deps && pnpm dup && pnpm qa`.
- **Done When:** QA inputs are `src`, `tests`, and `index.ts` only.

### Phase 5 — Docs and downstream plan

#### Sub-Task 5.1: Update active documentation

- **Status:** Completed (2026-10-26)
- **Objective:** Remove references to deleted files/commands and document the
  new flow.
- **Related Requirements:** R8
- **Dependencies and Preconditions:** Phases 1–4.
- **In Scope for This Sub-Task:**
  - `AGENTS.md`: remove the manifest rule; remove `scripts/` from TDD/structure;
    add `src/lib/skills.mjs`, `src/commands/install.mjs`,
    `src/commands/validate.mjs`; remove `pnpm manifest` from workflows; update
    migration status.
  - `README.md`: describe discovery from `skills/*/SKILL.md`; remove
    `pnpm manifest`; update the layout tree; update the `install.mjs` reference;
    update authoring notes.
  - `docs/plans/index.md`: add this plan; note that it supersedes the
    `scripts/`-deprecation/manifest TODO.
  - `docs/TODO.md`: mark “eliminar skills/manifest.json…” as done when the plan
    completes.
  - `package.json` help/examples if any.
- **Out of Scope for This Sub-Task:** Rewriting historical `codex-compat` plans.
- **Instructions:** Grep for `pnpm manifest`, `scripts/`, `skills/manifest.json`,
  `EXPECTED_SKILLS`, and `build_manifest` after editing; only historical plans
  and generic skill-authoring examples may retain `scripts/`.
- **Acceptance Criteria:** No active doc tells users to run a deleted command or
  edit a deleted file.
- **Cautionary Points:** `skills/create-skill/SKILL.md` uses `scripts/` as a
  generic skill-structure example; keep it unless it explicitly describes this
  repository's root.
- **Implementation Suggestions:** Update the layout tree to show `src/` modules
  instead of `scripts/`.
- **Testing Suggestions:** `pnpm validate`; manual grep.
- **Done When:** Active docs match the new repository layout.

#### Sub-Task 5.2: Update the `read-document` plan

- **Status:** Completed (2026-10-26)
- **Objective:** Remove the manifest/generation workflow from the future
  `read-document` plan so it does not reintroduce the deleted files.
- **Related Requirements:** R8
- **Dependencies and Preconditions:** Sub-Task 5.1.
- **In Scope for This Sub-Task:** In `docs/plans/read-document/plan.md`:
  - replace `skills/manifest.json` registration with `discoverSkills`;
  - remove `pnpm manifest` steps and acceptance criteria;
  - replace `scripts/validate.mjs`/`EXPECTED_SKILLS` with
    `src/commands/validate.mjs`/discovery;
  - update R1/R14, Sub-Task 4.3, QA, and final checklist.
- **Out of Scope for This Sub-Task:** Implementing `read-document`.
- **Instructions:** Keep the plan's feature scope; only update repository
  integration references.
- **Acceptance Criteria:** The read-document plan contains no `pnpm manifest`,
  `skills/manifest.json`, or `EXPECTED_SKILLS` references.
- **Cautionary Points:** Execute this plan before `read-document` (or update
  read-document as its first task if it is already in progress).
- **Implementation Suggestions:** Use a targeted grep and edit.
- **Testing Suggestions:** `grep -n "manifest\|EXPECTED_SKILLS\|pnpm manifest"
  docs/plans/read-document/plan.md`.
- **Done When:** The downstream plan matches the new repository flow.

### Phase 6 — Verification

#### Sub-Task 6.1: Run the full QA suite

- **Status:** Completed (2026-10-26)
- **Objective:** Prove the deletion is green.
- **Related Requirements:** R9
- **Dependencies and Preconditions:** Phases 1–5.
- **In Scope for This Sub-Task:** `pnpm install` (lockfile unchanged), `pnpm
  validate`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm deps`, `pnpm
  dup`, `pnpm security`, `pnpm qa`.
- **Out of Scope for This Sub-Task:** Cross-platform manual install.
- **Instructions:** Fix failures rather than suppressing. Keep new modules ≤300
  lines.
- **Acceptance Criteria:** `pnpm qa` exits 0; `pnpm validate` reports the
  current skills; no command references `scripts/`.
- **Cautionary Points:** `pnpm qa` includes security scanners that may need
  network; record any unavailable scan.
- **Implementation Suggestions:** Run `validate`/`test` first, scanners last.
- **Testing Suggestions:** Commands above.
- **Done When:** The aggregate gate is green.

#### Sub-Task 6.2: Smoke-test install and plugin registration

- **Status:** Completed (2026-10-26)
- **Objective:** Verify the user-facing workflows after deletion.
- **Related Requirements:** R3, R4, R9
- **Dependencies and Preconditions:** Sub-Task 6.1.
- **In Scope for This Sub-Task:**
  - `pnpm harness:install --dry-run` prints the link plan.
  - `pnpm harness:install` creates/updates the symlink (in a temp
    `OPENCODE_PLUGINS_DIR`).
  - `node --test tests/plugin.test.mjs` registers every current skill.
  - `node src/cli.mjs --help` lists `install` and `validate`.
- **Out of Scope for This Sub-Task:** Restarting OpenCode.
- **Instructions:** Use a temp plugins directory for the actual symlink test.
  Do not modify the user's real OpenCode config.
- **Acceptance Criteria:** Dry-run changes nothing; actual install links to the
  repo root; plugin test registers all skills.
- **Cautionary Points:** On Windows, symlink/junction creation may need
  privileges; mark as manual.
- **Implementation Suggestions:** Use `OPENCODE_PLUGINS_DIR=$(mktemp -d)` for
  the smoke test.
- **Testing Suggestions:** Commands above.
- **Done When:** Install and plugin registration work without `scripts/` or the
  skills manifest.

#### Sub-Task 6.3: Final review and release note

- **Status:** Completed (2026-10-26)
- **Objective:** Review the diff and document the migration.
- **Related Requirements:** All
- **Dependencies and Preconditions:** Sub-Tasks 6.1–6.2.
- **In Scope for This Sub-Task:** Review deletions/edits; verify every
  requirement; note that `pnpm manifest` is gone and `pnpm harness:install` /
  `pnpm validate` now route through `src/cli.mjs`; recommend a semver bump;
  update `docs/plans/index.md` status.
- **Out of Scope for This Sub-Task:** Publishing/pushing.
- **Instructions:** Use `final-review` if available; record the verdict.
- **Acceptance Criteria:** All sub-tasks `Completed`; `pnpm qa` green; no active
  references to `scripts/` or `skills/manifest.json`.
- **Cautionary Points:** Keep historical plans as history; do not rewrite them.
- **Implementation Suggestions:** Include a short “what changed for users”
  section in the release note.
- **Testing Suggestions:** Re-run `pnpm qa` after final edits.
- **Done When:** The plan is signed off.

## Final Integration & Verification

> **Final result (2026-10-26):** `scripts/` and `skills/manifest.json` are gone;
> `pnpm harness:install` and `pnpm validate` route through `src/cli.mjs`;
> discovery/install/validate tests cover the new behavior. `pnpm test` passes
> 91 tests, `pnpm qa` exits 0, and a real install smoke test created the
> expected symlink in a temporary OpenCode plugins directory.

```bash
pnpm install
pnpm validate
pnpm test
pnpm typecheck
pnpm lint
pnpm deps
pnpm dup
pnpm qa
pnpm harness:install --dry-run
node src/cli.mjs --help
test ! -d scripts
test ! -f skills/manifest.json
```

Acceptance checklist:

- [x] `scripts/` is deleted; no active code/config/doc references it.
- [x] `skills/manifest.json` is deleted; `pnpm manifest` is gone.
- [x] `index.ts` discovers and registers every `skills/*/SKILL.md` in sorted
      order, with warnings for invalid entries.
- [x] `pnpm harness:install` routes to `src/cli.mjs install` and preserves
      dry-run/symlink/legacy/non-symlink behavior.
- [x] `pnpm validate` routes to `src/cli.mjs validate` and validates every
      discovered skill plus package/entry/line limits/docs.
- [x] The validator asserts `scripts/` and `skills/manifest.json` are absent.
- [x] `package.json` `deps`/`dup` no longer include `scripts`.
- [x] Tests cover discovery, install, and repo validation; the old
      `build_manifest` test is gone.
- [x] `AGENTS.md`, `README.md`, `docs/plans/index.md`, and `docs/TODO.md` are
      updated.
- [x] The `read-document` plan no longer references the deleted files.
- [x] `pnpm qa` passes.
- [x] `pnpm harness:install --dry-run` and the plugin registration smoke test
      pass.

## Resolved Decisions

1. **Malformed skill behavior:** resolved as warn+skip in `index.ts`;
   `pnpm validate` fails the build on the same file.
2. **Expected skill count:** resolved with no static list; discovery plus the
   plugin test's expected IDs catch missing skills.
3. **Historical plans:** `codex-compat` references are kept as historical
   context; active docs point to this plan.
