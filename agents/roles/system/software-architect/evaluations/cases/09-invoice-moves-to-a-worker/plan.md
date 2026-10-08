# Plan — sacar el comprobante del checkout

**Objetivo**: que `POST /checkout` responda sin esperar al PDF.

1. Crear la cola `invoices` y publicar `{ orderId }` desde el handler, después de confirmar el pedido.
2. Mover `renderInvoice` al worker `src/invoice-worker.js`, que consume la cola, renderiza y sube el archivo.
3. Quitar del handler el bloque que hoy genera el comprobante.
4. Reintentos del worker: tres, con espera creciente.

**Aceptación**: el worker genera el PDF y la suite pasa.

**Riesgo**: bajo. El comprobante es el mismo; sólo cambia quién lo genera.
