---
name: flow
description: Evalúa con un recorrido si una intención es viable y propone una épica candidata.
---

Lee `{{OPS_DIR}}AGENTS.md`, `{{OPS_DIR}}planning/PROTOCOL.md` y el contexto de `{{OPS_DIR}}organization/`. Obtené el recorrido con
`node {{OPS_DIR}}tools/ops.js flow show <slug> --json` y ejecutá una etapa a la vez, adoptando en cada una el
contrato del cargo que la posee. Respetá el dueño de decisión de cada dominio: ningún otro cargo
resuelve en su lugar.

Marcá el exit gate de una etapa como cumplido sólo si se cumple de verdad. Cuando falte evidencia,
autoridad o una decisión externa, registrá la acción concreta en `{{OPS_DIR}}planning/HUMAN_ACTIONS.md` y detente:
una opinión del modelo no es investigación de usuarios ni valida un problema.

Si la intención resulta viable, escribí la épica en `{{OPS_DIR}}planning/roadmap/` con criterios observables y
cerrá con `node {{OPS_DIR}}tools/ops.js check planning`. Si no lo es, registrá en `{{OPS_DIR}}planning/INBOX.md` por qué y
qué la haría viable. **Nunca promuevas al BACKLOG**: esa firma es humana.
