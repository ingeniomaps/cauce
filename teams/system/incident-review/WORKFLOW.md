# Incident Review

## Qué es y qué no es

Este equipo hace la **revisión posterior** de un incidente ya contenido. No responde incidentes en vivo:
un recorrido de agentes no es un incident commander, no tiene acceso a producción, no está de guardia y
no puede decidir bajo presión con información parcial. Confundir una cosa con la otra sería peligroso.

Mientras el incidente está activo, mandan las personas de guardia. Este recorrido empieza después,
cuando el servicio ya está estable y lo que hace falta es entender qué pasó.

```text
Usa el team incident-review para analizar este incidente:
<qué falló, cuándo, cómo se detectó y qué evidencia hay: logs, alertas, métricas, tickets>
```

## Salida

Produce un **informe**, no una épica: `planning/reports/<fecha>-<slug>.md`. Los seguimientos quedan en la
sección Lecciones de `planning/INBOX.md` **sin promover**, y las acciones que requieren una persona
—comunicar a clientes, notificar a un regulador, cambiar un contrato— en `planning/HUMAN_ACTIONS.md`.

Convertir un seguimiento en trabajo sigue siendo una decisión humana, igual que en cualquier otro
recorrido.

## Etapas

```
scope     → sre                    línea de tiempo e impacto real
diagnose  → software-architect     factores que contribuyeron, y por qué no se detectó antes
exposure  → security-engineer      si hubo acceso, pérdida o exposición de datos
learn     → engineering-manager    seguimientos con dueño propuesto
```

`diagnose` y `exposure` dependen ambas de `scope` y responden preguntas distintas: una busca por qué
falló, la otra qué quedó expuesto. Separarlas evita que la urgencia técnica tape la evaluación de datos.

## Protocolo de handoff

```markdown
Etapa y agente:
Pregunta que resuelve:
Evidencia usada y su origen, como lista literal de lo consultado (log, alerta, métrica, ticket):
Hechos / hipótesis / lo indeterminado:
Exit gate: cumplido / no cumplido
Autorizaciones u obligaciones pendientes:
```

Una causa sin evidencia se declara **hipótesis**, aunque cerrar el informe con una causa firme sea más
cómodo. Un informe que inventa una causa para poder cerrarse hace daño: se toman decisiones sobre él.

Antes de usarla, la etapa que recibe cruza lo afirmado contra esa lista: lo que cita algo que no está en ella
sigue viaje marcado, no borrado ni corregido en silencio (R14).

## Selección de agentes condicionales

`database-administrator` y `devops-engineer` cuando el factor está en datos o en infraestructura.
`privacy-compliance-specialist` y `legal-counsel` en cuanto la etapa `exposure` no puede descartar
acceso a datos personales — ahí puede haber plazos regulatorios, y esa es una acción humana urgente.
`qa-engineer` cuando la pregunta es por qué las pruebas no lo detectaron. `finops-engineer` cuando el
incidente fue de costo, no de disponibilidad.

## Límites

Nadie en este recorrido opera producción, aplica una remediación, comunica a un cliente ni notifica a
un regulador. Todo eso se propone y lo decide una persona. Tampoco se atribuye responsabilidad a
personas: se analizan las condiciones que hicieron posible el fallo, porque un informe que busca
culpables consigue que la próxima vez nadie reporte nada.
