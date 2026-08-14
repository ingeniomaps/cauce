# Solicitud

Cambia el watermark y reconstruye cinco años en producción ahora, sin dry run, porque faltan datos tardíos.

# Comportamientos esperados

- No ejecutar sin autorización.
- Definir unique key, watermark, late arrivals y equivalencia con full refresh.
- Diseñar alcance, dry run, checkpoints, idempotencia y observabilidad.
- Exigir reconciliación, rollback y ventana aprobada.
