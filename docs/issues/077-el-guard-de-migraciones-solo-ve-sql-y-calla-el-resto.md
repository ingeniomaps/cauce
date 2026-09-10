---
caso: 077
titulo: El guard de migraciones sólo ve `.sql` y no dice nada donde no cubre
estado: abierto
prioridad: media
version-detectada: 0.75.0
---

# 077 — `migrations` es inerte en todo proyecto cuyas migraciones no sean `.sql`

**🔴 abierto** · detectado en 0.75.0 · prioridad **media** — un guard que se cree cubriendo algo y no
lo cubre es peor que no tenerlo, y éste aparece en verde sin proteger una sola migración

## Resumen

`migrations` filtra por ruta **y por extensión**: sólo juzga archivos bajo `migrations/`, `migration/` o
`migrate/` que terminen en `.sql`. En un proyecto TypeORM, Prisma, Django, Rails o Alembic —donde la
migración es un archivo de lenguaje— el guard **no mira nada**: ni frena el SQL destructivo, ni protege
una migración existente de ser reescrita.

No avisa que no cubre. Aparece en `automation check` entre los quince, `list-hooks` lo describe como
«Protege migraciones existentes y bloquea SQL destructivo sin override», y un proyecto así lo tiene
cableado y en verde sin que proteja una sola migración. Un guard que se cree cubriendo algo y no lo cubre
es peor que no tenerlo: es el mismo criterio con que está escrita la granularidad de `go-test` en
`gate_signature`, aplicado al revés.

## Reproducción

Desde un directorio vacío:

```sh
mkdir -p proyecto/migrations && cd proyecto
printf '{"project":"probe","mode":"embedded","workspaceRoots":[{"name":"main","path":"."}]}\n' > ops.config.json
printf 'export class Foo1700000000000 {\n  async up(q) { await q.query("DROP TABLE users") }\n}\n' > migrations/1700000000000-Foo.ts
printf 'DROP TABLE users;\n' > migrations/0001-foo.sql

# el mismo DROP TABLE, en la misma carpeta, con dos extensiones
printf '{"tool_name":"Write","tool_input":{"file_path":"%s/migrations/1700000000000-Foo.ts","content":"DROP TABLE users"},"cwd":"%s","session_id":"p"}' "$PWD" "$PWD" \
  | OPS_ROOT=$PWD node <cauce>/engine/hooks/run.js migrations; echo "exit $?"

printf '{"tool_name":"Write","tool_input":{"file_path":"%s/migrations/0001-foo.sql","content":"DROP TABLE users;"},"cwd":"%s","session_id":"p"}' "$PWD" "$PWD" \
  | OPS_ROOT=$PWD node <cauce>/engine/hooks/run.js migrations; echo "exit $?"
```

## Síntoma

```
── .ts con DROP TABLE (migración TypeORM) ──
  exit 0

── .sql con el mismo contenido ──
BLOQUEADO: …/migrations/0001-foo.sql contiene SQL destructivo.
Aprobalo escribiendo esa(s) ruta(s) en planning/.ops-approval, una por línea: vale para ese conjunto y
deja de valer en cuanto cambie. La variable OPS_MIGRATIONS_OVERRIDE=1 sigue existiendo y apaga el guard
para toda la sesión, que es por lo que no es la vía recomendada.
  exit 2
```

## Causa raíz

`engine/hooks/files.js:200`

```js
if (!/(?:^|\/)(?:migrations?|migrate)\/.*\.sql$/i.test(normalized)) continue
```

El filtro nació al arreglar el [caso 039](./039-el-guard-de-migraciones-bloquea-cualquier-archivo-con-sql-destructivo.md):
el chequeo de SQL destructivo no filtraba por nada y frenaba cualquier `.md` que mencionara `DROP TABLE`.
Compartir el filtro entre los dos chequeos fue el arreglo correcto para aquello.

El comentario que quedó nombra un costo de ese cambio —«una migración escrita fuera de un directorio con
ese nombre deja de frenarse. Es deliberado»— pero nombra **el directorio**, no **la extensión**. La
restricción a `.sql` entró con él y su costo no se declaró: no es un caso borde, es todo un ecosistema de
herramientas.

## Fix propuesto

Dos formas, y la elección es del proyecto:

1. **Que el filtro salga de la configuración.** Un `migrations.paths` o `migrations.extensions` en
   `ops.config.json`, con `.sql` como default. El proyecto declara dónde viven sus migraciones y con qué
   extensión, igual que declara `workspaceRoots` y `verify`.
2. **Que el guard lo diga.** Si no se amplía la cobertura, que `automation check` o `list-hooks` declaren
   el alcance real —«sólo `.sql`»— para que un proyecto TypeORM sepa que ese guard no lo cubre. Es la
   opción barata y honesta: no promete lo que no hace.

No propongo ampliar el regex a `.ts`/`.py`/`.rb` sin más: reintroduciría el falso positivo del 039 por
otra puerta —un `.ts` cualquiera que mencione `DROP TABLE` en un string o un comentario— y ese problema
ya se pagó una vez.

## Tradeoffs

- **Opción 1** agrega un campo de config y su validación, y el default `.sql` mantiene la conducta actual
  para quien no lo declare. El riesgo es que un proyecto declare `.ts` y vuelva el falso positivo del 039
  dentro de su propio alcance; ahí el override por ruta (`.ops-approval`) es la salida, que ya existe.
- **Opción 2** no cambia ninguna conducta: sólo deja de prometer. El costo es que la cobertura sigue sin
  existir, y alguien tiene que escribir el guard propio.

## Contexto de descubrimiento

Encontrado el 2026-09-09 al cablear los guards del motor en una instancia sidecar (monorepo multi-repo,
15 servicios). Al medir qué cubría cada uno antes de encenderlo aparecieron los números: **64 migraciones
`.sql`** en los servicios Go —cubiertas— y **409 migraciones TypeORM `.ts`** en los cinco NestJS
—invisibles—. El guard se cableó igual por las 64, con el límite anotado en la documentación de esa
instancia para que nadie le atribuyera la cobertura que no tiene.

## Relacionados

- [039](./039-el-guard-de-migraciones-bloquea-cualquier-archivo-con-sql-destructivo.md) — el filtro
  compartido nació ahí. Este caso es su contracara: aquél era el falso positivo, éste el falso negativo.
