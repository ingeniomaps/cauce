---
caso: 199
titulo: En un apply_patch de Codex los marcadores de goose y dbmate llegan con el prefijo del parche, y la migración se juzga entera
estado: abierto
prioridad: media
version-detectada: 0.98.0
---

# 199 — Por `apply_patch`, el `down` honesto vuelve a frenar

**🔴 abierto** · detectado en 0.98.0 · prioridad **media**. El arreglo del 185 parte la migración por sus
marcadores, pero en el sobre de `apply_patch` cada línea trae el prefijo del parche y ningún marcador empieza
la línea: la migración se evalúa entera y el `DROP` de su `Down` frena, igual que antes del 185.

## Resumen

Codex escribe archivos con `apply_patch`, cuyo sobre llega como `tool_input.command` (`*** Begin Patch` …).
`contentOf` le entrega al guard ese sobre tal cual, y en un `*** Add File:` cada línea del archivo viene
precedida de `+`. Los marcadores del 185 se reconocen al principio de la línea —`-- +goose Down`,
`-- migrate:down`—, así que `+-- +goose Down` no parte nada y el texto se juzga entero. La misma migración que
por `Write` pasa, por `apply_patch` se frena por su reversión.

Degrada al comportamiento de antes del 185, no a uno más permisivo: no deja pasar nada que antes se frenara.
Lo que vuelve es el falso positivo.

## Reproducción

Desde un directorio vacío, con la raíz mínima del 185 y el sobre armado como lo arma
`test/hooks/files.test.js` («guard-files lee el sobre de apply_patch aunque llegue como command»):

```bash
mkdir -p inst/planning && echo '{}' > inst/ops.config.json && git -C inst init -q
cat > up-down.sql <<'SQL'
-- +goose Up
CREATE TABLE catalog_items (id uuid PRIMARY KEY);

-- +goose Down
DROP TABLE catalog_items;
SQL
hook() {  # $1: write | patch
  node -e 'const fs = require("fs"), [mode] = process.argv.slice(1)
    const f = "db/migrations/20260923120000_catalog_items.sql", c = fs.readFileSync("up-down.sql", "utf8")
    const input = mode === "write"
      ? { tool_name: "Write", cwd: process.env.INST, tool_input: { file_path: f, content: c } }
      : { tool_name: "apply_patch", cwd: process.env.INST, tool_input: { command:
          `*** Begin Patch\n*** Add File: ${f}\n${c.trimEnd().split("\n").map((l) => "+" + l).join("\n")}\n*** End Patch` } }
    process.stdout.write(JSON.stringify(input))' "$1" \
  | env -u CLAUDE_PROJECT_DIR OPS_ROOT="$PWD/inst" INST="$PWD/inst" node <cauce>/engine/hooks/run.js migrations
  echo "exit=$?"
}
hook write
hook patch
```

## Síntoma

Salida real, 2026-09-23, contra el motor de la rama `fix/cases-185-196` (con el 185 ya arreglado):

```
--- Write
exit=0
--- apply_patch (Add File)
BLOQUEADO: db/migrations/20260923120000_catalog_items.sql contiene SQL destructivo: `DROP TABLE`.
Esto lo aprueba una persona: que pegue ella tal cual en planning/.ops-approval estas líneas:
  db/migrations/20260923120000_catalog_items.sql
[…]
exit=2
```

El mensaje no dice «en el bloque que aplica»: no se partió nada.

## Causa raíz

- **`engine/hooks/input.js:106-114`**, `contentOf`: sin `content` ni `new_string`, devuelve `patchOf(input)`
  (`:90-95`), el sobre entero con sus prefijos.
- **`engine/core/migrations.js:55-58`**, `SQL_MARKERS`: las expresiones están ancladas con `^--`, como las de
  goose y dbmate; `+-- +goose Down` no coincide, `sqlMask` (`:81-83`) devuelve `null` y `judged` (`:133`)
  juzga el texto entero.
- **El sobre puede traer varios archivos**, y hoy el mismo contenido se juzga para cada uno de los que
  `filesOf` (`input.js:97-104`) encuentra: una migración y un `.md` en el mismo parche comparten texto.

## Fix propuesto

Extraer del sobre el contenido de cada archivo antes de juzgarlo: para un `*** Add File: <ruta>`, las líneas
hasta el próximo `*** ` sin su `+` inicial, que es el archivo que va a quedar; con eso `judged` lo parte igual
que un `Write`. Un `*** Update File:` es un diff —contexto con ` `, quitado con `-`, agregado con `+`— y ahí
lo parecido al `Edit` del 185 es reconstruir el lado que aplica con las líneas de contexto y las agregadas, y
juzgar sólo las agregadas. Si el hunk no trae el marcador como contexto, se degrada a juzgar lo agregado
entero, como hoy.

## Tradeoffs

- **Parsear el formato del parche** es código nuevo sobre un formato de un tercero; el `Add File` es trivial,
  el `Update File` no.
- **Juzgar por archivo** cambia también lo que ven los otros guards que leen `contentOf` sobre un sobre con
  varios archivos; habría que decidir si el cambio se limita a `migrations`.

## Prioridad

Media. Afecta sólo a quien trabaja con Codex, pero ahí es el camino principal: toda tabla nueva en goose o
dbmate vuelve a pedir una aprobación por archivo, que es lo que el 185 vino a sacar.

## Contexto de descubrimiento

Cerrando el 185 el 2026-09-23: al recorrer por dónde llega el contenido al guard, el sobre de `apply_patch`
fue la única entrada que el arreglo no alcanzaba.

## Relacionados

- **185**: el mismo falso positivo, arreglado para `Write` y `Edit`.
