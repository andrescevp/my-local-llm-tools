# AGENTS.md — cheap-ai-winth-local-tools

Local-first AI toolbelt packaged as an OpenCode V2 plugin (skills only).

**This repository is the source of truth.** Skills are authored here, not
synced or copied from another checkout.

## Ground rules

- All nine skills are canonical here; edit `skills/<name>/` directly.
- Never edit `skills/manifest.json` by hand — generate it with
  `python3 scripts/build_manifest.py`.
- Files ≤ 300 lines (Python/TypeScript). `SKILL.md` ≤ 250 lines (target 200).
- Frontmatter descriptions are 1-500 characters; `create-skill`'s validator
  enforces the limit.
- `autoskills` must not restate authoring rules: it delegates naming,
  frontmatter, description limits, progressive disclosure, and validation to
  the `create-skill` skill.
- TDD for logic changes in `scripts/`, `index.ts`, or skill CLIs: write/extend
  the test first, then implement.

## Structure

| Path | Content | Generated? |
|---|---|---|
| `package.json` | OpenCode V2 package manifest | static |
| `index.ts` | `Plugin.define`: registers skills + context block | static |
| `skills/<name>/SKILL.md` | Skill instructions | static |
| `skills/manifest.json` | Registration metadata (id/name/description) | yes — `build_manifest.py` |
| `scripts/build_manifest.py` | Regenerate `skills/manifest.json` | static |
| `scripts/install.sh` | Symlink plugin into OpenCode | static |
| `scripts/test.sh` | Run unit suites | static |
| `scripts/validate.py` | Static validation | static |
| `tests/` | Unit tests for repo scripts | static |

## Workflows

```bash
python3 scripts/build_manifest.py   # regenerate manifest after adding/removing a skill
./scripts/install.sh                # install/update the OpenCode plugin link
python3 scripts/validate.py         # static checks
bash scripts/test.sh                # unittest suites
./scripts/install.sh --dry-run      # preview links
```

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
- Bundled scripts resolve paths from their own `__file__`; docs use `$SKILL_DIR`
  and assume the skill loader exposes the folder location.
- The two server skills are deliberately conservative: they only manage
  processes they recorded, never delete models, and never auto-download.
- Local endpoints: Ollama `127.0.0.1:11434`, ComfyUI `127.0.0.1:8188`,
  llama.cpp `127.0.0.1:8080`.

## Safety

- Never capture secrets, tokens, or credentials in docs, state files, or logs.
- Do not read `.env*`, `*credentials*`, or `*secrets*`.
- Ask before destructive/long-running actions: model pulls, deletes, server
  stops of processes you did not start.
