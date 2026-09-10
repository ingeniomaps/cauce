---
caso: 077
titulo: El guard de migraciones sólo ve `.sql` y no dice nada donde no cubre
estado: resuelto
resuelto-en: 0.77.0
prioridad: media
version-detectada: 0.75.0
---

# 077 — `migrations` es inerte en todo proyecto cuyas migraciones no sean `.sql`

**🟢 resuelto en 0.77.0** · detectado en 0.75.0 · prioridad **media** — un guard que se cree cubriendo algo
y no lo cubre es peor que no tenerlo, y éste aparecía en verde sin proteger una sola migración

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

## Cierre

**Resuelto en 0.77.0**, y con **las dos** vías que este caso ofrecía, porque cada una sola deja la mitad
del defecto en pie.

### El recorrido de lo que este caso enumeró

- **Opción 1 —«que el filtro salga de la configuración»— se hizo, acotada a la extensión.** `ops.config.json`
  acepta `migrations.extensions`, con `["sql"]` de default. La ruta sigue fijada por el motor
  —`migrations/`, `migration/`, `migrate/`—, y eso es una decisión: el hueco medido eran 409 migraciones
  TypeORM **bajo `migrations/`**, así que la ruta no era el problema. Lo que reabriría esa mitad es
  Alembic, que las pone en `alembic/versions/` y sigue sin cubrirse.
- **Opción 2 —«que el guard lo diga»— también se hizo, y no como alternativa sino como complemento.** La
  descripción decía «Protege migraciones existentes y bloquea SQL destructivo» a secas; ahora nombra el
  campo que amplía la cobertura y el default de quien no lo declara. Sin esto, un proyecto que no
  configura nada seguiría leyendo una promesa que no se le cumple — que es el defecto, no su síntoma.
- **«No ampliar el regex a `.ts`/`.py`/`.rb` sin más» — se respetó, y es lo que hace que esto sea opt-in.**
  Ampliar el default reintroduciría el falso positivo del [039](039-el-guard-de-migraciones-bloquea-cualquier-archivo-con-sql-destructivo.md)
  por otra puerta. Quien sabe si sus migraciones son de lenguaje es el proyecto, y así el costo lo elige
  quien lo paga. Hay una mutación que lo comprueba.
- **Tradeoff «opción 1 agrega un campo y su validación» — se pagó**, y la validación resultó ser lo más
  cargado de razón: la extensión entra en una expresión regular, así que un valor con metacaracteres la
  ampliaría a todo. Se valida contra `[a-z0-9]+` en `validateOpsConfig` **y** se filtra en el guard, que
  cae al default en vez de construir un patrón que no se pidió.
- **Tradeoff «un proyecto declara `.ts` y vuelve el falso positivo del 039» — se acepta, acotado a su
  propio alcance**, con la aprobación por ruta como salida. Es la misma que ya existía.
- **Tradeoff «opción 2 no cambia ninguna conducta» — dejó de ser un costo** al tomarse junto con la 1: lo
  que se declara ahora es cierto.

### Qué se corrió

**El falso negativo, reproducido antes de tocar nada**, con el mismo `DROP TABLE users` en la misma
carpeta y cuatro extensiones:

```
1700000000000-Foo.ts        exit=0     ← TypeORM
0001-foo.sql                exit=2
0002_add_users.py           exit=0     ← Django / Alembic
20230101_create_users.rb    exit=0     ← Rails
```

**Y el mismo guard después**, sobre el mismo directorio:

```
sin declarar nada                       .ts → exit 0 · .sql → exit 2
con extensions: ["sql", "ts"]           .ts → exit 2 · .sql → exit 2 · .md → exit 0
```

**Seis mutaciones, las seis en rojo**: el guard dejando de leer lo que el proyecto declara; el default
ampliándose solo —el falso positivo del 039—; el guard aceptando cualquier cadena en la expresión regular;
la ruta dejando de decidir; la descripción volviendo a prometer de más; y el validador aceptando una
extensión inválida.

**Todas en un clon desechable bajo `/tmp`**, con el árbol de trabajo comprobado intacto (R23). Dos de
ellas —la del guard y la del validador— **sobrevivieron en su primera versión** y obligaron a escribir los
casos que las ejercen; la del validador ni siquiera se estaba aplicando, por la indentación del reemplazo.

**La puerta entera**: 659 pruebas, 0 fallos.

### Lo que no se pudo correr, y se dice

La medición que originó el caso —64 `.sql` cubiertas contra 409 `.ts` invisibles— es de la instancia
sidecar y no se puede rehacer desde acá. Lo que sí se reprodujo es la causa: el mismo contenido, la misma
carpeta, y sólo una extensión juzgada.
