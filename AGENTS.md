# AGENTS.md — my-local-llm-tools

Local-first AI toolbelt packaged as an OpenCode V2 plugin (skills only).

**This repository is the source of truth.** Skills are authored here, not
synced or copied from another checkout. Repository tooling is JavaScript (ESM)
and dependencies are managed with `pnpm`.

## Ground rules

- All eighteen skills are canonical here; edit `skills/<name>/` directly.
- Skills are discovered from `skills/*/SKILL.md` at plugin load; there is no
  registration manifest to generate or edit.
- All executable skill tooling lives in the single CLI at `src/`; do not add
  per-skill `scripts/` directories. Add a command module and wire it in
  `src/cli.mjs`.
- Files ≤ 300 lines (JavaScript/TypeScript). `SKILL.md` ≤ 250 lines (target 200).
- Frontmatter descriptions are 1-500 characters; the CLI validator
  (`src/commands/skill/validate.mjs`) enforces the limit.
- `autoskills` must not restate authoring rules: it delegates naming,
  frontmatter, description limits, progressive disclosure, and validation to
  the `ccreate-skill` skill.
- TDD: write or extend the `node:test` suite before implementing logic in
  `src/` or `index.ts`.
- Dependencies are detected by `setup`/`doctor`; skills must not embed install
  commands. Each runnable skill gates on `doctor --skill <name>` (add `--cached`
  to read the manifest without probing services).

## Structure

| Path | Content | Generated? |
|---|---|---|
| `package.json` / `pnpm-lock.yaml` | Package manifest and lockfile | lockfile generated |
| `index.ts` | `Plugin.define`: registers skills + context block | static |
| `src/cli.mjs` | Single CLI dispatcher | static |
| `src/commands/<domain>.mjs` | One module per skill domain | static |
| `src/commands/install.mjs` | Symlink plugin into OpenCode | static |
| `src/commands/validate.mjs` | Static harness validation | static |
| `src/commands/convert.mjs` | LibreOffice conversion | static |
| `src/commands/gimp.mjs` / `gimp/` | GIMP operations and macros | static |
| `src/commands/inkscape.mjs` | SVG export/edit/vectorize | static |
| `src/commands/remove-bg.mjs` / `remove-bg/` | U2Net background removal | static |
| `src/commands/presentation.mjs` / `presentation/` | PPTX/HTML/PDF engine | static |
| `src/commands/browser.mjs` / `browser/` | Persistent browser, selectors, recordings | static |
| `src/lib/browser.mjs` / `browser-db.mjs` | Browser session paths and SQLite | static |
| `src/commands/setup.mjs` / `doctor.mjs` | Manifest generation and diagnostics | static |
| `src/commands/setup/manifest.schema.json` | Formal manifest schema (JSON Schema 2020-12) | static |
| `src/lib/skills.mjs` | Skill discovery and frontmatter parsing | static |
| `src/lib/libreoffice.mjs` | Shared LibreOffice resolver | static |
| `skills/<name>/SKILL.md` | Skill instructions; discovered at load time | static |
| `tests/*.test.mjs` | `node:test` suites | static |

## Workflows

```bash
pnpm install
pnpm harness:install   # install/update the OpenCode plugin link
pnpm cli setup         # detect dependencies + write the machine manifest
pnpm cli doctor        # diagnose the harness (read-only)
pnpm validate          # static checks
pnpm typecheck         # OpenCode plugin API types
pnpm test              # node:test suites
pnpm qa                # lint + typecheck + deps + dup + tests + validate + security
```

QA tools: **Biome** (`biome.json`), **dependency-cruiser**
(`.dependency-cruiser.cjs`), **jscpd** (`.jscpd.json`), **osv-scanner**
(`pnpm-lock.yaml`), **semgrep** (`.semgrep.yml`). Never add a lockfile from
another package manager; `pnpm` is the only supported package manager.

### Migration status

All skill and repository tooling lives in `src/`; there are no Python or shell
executables under `skills/` and no root `scripts/` directory. Add new behavior
as a command module, not as a per-skill or root-level script.

## Platform constraints (OpenCode V2 plugin API)

- Entry is `Plugin.define({ id, setup })` with a default export; ESM
  (`"type": "module"`), `exports["."]` → `./index.ts`.
- Transforms are synchronous: load all external data before the callback;
  never `await` inside `ctx.skill.transform`.
- Skill registration: `editor.add({ id, name, description, location, content })`
  where `content` is the full `SKILL.md` text.
- Context injection: `ctx.session.hook("context", (event) =>
  event.system.push({ type: "text", text }))`; mutate drafts only.
- Agents cannot be registered from a plugin — this harness ships none.

## Skill conventions

- Each skill has YAML frontmatter with `name` (equal to the directory) and a
  trigger-oriented `description` of at most 500 characters.
- Bundled behavior is invoked through the CLI, e.g.
  `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" skill validate <path>`.
- Skills use the standard `${CLAUDE_PLUGIN_ROOT}` reference; Claude Code
  substitutes it and the OpenCode plugin renders it at registration.
  `${CLAUDE_SKILL_DIR}` is also supported for skill-local files.
- `openai-api-usage` is documentation-only: it must not add runtime code or
  duplicate endpoints that local servers do not implement.
- Local endpoints: Ollama `127.0.0.1:11434`, ComfyUI `127.0.0.1:8188`,
  llama.cpp `127.0.0.1:8080` (optional OpenAI-compatible server).

## Safety

- Never capture secrets, tokens, or credentials in docs, state files, or logs.
- Do not read `.env*`, `*credentials*`, or `*secrets*`.
- Ask before destructive/long-running actions: model pulls, deletes, server
  stops of processes you did not start.
