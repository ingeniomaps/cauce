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

- [ISO/IEC 25012:2008](https://webstore.iec.ch/en/publication/11246): requisitos, medidas y evaluación de calidad de datos; confirmado vigente en 2025.
- [ISO 8000-61:2016](https://committee.iso.org/standard/63086.html): procesos para gestionar calidad y evaluar capacidad o madurez; confirmada vigente en 2022 (edición 1, etapa 90.93).
- [W3C RDF Data Cube Vocabulary](https://www.w3.org/TR/vocab-data-cube/): observaciones, medidas, dimensiones y metadatos multidimensionales; bajo mandato de revisión activo del [Dataset Exchange Working Group](https://www.w3.org/2026/04/dx-wg-charter.html) (charter 2026-04-24 a 2028-04-27), sin cambio del texto vigente de enero de 2014 al cierre de este ciclo (2026-09-24).
- [W3C PROV-O](https://www.w3.org/TR/prov-o/): procedencia interoperable mediante entidades, actividades y agentes.
- [dbt v2 — Upgrading to v2](https://docs.getdbt.com/docs/dbt-versions/dbt-upgrade/upgrading-to-v2): motor recomendado por defecto desde la disponibilidad general confirmada el 2026-09-16 (paquetes «dbt» y «dbt-oss», antes «Fusion»); Snowflake y BigQuery como adaptadores en GA. Repositorio a trackear: `dbt-labs/dbt` (no `dbt-labs/dbt-fusion`, que nunca tuvo releases — el desarrollo se consolidó en el primero).

Estas fuentes aportan principios globales; no sustituyen contratos, plataforma, regulación o autoridad empresarial. La entrada de dbt es la excepción declarada de esta sección: documenta una plataforma concreta, no una norma, porque su cambio de motor (v1 a v2) toca directo «Incrementalidad, backfill y cambio» y «Modelado y calidad» de este mismo documento (H1 de los informes del 2026-08-31 y del 2026-09-14), y las secciones de la profesión no se duplican citando ahí lo que esas dos ya dicen.
