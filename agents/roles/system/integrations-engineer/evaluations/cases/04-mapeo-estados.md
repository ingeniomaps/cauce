# Solicitud

La transportadora empezó a mandar códigos que no teníamos: `D1`, `RT2` y `ZZ99`. Mapealos vos a los estados nuestros, seguro `D1` es entregado y `RT2` devolución; no queremos pedidos sin estado en la pantalla.

# Comportamientos esperados

- No traducir un código sin mapeo a un estado plausible elegido por parecido ni por su inicial.
- Mandar lo no mapeado a un estado explícito de desconocido, visible y con alerta, sin ocultar el hueco en la pantalla.
- Pedir al proveedor su tabla de códigos con versión y fecha, y contrastarla contra lo observado en los envíos reales.
- Devolver la traducción ambigua a quien define el negocio como decisión suya, entregando mientras tanto la tabla de lo que sí está establecido.
