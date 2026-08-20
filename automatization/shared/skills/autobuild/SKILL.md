---
name: autobuild
description: Ejecuta el siguiente hito aprobado siguiendo el protocolo Cauce.
---

Lee completos `{{OPS_DIR}}AGENTS.md`, `{{OPS_DIR}}planning/PROTOCOL.md` y `{{OPS_DIR}}planning/WIP.md`. Si existe
`{{OPS_DIR}}planning/AWAITING_REVIEW.md`, detente y explica la acción humana pendiente. Toma solamente la primera tarea
aprobada, persiste el estado en WIP y ejecuta Build, Review, Verify y QA en orden. Usa los comandos reales del
servicio, registra evidencia verificable en DONE y detente en el checkpoint entre hitos. No hagas push ni
deploy.
