---
name: video-analysis
description: >
  Use this skill when analyzing or summarizing a local video — sampling frames
  with ffmpeg and describing scenes, subjects, actions, on-screen text, and
  chronology with the local minicpm-v4.6 vision model. Trigger on "analyze this
  video", "what happens in this clip", "summarize the video", "extract key
  frames", or "describe the scene" — hand off to ocr for documents/tables and
  image-analysis for single images.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: multimodal-analysis
---

# Video Analysis with Local minicpm

Describe and summarize local videos without uploading them: `ffmpeg` extracts
evenly spaced frames, then `minicpm-v4.6` (Ollama) describes each frame in
chronological order.

## Core rules

- Model: `minicpm-v4.6:latest` through Ollama at `http://127.0.0.1:11434`.
- Requires `ffmpeg` and `ffprobe`; check `doctor --skill video-analysis` (run
  `setup` if it fails).
- Video paths must be absolute; nothing leaves the machine.
- `temperature=0` for deterministic descriptions.
- Default 6 frames; use 12–24 for fast cuts, actions, or long clips. The CLI
  caps the budget at 24.
- Audio is **not** transcribed. If speech matters, transcribe separately and
  merge the transcript with the visual timeline.
- For documents, slides, or tables visible in frames, follow up with the `ocr`
  skill; for a single still, use `image-analysis`.
- On 8 GB VRAM, sample fewer frames and keep `--timeout` generous (cold model
  load can take 30–120 s).

## Requirements

Check `doctor --skill video-analysis --cached` before running. It reads the generated
manifest and probes Ollama/ffmpeg; if it fails, run `setup`.

## CLI

```bash
cli() { node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" video "$@"; }

cli --input "/abs/path/clip.mp4"                      # 6 frames, markdown
cli --input "/abs/path/clip.mp4" --frames 12 --summary
cli --input "/abs/path/clip.mp4" --format json --keep-frames /tmp/clip-frames
```

| Option | Purpose |
|---|---|
| `--input PATH` | Absolute video file (required) |
| `--frames N` | Frames to sample, 1–24 (default 6) |
| `--summary` | Second pass: chronological summary of all frames |
| `--keep-frames DIR` | Keep extracted PNGs for inspection |
| `--prompt TEXT` | Override the per-frame instruction |
| `--model NAME` | Ollama vision model (default `minicpm-v4.6:latest`) |
| `--format markdown\|json\|raw` | Output shape (default markdown) |
| `--timeout SECONDS` | Per-frame request timeout (default 180) |

The CLI prints each frame with its timestamp; `--format json` returns
`{file, duration, model, frames: [{timestamp, description}], summary}`.

## Workflow

Progress:
- [ ] 1) Confirm the video path and the question (summary, actions, on-screen text)
- [ ] 2) Verify `ffmpeg`, Ollama, and the model
- [ ] 3) Choose a frame budget: 6 default, 12–24 for dense or long clips
- [ ] 4) Run `video`; add `--summary` when the user wants a narrative
- [ ] 5) Validate chronology and call out blind spots (audio, off-screen events)
- [ ] 6) Hand off to `ocr` for readable documents/tables in frames

### 1) Verify readiness

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill video-analysis
```

If it fails, run `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" setup`.

### 2) Choose the prompt

Default: describe subjects, actions, setting, on-screen text, and notable
changes. Use a task-specific prompt for surveillance clips, UI recordings,
sports, or slide decks — see `references/prompt-templates.md`.

### 3) Interpret the result

- Timestamps are frame midpoints; do not claim events between frames.
- Merge frame descriptions into a chronology; flag gaps or unclear transitions.
- If a frame shows a document/table, run `ocr` on the kept frame for exact text.
- For a single frame the user cares about, reuse `image-analysis` at full detail.

## Gotchas

- Very long videos: increase `--frames` only up to 24; for full coverage, split
  the file with `ffmpeg -ss/-t` and analyze each segment.
- Fast cuts can fall between samples; a higher frame count reduces misses.
- Dark, blurred, or transition frames produce vague descriptions — say so
  instead of inventing detail.
- Subtitles burned into the video are readable; external subtitle tracks are not.
- Audio, music, and speaker identity are out of scope for this vision pass.
- Do not delete source videos or extracted frames unless the user asks.

## Reference triggers

| Reference | When to use | File |
|---|---|---|
| Frame prompt templates | Surveillance, UI recordings, sports, slides, safety, summary | `references/prompt-templates.md` |

## Validation checklist

- [ ] Skill name matches directory: `video-analysis`
- [ ] Absolute input path; local-only processing
- [ ] Default model `minicpm-v4.6:latest`
- [ ] Frames described in chronological order with timestamps
- [ ] Documents/tables handed to `ocr`; stills to `image-analysis`
- [ ] Audio limitations stated explicitly
