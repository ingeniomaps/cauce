---
caso: 192
titulo: El guard de verify sólo detecta una consulta SQL cambiada si vive en `db/queries/` o `queries/` en la raíz, así que en un monorepo o con otro `queries:` deja pasar el commit sin generado
estado: resuelto
resuelto-en: 0.99.0
prioridad: media
version-detectada: 0.98.0
---

# 192 — Una query fuera de `db/queries/` en la raíz se commitea sin regenerar y el guard no se entera

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **media**. El guard que exige el generado de sqlc
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

## Cierre

**Resuelto en 0.99.0 por el punto 2 del fix, con una condición que el caso no traía, y en el mismo
cambio que el 187.** El dueño decidió no leer la config de sqlc. El patrón se desancló y, para no pagar
el tradeoff que el propio caso señalaba, sólo dispara si el repositorio tiene config de sqlc. Recorriendo
lo que el caso enumeró:

- **Fix 1, leer `queries:` de la config → se decidió que no**, por la misma razón que el fix 1 del 187:
  haría falta un lector de YAML en un repositorio sin dependencias.
- **Fix 2, desanclar el patrón → se hizo distinto.** `SQL_SOURCE` en `engine/hooks/verify.js` es
  `(?:^|/)queries/.*\.sql`, y `changedSqlSource` exige además `usesSqlc(dir)`, que devuelve si el índice
  tiene un `sqlc.yaml`, `sqlc.yml` o `sqlc.json` a cualquier profundidad. No se parsea el archivo: sólo se
  comprueba que exista. Cubre `monorepo` y, a diferencia de lo que el caso preveía, también `otraruta`
  (`sql/queries/x.sql`), porque el patrón busca un segmento `queries/` en cualquier lugar de la ruta. Lo
  que sigue sin verse es un `queries:` que apunte a una carpeta con otro nombre (`sql/x.sql`).
- **Tradeoff «ampliar el patrón dispara más» → cerrado con la condición de la config.** Una carpeta
  `queries/` en un repositorio sin config de sqlc ya no dispara. Eso **quita** algo que antes pasaba: un
  `db/queries/x.sql` en la raíz de un repositorio sin sqlc bloqueaba y ahora no. Esa quita tiene su
  aserción de ausencia (filas `queries/ sin sqlc` y `db/queries/ sin sqlc`), que se vio en rojo sobre el
  código anterior. El único dependiente era la prueba vieja de `test/hooks/commit.test.js`, que ahora
  stagea un `sqlc.yaml`. Ni la documentación ni las plantillas mencionan ese comportamiento
  (`grep -rn "db/queries\|Ejecuta el generador"` fuera de `docs/issues/`).
- **Tradeoff de la interacción con el 187 → respetado.** Se entregan juntos, y el reconocimiento del
  generado por `*.sql.go` entra en el mismo cambio. El monorepo con `out` en `internal/platform/pgdb/`
  que el caso ponía de ejemplo pasa (fila `monorepo con el generado fuera de sqlc/`).
- **Tradeoff de YAML en el guard → no hace falta**, porque no se lee el contenido de la config.

**Lo que el caso no preveía.** Un commit hecho desde un subdirectorio (`git -C api commit`) pregunta el
índice desde ahí, y `git ls-files` sin `:(top)` sólo lista lo que cuelga de ese directorio. Sin eso, un
`sqlc.yaml` en la raíz no se habría visto. Se usa `:(top,glob)**/sqlc.*`, y la fila `commit desde un
subdirectorio` lo fija. El otro hallazgo, que el guard de OpenAPI toma un `api/sqlc.yaml` staged por una
especificación, está en el cierre del 187 y es el caso 197.

### Qué se corrió

- **La reproducción del caso, contra el motor arreglado** (2026-09-23, Node v24.18.0). Tal como está
  escrita, sin config de sqlc, las cuatro corridas dan `PASA`. Es lo que se decidió: sin config no hay
  generador que pedir. Con un `sqlc.yaml` staged junto a la consulta:

  ```
  == raiz-cfg: db/queries/x.sql sqlc.yaml
  BLOQUEADO: Cambió una consulta SQL fuente sin artefactos regenerados: busqué en el índice un `*.sql.go`, o algo bajo una carpeta `sqlc/` o `generated/`, y no hay ninguno. Si corriste `sqlc generate`, stageá lo que escribió; si su `output_files_suffix` le cambia el nombre, esto no lo reconoce.
  == monorepo-cfg: backend/db/queries/x.sql backend/sqlc.yaml
  BLOQUEADO: Cambió una consulta SQL fuente sin artefactos regenerados: busqué en el índice un `*.sql.go`, ...
  == otraruta-cfg: sql/queries/x.sql sqlc.yaml
  BLOQUEADO: Cambió una consulta SQL fuente sin artefactos regenerados: busqué en el índice un `*.sql.go`, ...
  == anidada-cfg: db/queries/sub/x.sql sqlc.yaml
  BLOQUEADO: Cambió una consulta SQL fuente sin artefactos regenerados: busqué en el índice un `*.sql.go`, ...
  ```

  Los cuatro bloquean. `monorepo` y `otraruta` pasaban antes del arreglo. El monorepo va en `backend/` y
  no en `api/` por el hallazgo de OpenAPI de arriba.
- **La tabla de `test/hooks/verify.test.js`, en rojo sobre el `verify.js` de antes**: `monorepo sin
  generado`, `commit desde un subdirectorio` y las dos filas sin sqlc.
- **Mutaciones en una copia del árbol**. Estas cuatro se pusieron en rojo: la fuente anclada a la raíz
  otra vez (falla `monorepo sin generado`), sin la condición de la config (fallan las dos filas sin
  sqlc), la config buscada sólo en la raíz (falla `monorepo sin generado`) y sin `top` (falla el commit
  desde un subdirectorio). La que sobrevive, que un `git ls-files` que falla haga aflojar el guard, está
  explicada en el cierre del 187.
- `npm run ci`, exit 0.
