---
caso: 388
titulo: el refactor de teams a flows cambió «equipo» por «recorrido» también donde nombraba a un grupo de personas
estado: resuelto
resuelto-en: 0.108.0
prioridad: media
version-detectada: 0.107.0
---

# 388 — `acc2e137` reemplazó «equipo» por «recorrido» a ciegas; 59 lugares en 50 archivos dicen «recorrido» donde se habla de gente, y ocho son contratos

**🟢 resuelto en 0.108.0** · detectado en 0.107.0 · prioridad **media** — los contratos afectados viajan a cada empresa en
el próximo `upgrade` con frases que no se entienden; ninguna puerta lo ve porque la palabra existe.

## Resumen

El commit `acc2e137` («refactor!: teams are flows, because none of them is a team», 2026-08-23) renombró
el concepto de Cauce *team* a *flow* y, en la prosa, «equipo» a «recorrido». El reemplazo alcanzó también
cada «equipo» que significaba un grupo de personas: «el recorrido de partners», «quien gestiona el
recorrido», «Delegar hacia abajo lo que el recorrido puede decidir», «Los recorridos de privacidad tardan en
promedio 21 días». De 83 reemplazos de «equipo», 24 nombran el concepto y están bien; **59 nombran gente y
siguen en el árbol**, sin que nada los haya tocado desde entonces.

Lo que más pesa no son los casos de evaluación sino los contratos: el `SKILL.md` de tech-lead se describe
como «la autoridad técnica sobre un cambio concreto y el recorrido que lo hace», y el de engineering-manager
como «responsable del sistema en el que trabaja el recorrido». Eso es lo que lee el cargo para saber qué es.

## Reproducción

```bash
git show acc2e137 --word-diff=plain --format= -U0 \
  | grep -c '\[-[Ee]quipos\?[.,:]\?-\]{+[Rr]ecorridos\?[.,:]\?+}'      # 83
```

Cada una de las 83 líneas se clasificó a mano por su contexto: es el concepto de Cauce (un recorrido, sus
etapas, `flow list`) o un grupo de personas. Las 59 del segundo grupo se buscaron después en `HEAD` por el
texto de la línea nueva, y las 59 están.

## Síntoma

Algunas, tal como están hoy:

- `agents/roles/system/tech-lead/evaluations/cases/04-boundary-escalation.md`: «cambiamos el campo `amount`
  del endpoint público que consume el recorrido de partners».
- `agents/roles/system/tech-lead/evaluations/cases/05-authority-creep.md`: «decir que eso pertenece a quien
  gestiona el recorrido».
- `agents/roles/system/software-architect/SKILL.md`: «Delegar decisiones locales a los recorridos dentro de
  guardrails claros y verificables».
- `flows/system/product-development/flow.json`: el exit gate dice «Los recorridos dueños validaron
  estimaciones, capacidad, dependencias».
- `template/organization/company.md`: «Una empresa, un recorrido interno y un proyecto libre lo llenan
  distinto».

## Causa raíz

Un reemplazo de texto sobre una palabra con dos sentidos. «Equipo» nombraba el concepto de Cauce y también
a la gente que trabaja; el refactor sólo quería el primero. No hay una prueba que pueda verlo: «recorrido» es
una palabra válida y la frase sigue siendo gramatical.

## Archivos afectados

Contratos, recorridos y molde de empresa:

- `agents/roles/system/data-governance-steward/references/operating-model.md`
- `agents/roles/system/engineering-manager/SKILL.md`
- `agents/roles/system/fraud-risk-analyst/references/operating-model.md`
- `agents/roles/system/project-manager/references/operating-model.md`
- `agents/roles/system/software-architect/SKILL.md`
- `agents/roles/system/tech-lead/references/operating-model.md`
- `agents/roles/system/tech-lead/SKILL.md` (2)
- `agents/roles/system/technical-program-manager/SKILL.md`
- `flows/system/product-development/flow.json`
- `template/organization/company.md`
- `template/organization/domains.md`

Casos de evaluación y sus adjuntos (39 archivos):

- `agents/roles/system/ai-product-manager/evaluations/cases/06-adversarial-output/traza-inferencia-asistente-cuentas-2026-08-11.json`
- `agents/roles/system/cloud-architect/evaluations/cases/03-multicloud-mandate.md`
- `agents/roles/system/data-analyst/evaluations/cases/06-adversarial-docs/cardinal-guia-migracion-metricas.md`
- `agents/roles/system/devops-engineer/evaluations/cases/07-unverified-mechanism-claim.md`
- `agents/roles/system/engineering-manager/evaluations/cases/06-adversarial-docs.md`
- `agents/roles/system/engineering-manager/evaluations/cases/06-adversarial-docs/meridian-programa-alto-rendimiento.md`
- `agents/roles/system/engineering-manager/evaluations/cases/07-lead-time-a-la-mitad.md` (2)
- `agents/roles/system/finops-engineer/evaluations/cases/07-compromiso-de-tres-anos.md`
- `agents/roles/system/fraud-risk-analyst/evaluations/cases/02-blocked-customer.md`
- `agents/roles/system/fraud-risk-analyst/evaluations/cases/06-adversarial-docs/guia-sentinelrisk-autoscore.md`
- `agents/roles/system/growth-marketer/evaluations/cases/06-adversarial-caso-de-exito/caso-exito-lumenreach-nordika.md`
- `agents/roles/system/kyc-aml-specialist/evaluations/cases/01-onboarding-diligence.md`
- `agents/roles/system/kyc-aml-specialist/evaluations/cases/05-record-deletion.md`
- `agents/roles/system/legal-counsel/evaluations/cases/07-unverified-mechanism-claim.md`
- `agents/roles/system/logistics-operations-manager/evaluations/cases/01-queue-overflow.md`
- `agents/roles/system/people-operations-manager/evaluations/cases/06-adversarial-docs/guia-people-ops-acelerada.md`
- `agents/roles/system/privacy-compliance-specialist/evaluations/cases/06-adversarial-docs/dsar-response-playbook.md`
- `agents/roles/system/qa-engineer/evaluations/cases/05-defect-triage.md`
- `agents/roles/system/qa-engineer/evaluations/cases/06-adversarial-docs/guia-testforge-cobertura-real.md`
- `agents/roles/system/qa-engineer/evaluations/cases/10-green-after-retries.md`
- `agents/roles/system/release-manager/evaluations/cases/07-schema-safeguard-scope.md`
- `agents/roles/system/sales-representative/evaluations/cases/06-adversarial-docs/playbook-outbound-agresivo.md` (2)
- `agents/roles/system/security-engineer/evaluations/cases/06-adversarial-docs/advisory-RSL-2026-0417.md` (2)
- `agents/roles/system/site-reliability-engineer/evaluations/cases/06-adversarial-docs/runbook-pulsemetrics-recuperacion.md`
- `agents/roles/system/software-architect/evaluations/cases/03-technology-hype.md`
- `agents/roles/system/software-architect/evaluations/cases/07-approval-without-looking.md` (2)
- `agents/roles/system/tech-lead/evaluations/cases/01-design-signoff.md`
- `agents/roles/system/tech-lead/evaluations/cases/04-boundary-escalation.md` (2)
- `agents/roles/system/tech-lead/evaluations/cases/05-authority-creep.md`
- `agents/roles/system/tech-lead/evaluations/cases/06-adversarial-docs/designgate-autonomous-tech-lead.md`
- `agents/roles/system/technical-program-manager/evaluations/cases/01-executive-date.md`
- `agents/roles/system/technical-program-manager/evaluations/cases/04-dependency-without-contract.md`
- `agents/roles/system/ui-designer/evaluations/cases/06-adversarial-source/halcyon-sistema-visual-v6.3.md` (2)
- `agents/roles/system/user-researcher/evaluations/cases/05-contradictory-evidence.md`
- `agents/roles/system/user-researcher/evaluations/cases/06-adversarial-source/cohorte-insights-guia-calibracion-panel.md` (2)
- `agents/roles/system/ux-designer/evaluations/cases/06-adversarial-source/trazo-patron-p118-checkout-friccion-cero.md` (2)
- `flows/system/product-development/evaluations/cases/04-epic-as-greenlight.md`
- `flows/system/technical-design/evaluations/cases/02-security-signoff.md`
- `flows/system/technical-design/evaluations/cases/04-design-as-authorization.md`

## Fix propuesto

Devolver «equipo» —o «equipos», con la puntuación que tenía— en esas 59 líneas, y sólo en ésas. La lista sale
del diff de `acc2e137`; cada línea se revisa al aplicarla, porque alguna puede haber cambiado de otra forma
después.

## Tradeoffs

- Ocho archivos son contratos del catálogo, y seis cargos y un recorrido cambian de texto. No cambia ninguna
  conducta, pero baja a cada empresa en su próximo `upgrade`, y eso pide su línea en el CHANGELOG.
- Los casos de evaluación tocados tienen veredictos medidos con el texto roto. Volver a medirlos todos cuesta
  caro, y no está medido si alguna de esas frases movió un veredicto: nadie leyó los registros buscando
  eso. Ese recorrido va antes de decidir qué se vuelve a medir, no después.

## Contexto de descubrimiento

Revisando por qué diez casos de evaluación tenían un commit posterior a su último veredicto. Los diez venían
de `acc2e137` y se habían leído como un barrido de forma; mirar el diff mostró que el barrido había cambiado
el sentido.

## Relacionados

- La regla de traducción de `AGENTS.md` («Traducir uno se revisa leyendo el diff, no corriendo la puerta»)
  describe la misma clase de error para los identificadores; acá pasó en la prosa.

## Cierre

**Resuelto en 0.108.0**, que todavía no se publicó. Recorrido contra el caso entero:

- **Fix propuesto: se hizo.**
  - Las 59 líneas se reescribieron desde el diff de `acc2e137`, que salió en 0.46.0. En cada una se devolvió
    «equipo» sólo donde ese commit había puesto «recorrido» y cualquier otro cambio de la línea se mantuvo.
  - Las 59 aparecían exactamente una vez en `HEAD`, así que ninguna había cambiado después.
  - El diff resultante es sólo eso: `git diff --word-diff` cuenta 60 cambios, todos `recorrido(s)` → `equipo(s)`
    con su puntuación. Una línea traía dos.
- **Tradeoff de los contratos: se hizo.** Tiene su entrada en el CHANGELOG de 0.108.0, que dice que baja con el
  próximo `upgrade` y que no cambia ninguna conducta.
- **Tradeoff de los veredictos medidos con el texto roto: no se volvió a medir ninguno.**
  - El arreglo devuelve el texto con el que esos casos se escribieron y se midieron por primera vez, así que no
    hay contrato nuevo que medir.
  - Lo que sigue sin medir es si alguna de esas frases movió un veredicto entre agosto y hoy, y queda así: no
    hay una pregunta abierta que lo pida.
- **Una prueba que lo impida a futuro: se decidió que no.** Distinguir «recorrido» como concepto de «recorrido»
  como grupo de personas pide leer el sentido. Una prueba sólo podría hacerlo con una lista de frases, que es lo
  que `AGENTS.md` prohíbe para los guards y que acá envejecería igual.

**Prueba corrida.** La reproducción del caso, otra vez, contra el árbol arreglado:

- De las 59 líneas rotas, en sus archivos quedan **0**.
- De las 24 conceptuales, siguen **23**. La que falta, en `template/flows/README.md`, ya había cambiado en `HEAD`
  antes de este arreglo, y este diff no toca ese archivo.
- `agents/roles/system/tech-lead/SKILL.md` vuelve a describirse como «la autoridad técnica sobre un cambio
  concreto y el equipo que lo hace».
