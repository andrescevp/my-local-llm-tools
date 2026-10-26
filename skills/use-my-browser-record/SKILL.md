---
name: use-my-browser-record
description: >
  Use this skill when a browser workflow must be repeated exactly — record the
  user's clicks, typed values, selections, and navigations in a headed browser,
  save the steps under ~/.mllt/browser, then replay them. Trigger on "record
  this browser task", "save these steps", "repeat this workflow", "replay my
  actions", or "automate this repeatedly". Gate with
  doctor --skill use-my-browser-record --cached.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: browser-action-recording
---

# Record and replay browser actions

Record a human-performed workflow once, then replay it with the same isolated
session. Step files live in `~/.mllt/browser/recordings`; metadata is also
stored in `~/.mllt/browser/selectors.sqlite`.

## Requirements

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill use-my-browser-record --cached
```

A headed browser is required during recording. The user performs the actions;
the CLI never asks for credentials.

## Record

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser record start \
  --name weekly-report \
  --url https://example.com \
  --timeout 900
```

- A headed window opens with the existing `default` session.
- The user performs the workflow normally.
- Close the browser window to stop; the steps are saved automatically.
- Use `--profile NAME` to record against another isolated profile.

Recorded step types:

| Type | Meaning |
|---|---|
| `navigate` | Main-frame navigation |
| `click` | Click on an element |
| `fill` | Typed/changed value |
| `select` | Dropdown selection |
| `press` | Enter key press |

## Inspect

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser record list
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser record show --name weekly-report
```

## Replay

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser replay \
  --name weekly-report --download-dir /abs/downloads
```

- Headless by default; add `--headed` to watch.
- Downloads triggered by the workflow are saved to `--download-dir` or
  `~/.mllt/browser/downloads`.
- A missing selector stops replay at that step with its index and type.

## Delete

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser record delete \
  --name weekly-report --yes
```

## Rules

- Record only workflows the user explicitly wants to repeat.
- Review a recording before replaying it; selectors can capture sensitive
  fields.
- Never store passwords in a recording. For login, use
  `browser session login` and record only the post-login workflow.
- Replay is best-effort: sites change, and a missing selector is a hard stop.
- Keep recordings local; do not upload them.
