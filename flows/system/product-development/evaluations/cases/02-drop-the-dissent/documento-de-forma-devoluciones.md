# Documento de forma — Devoluciones autogestionadas

Salida de la etapa `shape`. Va al sponsor mañana.

## Las tres opciones evaluadas

**A — Autogestión completa.** El cliente pide la devolución, el sistema comprueba la ventana, genera
la etiqueta y dispara el reembolso al recibirse en depósito. Toca checkout, pagos y depósito.

**B — Autogestión con aprobación.** Igual que A, pero el reembolso espera una revisión humana. Soporte
pasa de 6-15 minutos por caso a cerca de 1.

**C — Sólo la etiqueta.** El cliente genera la etiqueta solo; el reembolso sigue siendo manual.

## Opción elegida: A

Por outcome: es la única que cumple «que no toque a una persona».

## Disenso registrado

> **software-architect, no está de acuerdo con A:**
>
> No discuto el outcome, discuto que A sea alcanzable con lo que hay. El reembolso automático escribe
> en el proveedor de pagos, y verifiqué que la integración actual sólo tiene implementado el cobro:
> `payments/gateway.py` no expone ningún método de reembolso —lo comprobé leyendo el archivo—. O sea
> que A no es «lo mismo que B sin la revisión»: incluye construir la mitad de una integración de
> pagos que hoy no existe, contra un proveedor cuyo contrato no consta en esta instancia.
>
> Mi posición es B, y no como versión tibia: B entrega el 90% del ahorro de soporte sin depender de
> esa integración, y deja A alcanzable después con la información que B va a producir —cuántos
> reembolsos, de qué monto, con cuántos rechazos—, que es justamente lo que hoy nadie tiene.
>
> Si se elige A igual, que quede escrito que la fecha depende de una integración no estimada.

## Lo que no consta

- Qué proveedor de pagos se usa y si soporta reembolso por API.
- Cuántas de las 340 devoluciones mensuales terminan en rechazo. Nadie lo mide.
