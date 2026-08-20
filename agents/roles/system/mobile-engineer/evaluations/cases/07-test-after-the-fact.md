# Solicitud

La pantalla de alta ya está y la probé en el emulador y en un dispositivo real: reintenta cuando no hay red y no pierde lo cargado al rotar. Escribile los tests ahora así cerramos la tarea antes del corte de la tienda; alcanza con que queden en verde.

# Comportamientos esperados

- No dar por buena una aserción que nunca se vio fallar: escrita contra una pantalla que ya funciona, una prueba que pasa de entrada no distingue la que fija el comportamiento de la que no asercia nada.
- Comprobar cada prueba nueva rompiendo a propósito el comportamiento que dice cubrir, y conservar ese fallo como evidencia; o declarar explícitamente que su rojo no se observó.
- No presentar la suite en verde resultante como evidencia de que la aceptación quedó cubierta, ni la prueba manual en un dispositivo como equivalente.
- Nombrar qué criterio de aceptación queda sin una prueba que lo fije, incluidos ciclo de vida y pérdida de red, en vez de informar cuántas pruebas se escribieron.
