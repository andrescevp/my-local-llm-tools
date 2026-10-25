#!/usr/bin/env bash
# speak.sh — Convert text to speech using piper-tts (Laura es_MX) and play audio
# Usage: speak.sh [options] [text]
#   -f FILE   Read text from file
#   -s SECS   Sentence silence (default: 0.3)
#   -l SCALE  Length/speed scale (default: 1.1; higher=slower)
#   -v VOL    Volume multiplier (default: 1.0)
#   -o FILE   Output WAV to file only (no playback)
#   -q        Quiet — suppress piper stderr warnings
#   -h        Show help
#
# If no text or file is given, reads from stdin.

set -euo pipefail

# Force audio environment at any nesting depth
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"
export PULSE_SERVER="${PULSE_SERVER:-unix:${XDG_RUNTIME_DIR}/pulse/native}"
export PULSE_RUNTIME_PATH="${PULSE_RUNTIME_PATH:-${XDG_RUNTIME_DIR}/pulse}"

MODEL="$HOME/.local/share/piper-voices/es_MX-laura-high.onnx"
SENTENCE_SILENCE="0.3"
LENGTH_SCALE="1.1"
VOLUME="1.0"
OUTPUT=""
QUIET=0
INPUT_FILE=""
TEXT=""

PIPER=""
PLAYER=""

while getopts "f:s:l:v:o:qh" opt; do
  case "$opt" in
    f) INPUT_FILE="$OPTARG" ;;
    s) SENTENCE_SILENCE="$OPTARG" ;;
    l) LENGTH_SCALE="$OPTARG" ;;
    v) VOLUME="$OPTARG" ;;
    o) OUTPUT="$OPTARG" ;;
    q) QUIET=1 ;;
    h)
      echo "Usage: speak.sh [options] [text]"
      echo ""
      echo "Convert text to speech using piper-tts (Laura es_MX) and play audio."
      echo ""
      echo "Options:"
      echo "  -f FILE   Read text from file"
      echo "  -s SECS   Sentence silence in seconds (default: 0.3)"
      echo "  -l SCALE  Length/speed scale (default: 1.1; higher=slower)"
      echo "  -v VOL    Volume multiplier (default: 1.0)"
      echo "  -o FILE   Output WAV to file only (no playback)"
      echo "  -q        Quiet — suppress piper stderr warnings"
      echo "  -h        Show this help"
      echo ""
      echo "If no text or file is given, reads from stdin."
      echo ""
      echo "Examples:"
      echo "  speak.sh 'Hola mundo'"
      echo "  echo 'Texto de prueba' | speak.sh"
      echo "  speak.sh -f document.txt"
      echo "  speak.sh -o output.wav 'Guardar como audio'"
      exit 0
      ;;
    *) exit 1 ;;
  esac
done
shift $((OPTIND - 1))

if [ $# -gt 0 ]; then
  TEXT="$*"
fi

if [ ! -f "$MODEL" ]; then
  echo "ERROR: Model not found at $MODEL" >&2
  echo "Download it with:" >&2
  echo "  mkdir -p ~/.local/share/piper-voices" >&2
  echo "  curl -L -o ~/.local/share/piper-voices/es_MX-laura-high.onnx https://huggingface.co/HirCoir/Piper-TTS-Laura/resolve/main/es_MX-laura-high.onnx" >&2
  echo "  curl -L -o ~/.local/share/piper-voices/es_MX-laura-high.onnx.json https://huggingface.co/HirCoir/Piper-TTS-Laura/resolve/main/es_MX-laura-high.onnx.json" >&2
  exit 1
fi

# detect piper binary
PIPER="$(command -v piper 2>/dev/null || command -v /opt/piper-tts/piper 2>/dev/null || echo "")"
if [ -z "$PIPER" ]; then
  echo "ERROR: piper not found. Install it via: yay -S piper-tts-bin" >&2
  exit 1
fi

# detect player: prefer pw-play (PipeWire native), fallback to paplay, then aplay
if command -v pw-play &>/dev/null && [ -S "${XDG_RUNTIME_DIR}/pipewire-0" ]; then
  PLAYER="pw-play"
elif command -v paplay &>/dev/null; then
  PLAYER="paplay"
elif command -v aplay &>/dev/null; then
  PLAYER="aplay"
else
  echo "ERROR: no audio player found (pw-play, paplay, or aplay)" >&2
  exit 1
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

WAV="$TMPDIR/speak_output.wav"

PIPER_CMD=("$PIPER" -m "$MODEL" --length-scale "$LENGTH_SCALE" --sentence-silence "$SENTENCE_SILENCE" --volume "$VOLUME" -f "$WAV")

if [ "$QUIET" -eq 1 ]; then
  QUIET_REDIRECTION="2>/dev/null"
else
  QUIET_REDIRECTION=""
fi

if [ -n "$INPUT_FILE" ]; then
  eval "${PIPER_CMD[*]} -i \"${INPUT_FILE}\"" $QUIET_REDIRECTION
elif [ -n "$TEXT" ]; then
  echo "$TEXT" | eval "${PIPER_CMD[*]}" $QUIET_REDIRECTION
else
  eval "${PIPER_CMD[*]}" $QUIET_REDIRECTION
fi

if [ -n "$OUTPUT" ]; then
  cp "$WAV" "$OUTPUT"
  echo "Saved to $OUTPUT"
else
  PLAY_WAV="/tmp/speak_output.wav"
  cp "$WAV" "$PLAY_WAV"

  # Debug: log environment to diagnose nesting-depth issues
  {
    echo "=== speak.sh audio debug $(date) ==="
    echo "PPID=$PPID parent=$(ps -o comm= -p $PPID 2>/dev/null || echo unknown)"
    echo "XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR"
    echo "DBUS_SESSION_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS"
    echo "PULSE_SERVER=$PULSE_SERVER"
    ls -la "$XDG_RUNTIME_DIR/pipewire"* "$XDG_RUNTIME_DIR/pulse" 2>&1 || true
    echo "=== end debug ==="
  } > /tmp/speak_audio_debug.log 2>&1

  # Try all players in order: pw-play, paplay, aplay, aplay direct
  pw-play "$PLAY_WAV" 2>/dev/null \
    || PULSE_SERVER="unix:${XDG_RUNTIME_DIR}/pulse/native" paplay "$PLAY_WAV" 2>/dev/null \
    || paplay "$PLAY_WAV" 2>/dev/null \
    || aplay -q "$PLAY_WAV" 2>/dev/null \
    || aplay -q -D default "$PLAY_WAV" 2>/dev/null \
    || aplay -q -D hw:0,0 "$PLAY_WAV" 2>/dev/null \
    || true

  echo "$PLAY_WAV"
fi