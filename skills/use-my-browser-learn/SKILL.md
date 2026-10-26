---
name: use-my-browser-learn
description: >
  Use this skill when a browser task will be repeated and its CSS selectors
  should be learned or taught once from saved HTML — store selectors in the
  plugin's SQLite database for stable extraction. Trigger on "learn this
  selector", "teach the browser this field", "remember this element", or "make
  this extraction repeatable". Uses linkedom, not a browser, and SQLite. Gate
  with doctor --skill use-my-browser-learn --cached.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: browser-selector-learning
---

# Learn browser selectors from HTML

Selectors are learned assets, not hard-coded guesses. The learner parses saved
HTML with **linkedom** (no browser process) and stores selectors in
`~/.mllt/browser/selectors.sqlite`. Later runs use them without a model call.

## Requirements

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill use-my-browser-learn --cached
```

No Playwright browser is launched by this skill. Use `use-my-browser` to save a
page first when the site needs JavaScript or a login.

## Capture HTML first (optional for static pages)

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser page \
  --url https://example.com --out /abs/pages/example
# writes /abs/pages/example/page.html
```

For a static page, `--url` alone is enough: the learner fetches the HTML with
`fetch`, not a browser.

## Learn from a value

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser learn add \
  --html /abs/pages/example/page.html \
  --field intro \
  --value "This domain is for use in documentation examples"

# Static URL alternative
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser learn add \
  --url https://example.com \
  --field intro \
  --value "This domain is for use in documentation examples"
```

The page key defaults to the URL hostname when `--url` is used; with `--html`
use `--page NAME` to set the key. The learner picks the smallest element
containing the value and derives a stable selector.

## Teach an exact selector

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser learn add \
  --html /abs/pages/example/page.html \
  --field title \
  --selector "h1" \
  --mode text
```

## Inspect and test

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser learn list
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser learn stats
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser learn test \
  --html /abs/pages/example/page.html --field intro
```

Each row includes `page`, `field`, `selector`, `confidence`, `success_count`,
`fail_count`, `source`, and timestamps.

## Remove

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser learn remove --id 3
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" browser learn reset --page example.com --yes
```

## Workflow

- [ ] Save the page HTML with `use-my-browser` when it is dynamic or logged in.
- [ ] Learn with `--html` + `--value`, or teach `--selector`.
- [ ] Test the field immediately.
- [ ] Use `browser extract --page KEY --field NAME` in later runs.
- [ ] Re-learn when the site changes.

## Rules

- **No browser launch:** the learner only fetches/reads HTML and parses it with
  linkedom.
- Prefer stable attributes: `data-testid`, `aria-label`, `name`, stable IDs.
- Never learn a destructive action selector from a guess; test it first.
- Keep credentials and private tokens out of field values and notes.
- The database is local: no selector or page content leaves the machine.
