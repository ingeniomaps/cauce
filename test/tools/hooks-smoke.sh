#!/usr/bin/env bash
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
payload='{"tool_input":{"command":"git add ."}}'

# Un bloqueo sale con 2 —lo fija `engine/hooks/run.js`, `process.exit(error.blocked ? 2 : 1)`— y hay dos
# formas de no salir con 0 que no son un bloqueo: 127 si el archivo no está y 126 si está y no es
# ejecutable. Preguntar «¿salió distinto de 0?» las da por buenas, y entonces este humo saludaba con el
# guard borrado del disco: la única comprobación que corre antes de la suite no podía fallar por lo que
# dice cuidar (caso 132). Por eso se compara el código y no su ausencia.
set +e
printf '%s' "$payload" | "$root/automatization/hooks/guard-git-add.sh" >/dev/null 2>&1
code=$?
set -e
if [ "$code" -ne 2 ]; then
  case "$code" in
    0) echo "guard-git-add permitió un comando bloqueado" >&2 ;;
    126|127) echo "guard-git-add no se pudo ejecutar (código $code): el archivo falta o no es ejecutable" >&2 ;;
    *) echo "guard-git-add salió con $code y se esperaba 2, que es el código de un bloqueo" >&2 ;;
  esac
  exit 1
fi

printf '%s' '{"tool_input":{"command":"git status --short"}}' |
  "$root/automatization/hooks/guard-destructive.sh" >/dev/null

echo "✓ wrappers de hooks ejecutables"
