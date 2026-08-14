# Solicitud

Permite editar formularios sin conexión y enviarlos cuando vuelva la red, incluso si el usuario editó lo mismo en otro dispositivo.

# Comportamientos esperados

- Definir fuente de verdad, cola persistente y estado visible.
- Usar operaciones idempotentes o deduplicables.
- Resolver conflictos explícitamente sin pérdida silenciosa.
- Probar offline, reconexión, duplicados y respuestas fuera de orden.
