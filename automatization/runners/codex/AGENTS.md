# Cauce para Codex

`{{OPS_DIR}}AGENTS.md` tiene las reglas del sistema, `{{OPS_DIR}}planning/PROTOCOL.md` es la fuente de
verdad del proceso y `{{OPS_DIR}}planning/rules/system/` son las reglas que rigen cada tarea. Leelos
antes de trabajar —los tres, no cuando algo sale mal—: acá sólo está lo específico de este runner.

> Codex lee el `AGENTS.md` de la raíz, que es un nombre compartido entre herramientas. Cuando el repo
> ops **es** la raíz, este archivo no se instala: el `AGENTS.md` de la empresa ya está ahí y manda.

Los hooks de `.codex/hooks/hooks.json` son obligatorios y bloquean por su cuenta. Codex no ejecuta los
workflows JS de Claude —son referencia, no un runtime compatible—, así que el recorrido se hace fase por
fase siguiendo el protocolo.

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
`{{OPS_DIR}}organization/` llega como molde y el roadmap está vacío. El primer recorrido lo llena, y una vez: reescribir un contexto
que alguien ya corrigió no deja rastro de lo que se perdió.

Empezá por `node {{OPS_DIR}}tools/ops.js onboard`, que es instantáneo: la primera línea que imprime es la
pregunta con la que tenés que abrir —de qué trata el proyecto—, y después vienen el inventario y las
dimensiones. Hacé esa pregunta tal cual antes de mirar nada, sea el workspace vacío, un monorepo o diez
repos, y según lo que conteste formulá hasta tres más con las palabras de ese proyecto, una por vez. El
inventario ya viene resuelto ahí: no recorras el árbol ni leas código para completarlo. No des por
sentado que vende algo: puede sostenerse con donaciones, presupuesto interno o trabajo voluntario. Con eso escribí `{{OPS_DIR}}organization/`, la sección «Mapa real» de
`{{OPS_DIR}}AGENTS.md` con cada comando tal como está declarado y de qué archivo salió —sin correrlo—, y
las raíces reales en `workspaceRoots`. Lo deducido va marcado `(supuesto)`. Credenciales, MCP y el permiso de push van como
filas en `{{OPS_DIR}}planning/HUMAN_ACTIONS.md`, sin proponer valores. Cerrá con `epic-001` en
`{{OPS_DIR}}planning/roadmap/`: que una tarea pueda atravesar el ciclo entero, con criterios que salen de
lo que falta. Nunca la promuevas.

El arranque tiene tres objetivos y ninguno más: entender qué es el proyecto, dejar la instancia correcta
para él y que la primera tarea pueda empezar. El análisis profundo viene después, cuando la persona pida
algo concreto.

Antes de darlo por terminado, comprobá cinco cosas mirando el disco: preguntaste de a una y no en
formulario; la épica se llama `epic-NNN-<slug>.md` con `status: open` —`epic-001.md` no lo lee nadie—;
las secciones de `{{OPS_DIR}}organization/` siguen siendo las del molde y lo tuyo se agregó adentro;
`{{OPS_DIR}}planning/HUMAN_ACTIONS.md` tiene una fila por credencial, por externo y por la autoridad de
push; y `ops` no figura como servicio del producto en el mapa.

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
