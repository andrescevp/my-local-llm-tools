---
name: autoskills
description: >
  Use this skill when analyzing a project's structure, docs, configs, code, and
  agent settings to propose project-specific skills — scanning artifacts for
  conventions, workflows, and gotchas, then presenting a shortlist with names,
  descriptions, and scope for approval before authoring. Trigger when
  bootstrapping skills for a new project, onboarding, or auditing for skillable
  patterns, including "set up skills for this project" or "what skills would
  help here?" — ask for root/scope if ambiguous.
---

# autoskills

Analyze a project, propose a shortlist of skills, then hand authoring to
`create-skill`, the single source of truth for naming, frontmatter, description
limits, progressive disclosure, scripts, evals, and validation. Never restate
those rules here.

## 1. Discover project context

Scan the project root and common locations for these files. Read the ones that exist:

**Documentation:**
- `README.md`, `README.rst`, `docs/`, `CONTRIBUTING.md`, `ARCHITECTURE.md`
- `.github/` (workflows, issue templates, PR templates)
- Any `*.md` files in the project root

**Config files:**
- `package.json`, `pyproject.toml`, `setup.py`, `requirements.txt`, `Gemfile`, `Cargo.toml`, `go.mod`
- `Makefile`, `justfile`, `Taskfile.yml`
- `docker-compose.yml`, `Dockerfile`, `docker-compose.*.yml`
- `tsconfig.json`, `vite.config.*`, `webpack.config.*`, `.eslintrc*`, `.prettierrc*`
- `.pre-commit-config.yaml`, `ruff.toml`, `mypy.ini`
- `pytest.ini`, `jest.config.*`, `vitest.config.*`
- `terraform.tf`, `Pulumi.yaml`, `serverless.yml`
- `.env.example`, `.env.template`

**Agent configs:**
- `.opencode/` (skills, settings)
- `.agents/` (skills, config)
- `AGENTS.md`, `CLAUDE.md`, `AGENT.md`, `.cursorrules`
- `.github/copilot-instructions.md`

**Code structure:**
- Source directories (`src/`, `lib/`, `app/`, `packages/`, `services/`)
- Test directories (`tests/`, `test/`, `__tests__/`, `spec/`)
- Entry points, CLI definitions, main modules

## 2. Identify skillable patterns

From the artifacts, extract patterns that would benefit from dedicated skills:

**Deployment/CI patterns:**
- Custom deployment scripts, release processes, environment management
- CI/CD pipeline steps that aren't obvious (e.g., specific build flags, artifact handling)
- Database migration workflows, seed data procedures

**Code conventions:**
- Project-specific naming conventions, file organization, import patterns
- Custom linting rules, code review expectations from `.github/CODEOWNERS` or PR templates
- Testing patterns (fixtures, mocking conventions, test file naming)

**API/Service patterns:**
- Internal API conventions, authentication flows, error handling patterns
- Service communication patterns (gRPC, GraphQL schemas, message queues)
- Database schemas, migration conventions, query patterns

**Domain-specific workflows:**
- Data processing pipelines, ETL steps, report generation
- Content management workflows, translation/localization processes
- Monitoring, alerting, incident response procedures

**Agent-specific knowledge:**
- Project-specific commands, scripts, and their flags
- Known gotchas (soft deletes, ID mapping between services, health vs readiness endpoints)
- Configuration that the agent wouldn't know without being told

## 3. Ask for missing context

If the analysis reveals gaps, ask the user:

- "I see you use X tool — are there any project-specific flags or conventions I should capture?"
- "The README mentions a deployment process but doesn't detail the steps. Can you walk me through it?"
- "I noticed multiple services — are there cross-service conventions or gotchas?"
- "Are there any recurring issues or mistakes that a skill could help prevent?"

## 4. Propose skills for approval

Present a summary table before creating anything:

```
Proposed skills for <project-name>:

| # | Skill name | Scope | Source material |
|---|-----------|-------|----------------|
| 1 | deploy-staging | Deployment process for staging env | README.md, deploy.sh, .github/workflows/deploy.yml |
| 2 | api-conventions | Internal API patterns and auth | src/api/, docs/api.md, PR templates |
| 3 | test-patterns | Testing conventions and fixtures | tests/, pytest.ini, conftest.py |

Total: 3 skills proposed. Approve all, select specific ones, or suggest changes?
```

For each proposed skill, include:

- **name** — Valid skill name (lowercase, hyphen-separated)
- **description** — Draft trigger-focused description
- **scope** — What it covers in one line
- **source** — Which project files informed it
- **location** — Where it will be written (default: project-local `.agents/skills/<name>/`)

Wait for approval, rejection, or modification before writing any files.

## 5. Author approved skills with create-skill

For each approved skill:

1. Load the `my-local-llm-tools:create-skill` skill and run its interview and
   creation workflow.
2. Ground content in this project's actual artifacts, not generic knowledge.
3. Write the approved file to `.agents/skills/<name>/SKILL.md` unless the user chose another scope.
4. Validate the result with the shared validator:

   ```bash
   node "$SKILL_DIR/../../src/cli.mjs" skill validate .agents/skills/<name>/SKILL.md
   ```

   `src/cli.mjs` is the repository's single CLI; `create-skill` defines the rules it enforces.

## 6. Verify and report

After creation, report:

```
Created N skills for <project-name>:

✓ deploy-staging — .agents/skills/deploy-staging/SKILL.md (validated)
✓ api-conventions — .agents/skills/api-conventions/SKILL.md (validated)
✓ test-patterns — .agents/skills/test-patterns/SKILL.md (validated)

Run the shared validator on any skill to re-check:
  node "$SKILL_DIR/../../src/cli.mjs" skill validate .agents/skills/deploy-staging/SKILL.md
```

## Reference

| When to use | File |
|-------------|------|
| Extraction heuristics, proposal format, scope decisions, approval gate | `references/skill-generation.md` |
