---
name: speak
description: >
  Use this skill when opencode needs to speak text aloud, say something out loud,
  read output aloud, announce results verbally, or when the user says "speak", "say", "read aloud",
  "decir", "hablar", or mentions voice/tts/audio output.
---

> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Run the CLI as `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" speak ...`.

Always speak in system language. If the input text is not in system language, translate it before speaking.

## Requirements

Check `doctor --skill speak --cached` before running (piper + voice model for
the system language, with English fallback). If it fails, run `setup` or
`node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" voice ensure`.

## Usage

> CLI location: `src/cli.mjs` at the repository root.

```bash
# Speak a phrase in the system language
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" speak "Hello, this is the system voice"

# Download/refresh the voice for the system language
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" voice ensure

# Speak from stdin (long text)
cat /tmp/response.txt | node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" speak -q
```

Windows PowerShell, from the repository root:

```powershell
Get-Content .\response.txt | pnpm cli speak -q
```

> For responses that may be long (paragraphs, multi-line outputs), ALWAYS use the CLI with stdin piping. It handles arbitrary text lengths with no timeout, so, when speaking a response, do NOT set a short timeout. Piper can take 10-30+ seconds for long text. Use a timeout of at least 120000ms (2 minutes) in the bash tool when invoking piper or the speak CLI for long text.
