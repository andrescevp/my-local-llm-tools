#!/usr/bin/env bash
# install.sh — install the harness as an OpenCode V2 plugin.
#
# Skills are registered by index.ts (no file copies). The plugin directory is
# symlinked into the OpenCode plugins directory, which is auto-loaded.
#
# Usage:
#   ./scripts/install.sh            install (idempotent symlink)
#   ./scripts/install.sh --dry-run  preview only
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

step() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }

link() {
  if [[ $DRY_RUN -eq 1 ]]; then
    info "would link: $2 -> $1"
    return
  fi
  mkdir -p "$(dirname "$2")"
  ln -sfn "$1" "$2"
  info "linked: $2 -> $1"
}

step "OpenCode"
if command -v opencode >/dev/null; then
  info "opencode found: $(command -v opencode)"
else
  info "opencode not found — install it before restarting the client"
fi

plugins_dir="${OPENCODE_PLUGINS_DIR:-$HOME/.config/opencode/plugins}"
if [[ -e "$plugins_dir/my-utils-harness" ]]; then
  info "note: my-utils-harness is also installed; it registers autoskills,"
  info "comfyui-server, image-analysis, and ocr too. Duplicate skill ids may"
  info "conflict — keep only one of the two harnesses enabled if you see it."
fi
link "$REPO_ROOT" "$plugins_dir/cheap-ai-winth-local-tools"

echo
if [[ $DRY_RUN -eq 1 ]]; then
  echo "Dry run complete — nothing changed."
else
  cat <<'EOF'
Installed. Restart OpenCode so the plugin is loaded.
Verify statically with: python3 scripts/validate.py
EOF
fi
