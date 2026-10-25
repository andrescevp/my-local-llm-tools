# Script Design Rules for Skills

When the agent independently reinvents the same logic across runs, bundle a tested script in `scripts/`.

## One-off commands

For existing tools, reference them directly in `SKILL.md`:

```bash
uvx ruff@0.8.0 check .
npx eslint@9 --fix .
```

Pin versions. State prerequisites in `SKILL.md`.

## Self-contained scripts

Use PEP 723 for Python scripts with inline dependencies:

```python
# /// script
# dependencies = ["beautifulsoup4>=4.12,<5"]
# requires-python = ">=3.10"
# ///

from bs4 import BeautifulSoup
```

Run with `uv run scripts/script.py` — creates isolated env, installs deps, runs.

## Script design rules

- **No interactive prompts** — agents run in non-interactive shells. Accept input via flags, env vars, or stdin.
- **Document with `--help`** — agents read help output to learn the interface.
- **Helpful errors** — say what went wrong, what was expected, what to try.
- **Structured output** — prefer JSON/CSV over free-form text. Send data to stdout, diagnostics to stderr.
- **Idempotent** — agents may retry. "Create if not exists" is safer than "fail on duplicate."
- **Meaningful exit codes** — distinct codes for different failure types, documented in `--help`.
- **Dry-run support** — for destructive operations, add `--dry-run` flag.
- **Predictable output size** — default to summaries/reasonable limits; support `--output` for large output.

## Referencing scripts from SKILL.md

List available scripts in the main skill file:

```markdown
## Available scripts

- **`scripts/validate.sh`** — Validates configuration files
- **`scripts/process.py`** — Processes input data
```

Run with relative paths from the skill directory root:

```bash
bash scripts/validate.sh "$INPUT_FILE"
python3 scripts/process.py --input results.json
```
