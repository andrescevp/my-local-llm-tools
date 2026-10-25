# AGENTS.md — cheap-ai-winth-local-tools

Local-first AI toolbelt packaged as an OpenCode V2 plugin (skills only).

**This repository is the source of truth.** Skills are authored here, not
synced or copied from another checkout. Repository tooling is JavaScript (ESM)
and dependencies are managed with `pnpm`.

## Ground rules

- All nine skills are canonical here; edit `skills/<name>/` directly.
- Never edit `skills/manifest.json` by hand — generate it with
  `pnpm manifest` (`scripts/build_manifest.mjs`).
- All executable skill tooling lives in the single CLI at `src/`; do not add
  per-skill `scripts/` directories. Add a command module and wire it in
  `src/cli.mjs`.
- Files ≤ 300 lines (JavaScript/TypeScript). `SKILL.md` ≤ 250 lines (target 200).
- Frontmatter descriptions are 1-500 characters; the CLI validator
  (`src/commands/skill/validate.mjs`) enforces the limit.
- `autoskills` must not restate authoring rules: it delegates naming,
  frontmatter, description limits, progressive disclosure, and validation to
  the `create-skill` skill.
- TDD: write or extend the `node:test` suite before implementing logic in
  `src/`, `scripts/`, or `index.ts`.

## Structure

| Path | Content | Generated? |
|---|---|---|
| `package.json` / `pnpm-lock.yaml` | Package manifest and lockfile | lockfile generated |
| `index.ts` | `Plugin.define`: registers skills + context block | static |
| `src/cli.mjs` | Single CLI dispatcher | static |
| `src/commands/<domain>.mjs` | One module per skill domain | static |
| `skills/<name>/SKILL.md` | Skill instructions | static |
| `skills/manifest.json` | Registration metadata (id/name/description) | yes — `build_manifest.mjs` |
| `scripts/build_manifest.mjs` | Regenerate `skills/manifest.json` | static |
| `scripts/install.mjs` | Symlink plugin into OpenCode | static |
| `scripts/validate.mjs` | Static validation | static |
| `tests/*.test.mjs` | `node:test` suites | static |

## Workflows

```bash
pnpm install
pnpm manifest          # regenerate manifest after adding/removing a skill
pnpm harness:install   # install/update the OpenCode plugin link
pnpm validate          # static checks
pnpm test              # node:test suites
pnpm qa                # lint + deps + dup + tests + validate + security
```

QA tools: **Biome** (`biome.json`), **dependency-cruiser**
(`.dependency-cruiser.cjs`), **jscpd** (`.jscpd.json`), **osv-scanner**
(`pnpm-lock.yaml`), **semgrep** (`.semgrep.yml`). Never add a lockfile from
another package manager; `pnpm` is the only supported package manager.

### Migration status

All skill tooling is migrated to `src/`; there are no Python or shell
executables under `skills/`. Add new behavior as a command module, not as a
per-skill script.

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
  `node "$SKILL_DIR/../../src/cli.mjs" skill validate <path>`.
- Docs use `$SKILL_DIR` and assume the skill loader exposes the folder location.
- The two server skills are deliberately conservative: they only manage
  processes they recorded, never delete models, and never auto-download.
- Local endpoints: Ollama `127.0.0.1:11434`, ComfyUI `127.0.0.1:8188`,
  llama.cpp `127.0.0.1:8080`.

## Safety

- Never capture secrets, tokens, or credentials in docs, state files, or logs.
- Do not read `.env*`, `*credentials*`, or `*secrets*`.
- Ask before destructive/long-running actions: model pulls, deletes, server
  stops of processes you did not start.
