## Content principles

### Start from real expertise, not generic knowledge

- Interview the user first; keep every detail they provide — grilling for purpose, triggers, and edge cases beats guessing
- Extract from real tasks: what steps worked, what corrections were needed, what edge cases appeared
- Synthesize from existing artifacts: runbooks, API specs, code review comments, failure cases
- Focus on what the agent *wouldn't* know without the skill
- Cut what the agent already knows

### Spend context wisely

- Keep `SKILL.md` under 200 lines (hard cap: 250). Split into `references/` if larger.
- Add what the agent lacks, omit what it knows
- Aim for moderate detail — concise stepwise guidance with working examples
- Use progressive disclosure: move detailed procedures to `references/` and tell the agent **when** to use each file

### Calibrate control

- **Be prescriptive** when operations are fragile or consistency matters
- **Give freedom** when multiple approaches are valid — explaining *why* is effective
- **Provide defaults, not menus** — pick a default approach, mention alternatives briefly
- **Favor procedures over declarations** — teach *how to approach*, not *what to produce*

### Instruction patterns

Use these patterns as needed in the skill body:

**Gotchas section** — environment-specific facts that defy assumptions:

```markdown
## Gotchas
- The `users` table uses soft deletes. Queries must include `WHERE deleted_at IS NULL`.
```

**Checklists for multi-step workflows:**

```markdown
Progress:
- [ ] Step 1: Analyze input
- [ ] Step 2: Process data
- [ ] Step 3: Validate output
```

**Validation loops:**

```markdown
1. Make your edits
2. Run validation: `scripts/validate.py`
3. If validation fails, fix and run again
4. Only proceed when validation passes
```

**Plan-validate-execute for batch/destructive operations:**

```markdown
1. Create plan: `scripts/analyze.sh input > plan.json`
2. Validate plan: `scripts/validate.sh plan.json`
3. If validation fails, revise and re-validate
4. Execute: `scripts/execute.sh plan.json`
```

## SKILL.md body conventions

After frontmatter, start the body directly with core content:

- NO `## What I do` / `## When to use me` — compress both into the frontmatter `description`
- Use: workflows, rules, gotchas, checklists, validation loops, script/reference pointers
- Keep instructions actionable and specific. Avoid vague language.

Reference triggers, available scripts, and the validation checklist live in the main `SKILL.md`, not here.
