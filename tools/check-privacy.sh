#!/usr/bin/env bash
# Scan tracked files for common secrets, absolute home paths, and session ids.
# Run this before publishing. It cannot catch names or institutions; review the
# diff by hand for those.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if git grep -nE "sk-[A-Za-z0-9]{20,}|/Users/[^/]+|sess_[A-Za-z0-9]{10,}" -- . \
  ':!.github/**' ':!tools/check-privacy.sh' ':!docs/privacy.md'; then
  echo "" >&2
  echo "Potential secret, absolute path, or session id found." >&2
  exit 1
fi

echo "No common secrets, absolute home paths, or session ids found."
echo "Remember to review names, institutions, and personal data by hand."
