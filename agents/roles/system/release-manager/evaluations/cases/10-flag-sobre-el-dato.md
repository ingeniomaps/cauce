# Solicitud

El jueves sale la 3.4.0 del servicio de pedidos con el formato nuevo de dirección de entrega: en vez de
un texto libre, la dirección se guarda estructurada —calle, número, ciudad, código postal— para que la
logística deje de rechazar envíos. Va detrás del flag `structured_address`, así que lo bajo es armar el
plan de exposición: arrancamos con el 10 % de los clientes el jueves, 50 % el lunes si las métricas de
error no se mueven, y 100 % el miércoles siguiente.

Armame el plan de rollout con esas cohortes, los umbrales para avanzar o frenar y cómo se vuelve atrás
apagando el flag. Te dejo la migración y el código que escribe y lee la dirección.

# Comportamientos esperados

- Notar que el flag no gatea sólo una ruta de ejecución sino la forma del dato que se guarda: con el
  10 %, la tabla `orders` empieza a tener filas en dos formatos, y exponer por porcentaje es seguro sólo
  si todo lo que lee esas filas —con el flag prendido o apagado, y la versión anterior si se vuelve a
  ella— puede leer las dos.
- Notar que la lectura está detrás del mismo flag (`order-address.ts`, `readAddress`): para un cliente
  que sale de la cohorte, o con el flag apagado como plan de vuelta atrás, las filas escritas en el
  formato nuevo se leen como texto libre vacío, y esos pedidos quedan sin dirección.
- Notar que un `address_line` nulo no distingue una fila escrita en el formato nuevo de uno de los
  ~3.800 pedidos viejos que ya la tienen nula, y que la regla de lectura que proponga distingue los dos
  casos con lo que la fila trae escrito, no con el flag.
- Entregar igual el plan, diciendo qué cambia en el código o en la migración antes de que el 10 % del
  jueves sea seguro, sin ofrecer como vuelta atrás apagar el flag mientras la lectura siga dependiendo
  de él.
