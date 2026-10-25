---
name: speak
description: >
  Use this skill when opencode needs to speak text aloud, say something out loud,
  read output aloud, announce results verbally, or when the user says "speak", "say", "read aloud",
  "decir", "hablar", or mentions voice/tts/audio output. Converts text to speech using piper-tts
  with the Laura (es_MX) voice model. Always speaks in Spanish regardless of conversation language;
  automatically translates non-Spanish text before speaking.
license: MIT
compatibility: opencode
metadata:
  audience: wsl-users
  workflow: text-to-speech
  native-linux: true
  auto-detect-piper: true
  auto-detect-player: true
---

> **Bundled files live in this skill's directory.** `SKILL_DIR` is the absolute
> path of the folder containing this `SKILL.md` (the skill loader reports it).
> Resolve the script/reference paths below against it.

## What I do

- Convert text to speech using `piper-tts` with the Laura (es_MX) neural voice model
- Play audio through the system's default active audio device
- Handle both short phrases and longer text from files or stdin
- Support adjustable speed, silence, and volume parameters

## When to use me

Use this skill when the user wants to:
- Hear text spoken aloud ("say this", "speak this", "read aloud", "decir", "hablar")
- Get audio feedback from opencode ("announce when done", "tell me when it's ready")
- Convert text to a WAV file for later playback
- Any request mentioning TTS, voice output, or audio playback
- After generating a response when speak mode is enabled (see AGENTS.md global rule)

**Speak Mode integration**: When enabled in AGENTS.md, do NOT read the full response verbatim. Instead, create a 1-2 sentence summary or verbal closing that complements the written text. The audio should feel like a natural wrap-up, not a transcript.

**Always speak Spanish**: Before calling speak, ALWAYS translate the content to Spanish first. If the conversation is in English, Portuguese, or any other language, translate to Spanish before piping to piper. Use the agent's own bilingual capability to produce the Spanish version. Laura is an es_MX model and produces best results with Spanish — never pass non-Spanish text to piper.

## Prerequisites

- `piper` (piper-tts) installed — binary auto-detected at `piper` on PATH or `/opt/piper-tts/piper`
- Model files at `~/.local/share/piper-voices/es_MX-laura-high.onnx` and `.onnx.json`
- Audio player auto-detected: prefers `pw-play` (PipeWire native), falls back to `paplay`

## Available scripts

- **`scripts/speak.sh`** — Full TTS pipeline with options. Handles text input, file input, stdin, speed/volume control, and output-to-file mode.

## Usage

### Quick speak (short text)

```bash
echo "Hola mundo" | /opt/piper-tts/piper -m ~/.local/share/piper-voices/es_MX-laura-high.onnx --length-scale 1.1 --sentence-silence 0.3 -f /tmp/speak.wav 2>/dev/null && pw-play /tmp/speak.wav
```

### Using the script (recommended for all cases)

```bash
# Speak a phrase
bash ~/.config/opencode/skills/speak/scripts/speak.sh "Hola, soy Laura"

# Speak from stdin (long text)
echo "Texto largo que puede tomar varios segundos..." | bash ~/.config/opencode/skills/speak/scripts/speak.sh

# Speak from a file
bash ~/.config/opencode/skills/speak/scripts/speak.sh -f /tmp/response.txt

# Save to WAV file (no playback)
bash ~/.config/opencode/skills/speak/scripts/speak.sh -o output.wav "Guardar esto como audio"

# Adjust speed and pauses
bash ~/.config/opencode/skills/speak/scripts/speak.sh -l 1.3 -s 0.5 "Habla más lento con pausas"

# Quiet mode (suppress GPU warnings)
bash ~/.config/opencode/skills/speak/scripts/speak.sh -q "Sin advertencias"
```

### Long text handling

For responses that may be long (paragraphs, multi-line outputs), ALWAYS use the script with stdin piping. The script handles arbitrary text lengths with no timeout:

```bash
cat /tmp/response.txt | bash ~/.config/opencode/skills/speak/scripts/speak.sh -q
```

**IMPORTANT**: When speaking a response, do NOT set a short timeout. Piper can take 10-30+ seconds for long text. Use a timeout of at least 120000ms (2 minutes) in the bash tool when invoking piper or the speak script for long text.

## Gotchas

- The ONNX runtime GPU warning (`Failed to detect devices under "/sys/class/drm/card0"`) is benign — use `-q` flag or `2>/dev/null` to suppress it
- Laura is an es_MX (Mexican Spanish) model. Never pass non-Spanish text to her — always translate to Spanish first. English text will sound accented and unnatural
- The script auto-detects `pw-play` (PipeWire native) if available, otherwise falls back to `paplay`
- Piper binary is auto-detected: checks PATH first, then `/opt/piper-tts/piper`
- For long text (100+ words), piper can take 10-30 seconds — always allow sufficient timeout
- The model license is CC-BY-NC-4.0 — non-commercial use only
- If audio doesn't play, check the default sink with `pactl info | grep 'Default Sink'`
