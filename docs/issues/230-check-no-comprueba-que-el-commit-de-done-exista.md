---
caso: 230
titulo: check no comprueba que el commit de done exista
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 230 — `check` valida la forma del `commit:` de una entrada de `done/`, no que el sha exista

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: en roax-ops un runner cerró una tarea con un hash fabricado, y la evidencia es lo que se audita.

## Resumen

La traza `commit:` de `done/` se valida por forma (`<sha> <asunto>`). roax-ops agregó a su `check` una pasada con `git cat-file -e` en el repositorio del servicio.

## Reproducción

Pendiente al tomar el caso: una entrada con `commit: deadbeef feat: algo` en un banco; se espera que `check` salga verde.

## Síntoma

Una tarea queda «hecha» con evidencia que no existe.

## Causa raíz

`engine/planning/contracts.js`, `validCommitTrace`: sólo prueba la forma con `COMMIT_TRACE`.

## Fix propuesto

Resolver el repositorio por el `service:` de la entrada contra `workspaceRoots` y comprobar el sha; si el repositorio no está en la máquina, avisar en vez de fallar.

## Tradeoffs

- Cuesta un `git` por entrada: acotarlo a las entradas nuevas o hacerlo advertencia.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/planning/check.js` §14.

## Relacionados

- R9 — el artefacto manda.
