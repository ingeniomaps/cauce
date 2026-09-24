---
caso: 187
titulo: El guard de verify sólo reconoce el generado de sqlc si vive en una carpeta llamada `sqlc` o `generated`, y bloquea el commit cuando el proyecto configuró otro `out`
estado: abierto
prioridad: alta
version-detectada: 0.98.0
---

# 187 — Regenerar sqlc no alcanza: hay que ponerlo en la carpeta que el guard espera

**🔴 abierto** · detectado en 0.98.0 · prioridad **alta**. El guard detecta la fuente SQL por su ruta
declarada (`db/queries`) pero detecta el generado por un nombre de carpeta fijo, así que cualquier
proyecto que declare `gen.go.out` en otro lugar queda bloqueado aunque haya regenerado y stageado todo.

## Resumen

`verify()` en `engine/hooks/verify.js` compara dos cosas sobre el índice del commit:

```js
const changedSqlSource = staged.some((file) => /^(?:db\/queries|queries)\/.*\.sql$/i.test(file))        // :154
const hasSqlGenerated  = staged.some((file) => /(?:^|\/)(?:sqlc|generated)(?:\/|.*\.(?:go|ts|js|py)$)/i.test(file))  // :156
```

y si cambió la fuente sin el generado, bloquea (`:166`, el `if`; el mensaje está en `:167`).

Citas contrastadas contra el fuente el 2026-09-23 (`sed -n 147,175p engine/hooks/verify.js` sobre
`main` en `83fc8698`): las tres regex de `:154`, `:155` y `:156` coinciden carácter por carácter con las
de este caso, y el mensaje de `:167` también. La única corrección es que el bloqueo lo decide `:166` y
`:167` es su texto.

La primera mitad mira **la ruta de la fuente**, que sqlc declara en `queries:` y que casi siempre es
`db/queries`. La segunda mira **el nombre de una carpeta** — `sqlc/` o `generated/` — que sqlc **no**
impone: el destino lo declara el proyecto en `gen.go.out` y puede ser cualquiera.

El resultado es que el guard exige un layout que la herramienta no exige. Un proyecto que generó,
stageó el generado y tiene el árbol perfectamente en sync recibe «Ejecuta el generador» y no tiene
ninguna acción que lo desbloquee, porque ya lo ejecutó.

La asimetría se ve mejor al lado del chequeo hermano de OpenAPI, dos líneas más arriba:

```js
const hasApiGenerated = staged.some((file) => /(?:^|\/)[^/]*(?:generated|\.gen)\.(?:go|ts|js|py)$/i.test(file))  // :155
```

Ése reconoce el generado **por el nombre del archivo**, que es lo que `oapi-codegen` fija con `-o`, y
por eso funciona con cualquier carpeta. El de sqlc hace lo contrario y por eso falla.

## Reproducción

En una instancia con `guard-shell.sh` activo, sobre un repo Go con sqlc:

1. `sqlc.yaml` con `queries: "db/queries"` y `gen.go.out: "internal/platform/pgdb"` — o cualquier `out`
   que no contenga un segmento `sqlc` ni `generated`.
2. Agregar una query nueva en `db/queries/algo.sql` y correr el generador.
3. Stagear por nombre la query y **todos** los archivos que el generador tocó
   (`internal/platform/pgdb/algo.sql.go`, `models.go`, `querier.go`).
4. `git commit` → bloqueado con «Cambió una consulta SQL fuente sin artefactos regenerados».
5. Mover el mismo generado a `internal/sqlc/` (o renombrar la carpeta): el mismo commit pasa.

El paso 5 es el que muestra que lo que falta no es regenerar sino el nombre de la carpeta.

### Reproducción mínima, sin sqlc

El guard mira sólo nombres de rutas en el índice, así que los archivos pueden ser falsos y sqlc no hace
falta. Un script que llama al `verify` real del motor con un `git commit` como comando:

```bash
S=$(mktemp -d)
cat > "$S/run.js" <<'EOF'
const { verify } = require('<cauce>/engine/hooks/verify.js')
const dir = process.argv[2]
try { verify({ tool_input: { command: 'git commit -m x' }, cwd: dir }); console.log('PASA (verify no bloqueó)') }
catch (e) { console.log(e.blocked ? 'BLOQUEADO: ' + e.message : 'ERROR: ' + e.stack) }
EOF
mk() {  # $1 nombre del repo, el resto: rutas a crear y stagear
  d="$S/$1"; shift; mkdir -p "$d/planning"; git -C "$d" init -q
  echo '{"mode":"company"}' > "$d/ops.config.json"
  for f in "$@"; do mkdir -p "$d/$(dirname "$f")"; echo '-- fake' > "$d/$f"; git -C "$d" add -- "$f"; done
  (cd "$d" && env -u CLAUDE_PROJECT_DIR -u OPS_ROOT node "$S/run.js" "$d")
}
mk pgdb     db/queries/x.sql internal/platform/pgdb/x.sql.go internal/platform/pgdb/models.go \
            internal/platform/pgdb/querier.go
mk sqlcdir  db/queries/x.sql internal/sqlc/x.sql.go internal/sqlc/models.go internal/sqlc/querier.go
```

## Síntoma

Corrida del 2026-09-23, tarea `catalog-item-table` de la instancia `gouduet-ops`, repo
`gouduet/api`. Índice con las nueve rutas de la tarea, entre ellas los tres archivos que produjo
`sqlc generate`. Mensaje literal del guard:

```
BLOQUEADO: Cambió una consulta SQL fuente sin artefactos regenerados. Ejecuta el generador.
Aprobalo pegando tal cual en gouduet-ops/planning/.ops-approval estas líneas:
  db/migrations/20260923120000_catalog_items.sql
  db/queries/catalog_items.sql
  docs/adr/003-retiro-del-catalogo-muerto.md
  docs/partitioning-plan.md
  internal/catalog/item_migration_integration_test.go
  internal/catalog/item_table_integration_test.go
  internal/platform/pgdb/catalog_items.sql.go
  internal/platform/pgdb/models.go
  internal/platform/pgdb/querier.go
```

El generado **sí** estaba staged y **sí** estaba en sync: `sqlc diff` en ese mismo árbol devolvió exit
code 0 (sqlc v1.31.1, verificado en esa corrida). La única razón del bloqueo es que
`internal/platform/pgdb/` no se llama `sqlc` ni `generated`.

Se reintentó el commit una segunda vez con el mismo índice y frenó con el mensaje idéntico: no es un
estado transitorio.

### Reproducción de hoy (2026-09-23, `main` en `83fc8698`, Node v24.18.0)

Corrida del script de «Reproducción mínima» en un scratch desechable, salida real:

```
== pgdb
db/queries/x.sql
internal/platform/pgdb/models.go
internal/platform/pgdb/querier.go
internal/platform/pgdb/x.sql.go
BLOQUEADO: Cambió una consulta SQL fuente sin artefactos regenerados. Ejecuta el generador.
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:
  db/queries/x.sql
  internal/platform/pgdb/models.go
  internal/platform/pgdb/querier.go
  internal/platform/pgdb/x.sql.go
Valen para ese conjunto y dejan de valer en cuanto cambie. La variable OPS_SKIP_VERIFY=1 sigue existiendo y apaga el guard para toda la sesión, que es por lo que no es la vía recomendada.
== sqlcdir
db/queries/x.sql
internal/sqlc/models.go
internal/sqlc/querier.go
internal/sqlc/x.sql.go
PASA (verify no bloqueó)
```

Reproduce las dos mitades del caso: mismo índice, mismos nombres de archivo, y lo único que cambia el
veredicto es el nombre de la carpeta.

La otra mitad de la comparación —que la **fuente** fuera de la raíz no dispara el guard, y una query
bajo `api/db/queries/` pasa sin ningún generado— se encontró revisando este caso y es un defecto aparte:
**192**.

## Causa raíz

- **`engine/hooks/verify.js:156`**, `hasSqlGenerated`: el patrón
  `(?:^|\/)(?:sqlc|generated)(?:\/|.*\.(?:go|ts|js|py)$)` exige un segmento de ruta literal `sqlc` o
  `generated`. Es el layout de los ejemplos de sqlc, no una garantía de sqlc.
- **`engine/hooks/verify.js:154`**, `changedSqlSource`: la otra mitad de la comparación se apoya en
  la convención más común (`db/queries` o `queries`), así que para ese layout el disparo es correcto y
  sólo falla el reconocimiento. Que esté anclada a la raíz y no dispare en otros layouts es el
  caso 192.
- **La única prueba del guard fija el layout que falla**: `test/hooks/commit.test.js:38-45` stagea
  `db/queries/altas.sql` y después `sqlc/altas.go`; no hay caso con otro `out` ni con la fuente fuera de
  la raíz, y por eso nada se puso rojo.
- El destino verdadero está declarado y es legible: `sqlc.yaml:9` dice `out: "internal/platform/pgdb"`,
  en el mismo archivo del que sale `queries:` (`sqlc.yaml:4`). El guard ya podría saberlo y no lo mira.

## Fix propuesto

1. **Leer el destino del propio `sqlc.yaml` en vez de adivinarlo por nombre de carpeta.** Es el dato
   autoritativo y está junto al que ya se usa:

   ```diff
   -  const hasSqlGenerated = staged.some((file) =>
   -    /(?:^|\/)(?:sqlc|generated)(?:\/|.*\.(?:go|ts|js|py)$)/i.test(file))
   +  const outs = sqlcOutDirs(dir)   // gen.*.out de cada bloque de sql[] en sqlc.yaml/sqlc.json
   +  const hasSqlGenerated = staged.some((file) =>
   +    outs.some((out) => file.startsWith(`${out}/`))
   +    || /(?:^|\/)(?:sqlc|generated)(?:\/|.*\.(?:go|ts|js|py)$)/i.test(file))
   ```

   El patrón viejo queda como respaldo para cuando no haya config legible, o sea que degrada al
   comportamiento de hoy en vez de fallar abierto.

2. **Si leer la config se descarta, reconocer el generado por el nombre del archivo**, igual que hace
   `hasApiGenerated`: sqlc emite `<nombre>.sql.go` por cada archivo de `queries/`, más `models.go`,
   `querier.go`, `db.go` y `copyfrom.go`. `/\.sql\.(?:go|ts|py)$/` sobre el índice cubre el caso sin
   leer nada. Es más débil que el punto 1 —no cubre un `out` con nombres atípicos— pero arregla el
   default y no depende de parsear YAML.

3. **Que el mensaje diga qué buscó y no encontró.** Hoy dice «Ejecuta el generador» a alguien que
   acaba de ejecutarlo, y esa instrucción no tiene cómo desbloquear nada. Nombrar la expectativa
   —«no encontré nada staged bajo `internal/sqlc/` ni `*/generated/*`»— convierte una orden imposible
   en un diagnóstico accionable.

### Contraste del fix contra la reproducción (2026-09-23)

- **Punto 2 cierra la reproducción `pgdb`**: `internal/platform/pgdb/x.sql.go` matchea
  `/\.sql\.(?:go|ts|py)$/`. Los nombres, verificados contra el fuente público de sqlc en `main`
  (commit `bdbe55db`, <https://github.com/sqlc-dev/sqlc/blob/bdbe55db3ee08745827090d4aad1781bea2ee4ee/internal/codegen/golang/gen.go>):
  el archivo por query se llama `SourceName` + `.go` (`gen.go:262-269`), y `SourceName` es
  `filepath.Base` del archivo de query (`internal/compiler/compile.go:224`, `internal/codegen/golang/result.go:225`), o sea
  `x.sql` → `x.sql.go`. Tres matices que el punto 2 no dice:
  - `output_files_suffix` se agrega antes del `.go` (`gen.go:262-264`): con `_gen` el archivo es
    `x.sql_gen.go` y la regex no lo ve.
  - `db.go`, `models.go`, `querier.go`, `copyfrom.go` y `batch.go` son defaults renombrables
    (`gen.go:273-292`, `output_*_file_name`), y varios son condicionales: `querier.go` sólo con
    `emit_interface` (`gen.go:303`), `copyfrom.go`/`batch.go` sólo si hay queries `:copyfrom`/`:batch*`
    (`gen.go:308-314`). No sirven como señal, y el punto 2 hace bien en no usarlos.
  - `.ts`/`.py`: la generación de TypeScript y Python en sqlc va por plugins aparte, cuyo esquema de
    nombres **no se comprobó** acá. Hipótesis; la regex no debería prometer esas extensiones sin mirarlo.
- **Punto 1 cierra la reproducción `pgdb` sólo si el `sqlc.yaml` está en la raíz.** Las rutas de
  `out` son relativas al archivo de config; en un monorepo (`api/sqlc.yaml`) hay que buscarlo donde
  esté y prefijar su directorio. sqlc busca `sqlc.yaml`, `sqlc.yml` o `sqlc.json` y se niega si hay
  json y yaml a la vez (`internal/cmd/generate.go:72-94` del mismo commit). Las citas `sqlc.yaml:4` y
  `sqlc.yaml:9` de «Causa raíz» son del repo `gouduet/api` y **no se pudieron contrastar desde acá**.
- **Ninguno de los dos cierra el 192**, porque ambos tocan `hasSqlGenerated` y el falso
  negativo está en `changedSqlSource`. Si se lee la config (punto 1), el mismo lector da `queries:` y
  arregla las dos mitades; si se elige el punto 2, la fuente sigue anclada a la raíz.
- **YAML en el repo: no hay parser.** `grep -rniE "yaml|sqlc" engine --include=*.js` no devuelve
  ningún lector de `sqlc.*`; lo único parecido es `engine/core/frontmatter.js`, que según su propio
  comentario (`:10`) admite un subconjunto y «no lo que admitiría YAML entero». Con cero dependencias
  (AGENTS.md), el punto 1 exige escribir un lector acotado o leer sólo `sqlc.json`.
- **Punto 3 es otro defecto**, de la familia del 181: el mensaje ordena algo que no desbloquea, y eso
  seguiría siendo cierto con cualquier reconocimiento que falle. Se puede arreglar sin tocar el
  reconocimiento y al revés.

## Tradeoffs

- **Leer `sqlc.yaml` mete un parser de YAML en un guard que hoy no lo necesita.** Si eso pesa, el punto
  2 no lo pide y cubre el default. El punto 1 es el correcto; el 2 es el barato.
- **Reconocer por `*.sql.go` puede aceptar un archivo escrito a mano con ese nombre.** Es el mismo
  límite que ya tiene `hasApiGenerated` con `*generated.go`, y es aceptable: el guard busca señal de
  que alguien regeneró, no prueba criptográfica.
- **Ninguno de los dos comprueba que el generado esté realmente en sync**, sólo que viaje en el commit.
  Eso ya es así hoy y no empeora. Si se quisiera comprobarlo de verdad, la herramienta lo ofrece
  —`sqlc diff` devuelve exit 0/1 sin escribir nada (verificado, v1.31.1)— pero es una decisión distinta
  y más cara que la de este caso.

## Prioridad

Alta, y por la misma razón que el 185: no es un borde. `out:` es un campo de configuración normal y
cualquier proyecto que organice su código generado junto a su capa de plataforma —en vez de en una
carpeta `sqlc/` al costado— se frena en **cada** commit que toque una query, para siempre. La salida
que queda es aprobar el índice entero en `planning/.ops-approval` una vez por commit, que es trabajo
manual repetido para algo que se hizo bien, y acostumbrarse a aprobar bloqueos en serie es lo que
desarma un guard.

Agrava que la única salida posible la tiene que pegar una persona: el agente no escribe
`.ops-approval` y `OPS_SKIP_VERIFY=1` apaga el guard para toda la sesión, así que un bloqueo que nadie
puede resolver correctamente detiene la corrida entera.

## Contexto de descubrimiento

Instancia `gouduet-ops` (Cauce 0.98.0), repo `gouduet/api`, hito `catalog-item`, fase Commit de
`catalog-item-table` — la misma tarea que encontró el 185 en su fase Build. Es el segundo guard que
frena la misma tarea por asumir un layout que el proyecto no tiene obligación de seguir.

## Relacionados

- **185**: mismo hito y misma tarea; allá el guard de archivos asume la estructura interna de una
  migración, acá el de verify asume la estructura de directorios del generado.
- **181** (`el-guard-de-manifest-mira-el-indice-y-su-mensaje-promete-un-desbloqueo-que-no-implementa`):
  la misma familia de mensaje que indica una acción que no desbloquea; el punto 3 del fix es su
  continuación para este guard.
- **186**: por qué la salida por chat no está disponible cuando quien commitea es un subagente, que es
  lo que deja `.ops-approval` como única vía.
- **192**: la otra mitad del mismo guard —la fuente fuera de la raíz no dispara nada—, encontrada
  revisando este caso. Un fix que lea `sqlc.yaml` puede cerrar los dos.
