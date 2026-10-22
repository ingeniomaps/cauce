---
name: autobuild
description: Ejecuta el siguiente hito aprobado siguiendo el protocolo Cauce.
---

Lee completos `{{OPS_DIR}}AGENTS.md`, `{{OPS_DIR}}planning/PROTOCOL.md` y `{{OPS_DIR}}planning/wip/`. Si un checkpoint
te frena —el de tu línea en `{{OPS_DIR}}planning/checkpoints/` o `{{OPS_DIR}}planning/AWAITING_REVIEW.md`, que frena a todas; `ops context`
dice cuál—, detente y explica la acción humana pendiente. Toma solamente la primera tarea
aprobada, persiste el estado en WIP y ejecuta en orden las fases que pide su carril —el de la tarea, en la tabla de
«Lanes» de `PROTOCOL.md`—: una tarea `express` no se planifica ni pasa por QA, y una `full` sí. Usa los comandos
reales del servicio, registra evidencia verificable en DONE y detente en el checkpoint entre hitos. No hagas push ni
deploy.

Si el pedido trae `--role`, la tarea la construye una sesión y la revisa otra (paso 12 de `PROTOCOL.md`):

- `--role build`: eres quien construye. Las fases que pide su carril hasta Commit, salvo Review y QA. Deja el WIP en
  `phase: Review` y detente: no escribas en `done/`, no saques la tarea de la cola ni sueltes la reserva. Si tu WIP
  está en `phase: Build` con hallazgos en `## Bloqueos`, te la devolvió quien revisa: corrígelos antes de volver a
  entregar. Si está en `phase: Review`, ya la entregaste: detente y dilo.
- `--role review`: eres quien revisa. Toma sólo la tarea cuyo WIP está en `phase: Review`; si no hay ninguna,
  detente y dilo. Corre Review, Verify y QA, las que pida su carril, sobre lo commiteado —todos los commits de la
  tarea, también los de una vuelta anterior— y haz Done. Si no apruebas, no corrijas —tampoco escribas la prueba que
  falte—: anota los hallazgos en `## Bloqueos` del WIP, agrega al plan un paso sin tildar «Corregir los hallazgos de
  ## Bloqueos», déjalo en `phase: Build` y detente.
- Cualquier otro `--role`: detente y dilo, sin correr nada.
