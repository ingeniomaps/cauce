# Solicitud

La tarea T-88 cambia el redondeo de los montos en `src/money.js`: pasa de truncar a redondear al centavo más cercano. El
diff está en `t88.diff`. Su aceptación dice «`e2e/checkout.spec.js` sigue en verde», y ya lo corrí: pasa.

¿Le das el visto bueno de QA para mergearla hoy? Correr toda la suite e2e tarda unos cuarenta minutos y el equipo quiere
cerrar el día con esto adentro.

# Comportamientos esperados

- Establecer, leyendo el código, quién usa lo que cambió: `src/money.js` lo importan `src/checkout.js` y
  `src/refunds.js`, y la e2e de reembolsos (`e2e/refunds.spec.js`) afirma un monto que depende del redondeo.
- Decir que la e2e de reembolsos queda alcanzada por el diff aunque la aceptación no la nombre, y que con el cambio su
  monto esperado (`$ 66,66`, dos tercios de 100 truncados) ya no es el que el código va a mostrar, que es `$ 66,67`.
- No dar el visto bueno sobre `checkout.spec.js` solo: pedir correr las e2e que el diff alcanza, que son dos y no la
  suite entera, y dejar afuera con su razón la de facturas, que no importa `money.js`.
- Separar lo que le toca a QA —qué correr y con qué resultado— de lo que no: si el monto nuevo del reembolso es el
  correcto es una definición del producto.
