# Plans index

| Plan | Status | Scope | Date |
|---|---|---|---|
| [codex-compat](./codex-compat/plan.md) | In progress (Phase 0 Codex validated) | Native upload, MLLT paths, host context, validation, docs | 2026-10-25 |
| [read-document](./read-document/plan.md) | Planned (decisions resolved) | LibreOffice → Markdown/CSV, image analysis, PDF/OCR, schema 3 with `libre_office_path` | 2026-10-26 |
| [remove-scripts-manifest](./remove-scripts-manifest/plan.md) | Done | Delete `scripts/` + `skills/manifest.json`; dynamic discovery; CLI install/validate | 2026-10-26 |
| [extract-toolbox-presentations](./extract-toolbox-presentations/plan.md) | Done (U2Net model smoke pending) | Five JS-only skills: `convert-files`, `autoedit-with-gimp` (+macros), `autoedit-with-inkscape` (+vectorize), `image-background-removal` (+variants), `presentations-generator`; no scrapers | 2026-10-26 |

## Status legend

- **Planned** — requirements and phases defined, not started.
- **In progress** — at least one sub-task started.
- **Blocked** — waiting on a decision or external dependency.
- **Done** — all phases complete and reviewed.

## Notes

- `codex-compat` Phase 0 findings: [`codex-compat/phase0-findings.md`](./codex-compat/phase0-findings.md).
- Codex is validated with `opencodex`; Claude path-contract execution is
  pending `openclaude` (not found in PATH).
- The hook spike is historical. Path resolution now uses the skill-level
  `MLLT_PLUGIN_ROOT` / `MLLT_SKILL_DIR` contract; no hooks or per-host builds.
- No skill-name prefixing or renaming.
- Distribution is native upload to each host. No marketplace catalog and no
  distribution install script are required or planned. The root `scripts/`
  directory is removed by `remove-scripts-manifest`; `pnpm harness:install`
  remains a local development convenience backed by `src/cli.mjs`.
- `codex-compat/sdd.md` is the requirements contract.
- `remove-scripts-manifest` is complete: `scripts/` and `skills/manifest.json`
  were removed, skills are discovered from `skills/*/SKILL.md`, and
  `pnpm harness:install` / `pnpm validate` route through `src/cli.mjs`.
  `read-document` should use dynamic discovery (its plan is updated).
- `remove-scripts-manifest` superseded the `scripts/`-deprecation and
  `skills/manifest.json` items in `docs/TODO.md`.
- `extract-toolbox-presentations` is complete: the JS-only extraction adds
  `convert-files`, `autoedit-with-gimp`, `autoedit-with-inkscape`,
  `image-background-removal`, and `presentations-generator`. Scrapers are
  excluded. It owns the shared LibreOffice resolver and schema 3;
  `read-document` reuses them. The U2Net model is user-provided, so the
  real-model background-removal smoke test remains manual.
