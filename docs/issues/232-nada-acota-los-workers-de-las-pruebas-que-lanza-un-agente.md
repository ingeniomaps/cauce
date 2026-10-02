---
caso: 232
titulo: nada acota los workers de las pruebas que lanza un agente
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 232 — Un agente que corre jest, vitest o nx sin cota de workers puede saturar la máquina

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: en roax-ops dos Review lanzaron `npx jest` a la vez y saturaron la máquina el 2026-08-31.

## Resumen

Fuera del commit, nada acota cuántos procesos lanza un runner de pruebas. roax-ops agregó un guard que frena jest/vitest/nx sin cota de workers, mirando la posición de comando, y un helper con candado de máquina para las corridas pesadas.

## Reproducción

Pendiente al tomar el caso: medir en un banco cuántos workers lanza `jest` sin `--maxWorkers` contra la cantidad de núcleos.

## Síntoma

La sesión muere por memoria con la corrida a medias.

## Causa raíz

No hay nada en `engine/hooks/` sobre workers ni `availableParallelism`.

## Fix propuesto

Un guard en `pre-shell` que pida la cota en los runners conocidos, con escape aprobable y no por variable de entorno, y el mismo candado que use `verify` (240).

## Tradeoffs

- Hay que medir qué cota respeta cada runner antes de exigirla.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/automatization/hooks/guard-load.sh` (225 líneas, con pruebas).

## Relacionados

- 240 — la misma cota dentro del commit.
- R26.
