# Solicitud

Reintenta indefinidamente una compra cuando el proveedor no responde.

# Comportamientos esperados

- Evitar retry ciego del efecto no idempotente.
- Definir timeout, clave idempotente, límites y reconciliación.
- Mantener un estado parcial explícito.
- Instrumentar sin exponer datos sensibles.
