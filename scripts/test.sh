#!/usr/bin/env bash
# test.sh — run the unit tests for the skills that ship executable logic.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for suite in \
  "$ROOT/tests" \
  "$ROOT/skills/ollama-server/evals" \
  "$ROOT/skills/llamacpp-server/evals" \
  "$ROOT/skills/image-analysis/evals"
do
  echo
  echo "==> $suite"
  python3 -m unittest discover -s "$suite" -p 'test_*.py' -v
done
