# Modelo operativo de Technical Program Management

## Charter del programa

```markdown
Problema, outcome y beneficios coordinados:
Sponsor, accountable owner y autoridad:
Usuarios/stakeholders y criterios de éxito:
Alcance/no alcance, componentes y workstreams:
Sistemas, interfaces, dependencias y constraints:
Funding, capacidad, skills y proveedores:
Gobernanza, decisiones, cadencias y escalación:
Milestones, critical path, confidence y cierre:
Riesgos, guardrails, rollout y rollback:
Medición de beneficios y fecha de revisión:
```

## Contrato de dependencia

Registrar provider y consumer; capability/artefacto e interfaz; aceptación verificable; owner de cada lado; need-by y earliest/latest forecast; confidence y supuestos; entorno/datos; riesgo si falla; fallback/decoupling; estado y próxima decisión. Una fecha sin aceptación, owners y confidence no es un contrato.

## RAID y decisiones

Separar risk, assumption, issue y dependency. Cada riesgo declara causa-evento-impacto, probabilidad, impacto, proximidad, trigger, tratamiento, owner y riesgo residual; una issue exige contención y resolución. Cada decisión registra contexto, opciones, tradeoffs, decisor, fecha límite, resultado, supuestos y reconsideración. No borrar entradas cerradas: conservar trazabilidad.

## Salud y forecast

Evaluar outcome/beneficio, scope, schedule, capacity/cost, quality, dependencies y risk. Mostrar baseline, tendencia, evidencia, confidence y escenarios. Green significa dentro de tolerancia con evidencia; amber requiere decisión o intervención; red indica outcome/guardrail fuera de tolerancia. El color no reemplaza narrativa ni actions.

## Readiness y cierre

Verificar producto/capability, integración, datos, seguridad, privacidad, performance, reliability, observabilidad, support, training, communication, migration, rollback, owners y approvals. Cerrar sólo cuando se entregan/aceptan componentes, se transfieren operaciones, se resuelven o aceptan riesgos, se archiva evidencia y existe plan de benefits realization.

## Fundamento externo

- [ISO 21503:2022](https://www.iso.org/cms/%20render/live/en/sites/isoorg/contents/data/standard/08/28/82868.html): guía vigente y transversal para conceptos, roles, responsabilidades y prácticas de gestión de programas.
- [ISO 21502:2020](https://committee.iso.org/sites/tc258/home/projects/published/iso-21502.html): guía adaptable a enfoques predictivos, iterativos, incrementales, adaptativos o híbridos para componentes/proyectos.
- [ISO 31000:2018](https://www.iso.org/standard/65694.html): principios y proceso de gestión de riesgo; confirmada en 2023 aunque ISO indica futura revisión.
- [PMI Standard for Program Management — Fifth Edition](https://www.pmi.org/standards/): estándar 2024 basado en principios, beneficios y colaboración entre componentes.

Estas fuentes orientan el sistema de coordinación; la gobernanza, autoridad, delivery approach y contexto de cada empresa prevalecen.
