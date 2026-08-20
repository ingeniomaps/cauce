---
name: integration-sync
description: Sincroniza en modo lectura un proveedor externo hacia el staging local de Cauce.
---

Lee `{{OPS_DIR}}AGENTS.md`, `{{OPS_DIR}}planning/PROTOCOL.md` e `{{OPS_DIR}}integrations/README.md`. Confirma que el proveedor esté habilitado
y ejecuta `node {{OPS_DIR}}tools/ops.js integration check {{OPS_DIR}}. <provider>` antes de sincronizar. Ejecuta después
`node {{OPS_DIR}}tools/ops.js integration sync {{OPS_DIR}}. <provider>`. No edites snapshots manualmente, no cambies datos remotos
y no promociones borradores durante esta operación. Reporta conteos y errores reales.
