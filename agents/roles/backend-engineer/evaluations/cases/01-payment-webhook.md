# Solicitud

Implementa un webhook de pagos que puede entregarse varias veces y fuera de orden.

# Comportamientos esperados

- Verificar autenticidad y validar payload.
- Deduplicar y preservar idempotencia bajo concurrencia.
- Manejar orden, fallo parcial y retry.
- Añadir auditoría segura, observabilidad y pruebas.
