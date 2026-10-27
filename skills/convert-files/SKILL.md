---
name: convert-files
description: >
  Use this skill when converting or editing local documents, images, audio, or
  video with LibreOffice, ImageMagick, or ffmpeg — office formats, image
  conversion/resize/crop/rotate, media conversion, audio extraction,
  frames/thumbnails, trimming, muting, and normalization. Trigger on "convert
  this file", "convert image", "resize image", "extract audio", "extract
  frames", "make a GIF", "trim video", or "compress media". Gate with doctor
  --skill convert-files --cached.
license: MIT
compatibility: opencode, claude, copilot, antigravity
allowed-tools: Bash, Read
metadata:
  audience: developers
  workflow: file-conversion
---

# Convert and edit files locally

Use `pnpm cli convert` for document, image, and media processing. Documents
use local LibreOffice; images use ImageMagick; audio and video use ffmpeg.
Nothing is uploaded.

## Requirements

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" doctor --skill convert-files --cached
```

- Documents: LibreOffice.
- Images: ImageMagick (`magick` preferred, `convert` fallback).
- Media: `ffmpeg` and `ffprobe`.

If a dependency is missing, run `node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" setup`
and follow the printed hint.

## Workflow

- [ ] Confirm the input path, requested operation, and output path.
- [ ] Check that the output does not exist; the CLI refuses overwrites.
- [ ] Run the command and check the printed output path.
- [ ] Verify the output is non-empty; for frames, confirm the frame directory.

## Document conversion

```bash
# Single file
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" convert \
  --input /abs/report.docx --to pdf --out /abs/out

# Multiple inputs
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" convert \
  --input /abs/a.docx --input /abs/b.odt --to pdf --out /abs/out

# Explicit LibreOffice filter
node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" convert \
  --input /abs/data.xlsx --to csv --filter "Text - txt - csv (StarCalc)"
```

| Input | `--to` | Notes |
|---|---|---|
| `.docx`, `.odt`, `.rtf` | `pdf`, `html`, `txt` | Writer documents |
| `.xlsx`, `.ods` | `csv`, `pdf` | Spreadsheet; first sheet unless a filter says otherwise |
| `.pptx`, `.odp` | `pdf` | Presentation |
| `.svg` | `pdf` | Via LibreOffice Draw |

The target extension is determined by `--to`; LibreOffice must know the filter.

## Image conversion and editing

```bash
# Convert image formats
convert --input /abs/photo.png --to webp --out /abs/out
convert --input /abs/photo.tiff --to jpg --quality 85 --out /abs/out

# Resize, crop, rotate, and flip
convert --input /abs/photo.png --to png \
  --resize 800x600 --out /abs/out
convert --input /abs/photo.png --to png \
  --crop 400x300+10+20 --rotate 90 --flip horizontal --out /abs/out

# Grayscale, metadata removal, and transparency flattening
convert --input /abs/logo.png --to jpg \
  --grayscale --strip --background white --out /abs/out

# Apply EXIF orientation and trim uniform borders
convert --input /abs/scan.jpg --to png \
  --auto-orient --trim --out /abs/out
```

Common outputs include `jpg`, `png`, `webp`, `tiff`, `bmp`, `gif`, `avif`,
`ico`, and `pdf`; PDF writes depend on the ImageMagick policy.

Image flags: `--resize WxH`, `--crop WxH+X+Y`, `--rotate DEGREES`,
`--flip horizontal|vertical`, `--quality 1-100`, `--grayscale`, `--strip`,
`--background COLOR`, `--auto-orient`, and `--trim`. ImageMagick 7 uses
`magick`; ImageMagick 6 falls back to `convert`.

## Media conversion and editing

```bash
# Convert a video or audio file
convert --input /abs/clip.mov --to mp4 --out /abs/out
convert --input /abs/clip.mp4 --to mp3 --out /abs/out

# Extract audio from a video, with gain and normalization
convert --input /abs/clip.mp4 --to mp3 --volume 1.3 --normalize --out /abs/out

# Trim, resize, change frame rate, and remove audio
convert --input /abs/clip.mp4 --to mp4 \
  --start 00:00:10 --duration 30 --scale 1280:-2 --fps 30 --mute --out /abs/out

# Animated GIF
convert --input /abs/clip.mp4 --to gif \
  --start 00:00:02 --duration 4 --fps 12 --scale 640:-1 --out /abs/out
```

`--start`, `--end`, `--duration`, and `--at` accept seconds or `HH:MM:SS`.
Use `--end` or `--duration`, not both. `--at` is absolute and cannot be combined
with the range flags. Audio output rejects video filters such as `--scale` and
`--fps`. GIF output rejects audio filters.

## Frame and thumbnail extraction

```bash
# Evenly spaced frames; output defaults to jpg
convert --input /abs/clip.mp4 --frames 12 --out /abs/out

# One frame at an absolute time; choose png or webp
convert --input /abs/clip.mp4 --at 00:00:05 --to png --out /abs/out

# Frames from a trimmed range
convert --input /abs/clip.mp4 --start 10 --duration 5 --frames 6 --out /abs/out
```

Frames are written to `<out>/<input-basename>-frames/`; for example,
`/abs/out/clip-frames/frame-001.jpg`. The CLI refuses a non-empty frame
directory. `--frames` accepts 1-200 frames.

## Common operations

| Operation | Flags |
|---|---|
| Convert image format | `--to jpg/png/webp/tiff/gif/pdf` |
| Resize image | `--resize WxH` |
| Crop/rotate/flip image | `--crop WxH+X+Y`, `--rotate DEGREES`, `--flip` |
| Optimize image | `--quality N`, `--strip`, `--background COLOR` |
| Trim video or audio | `--start`, `--end` or `--duration` |
| Extract audio | `--to mp3`, `--to wav`, `--to m4a`, ... |
| Extract frames | `--frames N`, `--at TIME`, `--to jpg/png/webp` |
| Resize | `--scale WIDTH:HEIGHT`, e.g. `1280:-2` |
| Crop | `--crop WIDTH:HEIGHT:X:Y` |
| Rotate | `--rotate 90`, `180`, or `270` |
| Change frame rate | `--fps N` |
| Remove audio | `--mute` |
| Volume and loudness | `--volume FACTOR`, `--normalize` |
| Video quality | `--codec`, `--crf`, `--preset`, `--bitrate` |
| Audio format details | `--audio-codec`, `--bitrate`, `--audio-bitrate`, `--sample-rate`, `--channels` |
| Animated GIF | `--to gif`, `--fps`, `--scale` |

Codec availability depends on the local ffmpeg build. `copy` avoids re-encoding
but cannot be combined with filters that require re-encoding.

## Limits

- Output files are never overwritten.
- Password-protected documents may prompt or time out; unlock them first.
- Fonts can differ from Microsoft Office; embed fonts for exact rendering.
- Image conversion uses ImageMagick syntax: `WxH` and `WxH+X+Y`, not the
  video `W:H` syntax.
- Media conversion uses a bounded timeout (default 600 seconds).
- Frame extraction requires a video input and a non-empty target directory.
- For text extraction or OCR from documents, use `read-document` instead.

## Troubleshooting

| Symptom | Action |
|---|---|
| Exit `2` | Missing or conflicting flags, unsupported target, or output exists |
| Exit `3` | LibreOffice, ImageMagick, ffmpeg, or ffprobe missing; run `setup` |
| Exit `4` | Conversion failed; read the stderr line and check the input |
| No output | Try an explicit filter for documents, or a different codec for media |
| Empty frame directory | Check the requested time range and format |
| `Unknown encoder` | Choose a codec available in the local ffmpeg build |
| ImageMagick policy error | Adjust `policy.xml` only if you trust the operation; otherwise use another format |

## Validation checklist

- [ ] `doctor --skill convert-files --cached` passes
- [ ] Input exists and output is non-empty
- [ ] No input file was modified
- [ ] Output extension matches `--to`
- [ ] Frame extraction produced one file per requested frame
- [ ] Image edits use `WxH`/`WxH+X+Y`, not video colon syntax
- [ ] Media filters match the output type (no video filters on audio)
