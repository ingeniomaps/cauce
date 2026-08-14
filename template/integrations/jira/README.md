# Jira — sincronización y curación de solo lectura

## Activación

1. Cambia `enabled` a `true` aquí y en `../config.json`.
2. Configura `baseUrl` y `jql`.
3. Exporta las variables nombradas en `auth`; no pegues valores en JSON.
4. Ejecuta `integration check` y luego `integration sync`.

La búsqueda JQL tiene timeout, límite de páginas y detección de ciclos. Basic auth usa email y API token;
Bearer también está soportado. `candidateAssigneeEnv` es opcional: si se configura, solo las incidencias cuyo
`accountId` coincida son candidatas; las demás son contexto y su draft se regenera siempre.

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
- `service`: ruta responsable.
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
