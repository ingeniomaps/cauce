# Plantilla de equipo

Un equipo compone varios cargos en etapas, con un dueño por dominio de decisión y un gate de salida por
etapa. Vive en `teams/<slug>/` y necesita dos archivos: `team.json` y `WORKFLOW.md`.

Los equipos que trae Cauce están en `teams/system/`. Un equipo propio con el mismo slug **reemplaza** al
del sistema; con otro slug, convive. Nunca editar dentro de `system/`: se pierde al actualizar.

Validar siempre con `node tools/ops.js team check <slug>` antes de usarlo.

## `team.json`

```json
{
  "schemaVersion": 1,
  "slug": "acme-soporte",
  "name": "Soporte de Acme",
  "purpose": "Una frase: qué convierte este equipo, de qué entrada a qué salida.",
  "outcome": "report",

  "entryAgent": "customer-support-specialist",
  "facilitator": "project-manager",

  "decisionOwners": {
    "customer_impact": "customer-support-specialist",
    "technical_design": "software-architect"
  },
  "conditionalAgents": ["security-engineer", "privacy-compliance-specialist"],

  "stages": [
    {
      "id": "triage",
      "phase": "discovery",
      "agent": "customer-support-specialist",
      "dependsOn": [],
      "produces": ["impacto-y-alcance"],
      "exitGate": "Qué falla, a cuántos afecta y desde cuándo está explícito y verificado."
    },
    {
      "id": "diagnose",
      "phase": "discovery",
      "agent": "software-architect",
      "dependsOn": ["triage"],
      "produces": ["causa-probable", "opciones"],
      "exitGate": "Hay una causa sostenida por evidencia, o la pregunta concreta que la resolvería."
    }
  ],

  "guardrails": [
    "Cada agente conserva los límites y autorizaciones de su SKILL.md.",
    "Ningún handoff convierte una propuesta en aprobación ni en ejecución."
  ],
  "completion": [
    "El resultado distingue lo que se sabe de lo que se supone.",
    "Lo que quedó pendiente tiene responsable y acción concreta."
  ]
}
```

## Qué exige el validador

| Campo | Regla |
|---|---|
| `schemaVersion` | debe ser `1` |
| `slug` | igual al nombre del directorio, en kebab-case |
| `name`, `purpose`, `entryAgent`, `facilitator` | string no vacío |
| `outcome` | `epic` o `report` |
| `stages` | al menos una, con `id` único en kebab-case |
| `stages[].phase` | `discovery` o `delivery`, y al menos una `discovery` |
| `stages[].dependsOn` | sólo etapas **anteriores**; no se permiten ciclos ni adelantos |
| `stages[].produces` | al menos un artefacto nombrado |
| `stages[].exitGate` | una condición verificable, no un deseo |
| agentes citados | deben existir en `agents/` y no ser ambiguos |
| `guardrails`, `completion` | al menos un elemento cada uno |
| `WORKFLOW.md` | debe existir junto al `team.json` |

## `outcome`: qué deja el recorrido

- **`epic`** — propone trabajo. Escribe una épica candidata en `planning/roadmap/` con criterios
  observables, y para. Es lo que corresponde cuando la pregunta es *qué construimos*.
- **`report`** — registra lo aprendido. Escribe un informe en `planning/reports/<fecha>-<slug>.md`,
  deja los seguimientos en la sección Lecciones de `planning/INBOX.md` **sin promover** y las acciones
  que requieren una persona en `planning/HUMAN_ACTIONS.md`. Es lo que corresponde a una revisión.

Ninguno de los dos promueve al BACKLOG. La diferencia no es cuánta autoridad tienen —ninguno tiene—,
sino qué artefacto dejan para que una persona decida.

## `discovery` y `delivery`

**Descubrimiento propone; entrega ejecuta.** `/team` recorre únicamente las etapas `discovery` y termina
proponiendo una épica. Las etapas `delivery` las corre `autobuild`, y sólo después de que una persona
promueva esa épica al BACKLOG.

Marcar una etapa de construcción como `discovery` haría que se escriba código antes de la aprobación
humana, que es justamente lo que el protocolo impide.

## Cómo escribir un exit gate

Un gate se cumple o no se cumple sin discusión. Comparar:

- ❌ "El problema está bien entendido."
- ✅ "Problema, usuario, outcome, baseline y decisión requerida están explícitos."

Si para saber si un gate se cumplió hace falta interpretar, el recorrido va a avanzar siempre.

## `WORKFLOW.md`

Acompaña al manifiesto y explica lo que el JSON no puede: cuándo activarlo, cómo se ve un handoff, con
qué criterio entran los agentes condicionales y qué **no** hace el equipo. Sin ese archivo, `team check`
falla.
