---
caso: 411
titulo: el id del runner de una línea sale de la carpeta desde donde se corre ops, y plan-first lo busca bajo el de la instancia
estado: resuelto
resuelto-en: 0.112.0
prioridad: alta
version-detectada: 0.111.0
---

# 411 — `ops context --line web` desde la carpeta de sesión escribe el plan bajo `<carpeta>#line/web`, y `plan-first` busca `<instancia>#line/web`: la escritura en el árbol de la línea se frena con «hay plan escrito, pero bajo otro id»

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **alta**. La salida de `ops line` dice «`--line web` en context y claim»
sin decir desde dónde. Corrido desde la carpeta de sesión —donde se abre la sesión— o desde el árbol de la línea, el reclamo y
el plan quedan bajo un id que el guard no busca, y la sesión que los escribió no puede tocar el producto.

## Resumen

`runner(line)` (`engine/planning/claims.js:56-60`) arma el id con el `git rev-parse --show-toplevel` del proceso: desde la
instancia da `<instancia>#line/web`; desde la carpeta de sesión, que en sidecar no es un repo git, da `<carpeta>#line/web`; desde
el árbol de la línea, el del árbol. `linePlan` (`engine/hooks/files.js:242-247`) busca siempre el de la instancia. Lo de antes
de las líneas ya era así para el id sin línea (caso 152); con la línea, el nombre de la línea es explícito y la base sigue
saliendo del directorio.

**autobuild no queda afectado**: corre `ops` «desde ${ROOT}», la instancia (`automatization/workflows/autobuild.js:811`,
`:878`), y ahí los dos ids coinciden. Lo que lo sufre es todo lo demás: una persona o un agente que sigue la salida de
`ops line` desde la carpeta de sesión, y otro runner que corre `ops` desde donde lo deja su shell.

## Reproducción

El 2026-10-20, en un banco instalado fuera del árbol, con la línea `web` sobre `app`:

1. Un programador de Antigravity corrió `ops context` y `ops claim --line web` desde la carpeta de sesión. El WIP quedó como
   `wip/…-scratchpad-w406-line-web.md`, el reclamo con ese id, y `ops runners` lista `<W>#line/web`.
2. `ops context <instancia>/planning --line web`, según desde dónde:

   ```
   desde <W>                TASK unificar-color-primario … WIP Review · 3✓/0○
   desde <W>/lines/web/app  TAKEN unificar-color-primario (t@t — vos, desde otro runner)
                            PLAN … retomalo con `export CAUCE_RUNNER=<W>#line/web`
   desde <W>/ops            TAKEN … (vos, desde otro runner) … `export CAUCE_RUNNER=<W>#line/web`
   ```

3. El guard instalado (`ops/automatization/hooks/guard-files.sh`, con `CLAUDE_PROJECT_DIR`), para una escritura en
   `lines/web/app/src/components/Card.jsx`, desde la carpeta de sesión y desde el árbol: exit 2, «cambia el producto sin plan.
   hay plan escrito, pero bajo otro id: …-w406-line-web».
4. Una sesión real de Claude (`claude -p`) abierta en la carpeta de sesión, que delegó el mismo cambio en un subagente: el
   subagente quedó frenado con ese mismo mensaje y dejó el archivo sin tocar. (La sesión principal habría pasado, porque lo que
   pide la persona en el chat no se frena.)

## Causa raíz

`engine/planning/claims.js:58-59`: la base del id de una línea sale del directorio del proceso. `engine/hooks/files.js:245-246`:
el guard la saca de la instancia.

## Fix propuesto

Que el id de una línea tenga una sola base, la instancia, venga de donde venga el comando: `runner(line)` la toma de la raíz
ops que el comando recibe (`<planning-dir>`), no del `cwd`, cuando hay línea. Sin línea no cambia nada, y ese cambio, si hace
falta, es del caso 152. `CAUCE_RUNNER` sigue ganando.

Y la salida de `ops line`, que hoy dice «`--line web` en context y claim», puede dejar de depender de desde dónde se corran.

La aceptación pide la mutación: con la base sacada otra vez del `cwd`, la prueba que corre `context`/`claim --line web` desde
la carpeta de sesión y después escribe en el árbol por el guard ve la negativa y falla. Por R9, la quita: el id que reclamaba
desde la instancia antes del cambio es el mismo después, para que un reclamo vivo no quede huérfano.

## Tradeoffs

- Un reclamo ya escrito bajo `<carpeta>#line/<línea>` queda con el id viejo: `ops context` ya lo muestra como «vos, desde otro
  runner» con la salida de `CAUCE_RUNNER`, así que no se pierde, pero hay que decirlo en el CHANGELOG.

## Contexto de descubrimiento

En el experimento del caso 406, al mirar en disco lo que dejó el programador de Antigravity.

## Relacionados

- 152 — el id que cambia según el árbol, sin línea.
- 394 — la disposición de las líneas que trajo el id con línea.
- 410 — por qué el programador de Antigravity no se vio frenado por esto.

## Cierre

**Resuelto en 0.112.0.** `runner(line, root)` (`engine/planning/claims.js`): con línea, la base del id es el repositorio de la
raíz ops que recibe el comando, y no el del directorio del proceso. Los cinco llamadores de la CLI —`context`, `claim` (dos),
`release`, `worktree` (dos)— le pasan su raíz, y `linePlan` (`engine/hooks/files.js`), el de `plan-first`, usa la misma función
en vez de su propio cálculo, así que el id que se escribe y el que se busca salen del mismo lugar.

El enunciado, ítem por ítem:

- **Una sola base, la instancia, cuando hay línea; `CAUCE_RUNNER` sigue ganando**: hecho.
- **Sin línea no cambia nada**: así; sale del directorio del proceso como antes. Lo del caso 152 no se tocó.
- **La salida de `ops line` puede dejar de depender de desde dónde se corran**: no hizo falta cambiarla. Ahora es verdad tal
  como está: «`--line web` en context y claim» da el mismo id desde cualquier carpeta.
- **La mutación**: tres, abajo.
- **R9, el id desde la instancia es el mismo de antes**: la prueba espera `<instancia real>#line/pagos` también corriendo
  desde la instancia, que es lo que autobuild usa; y sin línea el código es el mismo.
- **Tradeoff, un reclamo viejo bajo `<carpeta>#line/<línea>`**: queda con su id, y `ops context` lo sigue mostrando como «vos,
  desde otro runner» con la salida de `CAUCE_RUNNER`. Lo dice el CHANGELOG.

Lo que el caso no preveía: ninguna prueba de 0.111.0 podía ver esto. El `cwd` por defecto del ayudante de las pruebas es
`engine/cli`, dentro del repo de Cauce, y la suite fija `CAUCE_RUNNER`. La prueba nueva lo quita y corre desde las tres
carpetas. Y llamar al guard en el mismo proceso desde la carpeta de sesión sin `OPS_ROOT` lo deja sin raíz y sin juzgar nada:
la primera versión de la prueba pasaba por eso con el guard roto, y se vio porque una mutación sobrevivió. Ahora le da la
raíz como el shim instalado (`run-hook.sh` exporta `OPS_ROOT`).

**Lo que se corrió para saber que funciona.**

- `test/hooks/line-trees.test.js`, «el id de una línea no depende de la carpeta desde donde se corre ops»: `claim --line`
  desde la carpeta de sesión; `context --line --json` desde la carpeta de sesión, el árbol y la instancia dan el mismo
  `wipFile`, el de la instancia; con el plan escrito ahí, `plan-first` deja escribir en el árbol desde la carpeta de sesión y
  desde el árbol, y sigue frenando en el checkout principal; `release --line` desde el árbol. Roja antes del cambio
  (`actual: '…-line-pagos.md'`, `expected: '…-ops-line-pagos.md'`).
- Mutaciones en una copia fuera del árbol, las tres en rojo: la base otra vez del `cwd`; `linePlan` sin la raíz; `context`
  sin la raíz.
- **Real**, en un banco instalado fuera del árbol, con Claude y Antigravity instalados, la línea `web` sobre `app` y una tarea
  de esa línea:
  - `ops claim ops/planning t-web --line web` desde la carpeta de sesión imprime `export CAUCE_RUNNER=<W>/ops#line/web`, y
    `context` desde ahí da el WIP `…-w410-rama-ops-line-web.md`;
  - con el plan escrito ahí, una sesión `claude -p` en la carpeta de sesión que delega la edición de
    `lines/web/app/src/app.js` en un subagente: editado, «Ningún hook frenó la edición» (USD 0,90). El mismo pedido con el
    código de 0.111.0, en el experimento del 406, terminó frenado con «hay plan escrito, pero bajo otro id»;
  - `agy -p` en el árbol de la línea, con el puente del 410: con ese plan, editado; sin el plan, negado con «…app.js cambia
    el producto sin plan. WIP está en IDLE…».
