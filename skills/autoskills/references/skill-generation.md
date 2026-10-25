> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Resolve the script/reference paths below against it.
>
> Authoring rules live in `create-skill`: naming, frontmatter, 1-500 character
> descriptions, 200/250 line budget, progressive disclosure, script design,
> evals, and validation. This file covers only project analysis and proposals.

## Extract, don't invent

Base skill content on actual project artifacts:

- **README/CONTRIBUTING** — Extract workflows, setup instructions, conventions
- **Config files** — Extract tool versions, flags, and project-specific settings
- **Code patterns** — Extract naming conventions, import patterns, error handling
- **CI/CD configs** — Extract build steps, deployment sequences, environment setup
- **Agent configs** — Extract existing instructions, extend them into skills
- **Issue/PR history** — If accessible, extract recurring issues and their resolutions

## Proposal format

Before writing files, show a table with one row per candidate skill:

| Column | Content |
|--------|---------|
| Skill name | Lowercase, hyphen-separated, derived from scope (`deploy-staging`, not `project-helper`) |
| Scope | One line describing what the skill covers |
| Source material | Concrete files/directories that informed it |
| Location | `.agents/skills/<name>/` by default |

For each row also draft the description, then wait for explicit approval.

## Scope decisions

- Default to **project-local** skills (`.agents/skills/<name>/`) since the content is project-specific.
- If the pattern is reusable across projects, propose `~/.agents/skills/<name>/` instead.
- If proposals overlap, merge them into one coherent skill rather than creating duplicates.
- If a need is a one-off command or policy note, a skill is the wrong tool — say so.

## Validation

Run the shared CLI validator after writing each skill:

```bash
node "$SKILL_DIR/../../src/cli.mjs" skill validate .agents/skills/<name>/SKILL.md
```

If validation fails, fix the file and rerun before reporting success.
