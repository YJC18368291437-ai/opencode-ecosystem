#!/usr/bin/env bash
# Install this workspace into OpenCode's global config and skill directories.
#
# Default mode copies files. Use --link for development.
# Existing config files are backed up before being replaced.
# An existing memory directory is NEVER overwritten.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${OPENCODE_CONFIG_HOME:-$HOME/.config/opencode}"
SKILLS_DIR="${OPENCODE_SKILLS_HOME:-$HOME/.agents/skills}"
MODE="copy"
DRY_RUN=0
RUN_NPM=1

usage() {
  cat <<'EOF'
Usage: ./install.sh [options]

Options:
  --copy        Copy files into place (default)
  --link        Symlink files into place (development)
  --dry-run     Print what would happen, change nothing
  --no-npm      Skip npm install
  -h, --help    Show this help

Environment:
  OPENCODE_CONFIG_HOME   default: ~/.config/opencode
  OPENCODE_SKILLS_HOME   default: ~/.agents/skills
EOF
}

for arg in "$@"; do
  case "$arg" in
    --copy) MODE="copy" ;;
    --link) MODE="link" ;;
    --dry-run) DRY_RUN=1 ;;
    --no-npm) RUN_NPM=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 1 ;;
  esac
done

say() { printf '%s\n' "$*"; }
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+ %s\n' "$*"
  else
    "$@"
  fi
}

backup_target() {
  local target="$1"
  [ -e "$target" ] || [ -L "$target" ] || return 0
  local rel="${target#"$CONFIG_DIR"/}"
  local dest="$BACKUP/$rel"
  run mkdir -p "$(dirname "$dest")"
  run cp -RP "$target" "$dest"
}

install_entry() {
  local src="$1"
  local target="$2"
  local name
  name="$(basename "$target")"

  if [ -e "$target" ] || [ -L "$target" ]; then
    backup_target "$target"
  fi

  case "$MODE" in
    link)
      run rm -rf "$target"
      run ln -s "$src" "$target"
      ;;
    copy)
      if [ -d "$src" ]; then
        run mkdir -p "$target"
        run cp -R "$src/." "$target/"
      else
        run mkdir -p "$(dirname "$target")"
        run cp -f "$src" "$target"
      fi
      ;;
  esac
}

BACKUP="$CONFIG_DIR.bak-$(date +%Y%m%d-%H%M%S)"

say "Workspace:  $ROOT"
say "Config:     $CONFIG_DIR"
say "Skills:     $SKILLS_DIR"
say "Mode:       $MODE"
[ "$DRY_RUN" -eq 1 ] && say "Dry run:    yes"
say ""

say "==> Installing config"
run mkdir -p "$CONFIG_DIR"
for entry in "$ROOT"/config/*; do
  [ -e "$entry" ] || continue
  install_entry "$entry" "$CONFIG_DIR/$(basename "$entry")"
done

say ""
if [ -e "$CONFIG_DIR/memory" ]; then
  say "==> Memory exists, keeping it untouched: $CONFIG_DIR/memory"
else
  say "==> Installing memory template"
  run cp -R "$ROOT/memory.template" "$CONFIG_DIR/memory"
fi

say ""
say "==> Installing skills"
run mkdir -p "$SKILLS_DIR"
for entry in "$ROOT"/skills/*; do
  [ -e "$entry" ] || continue
  target="$SKILLS_DIR/$(basename "$entry")"
  if [ -e "$target" ] || [ -L "$target" ]; then
    run mkdir -p "$BACKUP/skills"
    run cp -RP "$target" "$BACKUP/skills/"
  fi
  case "$MODE" in
    link)
      run rm -rf "$target"
      run ln -s "$entry" "$target"
      ;;
    copy)
      run rm -rf "$target"
      run cp -R "$entry" "$target"
      ;;
  esac
done

if [ "$RUN_NPM" -eq 1 ] && command -v npm >/dev/null 2>&1 && [ -f "$CONFIG_DIR/package.json" ]; then
  say ""
  say "==> Installing plugin dependency"
  if [ "$DRY_RUN" -eq 1 ]; then
    say "+ (cd $CONFIG_DIR && npm install --no-save --no-package-lock)"
  else
    (cd "$CONFIG_DIR" && npm install --no-save --no-package-lock)
  fi
fi

if [ -d "$BACKUP" ]; then
  say ""
  say "Backup:     $BACKUP"
fi

say ""
say "Next steps:"
say "  1. export DEEPSEEK_API_KEY=...        # or edit config/opencode.json"
say "  2. opencode debug config              # verify the config parses"
say "  3. opencode                           # start the TUI"
say ""
say "Optional: tvly login (search plugin), and the macOS capture quick action in docs/learning.md."
