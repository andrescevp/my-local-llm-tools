# Phase 0 findings — Codex spike

- **Date:** 2026-10-25
- **Host:** `opencodex` → `codex-cli 0.164.0` (OpenCode Go provider)
- **Isolation:** `CODEX_HOME=/tmp/opencode/codex-home`
- **Spike:** `/tmp/opencode/codex-spike/`
- **Status:** Codex complete; Claude pending (`openclaude` not found)
- **Distribution decision (2026-10-26):** installation is native upload to
  OpenCode, Claude Code, or Codex. `scripts/` is deprecated. The marketplace
  experiments below are historical evidence only; no marketplace catalog or
  installer is part of the plan.

## Decisions

### D1 — Manifest shape (marketplace experiment historical)

- A local marketplace root must contain
  `.agents/plugins/marketplace.json`.
- `source.path` must be relative, start with `./`, and stay inside the
  marketplace root. `./` works when the plugin root is the marketplace root.
- The local loader did **not** recognize a plugin that had only a portable root
  `plugin.json` (no `skills` field).
- The loader recognized `.codex-plugin/plugin.json` with:

```json
{
  "name": "probe",
  "version": "1.0.0",
  "description": "Codex private plugin spike",
  "skills": "./skills/"
}
```

- `codex plugin marketplace add <plugin-root>` + `codex plugin list` showed
  `probe@local-self` as available; `codex plugin add probe@local-self` installed
  it into `CODEX_HOME/plugins/cache/local-self/probe/1.0.0`.

**Decision:** use `.codex-plugin/plugin.json` as the Codex manifest, with
`skills` only. Do not add a portable root `plugin.json` unless a later host
requires it; in 0.164.0 the root manifest takes precedence. Native upload is
the distribution; the marketplace steps are historical.

### D2 — Root token substitution

The installed cache kept the literal tokens in `skills/probe/SKILL.md`:

```md
node "${CLAUDE_PLUGIN_ROOT}/scripts/echo.mjs" claude-token
node "${PLUGIN_ROOT}/scripts/echo.mjs" plugin-token
```

Codex did not substitute either token at install time or at skill-read time.

**Decision:** use the Codex plugin hook resolver. No generated distribution is
needed for the normal path.

### D3 — Namespacing

`codex debug prompt-input` listed the skill as:

```text
probe:probe
```

The plugin name is the namespace. The global `~/.agents/skills` names are
separate.

**Decision:** no skill-name prefix or rename is applied. Codex namespaces
plugin skills natively.

### D4 — Namespacing fallback

Aborted: no prefixing or renaming requirement.

### D5 — Hook packaging and execution (historical, superseded)

- `.codex-plugin/plugin.json` `"hooks": "./hooks/hooks.json"` loaded the hook
  file.
- Plugin hooks received both environment variables, pointing at the installed
  cache:

```text
PLUGIN_ROOT=/tmp/opencode/codex-home/plugins/cache/local-self/probe/1.0.0
CLAUDE_PLUGIN_ROOT=/tmp/opencode/codex-home/plugins/cache/local-self/probe/1.0.0
```

- `SessionStart` ran and injected `additionalContext`. A model prompt asking
  for the root, hosts, and feature readiness answered correctly from the
  injected context.
- `PreToolUse` with matcher `Bash` ran and rewrote both tokens to the cache
  root. The model's command then executed successfully:

```text
echo claude-token
cwd /tmp/opencode/codex-spike/plugin
echo plugin-token
cwd /tmp/opencode/codex-spike/plugin
```

- Non-interactive testing required `--dangerously-bypass-hook-trust`. Real
  users must review and trust the plugin hooks.
- A root `plugin.json` present alongside `.codex-plugin/plugin.json` caused the
  `.codex-plugin` hooks not to run. Root `plugin.json` with its own `hooks`
  field also did not run hooks in this version.

**Decision (superseded):** hooks worked, but they are rejected because they
would require host-specific configuration and separate builds. The plan uses
the skill-level `MLLT_PLUGIN_ROOT` / `MLLT_SKILL_DIR` contract instead. The
manifest is `.codex-plugin/plugin.json` with `skills` only; no root
`plugin.json`.

## Claude status

`openclaude` is not present in PATH, not a shell function, and not found under
`/usr/local/bin`, `~/.local/bin`, or the inspected shell configs. `claude`
2.1.306 exists and is configured with the user's Anthropic auth, not the
OpenCode Go provider.

A Claude spike at `/tmp/opencode/claude-spike/plugin` was created with:

- `.claude-plugin/plugin.json` including a `"hooks": "./hooks/claude.json"`
  manifest key;
- `skills/probe/SKILL.md` with `${CLAUDE_PLUGIN_ROOT}`;
- `hooks/claude.json` with a `SessionStart` command;
- `hooks/probe.mjs` with a marker and `additionalContext` output.

`claude plugin validate /tmp/opencode/claude-spike/plugin` passed with warnings
(no README, no LICENSE, no icon). The `hooks` manifest key was accepted. Hook
execution was not tested because `openclaude` is missing.

Endpoint check: OpenCode Go exposes `https://opencode.ai/zen/go/v1` and
`/v1/models`. A GET to `/v1/messages` returned 404, but a POST with an empty
JSON body returned 400, so the Anthropic-shaped path likely exists. The
documented Claude Code setup uses `ANTHROPIC_BASE_URL="https://opencode.ai/zen/go/"`
with an Anthropic-compatible model such as `minimax-m3`. No `openclaude`
wrapper was available to confirm it end to end.

Pending:

- Locate or create the `openclaude` wrapper.
- Run the Claude `SessionStart` hook and confirm `additionalContext` injection.
- Confirm Claude does not cross-load the Codex hook file.

## Commands used (no secrets)

```bash
CODEX_HOME=/tmp/opencode/codex-home opencodex plugin marketplace add \
  /tmp/opencode/codex-spike/plugin
CODEX_HOME=/tmp/opencode/codex-home opencodex plugin list --available --json
CODEX_HOME=/tmp/opencode/codex-home opencodex plugin add probe@local-self
CODEX_HOME=/tmp/opencode/codex-home opencodex debug prompt-input "probe"
CODEX_HOME=/tmp/opencode/codex-home \
  MY_LOCAL_LLM_TOOLS_CONFIG_DIR=/tmp/opencode/codex-spike/config \
  opencodex exec --skip-git-repo-check --sandbox read-only \
  --dangerously-bypass-hook-trust --json \
  -C /tmp/opencode/codex-spike/plugin "<prompt>"
```
