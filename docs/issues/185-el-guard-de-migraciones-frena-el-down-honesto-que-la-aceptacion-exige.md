---
caso: 185
titulo: El guard de migraciones frena el `down` honesto que la propia aceptación exige, y premia la migración sin reversión
estado: resuelto
resuelto-en: 0.99.0
prioridad: alta
version-detectada: 0.98.0
---

# 185 — Crear una tabla es destructivo si se puede deshacer

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **alta**. El guard mira el archivo entero y no distingue el
bloque que aplica del que revierte, así que toda migración que crea una tabla queda bloqueada por su propio
`down`.

## Resumen

`migrations()` en `engine/hooks/files.js` busca `drop table|database|schema|column|constraint`, `truncate` y
`delete from …;` **sobre el contenido completo** del archivo de migración. No mira dónde está la sentencia.

Una migración goose que crea una tabla se escribe así:

```sql
-- +goose Up
CREATE TABLE catalog_items (...);

-- +goose Down
DROP TABLE catalog_items;
```

El `DROP TABLE` del `Down` **es la reversión**: es lo que vuelve reversible el cambio, y es lo que cualquier
contrato de migración pide. El guard lo lee como SQL destructivo y bloquea la escritura del archivo.

El efecto es el opuesto al buscado: **la migración con `down` honesto se frena y la migración sin `down` pasa
sin problema.** El guard premia la más peligrosa de las dos.

## Reproducción

No hace falta una instancia ni un agente: el guard es `engine/hooks/run.js migrations`, y lee la entrada del
hook por stdin. Desde un directorio vacío, con `OPS_ROOT` apuntando a una raíz mínima —`ops.config.json` y
`planning/`, que es lo que `findOpsRoot` pide en `engine/hooks/input.js:215-226`—:

```bash
mkdir -p inst/planning && echo '{}' > inst/ops.config.json && git -C inst init -q
cat > up-down.sql <<'SQL'
-- +goose Up
-- +goose StatementBegin
CREATE TABLE catalog_items (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE catalog_items;
-- +goose StatementEnd
SQL
sed '/+goose Down/,$d' up-down.sql > up-only.sql   # la misma migración sin su reversión

guard() {  # $1: ruta de la migración, $2: archivo con el contenido que se escribe
  node -e 'const [f, c] = process.argv.slice(1)
    process.stdout.write(JSON.stringify({ tool_name: "Write", cwd: process.env.INST,
      tool_input: { file_path: f, content: require("fs").readFileSync(c, "utf8") } }))' "$1" "$2" \
  | env -u CLAUDE_PROJECT_DIR OPS_ROOT="$PWD/inst" INST="$PWD/inst" \
      node <cauce>/engine/hooks/run.js migrations
  echo "exit=$?"
}
guard api/db/migrations/20260923120000_catalog_items.sql up-down.sql
guard api/db/migrations/20260923120000_catalog_items.sql up-only.sql
```

El `env -u CLAUDE_PROJECT_DIR` no es decorativo: `opsRoot` prefiere esa variable a `cwd`
(`engine/hooks/input.js:260-262`), y dentro de una sesión de agente apunta a otro árbol.

## Síntoma

**Corrida original** —`wf_df659094-4cf`, 2026-09-23, tarea `catalog-item-table` de la instancia `gouduet-ops`,
tal como la reportó la corrida—:

```
build-blocked: `guard-files.sh` bloquea crear
api/db/migrations/20260923120000_catalog_items.sql por el `DROP TABLE` de su `-- +goose Down`
(mensaje literal: `BLOQUEADO: ... contiene SQL destructivo`)
```

La aceptación de esa tarea pide, textual, «la migración goose del ítem canónico, con `down` honesto y orden de
deploy documentado en la cabecera». O sea: **el guard bloquea lo que la aceptación exige.**

La corrida se detuvo con el WIP en 0 de 9 pasos. Sin el archivo no hay tabla; sin tabla no hay queries sqlc
—`sqlc.yaml` declara `schema: "db/migrations"`— ni generado ni pgtest, así que cae la tarea entera y no sólo su
primer paso.

**Reproducción de hoy** —2026-09-23, Cauce 0.98.0 en `83fc8698`, los comandos de arriba—. Con el `Down`:

```
BLOQUEADO: api/db/migrations/20260923120000_catalog_items.sql contiene SQL destructivo.
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:
  api/db/migrations/20260923120000_catalog_items.sql
Valen para ese conjunto y dejan de valer en cuanto cambie. La variable OPS_MIGRATIONS_OVERRIDE=1 sigue existiendo y apaga el guard para toda la sesión, que es por lo que no es la vía recomendada.
exit=2
```

La misma migración sin el bloque `Down`:

```
exit=0
```

## Causa raíz

- **`engine/hooks/files.js:339`**, dentro de `migrations()` (`:310`): `destructiveSql` —definido en `:316-321`—
  se evalúa con `destructiveSql.test(contentOf(input))`, o sea contra todo lo que la herramienta escribe. El
  guard ya sabe que el archivo es una migración —lo filtra por ruta y extensión con `migrationPattern`,
  `:301-308`, en `:337`—, pero no conoce la estructura interna del formato.
- **Qué es «todo lo que escribe» depende de la herramienta**: `contentOf` (`engine/hooks/input.js:74-82`)
  devuelve `content` en un `Write` y `new_string` en un `Edit`. Importa para el fix: en un `Edit` el guard no ve
  el archivo, sólo el fragmento.
- Los comentarios del archivo muestran que esta familia de falsos positivos ya se vio antes —el caso 039, un
  `DROP TABLE` mencionado en un archivo que no era migración (`:322-326`), y la decisión de no ampliar el
  default a `.ts`/`.py`/`.rb` por el mismo motivo (`:290-293`)— y se cerró mirando la ruta, no el contenido
  con más precisión. Acá la ruta **sí** es una migración, así que esa salida no aplica.

## Fix propuesto

1. **Partir el contenido por los marcadores del formato antes de buscar.** Goose los declara explícitos:

   ```diff
   -    if (destructiveSql.test(contentOf(input))) {
   +    if (destructiveSql.test(applySection(contentOf(input)))) {
   ```

   donde `applySection` devuelve lo que está bajo `-- +goose Up` y descarta lo que está bajo `-- +goose Down`.
   Si el archivo no trae marcadores, se evalúa entero, que es el comportamiento de hoy y el correcto para una
   migración que no declara su reversión.

   **Cómo reconoce goose un marcador, para que `applySection` lea lo mismo** (documentado: fuente de
   `pressly/goose`, rama `main` con la última release en v3.28.0, `internal/sqlparser/parser.go`, descargado el
   2026-09-23): la línea tiene que empezar con `--` —con espacio inicial es error, `extractAnnotation`,
   `:319-323`—, contener `+goose`, y la anotación se compara con `strings.EqualFold` (`:344-348`), así que
   `-- +goose down` y `--+goose Down` también son válidos. `Down` antes de `Up` es error (`:145-157`) y un
   segundo `Up` también (`:136-142`): **todo lo que sigue al `Down` es reversión**, y el corte es un solo
   índice. Un `applySection` sensible a mayúsculas no falla abierto —degrada a hoy—, pero deja bloqueada la
   variante en minúsculas que goose acepta.

2. **Las migraciones de lenguaje van con el 193.** Partirlas por su método de reversión —`downgrade()` en
   Alembic, `down` en Rails y TypeORM, `exports.down` en Knex; documentado en las fuentes que cita el 193— sólo
   tiene sentido una vez que el guard reconozca el borrado idiomático, que hoy no ve en ningún lado del
   archivo. Hasta ahí, el `down()` de lenguaje sólo frena cuando se escribe en SQL crudo. Este caso cierra con
   el punto 1, que cubre `.sql`, el default.

3. **Nombrar en el mensaje dónde está lo que frena.** Hoy dice «contiene SQL destructivo»; decir «en el bloque
   `Up`» le ahorra a quien lo lee ir a buscar cuál de las dos sentencias fue.

### Lo que el fix no cierra (medido el 2026-09-23 con el mismo `guard()` de Reproducción)

- **golang-migrate y sqlx no usan marcadores: la reversión es otro archivo.** El formato es
  `{version}_{title}.down.{extension}` (documentado: `MIGRATIONS.md` de `golang-migrate/migrate`, `master`,
  última release v4.20.1). `migrationPattern` lo toma como migración y el `DROP` es todo su contenido:

  ```
  guard db/migrations/000001_catalog_items.down.sql down-file.sql   # DROP TABLE catalog_items;
  BLOQUEADO: db/migrations/000001_catalog_items.down.sql contiene SQL destructivo.
  [las tres líneas de aprobación, iguales a las de arriba]
  exit=2
  ```

  `applySection` no ve nada que partir y evalúa entero, así que sigue bloqueado. Cerrarlo pide mirar el
  **nombre**: un `*.down.sql` es reversión entera.
- **dbmate usa otros marcadores**: `-- migrate:up` / `-- migrate:down` (documentado: README de
  `amacneil/dbmate`, `main`, última release v2.36.0). Mismo bloqueo hoy (`exit=2`) y mismo después de un fix
  que sólo lea `+goose`. El tradeoff «degrada al comportamiento de hoy» es cierto, pero hoy es este caso.
- **Un `Edit` sobre el `Down` sigue bloqueado aunque el fix entre.** El guard ve sólo `new_string`, que no trae
  marcadores, así que se evalúa entero. Medido con `old_string: "DROP TABLE catalog_items;"` →
  `new_string: "DROP TABLE IF EXISTS catalog_items;"`: `exit=2`, mismo mensaje. Cerrarlo pide ubicar
  `old_string` en el archivo en disco para saber de qué lado del `Down` cae —si el archivo no existe o no
  aparece, se evalúa el fragmento como hoy—. Sin esto, corregir el `Down` de una migración que todavía no
  viajó vuelve a pedir una aprobación por archivo.
- **La versión de lenguaje de este mismo bloqueo existe, y es menor.** Una TypeORM con
  `` q.query(`DROP TABLE …`) `` en `down()` da `exit=0` sin declarar `ts` y `exit=2` con
  `migrations.extensions: ["sql","ts"]`: frena la reversión honesta sólo cuando está en SQL crudo. El borrado
  idiomático (`queryRunner.dropTable`, `op.drop_table`…) no frena ni en `down()` ni en `up()`, y eso es el 193.

### Decisiones que el fix pide antes de construirlo

- **Qué formatos entran en esta vuelta**: sólo goose —el que se sufrió—, o también `*.down.sql` y dbmate, que
  fallan igual y son baratos (un sufijo de nombre y un segundo par de marcadores).
- **Si el `Edit` sobre el `Down` entra acá**: sin él, el fix cierra la creación y no la corrección.
- **Resuelto**: el punto 2 salió al 193 junto con el borrado idiomático que el `up()` de lenguaje no frena.

## Tradeoffs

- **Un `DROP` peligroso escondido en el `Down` deja de frenarse.** Es correcto: un `Down` sólo corre cuando
  alguien revierte a mano, y frenarlo ahí es frenar la reversión, no el daño. Lo que sí sigue frenándose es
  todo lo destructivo del `Up`, que es donde vive el riesgo real.
- **Depende del formato.** Un archivo que use otros marcadores no se parte y se evalúa entero, o sea que
  degrada al comportamiento de hoy en vez de fallar abierto.
- **Un proyecto puede escribir el `Down` mal a propósito** para colar un `DROP`. Es cierto, y es el mismo
  límite de cualquier guard: lo que frena es la forma habitual, no a alguien decidido.

## Prioridad

Alta. No es un borde: **toda tabla nueva pasa por acá**. En la instancia que lo encontró hay al menos cinco
tareas del catálogo canónico que crean tablas, y cada una va a frenarse igual. La salida que queda es aprobar
una por una en `planning/.ops-approval`, que es trabajo manual repetido para lo que el propio contrato pide
hacer bien, y acostumbrarse a aprobar bloqueos en serie es exactamente lo que desarma un guard.

## Contexto de descubrimiento

Instancia `gouduet-ops` (Cauce 0.98.0), hito `catalog-item`, primera tarea que toca el esquema. Se descubrió al
frenarse dos corridas seguidas en el mismo punto: `wf_df659094-4cf` y `wf_7a7d672c-c18`, la segunda tras
comprobar que la concesión por chat no alcanza a un subagente.

## Relacionados

- **039**: la otra cara del mismo patrón —un `DROP TABLE` que no era una migración—, cerrada mirando la ruta.
  Ésta pide mirar la estructura del archivo, no la ruta.
- **077**: el guard aprendió a cubrir migraciones de lenguaje.
- **193**: el guard no ve el borrado idiomático de un ORM; ahí vive el punto 2 del fix.

## Cierre

**Resuelto en 0.99.0, con los tres formatos y el `Edit` adentro, como decidió el dueño.** Recorriendo lo que
enumeró:

- **Fix 1, partir por marcadores → se hizo, distinto en la forma.** No es un corte en un índice sino una
  máscara por línea (`engine/core/migrations.js`, `sqlMask`): cada marcador `Up` devuelve al lado que aplica y
  cada `Down` lo deja, así que un archivo con los bloques en otro orden tampoco esconde nada. Goose se lee como
  lo lee su parser —comprobado el 2026-09-23 en `internal/sqlparser/parser.go` de pressly/goose, `main`: la
  línea empieza con `--` sin espacio antes, se borran `--` y `+goose`, y la anotación se compara con
  `strings.EqualFold`—: `-- +goose down` y `--+goose Down` parten, ` -- +goose Down` no. Sin marcadores se
  evalúa entero, como antes.
- **Fix 2, migraciones de lenguaje → salió al 193, y se hizo ahí** en esta misma versión.
- **Fix 3, el mensaje nombra el bloque → se hizo.** Dice la sentencia y que la reversión no se juzgó:
  «contiene SQL destructivo en el bloque que aplica (la reversión, `-- +goose Down`, no se juzga): `DROP TABLE`».
- **golang-migrate y sqlx → se hizo.** Un `*.down.<ext>` es reversión entera; el `.up.sql` se sigue juzgando.
- **dbmate → se hizo**, con su expresión literal (comprobado el 2026-09-23 en `pkg/dbmate/migration.go` de
  amacneil/dbmate, `main`: `(?m)^--\s*migrate:down(\s*$|\s+\S+)`, sensible a mayúsculas).
- **El `Edit` sobre el `Down` → se hizo, distinto de lo propuesto.** En vez de ubicar `old_string` y decidir
  un lado para todo el fragmento, el guard reconstruye el archivo como va a quedar y juzga la parte del
  fragmento que cae del lado que aplica (`judged`): un fragmento que mueve o agrega un marcador se lee en su
  lugar. Con `replace_all` cuentan todas las apariciones. Sin archivo en disco o sin `old_string` adentro, se
  juzga el fragmento entero, como antes.
- **La versión de lenguaje del bloqueo → la cerró el 193**, partiendo por `down()`/`downgrade()`.
- **Decisiones → tomadas por el dueño**: los tres formatos entran y el `Edit` también.
- **Tradeoffs → aceptados los tres como estaban escritos.** El de «depende del formato» se achicó: dbmate y
  golang-migrate ya no degradan.

**Lo que el caso no preveía.**

- **El guard dejó `files.js`.** Con tres casos encima pasaba de las 500 líneas; se partió por
  responsabilidad (R7): `engine/core/migrations.js` sabe qué es una migración, qué aplica y qué destruye, y lo
  leen el guard (`engine/hooks/migrations.js`) y `check` (196).
- **El sobre de `apply_patch` de Codex no se parte.** Ahí las líneas llegan con el prefijo del parche
  (`+-- +goose Down`), ningún marcador empieza la línea, y se evalúa entero: el comportamiento de antes, no
  uno más permisivo. Queda **sin caso propio y hay que numerarlo** al integrar —no se le asignó número acá
  porque otras sesiones abren casos a la vez y el README pide que se mueva el que no se publicó—.

### Qué se corrió

- **La reproducción del caso contra el motor arreglado** (2026-09-23, la función `guard()` de arriba y un
  `Edit` con el mismo JSON):

  ```
  --- up-down.sql                 exit=0
  --- up-only.sql                 exit=0
  --- golang-migrate .down.sql    exit=0
  --- dbmate                      exit=0
  --- Edit sobre el Down          exit=0
  --- contraste: DROP en el Up
  BLOQUEADO: api/db/migrations/20260923120001_x.sql contiene SQL destructivo en el bloque que aplica (la reversión, `-- +goose Down`, no se juzga): `DROP TABLE`.
  exit=2
  ```

  Antes del arreglo, las cinco primeras daban `exit=2` salvo `up-only.sql`, que es el síntoma del caso.
- **Pruebas nuevas en `test/hooks/migrations.test.js`, en rojo sobre el código anterior** (las seis del
  archivo fallaban) y **siete mutaciones en una copia del árbol, las siete en rojo**: goose sensible a
  mayúsculas, sin partir SQL, sin dbmate, sin el sufijo `.down`, el `Edit` sin leer el disco, `replace_all`
  ignorado y el mensaje sin nombrar el bloque.
- `npm run ci`, exit 0, en una copia con los archivos nuevos trackeados.
