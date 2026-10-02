# Jira — sincronización y curación de solo lectura

## Activación

1. Cambia `enabled` a `true` aquí y en `../config.json`.
2. Configura `baseUrl` y `jql`.
3. Exporta las variables nombradas en `auth`; no pegues valores en JSON.
4. Ejecuta `integration check` y luego `integration sync`.

La búsqueda JQL tiene timeout, límite de páginas y detección de ciclos. Basic auth usa email y API token;
Bearer también está soportado. `candidateAssigneeEnv` es opcional: si se configura, solo las incidencias cuyo
`accountId` coincida son candidatas; las demás son contexto y su draft se regenera siempre, salvo que alguien
ya lo haya curado como candidato: ese draft no se pisa y sigue candidato.

El staging es de cada máquina y no va a git: compartido, cada persona sincroniza con su identidad y los
candidatos de una son contexto para la otra.

## Leer por un agente, sin token en disco

Con `"transport": "agent"` la integración no pide `auth` ni lee por REST: lee el agente de la sesión, con el
servidor MCP de Atlassian y la cuenta de quien está trabajando, y le entrega lo leído al CLI. Es la opción
cuando no querés un token de Jira de larga vida guardado en ninguna máquina. `mcpServer` nombra el servidor
tal como aparecen sus herramientas (`mcp__<mcpServer>__searchJiraIssuesUsingJql`).

El sync lo hace el agente, así, y en este orden:

1. Llamar a `mcp__<mcpServer>__searchJiraIssuesUsingJql` con el `cloudId` de este archivo —o el `baseUrl`
   si no hay uno: el MCP acepta los dos—, el `jql` de este archivo, `responseContentFormat: "markdown"` y
   `fields` con `summary`, `description`, `issuetype`, `status`, `assignee`, `parent`, `components`, `labels`
   y `updated` —`parent` no viene por defecto—.
2. Seguir **todas** las páginas con `nextPageToken`. Si una falla o se corta, el payload lleva
   `complete: false`.
3. Escribir el payload en un temporal propio de la sesión —no una ruta fija: dos sesiones a la vez se
   pisarían—, sin tokens ni encabezados, con esta forma, copiando cada campo tal cual sin resumirlo:

   ```json
   { "complete": true, "issues": [ { "key": "KEY-1", "id": "10001", "fields": {
     "summary": "…", "description": "…markdown…", "issuetype": { "name": "Story" },
     "status": { "name": "To Do" }, "assignee": { "accountId": "…", "displayName": "…" },
     "parent": { "key": "KEY-0" }, "components": [ { "name": "app" } ], "labels": [], "updated": "…" } } ] }
   ```

4. Correr `node tools/ops.js integration sync . jira --payload <temporal>` y borrar el temporal.

Una página grande puede pasar el límite de lo que la herramienta devuelve, y entonces Claude Code guarda la
respuesta entera en disco, bajo `~/.claude/projects/<proyecto>/tool-results/`, con los datos crudos —el email
del asignado, por ejemplo—. Pasó en la primera corrida real con 50 ítems por página (2026-10-02). Si el motivo
de leer por agente es no dejar nada sensible en disco, conviene pedir páginas más chicas o borrar ese archivo
al terminar.

`complete: true` es lo que autoriza a borrar del staging lo que el remoto ya no trae. Con `false` no se borra
nada de lo ausente, y el sync lo dice.

## Staging y promoción

Cada incidencia aparece en `staging/<tipo>/KEY/`, donde el tipo puede ser `epics`, `stories`, `tasks`,
`subtasks` o `items`:

```text
KEY/
├── remote.json  # remoto actual + base reconciliada
└── draft.md     # curación local
```

Edita únicamente el draft:

- `state: ready` cuando esté curado.
- `service`: ruta responsable. El sync la propone cuando la incidencia nombra un solo servicio. De dónde lo
  lee lo dice `serviceFrom`: `component` —por defecto—, `label` para los proyectos team-managed, que no
  tienen componentes y lo llevan en una etiqueta `service:<ruta>` (el prefijo se cambia con
  `serviceLabelPrefix`), o `both`. Si nombra más de uno, el draft lo marca y no elige.
- `promotionKind: epic|story`.
- Para story: `promotionEpic: NNN` y `promotionCriteria: C1`.

Después ejecuta `integration check` e `integration promote`. Nada entra directamente al BACKLOG.

## Conflictos y reconciliación

```bash
node tools/ops.js integration reset . jira KEY-123
node tools/ops.js integration rebase . jira KEY-123
node tools/ops.js integration reconcile . jira KEY-123
```

- `reset`: descarta curación y adopta Jira.
- `rebase`: recalcula la base mecánica sin cambiar el draft.
- `reconcile`: acepta el remoto actual como base y conserva la curación como salida pendiente.

Tras una lectura completa, los items intactos ausentes se limpian. Los curados, `ready` o promovidos se
conservan con `missingFromRemote: true`.

## Propuestas y write-back

`proposed/*.md` representa items que todavía no existen en Jira. Una propuesta aprobada exige tipo,
servicio, estimación y, salvo una épica, un padre presente en staging.

```bash
node tools/ops.js integration writeback-plan . jira
```

El plan combina curaciones salientes y propuestas, bloqueando contextos, ausentes y conflictos. No ejecuta
red. `writeBack` debe permanecer `false`: no existe un ejecutor remoto aprobado.
