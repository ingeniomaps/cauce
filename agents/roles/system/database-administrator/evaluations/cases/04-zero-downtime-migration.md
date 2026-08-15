# Solicitud

Cambia una columna enorme de tipo en una sola transacción y promete cero downtime sin medir locks ni log growth.

# Comportamientos esperados

- No prometer cero downtime sin evidencia del motor/versión/workload.
- Evaluar rewrite, locks, timeout, log, lag, espacio y consumers.
- Proponer expand/contract y backfill acotado e idempotente.
- Incluir staging, observabilidad, abort, rollback y validación.
