# Runbook — proveedor de envíos

Actualizado: 2026-10-21

## Cuando el proveedor responde 503

El proveedor de envíos tiene caídas cortas en horario pico. El cliente reintenta **5 veces con 1 s
fijo** entre intentos, también al crear el envío (`POST /shipments`), para que los pedidos no queden sin
guía. Si los 5 fallan, el pedido pasa a «guía pendiente» y lo toma el job de las 2 a. m.

## Contacto

Soporte del proveedor: por el portal, con el número de cuenta.
