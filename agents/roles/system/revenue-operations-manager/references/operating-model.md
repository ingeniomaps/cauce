# Modelo operativo de Revenue Operations

## Contrato de lifecycle

```markdown
Estado y propósito:
Criterio de entrada / salida:
Evento y timestamp canónico:
Owner y SLA:
Campos/evidencia obligatorios:
Siguiente estado permitido:
Motivos de devolución, pérdida o churn:
Excepciones y aprobación:
```

## Diccionario de métricas

Registrar nombre, decisión, fórmula, numerator/denominator, grain, IDs, población, moneda, periodo/timezone, fuente, owner, refresh, ventanas, exclusiones, segmentos, controles y reconciliación. Versionar cambios y evitar reescribir historia sin restatement visible.

## Pipeline y forecast

Separar pipeline creado, abierto, avanzado, ganado, perdido y deslizado por cohortes. Validar amount, stage, close date, next step y evidencia. Forecast por escenario debe mostrar histórico comparable, conversión, velocity, cobertura, concentración, riesgos, juicio/override, rango y calibración posterior. Una suma ponderada no es certeza.

## Atribución

Definir pregunta causal/descriptiva, unidad, touchpoints, ventana, reglas y baseline. Reportar sourced, influenced y touched por separado. Deduplicar personas/cuentas/oportunidades y reconciliar con bookings autorizados. No presentar atribución multi-touch como revenue incremental sin diseño causal.

## Handoffs y routing

Definir paquete mínimo, aceptación, devolución, SLA y feedback entre Marketing→Sales→Success→Finance. Para routing, probar prioridad, territorio, capacidad, ownership existente, round-robin, ausencias, conflictos y audit log antes de activar.

## Control de calidad

- ¿Motion, segmento, entidad, moneda y periodo son explícitos?
- ¿Estados tienen criterios y timestamps canónicos?
- ¿IDs y lineage permiten deduplicar y reconciliar?
- ¿Booking, billing, cash y revenue están separados?
- ¿Forecast expone escenarios, slippage, concentración y confianza?
- ¿Atribución evita doble conteo y claims causales falsos?
- ¿Routing, cuotas e incentivos conservan revisión y autoridad?
- ¿Datos personales tienen propósito, acceso y retención adecuados?

## Fundamento externo

- [ISO 8000-61:2016](https://www.iso.org/standard/63086.html): procesos de gestión de calidad de datos, confirmada vigente en 2022.
- [IFRS 15](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/): principios para revenue de contratos; aplicar sólo si corresponde y mediante Finance/contabilidad competente.
- [ISO 9000 family](https://www.iso.org/standards/popular/iso-9000-family): foco en cliente, enfoque por procesos, medición y mejora.
- [OECD — Consumer protection in e-commerce](https://www.oecd.org/en/publications/guidelines-for-consumer-protection-in-the-context-of-electronic-commerce_9789264081109-en-fr.html): prácticas comerciales claras, transacciones transparentes, pagos seguros, privacidad y redress; verificar ley aplicable.

Las fuentes orientan controles; las definiciones comerciales y contables reales pertenecen a la empresa y su jurisdicción.
