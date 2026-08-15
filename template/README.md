# {{PROJECT_NAME}} Ops

Sistema de intención, ejecución y memoria del proyecto. Empieza en `planning/FLOW.md` y configura las
raíces de código en `ops.config.json`.

```bash
node tools/ops.js check planning
node tools/ops.js tree planning
node tools/ops.js context planning
node tools/ops.js team check product-development
```

- `organization/`: contexto estable de producto y negocio.
- `agents/roles/`: cargos de IA reutilizables; cada agente lee el contexto de `organization/`.
- Cualquier otro directorio bajo `agents/` es un tipo válido: se reconoce al tener contenido.
- `teams/`: composiciones de varios agentes y sus handoffs.
- `planning/`: roadmap, cola aprobada, trabajo en vuelo, evidencia e historial.
- `AGENTS.md`: límites de autonomía y acciones que requieren una persona.
- `integrations/`: adaptadores externos, snapshots y borradores curables.

Modo instalado: `{{MODE}}`.
