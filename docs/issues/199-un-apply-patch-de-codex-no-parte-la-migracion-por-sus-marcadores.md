---
caso: 199
titulo: En un apply_patch de Codex los marcadores de goose y dbmate llegan con el prefijo del parche, y la migración se juzga entera
estado: resuelto
resuelto-en: 0.99.0
prioridad: media
version-detectada: 0.98.0
---

# 199 — Por `apply_patch`, el `down` honesto vuelve a frenar

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **media**. El arreglo del 185 parte la migración por sus
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

## Cierre

**Resuelto en 0.99.0, por el fix propuesto.** Recorriendo lo que enumeró:

- **`Add File` → se hizo.** `patchSections` (`engine/core/migrations.js`) corta el sobre por archivo, y
  `judgedPatch` juzga un archivo nuevo por su contenido sin el prefijo, partido como un `Write`.
- **`Update File` → se hizo, por el camino que el caso proponía.** Se reconstruye el lado que va a quedar
  —contexto y agregado—, se parte con los marcadores que el hunk trae, y se juzga sólo lo agregado que cae
  del lado que aplica. Sin marcador en el contexto se juzga todo lo agregado, como antes. Dos bordes salieron
  al mutar y quedaron fijados: lo **quitado** no cuenta para partir —un hunk que saca el `Down` deja lo
  agregado después en el `Up`, y eso frena—, y el separador `@@` no es una línea del archivo —leído como tal,
  su sangría cortaba el `downgrade()` de una migración de Python—.
- **Tradeoff del formato de un tercero → aceptado**: el parser sólo reconoce las cabeceras `*** … File:` y los
  prefijos de línea, que es lo que `filesOf` ya leía para saber qué archivos toca el parche.
- **Tradeoff de juzgar por archivo en los otros guards → se limitó a `migrations`**, que es lo que el caso
  sugería decidir. `contentOf` no cambió, así que los demás guards siguen viendo el sobre entero.

**Lo que el caso no preveía: el sobre entero también frenaba de más entre archivos.** Un `DROP TABLE` citado en
un `docs/notes.md` del mismo parche frenaba la migración de al lado, porque el guard juzgaba todo el sobre para
cada archivo. Juzgar por sección lo cierra, y la prueba lo fija.

### Qué se corrió

- **La reproducción del caso, tal como está escrita, contra el guard arreglado** (2026-09-23):

  ```
  hook write → exit=0
  hook patch → exit=0
  ```

  Antes, `patch` daba `exit=2` con «contiene SQL destructivo: `DROP TABLE`».
- **La prueba nueva en `test/hooks/migrations.test.js`, en rojo sobre el código anterior**, y **cinco
  mutaciones en una copia del árbol, las cinco en rojo**: juzgar el sobre entero, un `Update` sin partir, lo
  quitado contando para partir, el `Add` con su prefijo, y `@@` como contenido. Las dos últimas de éstas
  sobrevivían a la primera versión de la prueba y pidieron los dos casos de arriba.
- `npm run ci`, exit 0, 993 pruebas.

### Prueba real en un banco instalado (2026-09-23)

Banco: `ops bench sidecar` copiado fuera del árbol de Cauce con el layout de gouduet —instancia y producto en repositorios hermanos—, `automation install` del runner y los guards invocados por los shims instalados, como los invoca el runner. Control: el mismo input con el motor 0.98.0 de gouduet-ops, cambiando sólo el enlace del banco. **Codex real** (codex-cli 0.152.1, gpt-5.5) escribiendo una migración goose con `Down` honesto por `apply_patch`, sin que el pedido nombre el archivo: escrita con la rama (`goose validate` exit 0) y «BLOQUEADO: … contiene SQL destructivo» con 0.98.0. La entrada cruda capturada confirma la forma que suponían las pruebas: `tool_name: "apply_patch"`, el sobre en `tool_input.command`, rutas relativas y `turn_id`.

### Revisión del conjunto antes del PR (2026-09-24)

Una revisión de código de la rama entera encontró que `patchSections` cortaba la sección en cualquier línea `*** `: un `*** Move to:` —migración renombrada— o un `*** End of File` dejaba sin juzgar lo que seguía, y un `DROP TABLE` ahí **pasaba**, donde el guard anterior, que juzgaba el sobre entero, lo frenaba. Reproducido con `patchSections` real (`lines: []` tras el `Move to`) y corregido en `c1fd28d0`: la sección termina sólo en la próxima cabecera de archivo o en `*** End Patch`. Dos casos nuevos en `test/hooks/migrations.test.js`, vistos en rojo.
