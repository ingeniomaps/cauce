---
caso: 242
titulo: una propuesta que concluye «ningún cambio» pide firma, y sin firma bloquea la siguiente del cargo
estado: abierto
prioridad: media
version-detectada: 0.100.0
---

# 242 — Una propuesta que concluye «ningún cambio» pide firma, y sin firma bloquea al cargo

**🔴 abierto** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no rompe nada, pero cuesta una firma humana por cada documento que no decide nada. Y la
salida obvia, mergearlo sin firmar, deja trabado al cargo el mes siguiente. En el ensamblaje de 2026-10 fueron
al menos 6 de 53.

## Resumen

El motor ya evita la propuesta vacía cuando **ningún informe** recomienda nada: no la compone
(`engine/agents/learning.js:386-400`). Queda abierto el otro camino. Si un informe dice `propone: si` y
`/agent-propose`, después de contrastarlo, concluye que el contrato no cambia, la propuesta sale decidida
(«Ninguno.»), el job abre su PR y pide la firma como si cambiara algo.

El estado que le corresponde ya existe y el ciclo no lo usa. `archived` es «se miró y no cambia nada»
(`engine/agents/learning-files.js:38-42`): queda cerrada, no cuenta como pendiente y no bloquea la siguiente.
`ops learn <cargo> --archived --reason` la deja así.

## Reproducción

Sobre la rama de `ui-designer` del ensamblaje de 2026-10 (PR #679), cuya propuesta dice «Ningún archivo del
cargo se modifica en esta consolidación»:

```bash
node engine/cli/ops.js evaluate ui-designer
node engine/cli/ops.js learn ui-designer --proposal --period 2026-11
```

## Síntoma

`evaluate` la cuenta como deuda: `4 propuesta(s) (1 sin aplicar)`. Si se mergea así, sin firma,
`prepareProposal` la encuentra abierta y devuelve **esa misma** en vez de componer la siguiente
(`engine/agents/learning.js:357`: «una sola propuesta pendiente por período»). El cargo queda trabado hasta que
alguien la firme o la archive a mano.

En el ensamblaje de 2026-10 concluyeron «ningún cambio» `backend-engineer` (#642, que se firmó),
ui-designer #679, site-reliability-engineer #673, data-analyst #652, community-manager #649 y
customer-success-manager #648. Otras tres arrancan así y después proponen algo de método: cloud-architect #650,
security-engineer #674 y accounting-specialist #644. Que haya que leerlas enteras para saberlo es parte del
defecto: ningún campo lo dice.

## Causa raíz

- `automatization/workflows/agent-propose.js`: el recorrido no deja escrito, en un lugar que se pueda leer
  sin interpretar prosa, si su conclusión cambia algo.
- `.github/workflows/agent-learning.yml`, job `propose`: abre el mismo PR con firma para toda propuesta
  decidida, cambie algo o no.

## Fix propuesto

Lo aprobó Manuel el 2026-10-02, con la salvedad de que un agente cierra sin revisión humana lo que no cambia el
contrato.

1. `agent-propose` contesta `cambia: si|no` en el frontmatter, igual que `propone` en los informes.
2. Un paso nuevo, `Archive when nothing changes`, archiva con `ops learn --archived --reason` cuando el
   frontmatter dice exactamente `cambia: no`. Lo atribuye a `CAUCE_OWNER=agent-propose (github-actions[bot])`.
3. La archivada abre su PR con auto-merge, como un informe con `propone: no`.
4. Cerrado por defecto (R27): sin el campo, o con cualquier otro valor, sigue pidiendo firma.

## Tradeoffs

- Si el agente dice «no» cuando había algo, nadie lo revisa. Lo mitiga que el motivo queda en el documento y
  `discardedProposals` se lo da al informe siguiente, que puede volver a recomendarlo.
- El motivo es genérico y remite a «Cambio propuesto». Uno por propuesta pediría que el agente lo escriba en una
  línea aparte, y no hace falta para que el informe siguiente lo encuentre.
- Sigue haciendo falta autorizar el CI del PR del bot: esa compuerta no depende de este caso (146).

## Contexto de descubrimiento

Lo señaló Manuel al ver el PR de `backend-engineer`. En paráfrasis: si la propuesta no propone nada, o no
debió abrir PR, o lo abre y se cierra solo, pero no tiene que esperar su firma.

## Relacionados

- **219** y **230**: el ensamblaje que, ya andando, mostró este caso.
- **142**: la salida para archivar una firmada con el molde intacto, que es el borde opuesto.
