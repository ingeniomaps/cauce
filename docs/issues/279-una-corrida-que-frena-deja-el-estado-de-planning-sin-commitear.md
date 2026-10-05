---
caso: 279
titulo: una corrida que frena deja el estado de planning sin commitear
estado: resuelto
resuelto-en: 0.101.0
prioridad: baja
version-detectada: 0.100.0
---

# 279 — Cuando `autobuild` para con una fila en `HUMAN_ACTIONS.md`, la instancia queda sucia

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **baja**.

**Prioridad baja**: no se pierde nada. Es la mitad que el 266 dejó afuera: cada corrida que frena termina con cambios sueltos que alguien tiene que decidir dónde van.

## Resumen

El 266 hizo que el cierre de una tarea commitee el estado de planning, y el 271 lo extendió al checkpoint
del hito. Una corrida que frena antes también escribe: la fila de la parada, y el cargo que Classify anotó
en la línea de la tarea. Eso quedaba sin commitear.

## Reproducción

La corrida del 278. Al terminar, en la instancia de la línea:

```bash
git status --short
```

## Síntoma

```
 M planning/HUMAN_ACTIONS.md
 M planning/backlog/normalizar.md
```

## Causa raíz

`automatization/workflows/autobuild.js`: el commit de planning vive después de Done y en el checkpoint.
Ninguna de las paradas que registran una fila pasa por ahí.

## Fix propuesto

Commitear el estado de planning en las paradas que registran una fila de la tarea, con el interruptor
`commitPerTask` y la regla de ramas del 266.

## Tradeoffs

- Un agente más por parada.
- En una instancia embebida parada en `main`, la parada pasa el repositorio a la rama de trabajo de planning.

## Contexto de descubrimiento

La misma corrida que el 278.

## Relacionados

- 266 — `autobuild` no commitea el estado de planning.
- 271 — el checkpoint del hito queda sin commitear.
- 176 — la parada que bloquea suelta el reclamo.

## Cierre

**Resuelto en 0.101.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo distinto.** La primera versión commiteaba al registrar la fila. Una corrida real mostró
  que eso era antes de soltar el reclamo: el commit se llevaba el archivo del reclamo y soltarlo dejaba el
  árbol sucio otra vez, con ` D planning/claims/<slug>.md`. Ahora va después de soltar.
- **Las paradas con fila de la tarea — se hicieron todas**: la de Ready, las dos del plan, la sospecha sin
  comprobar sobre una superficie crítica y el criterio ambiguo de Verify. La fila que Review registra por una
  decisión no para la corrida, y la commitea el cierre.
- **Tradeoff, un agente más — se paga.**
- **Tradeoff, la embebida en `main` — no se midió.** Las corridas fueron en una línea, cuya rama no es viva.

### Qué se corrió

- **Una corrida real que frenó en Ready**, con la primera versión: el commit `chore(planning): block …`
  existía y `git status` mostraba el reclamo borrado. Ése es el defecto del orden.
- **Una corrida real que frenó en la crítica**, con el orden corregido: el commit lleva la fila y la línea
  de la cola, sin el reclamo, y `git status --short` no devuelve nada. `ops check planning` en verde.
- **Cuatro mutaciones en rojo**, en una copia: sin el commit, sin el interruptor, el commit antes de soltar,
  y la parada de Verify sin commitear.
- **La puerta entera**, `npm run ci`.
