---
caso: 227
titulo: Jira no toma el servicio ni el carril de etiquetas
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 227 — El servicio de un ítem de Jira sale sólo de `components`, y el carril no sale de ningún lado

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: los proyectos team-managed de Jira no tienen componentes, así que ahí el servicio queda vacío.

## Resumen

La integración toma el servicio de `components`. roax-ops lo toma de una etiqueta `service:<dir>` (con componente y etiqueta a la vez como error) y el carril de una etiqueta `lane:` validada contra los carriles del motor.

## Reproducción

Pendiente al tomar el caso: el fixture con `labels: ["service:app"]` y sin componentes; se espera que `promote` escriba la historia sin `(service: …)`.

## Síntoma

En un proyecto team-managed cada historia promovida llega sin servicio y `check` la rechaza.

## Causa raíz

`engine/integrations/state.js:115`: el servicio sale sólo de `components`. Los carriles viven en `engine/planning/parser.js:30` y `promote` no escribe ninguno.

## Fix propuesto

`serviceFrom: "component"|"label"|"both"` y `serviceLabelPrefix` en la config; `laneLabelPrefix` para escribir `[lane]` en la línea de la tarea, con más de una etiqueta o una inválida como error.

## Tradeoffs

- El fixture de prueba ya trae `lane:full`: el dato existe y hoy se ignora.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/integrations/jira/services.js` y `promotion.js`.

## Relacionados

- 226 — la misma integración.
