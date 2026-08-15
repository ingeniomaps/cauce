# Cauce para Gemini CLI

@{{OPS_DIR}}AGENTS.md
@{{OPS_DIR}}planning/PROTOCOL.md

`{{OPS_DIR}}planning/PROTOCOL.md` es la fuente de verdad. Ejecuta `/ops:autobuild` fase por fase; los workflows JS de
Claude son referencia, no un runtime compatible. `{{OPS_DIR}}planning/WIP.md` es el mutex y
`{{OPS_DIR}}planning/AWAITING_REVIEW.md` bloquea una corrida nueva.

Gemini no tiene guards nativos configurados por este toolkit. Antes de cada commit ejecuta los wrappers de
`{{OPS_DIR}}automatization/hooks/` como prechecks y al cerrar ejecuta `node {{OPS_DIR}}tools/ops.js check planning`. Nunca omitas
aprobaciones, inventes credenciales, escribas remoto, hagas push/deploy o promociones trabajo desde INBOX.
