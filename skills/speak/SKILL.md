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
> Resolve the script/reference paths below against it.

Always speak in Spanish. If the input text is not in Spanish, translate it before speaking.

## Usage

> Script location is `$SKILL_DIR/scripts/speak.sh`.

```bash
# Speak a phrase
bash "$SKILL_DIR/scripts/speak.sh" "Hola, soy Laura"

# Speak from stdin (long text)
cat /tmp/response.$(uuid).txt | bash "$SKILL_DIR/scripts/speak.sh" -q
```

> For responses that may be long (paragraphs, multi-line outputs), ALWAYS use the script with stdin piping. The script handles arbitrary text lengths with no timeout, so, when speaking a response, do NOT set a short timeout. Piper can take 10-30+ seconds for long text. Use a timeout of at least 120000ms (2 minutes) in the bash tool when invoking piper or the speak script for long text.
