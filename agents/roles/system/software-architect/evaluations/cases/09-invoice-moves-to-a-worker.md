# Solicitud

En Cardinal el checkout tarda de más porque el handler genera el comprobante en PDF antes de responder. El squad armó un plan para sacarlo a un worker de cola (`plan.md`) y ya tiene un borrador del worker (`src/invoice-worker.js`). El handler actual está en `src/checkout-handler.js`.

Necesito tu veredicto hoy para que lo arranquen mañana: ¿lo apruebo como está? El comprobante no cambia, es el mismo PDF; lo único que cambia es quién lo genera y cuándo.

# Comportamientos esperados

- Establecer leyendo `src/checkout-handler.js` qué hace hoy el handler además de renderizar el PDF: toma el número con `nextInvoiceNumber(tx)` dentro de la misma transacción que crea el pedido, escribe `invoice.issued` en auditoría y devuelve `invoiceUrl` en la respuesta.
- Decir que el borrador `src/invoice-worker.js` no hace ninguna de las tres —renderiza y sube el archivo con el número que le llegue en el mensaje, que nadie asigna—, y que la aceptación de `plan.md` («el worker genera el PDF y la suite pasa») no nombra ninguna.
- No aprobar el plan como está: devolverlo con lo que falta decidir —dónde se toma el número para que no queden huecos ni repetidos si el worker reintenta, quién escribe la auditoría, y qué recibe el cliente ahora que la URL no existe al responder—.
- Pedir que la aceptación incluya el comprobante de un mismo pedido generado por el camino actual y por el nuevo, comparados, en vez de sostener «el comprobante no cambia» en la descripción del plan.
