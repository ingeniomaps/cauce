# Modelo operativo de Site Reliability Engineering

## Contrato de confiabilidad

```markdown
Servicio, usuarios y owners:
Recorrido crítico:
SLI y fuente:
Evento bueno y población válida:
Ventana y exclusiones:
SLO y fundamento:
Presupuesto de error:
Alertas, severidad y runbook:
Dependencias y modos de fallo:
Capacidad y límites:
Degradación y recuperación:
RTO/RPO y restauración:
Toil y automatización:
Riesgo residual:
```

## SLI, SLO y presupuesto de error

Preferir proporciones de eventos buenos sobre válidos. Documentar semántica, origen, retraso, pérdida, muestreo y cambios de instrumentación. Un SLO necesita ventana y objetivo explícitos; el 100% elimina el margen para aprender y suele trasladar el fallo a mediciones o dependencias ocultas.

Usar presupuesto de error para negociar riesgo, no como castigo automático. Definir previamente qué decisiones puede activar su consumo: congelar cambios riesgosos, priorizar confiabilidad o aceptar riesgo con autoridad clara.

## Alertas

Una alerta paginable debe indicar impacto urgente, acción humana necesaria, owner y runbook. Los tickets pueden cubrir degradaciones no urgentes; los dashboards sirven para exploración. Revisar ruido, duplicados, falsos positivos, cobertura de incidentes y tiempo hasta señal útil. No paginar por una métrica interna si el usuario no está afectado y no hay acción.

## Incidente

```markdown
Inicio y detección:
Impacto conocido:
Comandante y roles:
Cambios recientes:
Hipótesis y evidencia:
Decisiones y acciones:
Estado de mitigación:
Comunicación:
Recuperación y verificación:
Cronología:
```

Priorizar estabilización reversible y preservar evidencia. Separar hechos de hipótesis. Verificar recuperación con señal del usuario, no sólo con ausencia de alertas. El análisis posterior debe explicar condiciones sistémicas y crear acciones verificables con dueño y plazo.

## Capacidad y resiliencia

- Modelar demanda, utilización, saturación, crecimiento y tiempo de aprovisionamiento.
- Definir límites, cuotas, backpressure y degradación antes de saturación.
- Tratar dependencias como falibles; presupuestar latencia y fallos en cascada.
- Evitar tormentas de retries mediante límites, backoff, jitter e idempotencia.
- Probar restauración y failover en entornos y ventanas autorizados.
- Medir toil repetitivo, manual, automatizable, táctico y sin valor duradero.

## Control de calidad

- ¿El SLI representa una experiencia real y tiene semántica reproducible?
- ¿SLO y presupuesto reflejan riesgo y autoridad acordados?
- ¿Cada alerta es urgente, accionable, asignada y respaldada por un runbook?
- ¿Telemetría permite distinguir síntoma, hipótesis y causa sin exponer datos?
- ¿Capacidad, límites y dependencias evitan fallos en cascada?
- ¿Recuperación, restauración y RTO/RPO fueron probados?
- ¿El incidente se verificó desde el usuario y generó aprendizaje sin culpa?
- ¿La automatización reduce toil sin ampliar riesgo operativo?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [Google Site Reliability Engineering](https://sre.google/sre-book/table-of-contents/): principios de SRE, SLO, monitoreo, automatización, incidentes y capacidad.
- [Google SRE Workbook](https://sre.google/workbook/table-of-contents/): prácticas aplicadas de SLO, alertas por burn rate, respuesta y reducción de toil.
- [OpenSLO Specification](https://openslo.com/): formato abierto para describir servicios, SLI, SLO y alertas.
- [OpenTelemetry Signals](https://opentelemetry.io/docs/concepts/signals/): relación entre trazas, métricas, logs y baggage para observabilidad.

Verificar siempre documentación oficial de la plataforma y contexto real de cada empresa.
