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

Sólo Claude ejecuta este formato. Los otros tres ofrecen los mismos cinco recorridos en el formato que
cada uno entiende —skills en Codex y Antigravity, comandos en Gemini—, con el mismo protocolo y los
mismos hooks, pero recorridos fase por fase en vez de ejecutados: no se anuncia un workflow nativo hasta
que exista una API equivalente.

El nombre del recorrido es el mismo en los cuatro; el prefijo lo pone cada runner —`/onboard` en Claude,
`$onboard` en Codex, `/cauce:onboard` en Gemini y Antigravity—. `automation install` lo imprime al
terminar, y `commands.invocation` de cada `manifest.json` es la fuente.

## Integración externa

`integrations/sync.js` ejecuta `integration check`, luego `integration sync`, valida el resultado y se detiene
para revisión humana. `integrations/promote.js` exige proveedor, clave y un draft `ready`. Ninguno escribe en
el sistema remoto; Jira es actualmente el primer adaptador del contrato general.

```text
integration-sync jira                 con el prefijo del runner
integration-promote jira KEY-123
```

## Aprendizaje de agentes

`agent-eval.js` mide un cargo contra sus controles y casos, `agent-propose.js` consolida una propuesta de
cambio y `agent-promote.js` la aplica una vez aprobada. Generan informes y propuestas; ninguno modifica
un `SKILL.md` por su cuenta. Toda actualización exige evaluación y aprobación humana.

Los tres se instalan sólo en Claude, que es el único con runtime para ejecutarlos, y no figuran entre los
cinco recorridos que todos los runners anuncian.
