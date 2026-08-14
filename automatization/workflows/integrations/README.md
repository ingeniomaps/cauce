# Workflows de integraciones

Implementan el ciclo común de cualquier proveedor registrado:

```text
remoto → sync → staging → revisión humana → promote → planning
```

- `sync.js`: valida y refresca staging sin promover ni escribir remoto.
- `promote.js`: materializa localmente un candidato cuyo draft está `ready`.

El proveedor se selecciona con `OPS_INTEGRATION_PROVIDER`; `promote` requiere además
`OPS_INTEGRATION_KEY`. La implementación particular de Jira vive en `engine/integrations/providers/jira.js`,
no en estos workflows.
