---
caso: 233
titulo: la pasada de comentarios de R11 no tiene mecanismo
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 233 — R11 pide recorrer los comentarios agregados antes de entregar, y nada comprueba que se hizo

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: el AGENTS.md del toolkit ya lo admite («La pasada de comentarios que pide R11 no la cubre la puerta»).

## Resumen

roax-ops mecanizó la pasada: un guard lee los comentarios **agregados** en el commit, bloquea lo medible (bloques largos, idioma, separadores, emojis) y para el resto exige un token derivado de esos comentarios exactos, de modo que la pasada no se puede declarar sin haberla hecho sobre ese diff.

## Reproducción

No hace falta: el hueco está escrito en `AGENTS.md`.

## Síntoma

La pasada se saltea, y la puerta en verde no lo dice.

## Causa raíz

R11 (`template/planning/rules/system/code-shape.md`) y la nota de `AGENTS.md` sobre la pasada.

## Fix propuesto

Un guard opcional que liste los comentarios agregados y exija el token atado al diff, con idioma y emojis configurables.

## Tradeoffs

- Un token derivado demuestra que se miró la lista, no que se pensó cada comentario.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/automatization/bin/roax-comment-check.js` (310 líneas, con pruebas), commit `a2d8912`.

## Relacionados

- R11.
