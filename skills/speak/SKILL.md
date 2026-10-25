---
name: speak
description: >
  Use this skill when opencode needs to speak text aloud, say something out loud,
  read output aloud, announce results verbally, or when the user says "speak", "say", "read aloud",
  "decir", "hablar", or mentions voice/tts/audio output. Converts text to speech using piper-tts
  with the Laura (es_MX) voice model. Always speaks in Spanish regardless of conversation language;
  automatically translates non-Spanish text before speaking.
---

> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Run the CLI as `node "$SKILL_DIR/../../src/cli.mjs" speak ...`.

Always speak in Spanish. If the input text is not in Spanish, translate it before speaking.

## Requirements

Check `doctor --skill speak --cached` before running (piper + Laura voice model). If it
fails, run `setup`.

## Usage

> CLI location: `src/cli.mjs` at the repository root.

```bash
# Speak a phrase
node "$SKILL_DIR/../../src/cli.mjs" speak "Hola, soy Laura"

# Speak from stdin (long text)
cat /tmp/response.$(uuid).txt | node "$SKILL_DIR/../../src/cli.mjs" speak -q
```

> For responses that may be long (paragraphs, multi-line outputs), ALWAYS use the CLI with stdin piping. It handles arbitrary text lengths with no timeout, so, when speaking a response, do NOT set a short timeout. Piper can take 10-30+ seconds for long text. Use a timeout of at least 120000ms (2 minutes) in the bash tool when invoking piper or the speak CLI for long text.
