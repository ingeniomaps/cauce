# Modelo operativo de Release Management

## Contrato de release

```markdown
Objetivo, alcance / no alcance:
Versión, commit, digest y procedencia:
Servicios, entornos, regiones y cohortes:
Owners, aprobadores y on-call:
Cambios, flags, configuración y dependencias:
Compatibilidad y migraciones:
Evidencias de readiness:
Rollout, observación y guardrails:
Rollback / roll-forward y última prueba:
Comunicaciones y soporte:
Ventana, go/no-go y cierre:
```

## Readiness

Exigir evidencia proporcional: artefacto inmutable, tests del candidato, QA/aceptación, vulnerabilidades y excepciones, privacidad/compliance, capacidad, observabilidad, runbook, migración, backup/restore, rollback, soporte y documentación. Registrar owner, timestamp, entorno y resultado; una casilla antigua no es evidencia vigente.

## Rollout progresivo

```markdown
Etapa y cohorte:
Blast radius:
Inicio y mínimo de observación:
Señales técnicas y de usuario:
Baseline y umbral de avanzar / pausar / abortar:
Owner y autoridad:
Resultado y evidencia:
```

Comparar canary con baseline relevante y contemplar volumen suficiente, latencia de efectos y segmentos críticos. Detener ante telemetría insuficiente.

## Rollback y migraciones

Definir punto de no retorno, RTO/RPO aplicables, compatibilidad de versión N/N-1, datos escritos durante rollout y procedimiento ensayado. Para schema, preferir expand/migrate/contract. Si revertir empeora integridad, preparar roll-forward explícito y autoridad de incidente.

## Hotfix

Confirmar incidente/impacto, cambio mínimo, candidato identificable, revisión independiente disponible, tests enfocados, plan de recuperación, on-call y verificación. Documentar excepciones y realizar revisión posterior. No mezclar mejoras oportunistas.

## Control de calidad

- ¿El artefacto probado es exactamente el promovido?
- ¿Cada gate tiene owner y evidencia actual?
- ¿Dependencias, compatibilidad y migraciones tienen orden seguro?
- ¿Rollout limita blast radius y tiene umbrales observables?
- ¿Rollback o roll-forward fue probado en condiciones representativas?
- ¿Go/no-go y emergencias conservan autoridad y trazabilidad?
- ¿Soporte y comunicaciones conocen impacto y versión?
- ¿Cierre vincula código, artefacto, deploy, exposición y outcome?

## Fundamento externo

- [DORA — Continuous delivery](https://dora.dev/capabilities/continuous-delivery/): cambios bajo demanda de manera rápida, segura y sostenible.
- [DORA — Deployment automation](https://dora.dev/capabilities/deployment-automation/): artefactos promovibles, proceso repetible, configuración versionada y verificación automática.
- [Google SRE — Release Engineering](https://sre.google/sre-book/release-engineering/): builds reproducibles, releases trazables, canaries, rollout y rollback.
- [SLSA specification v1.2](https://slsa.dev/spec/v1.2/): procedencia y garantías incrementales para la cadena de suministro de software.

Adaptar gates y autoridad al riesgo, plataforma, regulación y políticas reales.
