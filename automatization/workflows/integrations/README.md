# Workflows de integraciones

Implementan el ciclo común de cualquier proveedor registrado:

```text
remoto → sync → staging → revisión humana → promote → planning
```

- `sync.js`: valida y refresca staging sin promover ni escribir remoto.
- `promote.js`: materializa localmente un candidato cuyo draft está `ready`.

El proveedor se pasa como argumento —`integration-sync jira`—; `promote` requiere además la clave remota:
`integration-promote jira KEY-123`. El prefijo lo pone cada runner: `/` en Claude, `$` en Codex y
`/cauce:` en Gemini y Antigravity.

La implementación particular de Jira vive en `engine/integrations/providers/jira.js`, no en estos
workflows.
