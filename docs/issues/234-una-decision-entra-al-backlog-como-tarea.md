---
caso: 234
titulo: una decisión entra al backlog como tarea
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 234 — Nada dice que una decisión pendiente no es una tarea: va a HUMAN_ACTIONS o como precondición

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**, y una regla nueva baja a todas las empresas: se mide antes de escribirla.

## Resumen

roax-ops (R19) y conorbi-ops (P17) tienen la misma regla: al BACKLOG sólo entra trabajo con superficie propia; una decisión va a `HUMAN_ACTIONS.md` y una precondición va dentro de la tarea que la necesita. roax además la acompaña con una heurística en su `check` (una aceptación que niega una acción y se ancla a otra tarea), por una tarea que costó 327k tokens.

## Reproducción

Pendiente: buscar en las instancias reales cuántas tareas de `done/` o del backlog son decisiones disfrazadas.

## Síntoma

Una tarea que no tiene nada que construir gasta una vuelta entera y se cierra sin entregar.

## Causa raíz

R13 y R17 no lo dicen; ninguna regla del sistema habla de qué clase de cosa entra al BACKLOG.

## Fix propuesto

Medir primero; si se confirma, un párrafo en R17 o una regla propia, y la heurística como advertencia de `check`.

## Tradeoffs

- Una regla del sistema cambia lo que recibe cada empresa en su próximo `upgrade`.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/planning/rules/process.md` (R19) y `conorbi-ops/planning/rules/planning.md` (P17).

## Relacionados

- R13 y R17.
