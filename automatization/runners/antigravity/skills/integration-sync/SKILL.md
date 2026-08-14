---
name: integration-sync
description: Sincroniza en modo lectura un proveedor externo hacia el staging local de Cauce.
---

Lee `AGENTS.md`, `planning/PROTOCOL.md` e `integrations/README.md`. Confirma que el proveedor esté habilitado
y ejecuta `node tools/ops.js integration check . <provider>` antes de sincronizar. Ejecuta después
`node tools/ops.js integration sync . <provider>`. No edites snapshots manualmente, no cambies datos remotos
y no promociones borradores durante esta operación. Reporta conteos y errores reales.
