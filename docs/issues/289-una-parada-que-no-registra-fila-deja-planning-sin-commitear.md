---
caso: 289
titulo: una parada que no registra fila deja planning sin commitear
estado: resuelto
resuelto-en: 0.103.2
prioridad: media
version-detectada: 0.103.1
---

# 289 — El 279 commitea el estado de planning sólo en cinco de las paradas del recorrido

**🟢 resuelto en 0.103.2** · detectado en 0.103.1 · prioridad **media**.

**Prioridad media**: no se pierde nada, pero es justo lo que el 279 dijo haber cerrado: la instancia queda sucia después de una corrida que frena.

## Resumen

Desde 0.101.0 una corrida que frena commitea el estado de planning que dejó. Lo hace en las paradas que
registran una fila de la tarea —Ready, las dos del plan, la sospecha sobre una superficie crítica y el
criterio ambiguo de Verify—. El recorrido tiene muchas más, y todas las que ocurren con la tarea ya tomada
dejan algo escrito: el reclamo, el cargo anotado en la cola, el WIP, una propuesta.

## Reproducción

Corrida real de `autobuild` con 0.103.1 en una instancia sidecar. Frenó en Verify con `verify-hollow`. Al
terminar, en la instancia:

```bash
git status --short
```

## Síntoma

Sobre `work/planning`, sin commitear: `HUMAN_ACTIONS.md` modificado, el archivo del reclamo de la tarea y una
propuesta del INBOX. La sesión lo reportó así: «la 0.101.0 decía que una corrida que frena commitea ese
estado; acá no pasó».

## Causa raíz

`automatization/workflows/autobuild.js`: `commitBlocked` se llamaba a mano en cinco lugares. Es una lista de
lo que se protege, y la parada que no estaba en ella nació afuera sin que nada fallara (R27).

## Fix propuesto

Que commitee toda parada que ocurra con una tarea tomada, sin enumerarlas.

## Tradeoffs

- Una llamada de agente más en cada parada, también en las que no dejaron nada nuevo.
- Las paradas de antes de tomar la tarea no commitean: ahí no hay nada escrito.

## Contexto de descubrimiento

La primera corrida de una instancia real con 0.103.1.

## Relacionados

- 279 — una corrida que frena deja el estado de planning sin commitear.
- 266 y 271 — el cierre y el checkpoint.

## Cierre

**Resuelto en 0.103.2.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.** Desde que la tarea se toma hasta que su cierre se commitea, toda parada pasa por el
  mismo lugar. Las dos comprobaciones de arranque, que ocurren antes de que pueda haber una tarea, quedaron
  como estaban.
- **Tradeoffs — se pagan los dos.**

### Qué se corrió

- **Tres paradas que el 279 no cubría, en el arnés**: `verify-hollow`, `qa-failed` y `commit-failed` piden el
  commit `chore(planning): block …`, una sola vez cada una. Antes no lo pedía ninguna.
- **Cuatro mutaciones en rojo**, en una copia: la parada sin commitear, la tarea que nunca queda tomada, la
  tarea cerrada que sigue tomada, y el commit sin tarea.
- **La puerta entera**, `npm run ci`.
- **Una corrida real que frenó por una de esas paradas** se corrió después, abajo.

### Una corrida real que frenó por otra parada, el 2026-10-06

Banco sidecar, sesión real con `/autobuild` sobre una tarea que terminó en `verify-hollow`. Al parar, la
instancia quedó con el commit `chore(planning): block retirar-prueba-legada` en `work/planning` y
`git status` sin nada. Con 0.103.1 esa misma parada dejaba la instancia sucia.
