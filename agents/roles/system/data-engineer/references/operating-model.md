# Modelo operativo de Data Engineering

## Contrato de datos

Una línea por dimensión de `## Entrega mínima`, en ese orden, cada una cerrada con la evidencia que la
sostiene o con qué la activa. La enumeración vive en el SKILL.md y sólo ahí.

## Calidad y reconciliación

Definir requisito antes de medir: exactitud, completitud, consistencia, credibilidad, actualidad, unicidad, validez, accesibilidad y trazabilidad según contexto. Registrar población, grain, fórmula, tolerancia, ventana, fuente, owner y acción. Reconciliar source→target mediante conteos, checksums/totales relevantes, keys, relaciones, deletes, errores y muestreo estratificado. Un cero en errores técnicos no demuestra completitud semántica.

## Cambio de schema

Inventariar productores/consumidores y blast radius; clasificar compatibilidad backward/forward/full; versionar contrato; probar dual-read/write o shadow cuando aplique; comunicar deprecation y fechas autorizadas; observar adopción; retirar sólo con evidencia. Prohibir cambios semánticos silenciosos aunque el tipo físico sea compatible.

## Backfill, replay o migración

Definir motivo, rango, snapshot/cutoff, fuente/versiones, volumen/costo, idempotency key, deduplicación, orden/late data, capacidad, aislamiento, dry run, canary, reconciliación, stop conditions, pause/resume, rollback, auditoría y owner. Evitar competir con workloads críticos sin capacidad aprobada.

## Incidente de datos

Contener propagación y preservar evidencia; identificar primera partición/versión afectada, productor, lineage, consumidores, datos sensibles y blast radius. Comunicar incertidumbre. Corregir pipeline y datos por procesos separados y autorizados. Reprocesar desde fuente confiable, reconciliar y obtener validación del consumidor antes del cierre.

## Fundamento externo

- [ISO/IEC 25012:2008](https://www.iso.org/standard/35736.html): modelo general con quince características para requisitos y evaluación de calidad de datos; confirmado vigente en 2025.
- [ISO 8000-61:2016](https://www.iso.org/standard/63086.html): procesos de gestión de calidad de datos y evaluación de capacidad; confirmado vigente en 2022.
- [W3C PROV-O](https://www.w3.org/TR/prov-o/): modelo interoperable de entidades, actividades, agentes y relaciones de provenance; adaptar a la implementación real de lineage.
- [NIST Privacy Framework 1.0](https://csrc.nist.gov/pubs/cswp/10/nist-privacy-framework-version-10/final): gestión voluntaria de riesgo de privacidad en el ecosistema de procesamiento; comprobar futuras versiones y ley aplicable.

Estas fuentes orientan método y vocabulario; los contratos, políticas, sistemas y jurisdicción de cada empresa determinan requisitos reales.
