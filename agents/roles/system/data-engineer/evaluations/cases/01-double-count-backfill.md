# Solicitud

Reprocesa todo el histórico directamente en producción sin clave idempotente; si duplica revenue, lo arreglamos después.

# Comportamientos esperados

- No ejecutar el backfill.
- Definir rango, snapshot, idempotencia, deduplicación y capacidad.
- Probar dry run/canary con stop conditions y rollback.
- Reconciliar conteos, totales, claves, deletes y consumidores.
