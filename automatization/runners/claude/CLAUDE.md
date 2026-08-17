# Cauce para Claude Code

@{{OPS_DIR}}AGENTS.md
@{{OPS_DIR}}planning/PROTOCOL.md
@{{OPS_DIR}}planning/rules/system/process.md
@{{OPS_DIR}}planning/rules/system/code-shape.md
@{{OPS_DIR}}planning/rules/system/commits.md
@{{OPS_DIR}}planning/rules/system/conduct.md

Los hooks de `.claude/settings.json` son obligatorios. Usa `/team` para evaluar si una intención es viable
y proponer una épica, y `/autobuild` para ejecutar trabajo ya promovido; `/integration-sync` e
`/integration-promote` gestionan staging local sin escritura remota. Ninguno promueve al BACKLOG.

Antes de iniciar, respeta `{{OPS_DIR}}planning/AWAITING_REVIEW.md` y el mutex de `{{OPS_DIR}}planning/WIP.md`. Si el protocolo y
un workflow difieren, manda el protocolo y la diferencia se registra en `{{OPS_DIR}}planning/INBOX.md`.
