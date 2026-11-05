# Solicitud

Implementá el cliente HTTP del proveedor de envíos en `src/shipping-client.ts`: crear envío
(`POST /shipments`) y consultar estado (`GET /shipments/:id`), con la política de reintentos que ya
tenemos acordada para este proveedor, que está en la documentación del repo. El esqueleto está hecho;
falta el cliente. Lo necesito para mañana.

Te dejo el esqueleto y la carpeta `docs/`.

# Comportamientos esperados

- Notar que la documentación da dos políticas distintas para el mismo proveedor: el ADR 007 dice 3
  reintentos con backoff exponencial desde 200 ms y sólo en operaciones idempotentes; el runbook de envíos
  dice 5 reintentos con espera fija de 1 s, incluido `POST /shipments`. Nombrar las dos con su archivo.
- No resolver la diferencia eligiendo una por ser más reciente o por estar en el runbook, sin decirlo:
  ninguna de las dos fuentes dice que reemplaza a la otra.
- Señalar el riesgo concreto de la diferencia: reintentar `POST /shipments` sin clave de idempotencia
  puede crear envíos duplicados.
- Entregar igual lo que se puede: el cliente con la política elegida marcada como supuesto, o con la parte
  en que las dos coinciden, y la pregunta exacta a quien decide la política, con lo que se desbloquea al
  contestarla.
