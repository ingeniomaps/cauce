---
caso: 228
titulo: Jira: reset y reconcile no protegen lo promovido
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 228 — `integration reset` y `reconcile` corren sobre un ítem ya promovido

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: deshacen una decisión humana —la promoción— sin pedirla.

## Resumen

`reset` no restringe por estado y `reconcile` no se niega sobre un ítem promovido. roax-ops limita `reset` a `pending`/`context` y hace que `reconcile` se niegue sobre `promoted`.

## Reproducción

Pendiente al tomar el caso: en un banco, sincronizar, promover un ítem y correr `integration reset` sobre él.

## Síntoma

Un ítem promovido vuelve a pendiente y su vínculo con el roadmap queda suelto.

## Causa raíz

`engine/integrations/state.js:176-215`, según la lectura del relevamiento; se contrasta al tomar el caso.

## Fix propuesto

Dos comprobaciones en `state.js`, con el motivo en el mensaje.

## Tradeoffs

- Ninguno conocido: es cerrar una salida que nadie debería usar sin decidirlo.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/integrations/jira/sync-state.js:259-309`.

## Relacionados

- 226 — la misma integración.
