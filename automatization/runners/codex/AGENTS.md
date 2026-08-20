# Cauce para Codex

`{{OPS_DIR}}AGENTS.md` tiene las reglas del sistema, `{{OPS_DIR}}planning/PROTOCOL.md` es la fuente de
verdad del proceso y `{{OPS_DIR}}planning/rules/system/` son las reglas que rigen cada tarea. Leelos
antes de trabajar —los tres, no cuando algo sale mal—: acá sólo está lo específico de este runner.

> Codex lee el `AGENTS.md` de la raíz, que es un nombre compartido entre herramientas. Cuando el repo
> ops **es** la raíz, este archivo no se instala: el `AGENTS.md` de la empresa ya está ahí y manda.

Los hooks de `.codex/hooks.json` son obligatorios y bloquean por su cuenta, y **no corren hasta que
los confíes con `/hooks`**: Codex saltea en silencio lo nuevo o lo modificado.

Los cinco recorridos llegan como skills en `.agents/skills/` y se invocan con `$`: `$onboard`, `$team`,
`$autobuild`, `$integration-sync` e `$integration-promote`. Los workflows JS de Claude siguen sin correr
acá —son referencia, no un runtime compatible—, así que cada recorrido se ejecuta fase por fase
siguiendo el protocolo.

`{{OPS_DIR}}planning/WIP.md` es el mutex: una sola tarea activa. `{{OPS_DIR}}planning/AWAITING_REVIEW.md`
bloquea una corrida nueva hasta que un humano revise. Nada se promueve desde `INBOX.md` sin aprobación.

Antes de cerrar, corré `node {{OPS_DIR}}tools/ops.js check {{OPS_DIR}}planning`.

## Los cargos

El catálogo está en `{{OPS_DIR}}node_modules/@ingeniomaps/cauce/agents/` y los propios de la empresa en
`{{OPS_DIR}}agents/`, que mandan sobre los del sistema con el mismo nombre.

Cada cargo tiene un `SKILL.md` con su contrato: cuándo actúa, qué decide, qué no le corresponde y cuál es
su entrega mínima. Para ver la lista con una línea por cargo:

```bash
node {{OPS_DIR}}tools/ops.js agents list
```

Leé el `SKILL.md` del cargo que corresponda antes de actuar en su terreno, y respetá sus límites. Lo que
ese cargo debe saber de esta empresa está en `{{OPS_DIR}}organization/roles/<slug>.md`.

## El arranque

En una instancia recién creada nadie le explicó todavía al toolkit qué es este proyecto:
`{{OPS_DIR}}organization/` llega como molde y el roadmap está vacío. El primer recorrido lo llena, y una
vez: reescribir un contexto que alguien ya corrigió no deja rastro de lo que se perdió.

Empezá por `node {{OPS_DIR}}tools/ops.js onboard`, que es instantáneo: la primera línea que imprime es la
pregunta con la que tenés que abrir —de qué trata el proyecto—. Hacésela tal cual y esperá la respuesta
antes de mirar el inventario, sea el workspace vacío, un monorepo o diez repos. Con lo que te conteste
invocá `$onboard`, que lleva el recorrido entero y la lista de lo que se comprueba al final; invocarlo
antes sólo devuelve la misma pregunta más caro.

El arranque tiene tres objetivos y ninguno más: entender qué es el proyecto, dejar la instancia correcta
para él y que la primera tarea pueda empezar. El análisis profundo viene después, cuando la persona pida
algo concreto. Estar bloqueado es un resultado legítimo; narrarlo como entrega, no.

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
