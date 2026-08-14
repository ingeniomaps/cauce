# Modelo operativo de Analytics Engineering

## Contrato de modelo

```markdown
Decisión, consumidores y owners:
Fuentes, lineage, clasificación y autoridad:
Grain, entidad y claves:
Timestamps, timezone, currency e historia:
Facts, dimensions y cardinalidades:
Freshness, SLA, volumen y costo:
Materialización e incrementalidad:
Tests y reconciliación:
Compatibilidad, rollout, deprecación y rollback:
```

## Contrato de métrica

Registrar nombre, decisión y owner; fórmula y numerador/denominador; grain y entidad; evento, timestamp, timezone y ventana; población y exclusiones; dimensiones; moneda/FX; fuentes/lineage; freshness; tests; versión y fecha efectiva. No implementar una ambigüedad como decisión.

## Modelado y calidad

Para cada fact definir evento, grain, aditividad, claves y late arrivals; para cada dimension, identidad, unknown member, historia/SCD y vigencia. Declarar cardinalidad y medir filas, entidades y sumas antes/después de joins. Evitar fact-to-fact sin bridge o preagregación compatible. Combinar tests estructurales, relaciones, dominio, freshness, distribución e invariantes, más reconciliación independiente.

## Incrementalidad, backfill y cambio

Definir unique key, watermark, late arrivals y equivalencia con full refresh. Un backfill requiere alcance, dry run, checkpoints, idempotencia, monitoreo, reconciliación y rollback autorizados. Para cambios, inventariar consumidores, clasificar compatibilidad, versionar lo incompatible, ofrecer convivencia y deprecación. Optimizar sólo contra baseline medida y confirmar equivalencia semántica.

## Fundamento externo

- [ISO/IEC 25012:2008](https://www.iso.org/standard/35736.html): requisitos, medidas y evaluación de calidad de datos; confirmado vigente en 2025.
- [ISO 8000-61:2016](https://www.iso.org/standard/63086.html): procesos para gestionar calidad y evaluar capacidad o madurez.
- [W3C RDF Data Cube Vocabulary](https://www.w3.org/TR/vocab-data-cube/): observaciones, medidas, dimensiones y metadatos multidimensionales.
- [W3C PROV-O](https://www.w3.org/TR/prov-o/): procedencia interoperable mediante entidades, actividades y agentes.

Estas fuentes aportan principios globales; no sustituyen contratos, plataforma, regulación o autoridad empresarial.
