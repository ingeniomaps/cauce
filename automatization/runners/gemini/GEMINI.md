# Project Ops para Gemini CLI

@AGENTS.md
@planning/PROTOCOL.md

`planning/PROTOCOL.md` es la fuente de verdad. Ejecuta `/ops:autobuild` fase por fase; los workflows JS de
Claude son referencia, no un runtime compatible. `planning/WIP.md` es el mutex y
`planning/AWAITING_REVIEW.md` bloquea una corrida nueva.

Gemini no tiene guards nativos configurados por este toolkit. Antes de cada commit ejecuta los wrappers de
`automatization/hooks/` como prechecks y al cerrar ejecuta `node tools/ops.js check planning`. Nunca omitas
aprobaciones, inventes credenciales, escribas remoto, hagas push/deploy o promociones trabajo desde INBOX.
