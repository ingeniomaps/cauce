#!/usr/bin/env bash
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
payload='{"tool_input":{"command":"git add ."}}'

if printf '%s' "$payload" | "$root/automatization/hooks/guard-git-add.sh" >/dev/null 2>&1; then
  echo "guard-git-add permitió un comando bloqueado" >&2
  exit 1
fi

printf '%s' '{"tool_input":{"command":"git status --short"}}' |
  "$root/automatization/hooks/guard-destructive.sh" >/dev/null

echo "✓ wrappers de hooks ejecutables"
