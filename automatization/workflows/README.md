# Workflows

## Build

`autobuild.js` implementa las fases de `planning/PROTOCOL.md`: checkpoint, recuperación desde WIP, Pick,
Ready, descomposición, Plan, Critique, Build, Review, Verify, QA, Commit, Done y cierre. Persiste WIP antes
de editar código y respeta el checkpoint entre hitos.

El workflow no contiene rutas, servicios ni proveedores de un producto. Lee `ops.config.json`, utiliza el
`service` declarado por cada tarea y limita el trabajo a `workspaceRoots`.

```text
ops.config.json + planning/PROTOCOL.md
                 ↓
automatization/workflows/autobuild.js   (fuente canónica)
                 ↓ automation install
.claude/workflows/autobuild.js          (adaptador ejecutable)
```

Claude dispone actualmente del formato ejecutable usado por este archivo. Codex y Gemini conservan el
mismo protocolo y los mismos hooks, pero no se anuncia un workflow nativo hasta disponer de una API
equivalente; en esos runners el recorrido se ejecuta siguiendo `planning/PROTOCOL.md`.

## Integración externa

`integrations/sync.js` ejecuta `integration check`, luego `integration sync`, valida el resultado y se detiene
para revisión humana. `integrations/promote.js` exige proveedor, clave y un draft `ready`. Ninguno escribe en
el sistema remoto; Jira es actualmente el primer adaptador del contrato general.

```bash
OPS_INTEGRATION_PROVIDER=jira /integration-sync
OPS_INTEGRATION_PROVIDER=jira OPS_INTEGRATION_KEY=KEY-123 /integration-promote
```

## Aprendizaje de agentes

Genera informes y propuestas; nunca modifica automáticamente un `SKILL.md`. Toda actualización exige
evaluación y aprobación humana.
