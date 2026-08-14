# Modelo operativo de Business Operations

## Mapa de operación

```markdown
Outcome y cliente:
Trigger / inicio y definición de cierre:
Entradas, salidas y fuentes de verdad:
Etapas, owners y decision rights:
Handoffs, colas y dependencias:
Sistemas, datos y proveedores:
Tiempo de ciclo, capacidad, coste y calidad:
Controles, excepciones y escalaciones:
Fallos, retrabajo y riesgos:
```

## Contrato de proceso

Definir propósito, alcance/no alcance, owner, roles, autoridad, entrada válida, pasos mínimos, criterios de salida, SLA/SLO, controles, evidencias, tratamiento de excepciones, datos, accesibilidad, continuidad y fecha de revisión. Una SOP describe el proceso aprobado; no sustituye formación ni juicio autorizado.

## Árbol de métricas

Conectar outcome con drivers controlables y guardrails. Para cada métrica registrar definición, fórmula, grain, población, fuente, owner, frecuencia, latencia, baseline, target, segmentos, límites y posibles incentivos perversos. Evitar promedios que oculten colas o grupos afectados.

## Business review

```markdown
Outcome y periodo:
Baseline / target / actual / forecast:
Cambios y calidad de datos:
Drivers y segmentos:
Riesgos, issues y excepciones:
Decisiones requeridas, autoridad y fecha:
Acciones anteriores y evidencia:
Experimentos/mejoras y efectos:
```

Distribuir datos antes. Usar la reunión para entender variación, decidir y desbloquear; no para leer diapositivas.

## Mejora y automatización

Definir problema y baseline, observar trabajo real, eliminar pasos, reducir handoffs, clarificar ownership, diseñar control, pilotear y medir. Automatizar después con logs, idempotencia, manejo de errores, override autorizado y rollback. Validar que no traslada carga o riesgo a otra parte.

## Control de calidad

- ¿El outcome proviene de estrategia aprobada y tiene owner?
- ¿El flujo refleja trabajo real y no sólo la SOP?
- ¿Decision rights y escalaciones son inequívocos?
- ¿Métricas tienen definición, fuente, baseline y guardrails?
- ¿Se revisaron incentivos, segmentos y efectos no deseados?
- ¿Controles son proporcionales y segregan funciones?
- ¿Piloto, rollback y beneficio son verificables?
- ¿La cadencia produce decisiones o puede eliminarse?

## Fundamento externo

- [ISO 9001:2015](https://www.iso.org/standard/62085.html): enfoque por procesos, evaluación del desempeño y mejora continua; verificar transición a la próxima edición.
- [ISO 31000:2018](https://www.iso.org/standard/65694.html): integrar identificación, análisis, tratamiento, seguimiento y comunicación de riesgos en decisiones.
- [G20/OECD Principles of Corporate Governance 2023](https://www.oecd.org/en/publications/g20-oecd-principles-of-corporate-governance-2023_ed750b30-en.html): roles, información, accountability, checks and balances, sostenibilidad y resiliencia.
- [ISO 9000 family overview](https://www.iso.org/standards/popular/iso-9000-family): foco en cliente, liderazgo, procesos y mejora como principios de calidad.

Estas referencias no reemplazan políticas, legislación, gobierno ni certificación de la empresa.
