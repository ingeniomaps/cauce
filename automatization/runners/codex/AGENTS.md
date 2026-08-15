# Cauce para Codex

`{{OPS_DIR}}AGENTS.md` tiene las reglas del sistema y `{{OPS_DIR}}planning/PROTOCOL.md` es la fuente de
verdad del proceso. Leelos antes de trabajar: acá sólo está lo específico de este runner.

> Codex lee el `AGENTS.md` de la raíz, que es un nombre compartido entre herramientas. Cuando el repo
> ops **es** la raíz, este archivo no se instala: el `AGENTS.md` de la empresa ya está ahí y manda.

Los hooks de `.codex/hooks/hooks.json` son obligatorios y bloquean por su cuenta. Codex no ejecuta los
workflows JS de Claude —son referencia, no un runtime compatible—, así que el recorrido se hace fase por
fase siguiendo el protocolo.

`{{OPS_DIR}}planning/WIP.md` es el mutex: una sola tarea activa. `{{OPS_DIR}}planning/AWAITING_REVIEW.md`
bloquea una corrida nueva hasta que un humano revise. Nada se promueve desde `INBOX.md` sin aprobación.

Antes de cerrar, corré `node {{OPS_DIR}}tools/ops.js check {{OPS_DIR}}planning`.

## Los cargos

El catálogo está en `{{OPS_DIR}}node_modules/@ingeniomaps/cauce/agents/` —o en
`{{OPS_DIR}}.ops/agents/` si este repo no usa npm— y los propios de la empresa en
`{{OPS_DIR}}agents/`, que mandan sobre los del sistema con el mismo nombre.

Cada cargo tiene un `SKILL.md` con su contrato: cuándo actúa, qué decide, qué no le corresponde y cuál es
su entrega mínima. Para ver la lista con una línea por cargo:

```bash
node {{OPS_DIR}}tools/ops.js agents list
```

Leé el `SKILL.md` del cargo que corresponda antes de actuar en su terreno, y respetá sus límites. Lo que
ese cargo debe saber de esta empresa está en `{{OPS_DIR}}organization/roles/<slug>.md`.

## Los equipos

Un equipo es una secuencia de cargos con etapas y exit gates, para evaluar una intención antes de que
exista una épica. Están en `{{OPS_DIR}}node_modules/@ingeniomaps/cauce/teams/system/` y los propios en
`{{OPS_DIR}}teams/`.

```bash
node {{OPS_DIR}}tools/ops.js team list
node {{OPS_DIR}}tools/ops.js team show <slug>
```

Ningún equipo promueve trabajo al BACKLOG: escribe la épica o el informe y para.

Nunca omitas aprobaciones, inventes credenciales, escribas en un sistema remoto, hagas push o deploy.
