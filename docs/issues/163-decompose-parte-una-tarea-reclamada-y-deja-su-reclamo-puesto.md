---
caso: 163
titulo: Decompose parte una tarea reclamada y no suelta su reclamo, así que el Claim siguiente se niega y la corrida para
estado: abierto
prioridad: alta
version-detectada: 0.90.0
---

# 163 — Partir una tarea la borra del BACKLOG y deja su reclamo puesto: el runner queda ocupado por una tarea que ya no existe

**🔴 abierto** · detectado en 0.90.0 · comprobado en 0.94.0 · prioridad **alta** — toda corrida que parta
una tarea termina en `claim-stuck`, y `check` queda en rojo con un reclamo huérfano que suelta una persona

## Resumen

El recorrido reclama la tarea antes de estimarla. Cuando Decompose la parte, la escritura reemplaza esa
línea del BACKLOG por sus subtareas y el bucle sigue —eso funciona desde 0.75.0, que es lo que arregló el
caso 071—, pero **el reclamo de la tarea partida se queda en disco**. El runner pasa a estar ocupado por
un slug que ya no existe en ninguna de las dos puntas, así que:

- el Claim de la primera subtarea se niega y la corrida para con `claim-stuck`;
- `ops check planning` falla con `✗ claims/<slug>.md: <slug> no existe en BACKLOG ni DONE`.

Las dos salidas que el propio bloqueo ofrece —cerrar la tarea o soltarla— son actos que el recorrido no
hace y que quedan para una persona. No es una carrera perdida ni un estado ambiguo: la corrida se dejó
ocupada a sí misma.

## Reproducción

1. Una tarea en el BACKLOG que no sea `express` ni `lite` —Decompose no corre en esos dos carriles— y
   cuya estimación supere `maxTaskHours`.
2. Correr `autobuild` con esa tarea a la cabeza de la cola.
3. Claim la reserva, Ready la aprueba, Decompose devuelve `needsSplit: true` y reescribe el BACKLOG.
4. La corrida vuelve al tope del bucle y pide la primera subtarea.

## Síntoma

Verbatim de la corrida `wf_a7231736-1f8`, el 2026-09-15:

```
Este runner ya tiene integraciones-por-tabla. Cerrala o soltala primero; y si sos otro agente en la
misma máquina, exportá CAUCE_RUNNER con un valor propio.
```

El recorrido paró con `claim-stuck` y el detalle correcto: *«context la ofrece y claim la rechaza, así que
repetir no cambia nada»*. La segunda frase del mensaje —la de `CAUCE_RUNNER`— manda a un diagnóstico que
acá no aplica: no hay dos agentes, hay uno con un reclamo viejo. El motor no puede distinguirlos porque
desde su lado se ven igual.

## Causa raíz

Tres piezas, ninguna equivocada por su cuenta:

- **`automatization/workflows/autobuild.js:652-666`** (0.94.0): la rama `estimate.needsSplit` escribe el
  BACKLOG, relee el contexto, comprueba que la cola ya no ofrezca la misma tarea y hace `continue`. No
  hay ninguna llamada a `release`. El único `release` del archivo está en el texto que la fase Done le
  dicta a su agente (línea 1028 de la copia instalada en la instancia).
- **`engine/cli/claims.js:42-43`**: `claim` se niega a darle una segunda tarea a un runner que ya tiene
  una. Es deliberado y está bien —es lo que evita que un id compartido en sidecar construya dos cosas a
  la vez, según el comentario de `engine/planning/claims.js:47-52`—, pero el estado que lo dispara acá lo
  creó el propio recorrido.
- **`engine/planning/claims.js`**: el reclamo es un archivo cuyo nombre es el slug. Partir la tarea
  cambia el BACKLOG y no toca `planning/claims/`, así que nada los vuelve a cruzar hasta que `check` lo
  reporta.

Y hay una cuarta pieza que llegó con 0.94.0: **R25 pide que la unidad original se cierre diciendo en qué
se partió**. El recorrido no la cierra: borra su línea. O sea que la regla nueva describe un cierre que
el recorrido no tiene forma de producir, y el reclamo huérfano es el mismo hueco visto desde el otro
lado.

## Fix propuesto

Soltar el reclamo en la misma rama que parte la tarea, antes del `continue`. Es determinista y no
necesita un agente:

```js
       if (estimate.needsSplit) {
         await write(`Reemplazá sólo ${task.id} en ${BACKLOG} por subtareas ordenadas y verificables de forma ` +
           `independiente: ${JSON.stringify(estimate.subtasks)}.`, { label: 'split' })
+        // La tarea partida deja de existir, así que su reclamo no reserva nada: lo único que hace es
+        // dejar al runner ocupado por un slug que no está ni en la cola ni en lo hecho, y ahí el Claim
+        // de la primera subtarea se niega. El reclamo lo puso esta corrida; soltarlo también le toca.
+        await releaseClaim(task.id)
         planning = await readContext()
```

Dos detalles que conviene no perder:

- **Soltar después de la escritura y no antes.** Si la escritura no ocurre —el caso que la guarda de la
  línea 660 ya contempla— la tarea sigue viva y su reclamo tiene que seguir puesto.
- **Si la partición quiere cumplir R25**, el cierre de la original va en el mismo lugar: una entrada en
  `done/` que nombre las subtareas, con `commit: n/a — partida` y `lane:` el que traía. Eso además le da
  a `check` con qué cruzar el reclamo mientras exista.

## Tradeoffs

Soltar el reclamo dentro del recorrido significa que un `autobuild` que muera justo ahí deja la tarea
partida y sin reservar. Es el estado correcto: las subtareas son unidades nuevas y ninguna está tomada.
Lo que hoy queda en su lugar —una reserva sobre algo que no existe— no es más seguro, es sólo más
silencioso hasta que alguien corre `check`.

## Prioridad

**Alta.** No depende de una carrera ni de un id compartido: pasa siempre que Decompose parta, que es una
fase que el propio protocolo manda correr (paso 5 de la máquina por tarea). El costo directo es chico
—tres agentes: releer contexto, reclamar, releer contexto— pero la corrida termina sin construir nada de
la tarea nueva y deja `planning` en rojo, que es trabajo manual y con el motor diciendo que el problema
puede ser otro.

## Contexto de descubrimiento

Corrida `wf_a7231736-1f8` en la instancia de venotal (sidecar), el 2026-09-15 con Cauce 0.90.0: 21
agentes, 2.123.013 tokens, 31 minutos. La primera tarea —`secrets-declaration`— se construyó, se revisó,
se verificó y se cerró bien. Con la segunda, `integraciones-por-tabla`, Decompose devolvió 8 horas contra
un `maxTaskHours` de 4, la partió en tres y ahí paró.

El reclamo huérfano lo soltó una persona con `ops release planning integraciones-por-tabla`, y eso
devolvió `check` a verde. Lo comprobado el 2026-09-16 contra el paquete 0.94.0 recién instalado: la rama
de `needsSplit` sigue sin soltar nada.

**Consultado para escribir esto**: `automatization/workflows/autobuild.js` (líneas 498-504 y 645-670) y
`engine/cli/claims.js` (líneas 38-45) del paquete `@ingeniomaps/cauce@0.94.0` instalado en
`venotal-ops/node_modules`; `engine/planning/claims.js` (líneas 43-58); el `journal.jsonl` de la corrida;
y la salida de `ops check planning` antes y después del `release`.

## Relacionados

- **071** (resuelto en 0.75.0) — la otra mitad de esta misma secuencia: ahí Claim no volvía a elegir tarea
  después de Decompose. Volver a elegir ya funciona; lo que falta es soltar lo anterior.
- **137** y **139** — el id del runner en sidecar. Son el diagnóstico al que manda la segunda frase del
  mensaje de `claim`, y acá es una pista falsa.
- **R25** (0.94.0) — pide que la unidad partida se cierre diciendo en qué se partió; hoy el recorrido la
  borra.
