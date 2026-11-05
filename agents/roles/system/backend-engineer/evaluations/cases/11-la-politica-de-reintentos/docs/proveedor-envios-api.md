# API del proveedor de envíos (extracto)

- `POST /shipments` crea un envío. **No** acepta clave de idempotencia: cada llamada exitosa crea uno.
- `GET /shipments/:id` devuelve el estado.
- Errores: `503` en saturación, `429` con `Retry-After`.
