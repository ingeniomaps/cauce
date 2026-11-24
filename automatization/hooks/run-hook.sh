#!/usr/bin/env bash
set -u

hook_name=${1:-}
hook_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ops_root=$(CDPATH= cd -- "$hook_dir/../.." && pwd)
# El guard sabe dónde vive; quien lo invoca, no necesariamente. En modo sidecar la herramienta se
# abre en la carpeta de la compañía y la raíz ops es un hermano, que ninguna búsqueda hacia arriba
# encuentra: sin esto el guard no halla `ops.config.json` y deja pasar todo en silencio.
export OPS_ROOT="$ops_root"
# Primero el argumento, que además es lo que nombra el error de abajo.
if [ -z "$hook_name" ]; then
  echo "BLOQUEADO: run-hook.sh requiere el nombre del guard o grupo que debe ejecutar." >&2
  exit 2
fi

# Copia de `packagePath`; su porqué vive allá. Son tres los que la repiten y el motor los nombra.
runner=""
for candidate in \
  "$ops_root/node_modules/@ingeniomaps/cauce/engine/hooks/run.js" \
  "$ops_root/engine/hooks/run.js" \
  "$ops_root/../node_modules/@ingeniomaps/cauce/engine/hooks/run.js"
do
  if [ -f "$candidate" ]; then runner="$candidate"; break; fi
done

# Un guard que no encuentra su motor bloquea, nunca permite.
if [ -z "$runner" ]; then
  echo "BLOQUEADO [$hook_name]: no se encontró el motor de hooks de Cauce." >&2
  echo "  Buscado en node_modules/@ingeniomaps/cauce y engine/ bajo $ops_root y su carpeta padre" >&2
  exit 2
fi

# Un motor que no carga —un `require` roto tira antes de que `run.js` decida— salía con 1, y Claude Code sólo frena con
# 2: los guards dejaban pasar todo (caso 557). Node arranca con un atajador que lo convierte en 2 y después corre
# `run.js` como su programa. Lo que no contesta no autoriza, salvo lo que no puede frenar por un defecto propio, que es
# `CANNOT_STOP` de `run.js` y una prueba compara con esta lista. Va con `exec` para que la señal con que el runner
# corta el hook le llegue a node y no a un bash intermedio, que la dejaría corriendo sin padre. `runMain` es lo que
# hace a `run.js` el programa principal, y pide la ruta absoluta que arma este shim; si dejara de hacerlo,
# `test/tools/hooks-smoke.sh` deja de ver el bloqueo.
exec node -e '
const quiet = new Set(["prompt", "prompt-notice", "stop", "chat", "rules-notice", "planning-drift"])
const names = process.argv.slice(2)
process.on("uncaughtException", (error) => {
  const said = String(error && error.message).split("\n")[0]
  const stops = !(names.length && names.every((name) => quiet.has(name)))
  process.stderr.write(`${stops ? "BLOQUEADO" : "Aviso"} [${names.join(" ")}]: el motor de hooks falló sin decidir `
    + `(${said})${stops ? ", y lo que no contesta no autoriza" : ""}. Revisá que el paquete de Cauce esté instalado `
    + "entero (npm install en la raíz ops).\n")
  process.exit(stops ? 2 : 1)
})
require("node:module").runMain()' "$runner" "$@"
