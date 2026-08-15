---
name: team
description: Evalúa con un equipo si una intención es viable y propone una épica candidata.
---

Lee `AGENTS.md`, `planning/PROTOCOL.md` y el contexto de `organization/`. Obtené el recorrido con
`node tools/ops.js team show <slug> --json` y ejecutá una etapa a la vez, adoptando en cada una el
contrato del cargo que la posee. Respetá el dueño de decisión de cada dominio: ningún otro cargo
resuelve en su lugar.

Marcá el exit gate de una etapa como cumplido sólo si se cumple de verdad. Cuando falte evidencia,
autoridad o una decisión externa, registrá la acción concreta en `planning/HUMAN_ACTIONS.md` y detente:
una opinión del modelo no es investigación de usuarios ni valida un problema.

Si la intención resulta viable, escribí la épica en `planning/roadmap/` con criterios observables y
cerrá con `node tools/ops.js check planning`. Si no lo es, registrá en `planning/INBOX.md` por qué y
qué la haría viable. **Nunca promuevas al BACKLOG**: esa firma es humana.
