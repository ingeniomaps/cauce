---
caso: 193
titulo: El guard de migraciones no ve un borrado escrito con la API del ORM, sólo el SQL crudo
estado: resuelto
resuelto-en: 0.99.0
prioridad: media
version-detectada: 0.98.0
---

# 193 — Una migración de lenguaje borra una tabla y el guard la deja pasar

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **media**. Declarar `migrations.extensions` promete cubrir las
migraciones de lenguaje, y lo que cubre es el SQL crudo que aparezca adentro: `op.drop_table`, `drop_table`,
`queryRunner.dropTable` o `knex.schema.dropTable` en el `up` pasan sin nada que los frene.

## Resumen

`migrations()` decide con `destructiveSql`, una regex de SQL: `drop table|database|schema|column|constraint`,
`truncate` y `delete from …;`. Desde el caso 077 un proyecto puede declarar `.py`, `.rb`, `.ts` o `.js` como
migraciones, pero en esos formatos la forma habitual de borrar no es SQL sino una llamada a la API del ORM, y la
regex no la reconoce. El guard queda cableado y en verde sobre archivos en los que no puede frenar nada de lo
que se escribe normalmente: el mismo «aparece cubierto y no lo está» que el 077 vino a cerrar.

## Reproducción

Desde un directorio vacío, con la misma raíz mínima y la misma función `guard()` del caso 185 (sección
Reproducción: `node engine/hooks/run.js migrations` con el JSON del hook por stdin), declarando las
extensiones:

```bash
echo '{"migrations":{"extensions":["sql","py","rb","ts","js"]}}' > inst/ops.config.json

cat > al.py <<'PY'
from alembic import op

def upgrade():
    op.drop_table("catalog_items")

def downgrade():
    pass
PY
cat > rails.rb <<'RB'
class DropCatalogItems < ActiveRecord::Migration[8.0]
  def up
    drop_table :catalog_items
  end
end
RB
cat > torm.ts <<'TS'
import { MigrationInterface, QueryRunner } from 'typeorm'
export class DropCatalogItems1727092800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('catalog_items')
  }
  public async down(): Promise<void> {}
}
TS
cat > knex.js <<'JS'
exports.up = (knex) => knex.schema.dropTable('catalog_items')
exports.down = () => {}
JS
sed 's/op.drop_table("catalog_items")/op.execute("DROP TABLE catalog_items")/' al.py > al-raw.py

guard migrations/versions/20260923_drop.py              al.py
guard db/migrate/20260923120000_drop_catalog_items.rb   rails.rb
guard src/migrations/1727092800000-DropCatalogItems.ts  torm.ts
guard migrations/20260923120000_drop.js                 knex.js
guard migrations/versions/20260923_drop.py              al-raw.py   # contraste: el mismo borrado en SQL crudo
```

## Síntoma

Salida real, 2026-09-23, Cauce 0.98.0 en `83fc8698`. Las cuatro migraciones que borran la tabla con la API de
su herramienta:

```
--- al.py → migrations/versions/20260923_drop.py
exit=0
--- rails.rb → db/migrate/20260923120000_drop_catalog_items.rb
exit=0
--- torm.ts → src/migrations/1727092800000-DropCatalogItems.ts
exit=0
--- knex.js → migrations/20260923120000_drop.js
exit=0
```

El contraste —el mismo `upgrade()` con el borrado escrito en SQL crudo— sí se frena:

```
--- al-raw.py → migrations/versions/20260923_drop.py
BLOQUEADO: migrations/versions/20260923_drop.py contiene SQL destructivo.
exit=2
```

O sea que la ruta y la extensión están bien: el archivo se reconoce como migración. Lo que no se reconoce es
el borrado.

## Causa raíz

- **`engine/hooks/files.js:316-321`**: `destructiveSql` es la única definición de «destructivo», y es de SQL.
  Se evalúa en `:339` sobre cualquier archivo que `migrationPattern` (`:301-308`) acepte, sin distinguir
  extensión.
- **El 077 amplió el alcance y no el criterio.** El comentario de `:281-297` razona sobre qué archivos mirar
  —y por qué no ampliar el default a `.ts`/`.py`/`.rb`— pero la pregunta de qué buscar adentro de un archivo
  de lenguaje no se hizo: se heredó la de `.sql`.

## Fix propuesto

Agregar a la regex las formas de borrar de cada herramienta que la documentación pública nombra. Las
comprobadas el 2026-09-23 (documentado: la página se descargó y el nombre aparece en ella):

| Herramienta | Borrar tabla | Borrar columna | Fuente |
|---|---|---|---|
| Alembic | `op.drop_table` | `op.drop_column` | https://alembic.sqlalchemy.org/en/latest/ops.html |
| Rails | `drop_table` | `remove_column` | https://github.com/rails/rails/blob/main/guides/source/active_record_migrations.md |
| TypeORM | `queryRunner.dropTable` | `queryRunner.dropColumn` | https://github.com/typeorm/typeorm/blob/master/docs/docs/migrations/09-api.md |
| Knex | `knex.schema.dropTable` | `table.dropColumn` | https://github.com/knex/documentation/blob/main/src/guide/schema-builder.md |
| Django | `migrations.DeleteModel` | `migrations.RemoveField` | https://docs.djangoproject.com/en/5.2/ref/migration-operations/ |

Una forma posible, sin decidir:

```diff
   const destructiveSql = new RegExp(
     String.raw`\bdrop\s+(?:table|database|schema|column|constraint)\b` +
       String.raw`|\btruncate\b` +
-      String.raw`|\bdelete\s+from\s+\S+\s*(?:;|$)`,
+      String.raw`|\bdelete\s+from\s+\S+\s*(?:;|$)` +
+      String.raw`|\b(?:drop_table|drop_column|remove_column|dropTable|dropColumn|DeleteModel|RemoveField)\b`,
     'i',
   )
```

Esa lista es la de las páginas de arriba y no más. Otras variantes de las mismas herramientas —`dropTableIfExists`
de Knex, `remove_columns` o `drop_join_table` de Rails, `dropColumns` de TypeORM— son **hipótesis** hasta
contrastarlas con la misma fuente; se agregan comprobadas, no de memoria.

Si el 185 entra antes, esto convive con él: la reversión del lenguaje (`downgrade()` en Alembic, `down` en
Rails y en TypeORM, `exports.down` en Knex) no debería frenar, y ampliar la regex sin partir por método haría
que cada `down()` honesto se frene, que es el 185 trasladado a otra extensión.

## Tradeoffs

- **Más falsos positivos en archivos de lenguaje.** `\bdrop_table\b` también aparece en un comentario o en un
  helper. Es el mismo costo que el 039 y el 077 aceptaron para `.sql`, y sigue siendo opt-in: sólo lo paga
  quien declaró la extensión.
- **La lista envejece.** Cada ORM que se agregue pide su fila. Lo que no se nombre sigue pasando, igual que hoy.
- **La coincidencia no distingue herramientas**: `DeleteModel` en un `.ts` también frenaría. Filtrar por
  extensión lo evita a cambio de más código; no parece que haga falta.

## Prioridad

Media. No frena trabajo —pasa de largo—, así que nadie lo va a reportar solo; pero es un guard que se presenta
como cubriendo algo que no cubre, en el camino principal de cualquier proyecto con ORM que haya seguido la
salida del 077.

## Contexto de descubrimiento

Revisando el caso 185 el 2026-09-23 (paso 1 del recorrido): al comprobar si su punto 2 —partir también las
migraciones de lenguaje por su `down()`— cerraba algo, la regex resultó no reconocer el borrado idiomático en
ningún lado del archivo, `up` incluido.

De paso apareció otro defecto, que salió como caso propio: el guard no reconoce `alembic/versions/`, la carpeta
por defecto de Alembic, así que ahí no frena ni el SQL crudo — ver **196**.

## Relacionados

- **185**: la cara opuesta —el guard frena la reversión honesta—. Su punto 2 (partir por `down()`) remite acá:
  no tiene sentido partir por método mientras el `up` idiomático no se vea.
- **077**: amplió qué archivos se miran; éste es lo que quedó pendiente de esa ampliación.
- **196**: en `alembic/versions/` el guard no reconoce ni el archivo, así que este caso ni llega a aplicar.
- **039**: el costo de falsos positivos que cualquier ampliación del criterio vuelve a pagar.

## Cierre

**Resuelto en 0.99.0, con la lista del caso más las cuatro hipótesis comprobadas, y partiendo el `down()` de
lenguaje.** Recorriendo lo que enumeró:

- **Fix propuesto, ampliar lo que cuenta como borrado → se hizo, distinto en la forma.** No se sumó a la
  expresión de SQL sino a una propia, `DESTRUCTIVE_API` en `engine/core/migrations.js`, **sensible a
  mayúsculas**: con la `i` del SQL, `droptable` o `deletemodel` en prosa también frenaban. Entran las diez
  filas de la tabla del caso.
- **Las variantes marcadas hipótesis → comprobadas y agregadas** (2026-09-23, la página se descargó y el
  nombre aparece en ella): `knex.schema.dropTableIfExists(tableName)` en
  https://github.com/knex/documentation/blob/main/src/guide/schema-builder.md; `remove_columns` y
  `drop_join_table` en https://github.com/rails/rails/blob/main/guides/source/active_record_migrations.md;
  `dropColumns(table, columns, ifExists?)` en
  https://github.com/typeorm/typeorm/blob/master/docs/docs/migrations/09-api.md.
- **Convivir con el 185, partir por el método de reversión → se hizo.** Sin esto, cada TypeORM o Knex que
  crea una tabla se frenaba por su `down()`, que es el 185 trasladado. Se reconoce el encabezado al principio
  de la línea —`def downgrade(` de Alembic, `def down`/`def self.down` de Rails, `down(` con sus modificadores
  en TypeORM, `exports.down =` y `export function down` de Knex— y **el bloque termina donde la indentación
  vuelve a la del encabezado**. No es parsear el lenguaje, y por eso es barato: las herramientas generan sus
  migraciones con ese formato, y un archivo con otro formato acorta el bloque, así que se juzga de más y no de
  menos. El único borde abierto es escribir `up` en la misma línea que el encabezado de `down`; una llamada a
  `down(knex)` dentro de `up` no cuenta como encabezado, y está probado.
- **Tradeoff de falsos positivos → aceptado**, sigue siendo opt-in por extensión.
- **Tradeoff de la lista que envejece → aceptado**; el comentario lo dice donde vive la lista.
- **Tradeoff de no filtrar por extensión → se decidió que no hace falta**: la sensibilidad a mayúsculas
  saca el ruido que motivaba la duda.

**Lo que el caso no preveía.**

- **La misma página de TypeORM define otros tres borrados** —`dropSchema`, `dropDatabase`, `clearTable`— y la
  de Rails `remove_reference`. No entraron: el dueño pidió la lista del caso y nada más. Agregarlos es una
  línea y su prueba; queda para decidir.
- **Django no tiene `down`**: la reversión la calcula el framework, así que en sus migraciones se juzga todo
  el archivo, y una función de reversión de `RunPython` que borre frena igual. Es correcto por construcción,
  y se dice para que nadie busque ahí un corte que no existe.

### Qué se corrió

- **La reproducción del caso contra el motor arreglado** (2026-09-23): las cuatro migraciones que antes daban
  `exit=0` ahora frenan, y el contraste sigue frenando:

  ```
  --- al.py     BLOQUEADO: … contiene un borrado destructivo en el bloque que aplica (la reversión, `downgrade()`, no se juzga): `drop_table`.  exit=2
  --- rails.rb  BLOQUEADO: … contiene un borrado destructivo: `drop_table`.  exit=2
  --- torm.ts   BLOQUEADO: … (la reversión, `down()`, no se juzga): `dropTable`.  exit=2
  --- knex.js   BLOQUEADO: … (la reversión, `exports.down`, no se juzga): `dropTable`.  exit=2
  --- al-raw.py BLOQUEADO: … contiene SQL destructivo en el bloque que aplica …: `DROP TABLE`.  exit=2
  --- reversión honesta TypeORM (createTable en up, dropTable en down)  exit=0
  ```
- **Pruebas nuevas en `test/hooks/migrations.test.js`, en rojo sobre el código anterior**, y **cinco
  mutaciones en una copia del árbol, las cinco en rojo**: sin la expresión de la API, sin
  `dropTableIfExists`, sin partir lenguaje, el bloque de `down` hasta el final del archivo, y el encabezado
  sin anclar al principio de la línea. Una sexta —no contar la línea de cierre como parte del bloque—
  sobrevivió: era inobservable, porque un `}` o un `end` no destruyen nada, y se sacó del código.
- `npm run ci`, exit 0, en una copia con los archivos nuevos trackeados.
