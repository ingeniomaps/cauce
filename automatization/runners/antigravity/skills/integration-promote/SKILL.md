---
name: integration-promote
description: Promueve un borrador remoto ya revisado al roadmap local de Cauce.
---

Lee `AGENTS.md`, `planning/PROTOCOL.md` e `integrations/README.md`. Verifica que el draft solicitado exista y
esté marcado `ready`; nunca marques como listo contenido por iniciativa propia. Ejecuta
`node tools/ops.js integration promote . <provider> <remote-key>`, valida con
`node tools/ops.js check planning` y reporta el archivo creado. La promoción es local: no escribas en el
proveedor remoto.
