# Plans index

| Plan | Status | Scope | Date |
|---|---|---|---|
| [codex-compat](./codex-compat/plan.md) | In progress (Phase 0 Codex validated) | Native upload, MLLT paths, host context, validation, docs | 2026-10-25 |

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
  install script are required or planned. `scripts/` is deprecated.
- `codex-compat/sdd.md` is the requirements contract.
- Removing `skills/manifest.json` is out of scope for `codex-compat`; it stays
  tracked in `docs/TODO.md`.
