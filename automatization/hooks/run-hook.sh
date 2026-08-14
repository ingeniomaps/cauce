#!/usr/bin/env bash
set -u

hook_name=${1:-}
hook_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ops_root=$(CDPATH= cd -- "$hook_dir/../.." && pwd)
runner="$ops_root/.ops/engine/hooks/run.js"
[ -f "$runner" ] || runner="$ops_root/engine/hooks/run.js"

if [ ! -f "$runner" ]; then
  echo "BLOQUEADO [$hook_name]: no se encontró el motor de hooks de Project Ops." >&2
  echo "  Buscado en: $ops_root/.ops/engine/hooks/run.js" >&2
  echo "           y: $ops_root/engine/hooks/run.js" >&2
  exit 2
fi

if [ -z "$hook_name" ]; then
  echo "BLOQUEADO: run-hook.sh requiere el nombre del guard o grupo que debe ejecutar." >&2
  exit 2
fi

exec node "$runner" "$@"
