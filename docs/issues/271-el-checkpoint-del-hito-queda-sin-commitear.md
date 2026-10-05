---
caso: 271
titulo: el checkpoint del hito queda sin commitear
estado: resuelto
resuelto-en: 0.101.0
prioridad: baja
version-detectada: 0.100.0
---

# 271 — Al terminar un hito, `AWAITING_REVIEW.md` queda escrito y sin commitear en la instancia

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **baja**.

**Prioridad baja**: es un archivo, pero es el que frena la corrida siguiente, y deja la instancia sucia justo donde el 266
vino a limpiarla.

## Resumen

El recorrido escribe el checkpoint del hito después del último commit de planning. Nada lo commitea.

## Reproducción

Dos corridas reales de `autobuild` con `humanCheckpointBetweenMilestones`, una en sidecar y otra en una
instancia embebida, 2026-10-05.

## Síntoma

Al terminar, en las dos:

```
## work/planning
?? planning/AWAITING_REVIEW.md
```

## Causa raíz

`automatization/workflows/autobuild.js`: el paso `human-checkpoint` escribe el archivo y devuelve.

## Fix propuesto

Que ese mismo paso lo commitee, con la regla de rama de planning y sólo si el proyecto commitea por tarea.

## Tradeoffs

- Es el mismo agente haciendo dos cosas, escribir y commitear, en vez de un paso más.

## Contexto de descubrimiento

Las corridas reales en bancos, después del 266.

## Relacionados

- 266 — `autobuild` no commitea el estado de planning.

## Cierre

**Resuelto en 0.101.0.** El paso que escribe el checkpoint lo commitea después, solo, como
`chore(planning): await review of <hito>`.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.**
- **Tradeoff — se paga.**

### Qué se corrió

- **Antes y después en el arnés**: el prompt del checkpoint no pedía commit; ahora lo pide con la regla
  de rama, y con `commitPerTask` apagado el archivo se escribe igual y no se commitea.
- **Tres mutaciones en rojo**, en una copia.
- **Una sonda con un agente real** sobre la instancia del banco de la corrida, parada en `work/planning`
  con el archivo sin commitear, y el texto literal del pedido. Comprobado en el disco: un commit
  `chore(planning): await review of altas` en `work/planning`, que toca sólo `planning/AWAITING_REVIEW.md`,
  y el árbol limpio.
- **La puerta entera**, `npm run ci`.
