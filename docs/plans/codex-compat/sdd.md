# SDD — Codex compatibility for my-local-llm-tools

- **Status:** Draft (approved for planning)
- **Date:** 2026-10-25
- **Scope:** repository-wide packaging, documentation, and host integration
- **Owners:** maintainers of `my-local-llm-tools`
- **Phase 0 findings:** [`phase0-findings.md`](./phase0-findings.md)

## 1. Problem

`my-local-llm-tools` is a skills-only plugin that works in OpenCode V2 and
Claude Code. The repository root is the plugin root and `skills/` is already in
the location required by the portable Agent Plugins layout.

Codex does not load the repository as a plugin today:

- there is no `.codex-plugin/plugin.json` compatibility manifest;
- there is no native upload flow documented for the three hosts;
- installation scripts under `scripts/` are deprecated and are not used;
- skills resolve the CLI through `${CLAUDE_PLUGIN_ROOT}`; Phase 0 proved Codex
  does not substitute that token (or `${PLUGIN_ROOT}`) in installed
  `SKILL.md`, so a skill-level `MLLT_*` path contract is required;
- Codex session context only comes from `AGENTS.md`, which is OpenCode-centric
  and does not include the setup machine manifest.

A read-only check with Codex CLI 0.164.0 (`codex debug prompt-input "hi"`)
confirmed that zero skills from this repository were discovered. Phase 0 then
validated a probe plugin, manifest discovery, and `<plugin>:<skill>`
namespacing with `opencodex`. The hook spike is historical; hooks are rejected
in favor of the `MLLT_*` path contract.

## 2. Goals

1. Install the repository natively in OpenCode, Claude Code, and Codex without
   moving or renaming `skills/`; no marketplace catalog and no install script.
2. Make every skill's CLI invocation resolve correctly under Codex.
3. Give Codex and Claude Code the same operational context that OpenCode
   receives, sourced from the setup machine manifest (hosts, models, tools,
   readiness).
4. Keep OpenCode V2 registration and Claude Code plugin behavior intact; the
   only OpenCode change is manifest-driven context injection in `index.ts`.
5. Do not prefix or rename skill names; host namespaces stay native.
6. Add automated validation so the three host integrations cannot drift
   silently.

## 3. Non-goals

- No MCP server. The toolbelt uses a local CLI and localhost HTTP only.
- No skill renames, no directory moves, no duplicate skill trees as the primary
  distribution.
- No rewrite of the OpenCode plugin API usage in `index.ts`.
- No removal of `skills/manifest.json` or `scripts/build_manifest.mjs`; that is
  tracked separately in `docs/TODO.md` and is out of scope here.
- No Codex/Claude hooks and no generated per-host builds. Path resolution is a
  skill-level contract.
- No new runtime dependency unless a phase proves it necessary.
- No automatic model pulls, server restarts, or destructive commands.

## 4. Hosts and discovery

| Host | Discovery | Install command | Root token |
|---|---|---|---|
| OpenCode V2 | `index.ts` registers `skills/*/SKILL.md` | native plugin upload | `${CLAUDE_PLUGIN_ROOT}` rendered by `index.ts` |
| Claude Code | `.claude-plugin/plugin.json` + root `skills/` | native plugin upload | `${CLAUDE_PLUGIN_ROOT}` native |
| Codex | `.codex-plugin/plugin.json` + root `skills/` | native plugin upload | `MLLT_*` derived from the `SKILL.md` path |

Codex also discovers standalone skills in `.agents/skills`, but that is **not**
the primary distribution path for this repository. It is only an optional
development convenience and must not create duplicate names.

## 5. Requirements

### Cross-host invariants

- **XH-01** `skills/` stays at the repository root; skill directories and names
  do not change.
- **XH-02** OpenCode V2 keeps registering all 10 skills and injecting its
  context block; existing tests keep passing.
- **XH-03** Claude Code keeps validating and loading the plugin through
  `.claude-plugin/plugin.json` and `${CLAUDE_PLUGIN_ROOT}`.
- **XH-04** No MCP server, no new runtime dependency, no secrets, no destructive
  automation.
- **XH-05** The machine manifest written by the `setup` skill
  (`manifestPath()`, schema 2) is the source of environment context: hosts,
  models, tools, and per-skill readiness. No host hardcodes endpoints, model
  lists, or readiness in its integration code. `skills/manifest.json` remains
  the OpenCode registration metadata and is out of scope for this plan.
- **XH-06** Script-using skills share one path contract (`MLLT_PLUGIN_ROOT`,
  `MLLT_SKILL_DIR`). No skill command hardcodes a host token, and no hooks or
  generated per-host builds are used for path resolution.

### Codex

- **CX-01** A `.codex-plugin/plugin.json` compatibility manifest declares
  `name`, `version`, `description`, and `skills: "./skills/"`. It is the active
  Codex manifest and its version matches `package.json` and
  `.claude-plugin/plugin.json`. A portable root `plugin.json` is not added in
  Phase 1 because Codex 0.164.0 prioritizes it and changes manifest
  precedence.
- **CX-02** The repository root is the native upload artifact: it contains
  `.codex-plugin/plugin.json`, `skills/`, `src/`, and the runtime files needed
  by the CLI. No marketplace catalog or installer script is required.
- **CX-03** Each host installs the plugin through its native upload flow;
  `scripts/` is deprecated and no install/package task is added.
- **CX-04** Every script-using skill declares the `MLLT_PLUGIN_ROOT` and
  `MLLT_SKILL_DIR` path contract. OpenCode renders both placeholders in
  `index.ts`; Claude Code maps them from `${CLAUDE_PLUGIN_ROOT}` and
  `${CLAUDE_SKILL_DIR}`; Codex derives them from the absolute `SKILL.md` path
  shown in the skill catalog. No hook and no per-host build is required.
- **CX-05** `AGENTS.md` carries stable guidance: host matrix, CLI entry point,
  safety rules, Codex sandbox/network guidance, and a pointer to the setup
  machine manifest. Dynamic hosts/models/readiness are injected from the
  manifest, not copied into `AGENTS.md`.
- **CX-06** Codex's skill catalog budget and duplicate-name behavior are
  documented: the budget limitation is explained and the plugin namespace is
  the collision strategy. No description rewrite is performed because
  `skills/manifest.json` regeneration depends on deprecated tooling.
- **CX-07** `ccreate-agent` can produce Codex subagent definitions (TOML in
  `~/.codex/agents/` or `.codex/agents/`) in addition to Markdown agent
  profiles.
- **CX-08** `autoskills` recognizes Codex artifacts (`.codex/config.toml`,
  `.codex/agents/*.toml`, `.codex/skills/`, `.codex-plugin/plugin.json`).
- **CX-09** README, layout documentation, Windows notes, and validation cover
  Codex.
- **CX-10** No skill-name prefixing or renaming is applied; Codex namespaces
  plugin skills natively as `<plugin>:<skill>`.
- **CX-11** No Codex or Claude Code hooks are required for path resolution or
  context. The plugin stays single-source; no generated per-host build is
  produced.
- **CX-12** OpenCode injects the setup machine manifest context from
  `index.ts`. Codex and Claude Code get a pointer to the same manifest in
  `AGENTS.md` / `CLAUDE.md`; the agent reads it on demand. No `SessionStart`
  hook is required.

### Quality

- **QA-01** `tests/harness_contract.test.mjs` checks the Codex manifest, native
  upload layout, version sync, skill-name/directory equality, and description
  budget. `scripts/validate.mjs` is deprecated and not a gate.
- **QA-02** A `tests/codex_compat.test.mjs` suite covers manifest parsing,
  version sync, renderer behavior, native upload layout, and budget.
- **QA-03** Versions are synchronized across `package.json`,
  `.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json`.
- **QA-04** The repository declares a license (MIT) consistently.

## 6. Acceptance criteria

| Requirement | Acceptance |
|---|---|
| XH-01 | `skills/` stays at the root; skill names do not change |
| XH-02 | `pnpm test` passes; OpenCode plugin test still asserts 10 skills and rendered tokens |
| XH-03 | `claude plugin validate .` passes; Claude install command documented |
| XH-05 | `index.ts` uses the setup machine manifest for hosts, models, tools, and readiness; no endpoint/model list is hardcoded; `skills/manifest.json` stays registration-only |
| XH-06 | All script-using skills use `MLLT_PLUGIN_ROOT` / `MLLT_SKILL_DIR`; no hooks or per-host builds |
| CX-01 | `.codex-plugin/plugin.json` parses with `skills` (no hooks); `name` is kebab-case; version equals the other manifests |
| CX-02 | The native upload layout contains `.codex-plugin/plugin.json`, `skills/`, and `src/`; no marketplace or installer exists |
| CX-03 | The plugin uploads natively in OpenCode, Claude Code, and Codex; no `scripts/` install command is used |
| CX-04 | In an isolated `CODEX_HOME`, a Codex session runs the OCR skill after deriving `MLLT_*` from the installed `SKILL.md`; no hook or generated distribution |
| CX-05 | `codex debug prompt-input "smoke"` shows the path contract and the setup manifest pointer, plus all 10 repo skills |
| CX-06 | The catalog budget limitation and namespace collision strategy are documented; no description rewrite is required |
| CX-07 | `ccreate-agent/references/codex-subagents.md` exists and is referenced by `ccreate-agent` |
| CX-08 | `autoskills` scan list includes the Codex artifacts |
| CX-09 | README has a Codex section and updated layout tree |
| CX-10 | No skill-name prefix or rename is applied; Codex lists skills as `<plugin>:<skill>` |
| CX-11 | No Codex/Claude hooks and no per-host build are added; the path contract is documented |
| CX-12 | OpenCode injects the setup manifest; Codex and Claude reach it via `AGENTS.md` / `CLAUDE.md`; no hook output is required |
| QA-01 | `pnpm test` fails on a missing/mismatched Codex manifest; no `scripts/` gate |
| QA-02 | New tests fail before implementation and pass after |
| QA-03 | A deliberate version mismatch makes validation fail |
| QA-04 | `LICENSE` exists and `package.json` declares MIT |

## 7. Constraints

- Follow repository rules in `AGENTS.md`: TDD for `src/`, `tests/`, and
  `index.ts`; files at most 300 lines; `SKILL.md` at most 250 lines. The
  deprecated `scripts/` directory is not modified or used.
- Use `pnpm`; do not add another lockfile.
- Keep `index.ts` behavior and the `my-local-llm-tools` namespace for OpenCode.
- Keep `${CLAUDE_PLUGIN_ROOT}` as the source token unless Phase 0 proves that a
  different token is strictly better for all three hosts.
- All Codex experiments run with an isolated `CODEX_HOME` under
  `/tmp/opencode/`; no changes to the user's real Codex config during planning.
- `index.ts` and the agent read the setup machine manifest; nothing rewrites it.
  Only `pnpm cli setup` writes it.
- No secrets in plans, docs, tests, or logs.

### Path contract policy

- Script-using skills use only `MLLT_PLUGIN_ROOT` and `MLLT_SKILL_DIR` in
  commands. They do not hardcode `${CLAUDE_PLUGIN_ROOT}`, `${PLUGIN_ROOT}`, or
  an install path.
- Each script-using skill includes a short resolution block:
  - **Claude Code:** map `MLLT_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"` and
    `MLLT_SKILL_DIR="${CLAUDE_SKILL_DIR}"`.
  - **OpenCode:** `index.ts` replaces the `MLLT_*` placeholders with the
    registered plugin and skill directories.
  - **Codex:** derive both values from the absolute `SKILL.md` path shown in
    the skill catalog; `MLLT_SKILL_DIR` is its directory and
    `MLLT_PLUGIN_ROOT` is two levels up.
- Hooks are not used for path resolution, context injection, rename, or
  content transformation.
- No generated per-host build is produced. The repository is the single
  source of truth.
- Context: OpenCode injects the setup machine manifest from `index.ts`; Codex
  reads `AGENTS.md`; Claude reads `CLAUDE.md`. Both files point to
  `manifestPath()` and instruct the agent to read it on demand.

## 8. Assumptions and open questions

- **Q1** Native upload layout: confirm what each host accepts (directory or
  zip) and the enablement step. The plugin needs `.codex-plugin/plugin.json`
  with `skills`; no marketplace or installer is involved.
- **Q2** Answered in Phase 0: Codex does not substitute
  `${CLAUDE_PLUGIN_ROOT}` or `${PLUGIN_ROOT}` in installed `SKILL.md`.
  CX-04's `MLLT_*` contract handles the path instead.
- **Q3** Answered in Phase 0: Codex namespaces plugin skills as
  `<plugin>:<skill>` (`probe:probe` in the spike). Claude Code already prefixes
  plugin skills; OpenCode prefixes via `index.ts`. No skill-name prefix is
  added.
- **Q4** Does the host's native upload flow load this repository directly, or
  does it require a zip? Validate in 1.3/1.6; do not assume a default path.
- **Q5** Codex may shorten descriptions when its catalog budget is exceeded.
  Document the limit; no description rewrite in this plan.
- **Q6** Aborted: no skill-name prefixing or renaming.
- **Q7** Can Codex reliably derive `MLLT_PLUGIN_ROOT` and `MLLT_SKILL_DIR` from
  the absolute `SKILL.md` path shown in the skill catalog? Validate with
  `opencodex` by running a script-using skill. If not, add a tiny bootstrap
  command to the skill directive; do not reintroduce hooks.

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Native upload layout not recognized by a host | Plugin not discovered | Validate each host's upload flow in 1.3/1.6; document the accepted layout |
| Codex does not substitute either root token | CLI commands fail | Phase 0 confirmed; use the `MLLT_*` path contract |
| Codex derives the wrong `MLLT_*` values | CLI commands fail | Validate with `opencodex`; keep the derivation instructions explicit in each skill |
| Claude does not follow the `MLLT_*` mapping | CLI commands fail | Keep the mapping block next to the command; validate with `openclaude` |
| Global duplicate names shadow plugin skills | Wrong skill version runs | Phase 0 confirmed `<plugin>:<skill>`; document one installation method |
| A root `plugin.json` changes manifest precedence | Plugin not discovered | Keep only `.codex-plugin/plugin.json` for Codex; revalidate if a root manifest is added |
| `MLLT_*` placeholders leak into a host | Commands use literal placeholders | Renderer/tests assert no unresolved `MLLT_*` in OpenCode output; directive for Claude/Codex |
| Version drift across three manifests | Inconsistent installs | Contract tests enforce equality |
| Codex sandbox blocks localhost | Runtime failures | Document `sandbox_workspace_write.network_access` and approval flow |

## 10. Definition of done

- All phases complete and reviewed.
- `pnpm test` passes; `scripts/` is not used as a gate.
- `claude plugin validate .` passes.
- The plugin uploads natively in Codex, `codex debug prompt-input` lists all 10
  repo skills, and a smoke session resolves the OCR skill through the `MLLT_*`
  path contract (no hooks, no installer, no generated distribution).
- Codex lists plugin skills as `<plugin>:<skill>`; no skill-name prefix or
  rename is applied.
- OpenCode still registers 10 skills and injects the setup machine manifest
  context from `index.ts`; Codex and Claude read the manifest via the
  `AGENTS.md` / `CLAUDE.md` pointer.
- No hooks or per-host builds are added.
- README documents the native upload path for the three hosts and the "one
  upload method" rule.
