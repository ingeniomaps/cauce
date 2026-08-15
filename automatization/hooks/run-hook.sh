#!/usr/bin/env bash
set -u

hook_name=${1:-}
hook_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ops_root=$(CDPATH= cd -- "$hook_dir/../.." && pwd)
# Mismo orden que tools/ops.js: primero la dependencia npm, después la copia local, y por último
# el propio repositorio del toolkit. Un guard que no encuentra su motor bloquea, nunca permite.
runner=""
for candidate in \
  "$ops_root/node_modules/@ingeniomaps/cauce/engine/hooks/run.js" \
  "$ops_root/.ops/engine/hooks/run.js" \
  "$ops_root/engine/hooks/run.js"
do
  if [ -f "$candidate" ]; then runner="$candidate"; break; fi
done

if [ -z "$runner" ]; then
  echo "BLOQUEADO [$hook_name]: no se encontró el motor de hooks de Cauce." >&2
  echo "  Buscado en node_modules/@ingeniomaps/cauce, .ops/engine y engine/ bajo $ops_root" >&2
  exit 2
fi

if [ -z "$hook_name" ]; then
  echo "BLOQUEADO: run-hook.sh requiere el nombre del guard o grupo que debe ejecutar." >&2
  exit 2
fi

exec node "$runner" "$@"
