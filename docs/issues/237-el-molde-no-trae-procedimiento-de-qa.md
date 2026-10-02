---
caso: 237
titulo: el molde no trae procedimiento de QA
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 237 — PROTOCOL dice probar por el camino real en una línea, y no hay un procedimiento

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: ninguna entrada de `done/` de conorbi cita su `QA.md`, así que no hay evidencia de uso, sólo de que lo trajo de roax.

## Resumen

conorbi-ops y roax-ops tienen un `planning/QA.md` con nueve pasos: leer los criterios, elegir el ambiente por donde entra el usuario, comprobar que el cambio está desplegado, saber qué datos se gastan, ir por el camino real, devolver la configuración, separar lo preexistente corriendo sin el cambio, dar el veredicto por criterio y contrastar con R15.

## Reproducción

No hace falta: es la ausencia de un archivo.

## Síntoma

QA queda librado a la memoria de quien lo hace.

## Causa raíz

`template/planning/PROTOCOL.md` lo dice en una línea en la fase de QA; no existe `template/planning/QA.md`.

## Fix propuesto

Un `QA.md` de molde, sin los ejemplos de la empresa, citado desde PROTOCOL. Antes, ver si el contrato de `qa-engineer` ya lo cubre.

## Tradeoffs

- El contrato de `qa-engineer` puede cubrir parte: contrastar antes.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- `agents/roles/system/qa-engineer`.
