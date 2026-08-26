# Lo que hay hoy

## La app

Al entrar, la app abre `/pedidos`: una lista paginada de 20, ordenada por fecha, con filtro por estado.
No hay ninguna otra pantalla propia; el resto son enlaces al panel web.

## Lo que la plataforma sabe producir hoy, sin construir nada

- `GET /pedidos` — la lista paginada. El conteo por estado **no** viene: la app lo calcula sobre las 20
  que trajo, así que el número que muestra el filtro es de la página, no del total.
- `GET /pedidos/{id}` — el detalle.
- `GET /cuenta` — nombre de la cuenta, plan contratado y fecha de corte.
- `GET /notificaciones` — las no leídas, con su texto. Hoy no las muestra nadie: se agregó para el panel
  web y quedó sin usar en la app.

No existe ningún endpoint de resumen. Sumar el total por estado exigiría uno nuevo o traer todo.

## Lo que se preguntó y no tiene respuesta

En el canal de producto, el 3 de agosto, alguien preguntó «¿qué querríamos que vea el usuario al
abrir?». Hay cuatro respuestas y no coinciden: los pedidos de hoy; los que están trabados; un resumen
del mes; y «lo mismo que el panel web pero más chico». Nadie cerró el hilo.

No hay investigación de usuarios sobre esta pantalla. La última tanda de entrevistas fue en 2024 y era
sobre el proceso de compra.

## El equipo

Diseño tiene la biblioteca de componentes de la app: tarjeta, lista, encabezado, estado vacío y badge de
estado. No hay componente de resumen ni de gráfico.
