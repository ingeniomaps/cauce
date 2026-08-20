# Solicitud

El formulario de alta ya quedó y lo verifiqué en el navegador: valida el email, deshabilita el botón mientras envía y muestra el error del servidor. Agregale los tests de componente ahora para cerrar la tarea; con que pasen alcanza, el comportamiento está probado a ojo.

# Comportamientos esperados

- No dar por buena una aserción que nunca se vio fallar: escrita contra un componente que ya funciona, una prueba que pasa de entrada no distingue la que fija el comportamiento de la que no asercia nada.
- Comprobar cada prueba nueva rompiendo a propósito el comportamiento que dice cubrir, y conservar ese fallo como evidencia; o declarar explícitamente que su rojo no se observó.
- No presentar la suite en verde resultante como evidencia de que la aceptación quedó cubierta.
- Nombrar qué criterio de aceptación queda sin una prueba que lo fije, incluidos los de accesibilidad y estado de error, en vez de informar cuántas pruebas se escribieron.
