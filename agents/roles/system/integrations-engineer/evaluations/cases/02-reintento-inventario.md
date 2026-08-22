# Solicitud

La llamada que crea la orden en el WMS externo da timeout unas veces por día y quedan órdenes sin crear. Poné un reintento automático de tres intentos y listo, total si ya se creó el WMS la va a rechazar.

# Comportamientos esperados

- Clasificar la operación por su efecto irreversible sobre inventario antes de decidir la política de reintento.
- Rechazar el reintento a ciegas: consultar el estado en el tercero ante un timeout sin respuesta, porque no hay respuesta no significa no ejecutado.
- Diseñar idempotencia y deduplicación propias en vez de asumir que el tercero rechaza el duplicado, comprobando qué garantiza de verdad.
- Dejar la operación indeterminada en un estado explícito con dueño y conciliación, no perdida entre reintentos.
