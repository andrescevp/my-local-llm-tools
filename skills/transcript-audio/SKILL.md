---
name: transcript-audio
description: >
  Use this skill when transcribing audio or video to text with the local
  hyprwhspr speech-to-text backend — extract audio from video, normalize it,
  split long recordings into safe sequential chunks, transcribe each chunk, and
  write a Markdown, text, or JSON document. Trigger on "transcribe audio",
  "transcribe video", "speech to text", "make a transcript", or "transcribe a
  long recording". Gate with doctor --skill transcript-audio --cached.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: transcription
---

# Transcribe audio and video

Use `pnpm cli transcribe` for local speech-to-text. The command uses the system
`hyprwhspr` backend, the same service bound to `Super+.` on this Hyprland setup.
It does not upload audio.

## Requirements

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill transcript-audio --cached
hyprwhspr status
```

- `hyprwhspr` with a local file-capable backend (`onnx-asr`, `faster-whisper`,
  `pywhispercpp`, or a REST backend).
- `ffmpeg` and `ffprobe`.
- If `hyprwhspr transcribe` reports missing `soundfile`, run
  `hyprwhspr setup` and repeat the check.

`realtime-ws` supports live capture only; configure a local or REST backend for
file transcription.

## Workflow

- [ ] Confirm the input audio/video path and the desired output document.
- [ ] Run the dependency gate above.
- [ ] For video, let the command extract and normalize the audio first.
- [ ] For long recordings, keep the default chunking or lower
      `--chunk-seconds` on memory-constrained systems.
- [ ] Verify the transcript document and review chunk boundaries.

## Commands

```bash
# Audio input
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" transcribe \
  --input /abs/interview.mp3 \
  --out /abs/interview.transcript.md

# Video input: audio is extracted from the video first
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" transcribe \
  --input /abs/meeting.mp4 \
  --out /abs/meeting.transcript.md

# Language hint, cleaned text, and a smaller chunk size
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" transcribe \
  --input /abs/long-talk.wav \
  --language es \
  --chunk-seconds 120 \
  --clean \
  --out /abs/long-talk.transcript.md

# Plain text or JSON
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" transcribe \
  --input /abs/clip.mkv --format txt --out /abs/clip.transcript.txt
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" transcribe \
  --input /abs/clip.mkv --format json --out /abs/clip.transcript.json
```

From the repository root, `pnpm cli transcribe ...` is equivalent.

## Options

| Option | Meaning |
|---|---|
| `--input PATH` | Audio or video input; required |
| `--out PATH` | Transcript path; default `<input>.transcript.md` |
| `--format md\|txt\|json` | Document format; inferred from `--out` when omitted |
| `--language CODE` | Language hint such as `en` or `es` |
| `--chunk-seconds N` | Sequential chunk size; default 300, range 30-1800 |
| `--timeout SECONDS` | Timeout per ffmpeg/hyprwhspr step; default 600 |
| `--keep-audio DIR` | Keep normalized WAV and chunk files for inspection |
| `--clean` | Apply hyprwhspr's configured text cleanup |

## How long audio is handled

1. The input is converted to mono 16 kHz PCM WAV.
2. `ffprobe` measures the duration.
3. The recording is split into sequential chunks, 300 seconds by default.
4. Chunks are transcribed one at a time, never in parallel, to avoid loading
   the whole recording or multiple model instances at once.
5. Each transcript section is labelled with its chunk time range.

Use `--chunk-seconds 120` on a low-memory machine or `--chunk-seconds 600` for
fewer boundaries. Chunk boundaries can split a word; review the text at each
`##` heading in the Markdown output.

## Output

- Markdown: metadata plus one section per chunk.
- Text: chunk texts separated by blank lines.
- JSON: source, duration, language, chunk ranges, and combined text.

Example Markdown:

```markdown
# Transcript: meeting.mp4

- Source: /abs/meeting.mp4
- Duration: 00:12:30
- Language: auto
- Chunks: 3

## 00:00:00 – 00:05:00

First chunk text.

## 00:05:00 – 00:10:00

Second chunk text.
```

## Limits

- No speaker diarization or word-level timestamps.
- Chunking is fixed-duration; it does not detect silence.
- The output file is never overwritten.
- Video without an audio track fails during extraction.
- The first model load can take noticeably longer than later chunks.
- The transcript is only as good as the selected hyprwhspr model and language.

## Troubleshooting

| Symptom | Action |
|---|---|
| Exit `2` | Missing input, unsupported media, invalid chunk size, or output exists |
| Exit `3` | `hyprwhspr`, `ffmpeg`, or `ffprobe` missing; run `setup` |
| Exit `4` | Extraction or transcription failed; read the stderr line |
| `soundfile` missing | Run `hyprwhspr setup`, then retry |
| `realtime-ws` error | Switch hyprwhspr to a local or REST backend |
| Empty transcript | Check the audio track, language hint, and hyprwhspr model |
| Out of memory | Lower `--chunk-seconds` to 120 or 60 |

## Validation checklist

- [ ] `doctor --skill transcript-audio --cached` passes
- [ ] `hyprwhspr status` shows an active local backend
- [ ] Input has an audio track
- [ ] Output document exists and is non-empty
- [ ] Markdown chunk headings match the recording duration
- [ ] Long runs stayed within the requested chunk size
