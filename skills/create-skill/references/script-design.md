# Script Design Rules for Skills

When the agent independently reinvents the same logic across runs, add it to the
repository's unified CLI in `src/` instead of bundling a per-skill script.

## One-off commands

For existing tools, reference them directly in `SKILL.md`:

```bash
pnpm dlx eslint@9 .
pnpm dlx prettier@3 --write .
```

Pin versions. State prerequisites in `SKILL.md`.

## Unified CLI modules

Skill behavior lives in `src/commands/<domain>.mjs`, wired through
`src/cli.mjs`. Shared helpers go in `src/lib/`. Modules are plain ESM:

```js
#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { parse } from "yaml"

export function run(argv) {
  // parse flags explicitly; never prompt interactively
  return 0
}
```

Run with `node src/cli.mjs <domain> <action>` (or `pnpm cli …`). Declare any
third-party dependency in `package.json`; never vendor code.

## Script design rules

- **No interactive prompts** — agents run in non-interactive shells. Accept input via flags, env vars, or stdin.
- **Document with `--help`** — agents read help output to learn the interface.
- **Helpful errors** — say what went wrong, what was expected, what to try.
- **Structured output** — prefer JSON/CSV over free-form text. Send data to stdout, diagnostics to stderr.
- **Idempotent** — agents may retry. "Create if not exists" is safer than "fail on duplicate."
- **Meaningful exit codes** — distinct codes for different failure types, documented in `--help`.
- **Dry-run support** — for destructive operations, add `--dry-run` flag.
- **Predictable output size** — default to summaries/reasonable limits; support `--output` for large output.

## Referencing commands from SKILL.md

List the CLI actions in the main skill file:

```markdown
## CLI

- `skill validate <SKILL.md>` — checks the skill against the spec
- `ollama status` — health, version, model counts
```

Run with the repo-root CLI:

```bash
pnpm cli skill validate skills/<name>/SKILL.md
```
