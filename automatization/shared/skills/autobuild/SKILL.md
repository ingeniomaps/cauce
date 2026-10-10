---
name: autobuild
description: Ejecuta el siguiente hito aprobado siguiendo el protocolo Cauce.
---

Lee completos `{{OPS_DIR}}AGENTS.md`, `{{OPS_DIR}}planning/PROTOCOL.md` y `{{OPS_DIR}}planning/wip/`. Si un checkpoint
te frena —el de tu línea en `{{OPS_DIR}}planning/checkpoints/` o `{{OPS_DIR}}planning/AWAITING_REVIEW.md`, que frena a todas; `ops context`
dice cuál—, detente y explica la acción humana pendiente. Toma solamente la primera tarea
aprobada, persiste el estado en WIP y ejecuta Build, Review, Verify y QA en orden. Usa los comandos reales del
servicio, registra evidencia verificable en DONE y detente en el checkpoint entre hitos. No hagas push ni
deploy.
