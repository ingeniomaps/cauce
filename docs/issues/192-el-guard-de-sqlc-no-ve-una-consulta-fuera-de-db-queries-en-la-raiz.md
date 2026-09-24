---
caso: 192
titulo: El guard de verify sólo detecta una consulta SQL cambiada si vive en `db/queries/` o `queries/` en la raíz, así que en un monorepo o con otro `queries:` deja pasar el commit sin generado
estado: abierto
prioridad: media
version-detectada: 0.98.0
---

# 192 — Una query fuera de `db/queries/` en la raíz se commitea sin regenerar y el guard no se entera

**🔴 abierto** · detectado en 0.98.0 · prioridad **media**. El guard que exige el generado de sqlc
junto a una query cambiada sólo reconoce la query en dos rutas ancladas a la raíz del repositorio; en
cualquier otro layout no dispara, y el commit sale con la fuente nueva y el generado viejo.

## Resumen

`verify()` decide si hubo SQL fuente en el commit con:

```js
const changedSqlSource = staged.some((file) => /^(?:db\/queries|queries)\/.*\.sql$/i.test(file))   // :154
```

El `^` ata el patrón a la raíz. En un monorepo (`api/db/queries/x.sql`) o con `queries:` apuntando a
otra carpeta (`sql/queries/x.sql`), `changedSqlSource` es `false`, el bloqueo de `:166` no se evalúa y
el commit pasa aunque no lleve nada regenerado. No es un guard permisivo con ese layout: es un guard
que no sabe que hubo SQL.

Es la mitad opuesta del 187. Allá el guard adivina dónde está el **generado** y bloquea lo que está
bien; acá adivina dónde está la **fuente** y deja pasar lo que está mal. El origen es el mismo —suponer
un layout en vez de leer el que declara `sqlc.yaml`— y los efectos van en direcciones contrarias.

## Reproducción

Desde un directorio vacío. No hace falta sqlc: el guard mira sólo rutas del índice, así que los
archivos pueden ser falsos. `<cauce>` es la raíz de este repositorio.

```bash
S=$(mktemp -d)
cat > "$S/run.js" <<'EOF'
const { verify } = require('<cauce>/engine/hooks/verify.js')
const dir = process.argv[2]
try { verify({ tool_input: { command: 'git commit -m x' }, cwd: dir }); console.log('PASA (verify no bloqueó)') }
catch (e) { console.log(e.blocked ? 'BLOQUEADO: ' + e.message.split('\n')[0] : 'ERROR: ' + e.stack) }
EOF
mk() {  # $1 nombre del repo, el resto: rutas a crear y stagear
  d="$S/$1"; shift; mkdir -p "$d/planning"; git -C "$d" init -q
  echo '{"mode":"company"}' > "$d/ops.config.json"
  for f in "$@"; do mkdir -p "$d/$(dirname "$f")"; echo '-- fake' > "$d/$f"; git -C "$d" add -- "$f"; done
  echo "== $(basename "$d"): $(git -C "$d" diff --cached --name-only | tr '\n' ' ')"
  (cd "$d" && env -u CLAUDE_PROJECT_DIR -u OPS_ROOT node "$S/run.js" "$d")
}
mk raiz     db/queries/x.sql
mk monorepo api/db/queries/x.sql
mk otraruta sql/queries/x.sql
mk anidada  db/queries/sub/x.sql
```

Los cuatro commits llevan una query cambiada y **ningún** generado; los cuatro deberían bloquear.

## Síntoma

Salida real del script, corrido el 2026-09-23 sobre `main` en `83fc8698` con Node v24.18.0:

```
== raiz: db/queries/x.sql
BLOQUEADO: Cambió una consulta SQL fuente sin artefactos regenerados. Ejecuta el generador.
== monorepo: api/db/queries/x.sql
PASA (verify no bloqueó)
== otraruta: sql/queries/x.sql
PASA (verify no bloqueó)
== anidada: db/queries/sub/x.sql
BLOQUEADO: Cambió una consulta SQL fuente sin artefactos regenerados. Ejecuta el generador.
```

`raiz` y `anidada` bloquean como corresponde; `monorepo` y `otraruta` pasan sin generado.

## Causa raíz

- **`engine/hooks/verify.js:154`**, `changedSqlSource`: `^(?:db\/queries|queries)\/.*\.sql$` exige que
  la ruta relativa al repositorio **empiece** con `db/queries/` o `queries/`. sqlc no impone esa ruta:
  la declara el proyecto en `queries:` de su config, relativa al directorio del `sqlc.yaml`.
- **`engine/hooks/verify.js:166`**: el bloqueo sólo se evalúa si `changedSqlSource` es verdadero, así
  que lo de `:154` decide todo.
- **`test/hooks/commit.test.js:38-45`**: la única prueba del guard stagea `db/queries/altas.sql` en la
  raíz; no hay caso con la fuente en otro lado, y por eso nada se puso en rojo.

Contrastado el 2026-09-23 con `sed -n 147,175p engine/hooks/verify.js` y `sed -n 30,46p
test/hooks/commit.test.js` sobre `83fc8698`.

## Fix propuesto

1. **Leer `queries:` de la config de sqlc**, junto con `gen.*.out`, que es el punto 1 del 187. Un solo
   lector resuelve las dos mitades: la fuente y el generado quedan donde el proyecto los declaró, con el
   directorio del `sqlc.yaml` como prefijo (en un monorepo, `api/`). sqlc busca `sqlc.yaml`, `sqlc.yml`
   o `sqlc.json` (verificado en `internal/cmd/generate.go:72-74` del fuente público de sqlc, commit
   `bdbe55db`). El patrón actual queda como respaldo cuando no haya config legible.

2. **Si leer la config se descarta, desanclar el patrón**:

   ```diff
   -  const changedSqlSource = staged.some((file) => /^(?:db\/queries|queries)\/.*\.sql$/i.test(file))
   +  const changedSqlSource = staged.some((file) => /(?:^|\/)(?:db\/queries|queries)\/.*\.sql$/i.test(file))
   ```

   Cubre `monorepo` y no `otraruta`: una carpeta de queries con cualquier nombre sólo se reconoce
   leyendo la config.

## Tradeoffs

- **Ampliar el patrón dispara más.** Desanclado, cualquier `.sql` bajo una carpeta `queries/` a
  cualquier profundidad pide generado, aunque no sea de sqlc —consultas de un reporte, fixtures de
  prueba, scripts de análisis—. Y cada disparo falso termina en `.ops-approval`, que es lo que el 187
  describe como la forma de acostumbrarse a aprobar bloqueos. Leer la config no tiene ese costo.
- **Interacción con el 187.** Arreglar sólo este caso **empeora** al 187: los proyectos que hoy pasan
  por no ser detectados —un monorepo con `out` en `internal/platform/pgdb/`— empezarían a bloquear en
  cada commit que toque una query, aunque hayan regenerado. Este fix no se entrega antes que el
  reconocimiento del generado del 187, y lo natural es un solo cambio que lea la config para los dos.
- **Leer la config mete YAML en el guard**, y el repositorio no tiene parser (`grep -rniE "yaml|sqlc"
  engine --include=*.js` no devuelve ningún lector de `sqlc.*`; `engine/core/frontmatter.js` admite un
  subconjunto). Con cero dependencias es un lector acotado a escribir, o leer sólo `sqlc.json`.

## Prioridad

Media. Falla abierto y en silencio: nadie ve un bloqueo, así que nadie reporta nada, y el commit sale
con una query que el código generado no refleja. Lo acota que el guard nunca prometió sync —sólo que el
generado viaje en el commit— y que un generado viejo suele romper en build o en pruebas cuando la
firma de la query cambió. No es alta porque no frena trabajo; no es baja porque en los layouts
afectados el guard directamente no existe, y nada lo dice.

## Contexto de descubrimiento

Revisando el 187 el 2026-09-23 (paso 1 del recorrido: reproducirlo antes de arreglarlo). Para ver si
el fix del 187 cerraba también otros layouts se corrió el guard con la fuente en otras rutas, y los que
quedaban fuera de la raíz pasaron sin generado.

## Relacionados

- **187**: la mitad opuesta del mismo guard —el generado fuera de `sqlc/` o `generated/` bloquea lo
  que está bien—. Mismo origen; un fix que lea la config de sqlc cierra los dos, y este no debería
  entregarse solo (ver Tradeoffs).
