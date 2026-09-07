---
caso: 038
titulo: Cuatro guards siguen abriéndose por sesión, y la aprobación por operación ya les encaja
estado: abierto
prioridad: media
version-detectada: 0.64.0
---

# 038 — La aprobación por operación existe y sólo la usa un guard

**🔴 abierto** · detectado en 0.64.0 · prioridad **media** — la salida ancha es la única que queda en cuatro guards

## Resumen

0.64.0 le dio a `governance` una aprobación **por operación**: un archivo que nombra las rutas
autorizadas y que el guard coteja contra el índice. Los otros cuatro guards que se pueden abrir siguen
teniendo una sola salida, una variable de entorno, y esa es **por sesión**: el guard la lee de su propio
proceso, así que la forma que funciona —exportarla donde arranca el runner— lo deja apagado hasta que
la sesión cierre.

| variable | qué abre | alcance |
|---|---|---|
| `OPS_MIGRATIONS_OVERRIDE` | SQL destructivo en una migración | sesión |
| `OPS_TEST_EVIDENCE_OVERRIDE` | borrar o apagar una prueba | sesión |
| `OPS_DEPENDENCIES_OVERRIDE` | manifiestos, lockfiles, publicar, instalar global | sesión |
| `OPS_SKIP_VERIFY` | saltear los gates antes de un commit | sesión |

El `Makefile` de este repositorio ya dice cuál es el alcance correcto —«la autorización de R10 es por
operación y humana»—, y cuatro de las cinco salidas no lo cumplen.

## Reproducción

No hay un comando que falle: el defecto es el alcance, no el comportamiento. Se observa así:

```bash
grep -n "process.env.OPS_" engine/hooks/files.js engine/hooks/shell.js
#   → cinco interruptores; cuatro sin más salida que la variable

grep -n "AP.read" engine/hooks/shell.js
#   → un solo consumidor: governance
```

*Verificado* el 2026-09-07 sobre 0.64.0.

## Causa raíz

Cuando se construyó la aprobación se descartó extenderla con este argumento: los otros guards corren en
`pre-files`, sobre una escritura suelta, y «no hay un conjunto stageado contra el cual cotejar». El
argumento se dijo al decidir el alcance y **no quedó escrito en el 034**, así que hasta ahora no había
dónde revisarlo — que es la otra mitad de por qué este caso existe.

**Eso es falso, y es lo que este caso viene a corregir.** La entrada de un guard de archivos trae la
ruta —`fileOf` la saca de `file_path`, y `patchOf` la saca del sobre de `apply_patch`—, así que un guard
de archivos sí puede saber sobre qué está decidiendo. `test-evidence` ya la usa: lee el `*** Delete
File:` del parche para saber qué prueba se borra. Y `migrations` la usa en su segundo chequeo, el que
detecta la reescritura de una migración existente. Una aprobación por ruta —que es exactamente la forma
que ya existe— encaja igual de bien: aprobar `db/migrations/003.sql` autoriza ese archivo y ninguno más.

Con una salvedad que hay que resolver primero: el chequeo de SQL destructivo de `migrations` bloquea
mirando **sólo el contenido**, sin consultar la ruta que tiene a mano. Ahí no hay a qué atar la
aprobación hasta que lea `filesOf(input)`, que es lo que pide el
[039](039-el-guard-de-migraciones-bloquea-cualquier-archivo-con-sql-destructivo.md).

Y `dependencies` y `verify` corren sobre commits, así que les sirve el mecanismo tal como está, sin
adaptarlo.

## Fix propuesto

Que los cuatro consulten la aprobación antes de bloquear, con el mismo archivo y la misma semántica de
cotejo que usa `governance`. La pieza ya está escrita —`engine/hooks/approval.js`— y lo que falta es
llamarla desde cada guard con lo que ese guard tiene a mano:

- `migrations` y `test-evidence`: las rutas de `filesOf(input)`.
- `dependencies` y `verify`: las rutas del índice, igual que `governance`.

Dos decisiones que conviene tomar antes de escribir:

- **¿Un archivo o cuatro?** Uno solo es más simple y hace que una aprobación de migración autorice
  también un borrado de prueba si ambas rutas están listadas — que puede estar bien, porque las escribió
  una persona a propósito. Cuatro separa las autorizaciones a cambio de cuatro archivos que limpiar.
  Con uno solo, el nombre `.governance-approval` deja de describir lo que hace.
- **¿La variable se queda?** Hoy es la salida documentada de los cuatro y sacarla rompería a quien la
  use. Lo razonable es dejarla, con su alcance dicho —que ya lo está en `AGENTS.md`— y que la aprobación
  sea la vía recomendada, igual que en `governance`.

Y una que **no** hay que tomar: extender el cotejo a `git-add`. Ahí la prohibición de R8 no tiene
excepción configurable, y darle una sería inventar un permiso que la regla no da.

## Tradeoffs

Cuatro guards más consultando un archivo es cuatro veces la superficie de un mecanismo que hoy tiene un
solo consumidor y ninguna corrida en producción. Conviene que salga junto con lo que enseñe el uso de la
aprobación de gobernanza, no antes.

Y hay un costo que no es técnico: cinco salidas con dos formas distintas es peor de explicar que cinco
con una. Mientras estén mezcladas, `AGENTS.md` tiene que contar las dos, que es lo que hace hoy.

## Prioridad

**Media.** No desprotege por sí solo: las cuatro variables ya existían y ahora están documentadas con su
alcance, así que quien las use sabe qué está haciendo. Lo que falta es que pueda elegir la salida
angosta, y hoy no puede.

## Contexto de descubrimiento

Al cerrar el [034](034-el-override-de-gobernanza-no-tiene-camino-documentado.md), el 2026-09-06, se dijo
que la aprobación no encajaba en los guards de archivos. Al revisar esa afirmación para contestar si
convenía atender el hilo o esperar, resultó equivocada: un guard de archivos conoce su objetivo tan bien
como uno de commits conoce el índice.

## Relacionados

- [034](034-el-override-de-gobernanza-no-tiene-camino-documentado.md) — de donde sale, y donde se
  construyó la aprobación que acá se extiende.
- [039](039-el-guard-de-migraciones-bloquea-cualquier-archivo-con-sql-destructivo.md) — apareció
  comprobando la causa raíz de éste, y lo precede: sin ruta no hay a qué atar la aprobación.
