# Cauce para Claude Code

@AGENTS.md
@planning/PROTOCOL.md

Los hooks de `.claude/settings.json` son obligatorios. Usa `/autobuild` para ejecutar trabajo promovido;
`/integration-sync` y `/integration-promote` gestionan staging local sin escritura remota.

Antes de iniciar, respeta `planning/AWAITING_REVIEW.md` y el mutex de `planning/WIP.md`. Si el protocolo y
un workflow difieren, manda el protocolo y la diferencia se registra en `planning/INBOX.md`.
