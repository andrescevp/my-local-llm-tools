---
name: create-skill
description: >
  Use this skill when creating, updating, or evaluating agent skills — interview
  the user first to extract maximum information with minimal words, then write
  lean SKILL.md files with valid frontmatter, trigger-optimized
  descriptions, bundled scripts, and eval harnesses. Trigger on new skill
  creation, improving an existing skill's instructions or description, adding
  scripts, or setting up evaluation cases — even if they just say "make a skill
  for X" without mentioning skill creation explicitly.
---

# create-skill

Create, optimize, and evaluate agent skills. Convention: the frontmatter `description` compresses "What I do" + "When to use me"; the body never repeats them.

## Interview first (mandatory)

Before creating or updating, grill the user to extract the most information with the fewest words. Ask one compact batch of questions, then follow up only on real gaps. Keep every detail — never discard or silently generalize user specifics.

Core questions (adapt to the case):

- **Purpose**: What must the skill DO? Input, output, failure modes?
- **Knowledge**: What must the agent know that it can't infer (gotchas, conventions, constraints, environment facts)?
- **Scope**: Which clients (opencode, copilot, antigravity)? Project or global? Who runs it?
- **Triggers**: Which phrases/scenarios must activate it? Which near-misses must NOT?
- **Success**: How do we know it works (tests, checklists, evals, sample outputs)?
- **Source material**: Existing docs, runbooks, specs, code, past feedback to mine?
- **Name/path**: Preferred name, or let me propose one; target directory.
- **Update case**: What changed, what broke, what must be preserved?

Write terse, information-dense prose — minimal words, all information kept.

## Skill name rules

- Must be 1-64 characters
- Must be lowercase alphanumeric with single hyphen separators
- Must not start or end with `-`
- Must not contain consecutive `--`
- Must match the directory name containing `SKILL.md`
- Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`
- Convert underscores to hyphens if the user provides `snake_case`

## Directory structure

Create one folder per skill and put `SKILL.md` inside:

- Project: `${projectRoot}/.agents/skills/<name>/SKILL.md`
- Global: `~/.agents/skills/<name>/SKILL.md`

Supporting directories (optional, inside the skill directory):

- `scripts/` — executable scripts bundled with the skill (this repo centralizes them in `src/cli.mjs` instead)
- `references/` — detailed reference material for progressive disclosure
- `assets/` — templates, sample files, or other resources
- `evals/` — evaluation test cases and input files

## Skeleton constraint (mandatory)

Every skill **must** keep its main `SKILL.md` lean using progressive disclosure:

- **Target**: main file under **200 lines** (hard cap: 250 lines)
- **Move to `references/`**: detailed procedures, eval methodology, script design rules, optimization loops, exhaustive examples — anything not needed for the basic workflow
- **Tell the agent when to load**: each reference file must have a clear trigger description in the main SKILL.md
- **Self-enforcing**: this skill applies this constraint to itself

The main file must contain:
1. Frontmatter with a description that compresses capabilities + triggers (replaces any `What I do` / `When to use me` sections — never add those headers)
2. Core rules (naming, structure, frontmatter)
3. Creation/update workflow (interview first)
4. Reference triggers (when to use each `references/` file)
5. Available scripts (if any)
6. Validation checklist

Directory layout after split:
```
skills/<name>/
  SKILL.md              ← Lean: workflow, rules, reference triggers (~200 lines)
  references/           ← Detailed guides loaded on specific triggers
  scripts/              ← Bundled scripts (this repo: src/cli.mjs instead)
  evals/                ← Test cases (if any)
```

## Frontmatter template

Every `SKILL.md` must start with YAML frontmatter:

```yaml
---
name: <skill-name>
description: >
  <capabilities + triggers compressed: "Do X ... Use this skill when ...">
  <Focus on user intent, not implementation. List contexts where the skill applies.>
  <Even if they don't explicitly mention the domain directly.>
  <Max 500 characters (validator-enforced)>
---
```

Description rules (critical for triggering):

- Must carry BOTH capabilities (what the skill does) and triggers (when to use).
- Use imperative phrasing: "Use this skill when..." not "This skill does..."
- Focus on user intent; err on the side of being pushy; list contexts
- Max 500 characters (enforced by `validate_skill.py`)
- Test with should-trigger and should-not-trigger queries

## Creation workflow

1. **Interview the user** — ask the mandatory questions above; mine any provided source material.
2. **Propose a valid skill name** — apply the naming rules above.
3. **Draft the compressed description** — capabilities + triggers, imperative phrasing, max 500 chars.
4. **Write the SKILL.md body** — start directly with core rules/workflow; no `What I do` / `When to use me` headers. Split over-200-line detail into `references/`.
5. **Show the draft and confirm** — present the full skill; adjust on feedback.
6. **Write the file** — create the directory and write `SKILL.md` at the agreed path (ask if ambiguous).
7. **Verify** — run the checklist below and `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" skill validate <path>`.

## Update workflow

When updating an existing skill, interview first (same questions), then:

1. Diff the current `SKILL.md` against the new information; apply minimal changes.
2. Update the description if capabilities or triggers changed.
3. Remove `## What I do` / `## When to use me` if present; compress into the description.
4. Re-run validation (and evals when behavior changed).

## Reference triggers

| Reference | When to use | File |
|-----------|-------------|------|
| Content principles & instruction patterns | Writing detailed skill body content, calibrating control, choosing patterns | `references/content-principles.md` |
| Description optimization | User asks to optimize/improve a description, or triggers are unreliable | `references/description-optimization.md` |
| Script design rules | Bundling scripts with a skill | `references/script-design.md` |
| Evaluating output quality | Setting up evals, grading, benchmarking a skill | `references/evaluating-output.md` |

Limits in this file are canonical: reference files must defer to them, never restate different values.

## CLI

Skill tooling lives in the repository's single CLI (`src/cli.mjs`); there are no
per-skill scripts. Run it from the repo root with `pnpm cli …` or directly:

- **`skill validate <SKILL.md>`** — name regex, frontmatter, description cap,
  banned sections, vague language, line count.
- **`skill triggers <queries.json> <skill_name> [runs]`** — trigger rates against
  eval queries.
- **`skill evals <evals.json> <SKILL.md> <workspace_dir> [--baseline]`** — run
  evaluation cases with/without the skill.

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" skill validate skills/<name>/SKILL.md
```

## Validation checklist

Before writing the file, verify:

- [ ] `name` matches regex `^[a-z0-9]+(-[a-z0-9]+)*$` and the directory name
- [ ] `description` is 1-500 chars, imperative, compresses capabilities + triggers
- [ ] Frontmatter starts at line 1; only valid fields
- [ ] Directory structure is `<base>/skills/<name>/SKILL.md`
- [ ] Main file under 250 lines (target 200); detail in `references/` with clear triggers
- [ ] Content avoids teaching what the agent already knows; gotchas included
- [ ] Scripts (if any) have no interactive prompts and expose `--help`