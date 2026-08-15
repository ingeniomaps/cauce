---
name: integration-promote
description: Promueve un borrador remoto ya revisado al roadmap local de Cauce.
---

Lee `{{OPS_DIR}}AGENTS.md`, `{{OPS_DIR}}planning/PROTOCOL.md` e `{{OPS_DIR}}integrations/README.md`. Verifica que el draft solicitado exista y
esté marcado `ready`; nunca marques como listo contenido por iniciativa propia. Ejecuta
`node {{OPS_DIR}}tools/ops.js integration promote {{OPS_DIR}}. <provider> <remote-key>`, valida con
`node {{OPS_DIR}}tools/ops.js check planning` y reporta el archivo creado. La promoción es local: no escribas en el
proveedor remoto.
