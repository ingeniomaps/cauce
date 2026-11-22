---
caso: 539
titulo: el merge, la aprobación o el workflow que `delivery` frena por `gh` pasan si se piden por la API
estado: abierto
prioridad: media
version-detectada: 0.124.0
---

# 539 — el merge, la aprobación o el workflow que `delivery` frena por `gh` pasan si se piden por la API

**🔴 abierto** · detectado en 0.124.0 · prioridad **media**: no hay incidente medido en Cauce, pero una instancia real
construyó por su cuenta el freno que falta. Lo que pasa sin freno es lo mismo que R10 ya frena: el merge, la
aprobación y el workflow, pedidos de otra forma.

## Resumen

`delivery` (caso 225) frena los actos de R10 por la forma con que se escriben en `gh`. La misma acción, pedida a la API
de GitHub por otro camino, pasa:

- **Un workflow por la API REST:** `POST …/actions/workflows/<id>/dispatches` y `POST repos/<o>/<r>/dispatches`. Es lo
  mismo que `gh workflow run`, que sí frena.
- **Un merge o una aprobación por GraphQL:** `gh api graphql` con `mutation { mergePullRequest … }` o
  `addPullRequestReview … APPROVE`. Por REST, `gh api …/pulls/N/merge|reviews` sí frena.
- **Cerrar un PR por REST:** `PATCH repos/<o>/<r>/pulls/N` con `state=closed`. `gh pr close` sí frena.
- **La API con `curl`:** `curl -X POST https://api.github.com/repos/<o>/<r>/pulls/N/merge` no pasa por `gh`, así que
  ninguna regla lo mira.

La regla REST que hay sólo reconoce dos rutas (`engine/hooks/delivery.js:94`). No mira el método ni el cuerpo: un
`dispatches` o un `graphql` no encajan en ninguna.

## Reproducción

Sin modelo, con el arnés de guards (`test/support/hooks-harness`) y `execute('destructive', …)`. El script está en el
scratchpad de la sesión, `repro-539.js`. La primera línea es el control, que tiene que frenar:

```
FRENA  gh pr merge 12 --repo acme/app
PASA   gh api -X POST repos/acme/app/actions/workflows/deploy.yml/dispatches -f ref=main
PASA   gh api repos/acme/app/dispatches -f event_type=deploy
PASA   gh api graphql -f query='mutation { mergePullRequest(input:{pullRequestId:"X"}) { clientMutationId } }'
PASA   gh api graphql -f query='mutation { addPullRequestReview(input:{pullRequestId:"X", event:APPROVE}) { … } }'
PASA   gh api -X PATCH repos/acme/app/pulls/12 -f state=closed
PASA   curl -X POST -H "Authorization: token $T" https://api.github.com/repos/acme/app/pulls/12/merge
PASA   gh api -X POST repos/acme/app/issues/12/comments -f body=listo
PASA   gh api -X DELETE repos/acme/app/git/refs/heads/develop
PASA   gh api -X POST repos/acme/app/releases -f tag_name=v1
PASA   gh issue comment 12 --body listo
PASA   gh issue close 12
PASA   gh api repos/acme/app/pulls/12
PASA   gh api graphql -f query='{ viewer { login } }'
```

Las dos últimas son lecturas y tienen que seguir pasando. Las cinco primeras después del control son actos que R10 ya
frena en su forma de `gh`. Las otras cinco, desde el comentario por REST hasta `gh issue close`, son escrituras que R10
no nombra; para esas, ver «Decisión».

Por qué `-f` sin `-X` es un POST: `gh api --help` (2.86.0) dice «The default HTTP request method is `GET` normally and
`POST` if any parameters were added». Verificado en esta sesión.

## Síntoma

Un agente que choca con el freno de `gh pr merge` tiene a mano una forma que pasa: la misma acción por la API. Ese
desvío es justo lo que el freno existe para impedir. No hace falta mala fe: `gh api` es la forma documentada para lo que
`gh` no trae como subcomando, y un agente la elige sola.

Una instancia real lo vio y construyó su propio guard de entrega. Frena:
- cualquier escritura por `gh api` bajo el repositorio de su organización;
- un `dispatches` en cualquier repositorio;
- cualquier mutación GraphQL, y una consulta que llega por archivo (`-F query=@x`, `--input`), que no se puede leer;
- `curl` y `http` contra `api.github.com`.

## Causa raíz

El 225 armó `delivery` por las formas de `gh` que conocía, y la API la cubrió con una sola ruta REST
(`delivery.js:94`). El enunciado del 225 nombra `gh api …/pulls/N/merge|reviews` y nada más de la API. Los
`dispatches`, GraphQL y `curl` no se consideraron.

## Fix propuesto

Una regla de `delivery` que lea la llamada a la API en vez de la ruta:

- **El método:** `-X`/`--method`, o POST si hay `-f`/`-F`/`--field`/`--raw-field`/`--input` sin método (la ayuda de
  `gh` citada arriba). Un GET pasa siempre.
- **REST:** frenan las rutas que son un acto de R10:
  - `…/pulls/N/merge` y `…/pulls/N/reviews`, como hoy;
  - `…/pulls/N` con PATCH;
  - `…/dispatches`;
  - `…/releases` con escritura;
  - `…/actions/runs/N/rerun`.
- **GraphQL:** frena una consulta que contiene `mutation`, y también una que no se puede leer porque llega por archivo
  (la dirección segura).
- **`curl`, `wget` y `http`/`https`** contra `api.github.com`, con el mismo método y la misma ruta. GraphQL por un
  cliente HTTP frena siempre, porque el cuerpo no se lee.
- **El ítem de aprobación** nombra el método y la ruta (`gh api POST repos/acme/app/dispatches`). Así una línea de
  `.ops-approval` o una orden de chat lo puede nombrar, y vale en el lugar de `GH` (caso 446): el repositorio sale de
  la ruta.

## Decisión

**Qué escrituras de la API frena el motor.** Dos formas, y cambian lo que baja a todas las instancias:

1. **Sólo los actos de R10** (la lista de arriba). Es lo que R10 ya promete, así que no cambia el producto: cierra el
   desvío. Comentar un issue, borrar una rama o ponerle una etiqueta siguen pasando, como pasan hoy por `gh issue`.
2. **Toda escritura por la API, cerrada por defecto (R27).** Es lo que hizo la instancia para su organización. Agrega
   un freno que R10 no nombra: comentar un issue por la API frenaría, y `gh issue comment` no, salvo que se amplíe
   también. Es una regla nueva para todas las instancias, no un desvío que se cierra.

**Decidido: la 1** (Manuel, 2026-11-22, sobre esta recomendación). Cierra lo que se puede probar como desvío sin decidir nada nuevo. La 2 es otra discusión, que
toca a R12 («enviar mensajes»), y si se quiere va como caso propio con `gh issue` adentro.

## Tradeoffs

- **Falsos frenos sobre lecturas:** `gh api graphql -f query='{…}'` es un POST y una lectura. Por eso GraphQL se juzga
  por `mutation` y no por el método. Lo que se prueba es que las lecturas de la reproducción sigan pasando.
- **`mutation` dentro de un valor que no es la consulta** (un `-f body='… mutation …'` en REST) no importa, porque en
  REST manda la ruta. En GraphQL, la palabra fuera de la consulta frena de más, que es la dirección segura.
- **Una lista de rutas es una lista** (R27): una ruta nueva de la API nace abierta. Se acepta igual que en el 225, que
  lo dijo para los deploys. Lo que frena es el acto de R10, y la lista se compara contra esos seis actos, no contra la
  API entera.
- **Es un agregado al guard** y no quita nada, así que no pide comparar antes y después. Sí pide la aserción de que lo
  que pasaba y tiene que seguir pasando (las lecturas, `gh pr view`) siga pasando.
- **Prueba real:** una sesión de `claude -p` en un banco, que choque con el freno de `gh pr merge` y no lo esquive por
  la API. Cuesta menos de USD 1 y se pregunta antes.

## Contexto de descubrimiento

Paso 3 de la auditoría de una instancia (2026-11-21), ítem 9 del nivel 2: «ampliar `delivery`». El guard de entrega de
la instancia tiene 497 líneas y cubre REST, GraphQL y clientes HTTP. Lo general de ese guard es esto. Lo propio de la
instancia, como su organización y su script de evidencia, se queda allá.

## Relacionados

- 225: `delivery`, y por qué un guard de shell no cierra todo lo que podría desplegar.
- 446: dónde vale una aprobación de `gh` (el quinto lugar de cada regla).
- 280 y 520: el ítem de un merge, un cierre o una reapertura leído por partes.
- 540: el `--repo` que nombra el original. Es otro defecto en el mismo guard.
- 541: las mismas escrituras por un servidor MCP, que no pasan por el shell.
