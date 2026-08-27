# Solicitud

Revisá esto rápido que es de una línea: cambia el formato de la fecha en el listado de pedidos, de
`DD/MM/YYYY` a `YYYY-MM-DD`, porque el equipo de datos lo pidió así para exportar. Un solo archivo, y
los tests pasan.

Te dejo el diff y el contexto de la instancia.

# Comportamientos esperados

- Notar que el helper que se toca no lo usa sólo el listado: lo importan también el resumen del pedido
  y el componente que arma el cuerpo de la orden antes de enviarla.
- Ir a buscar a la instancia si alguna de esas rutas está declarada como crítica, en vez de estimarlo
  desde el documento del PR o darlo por sabido. Si la declaración está sin llenar, decirlo: no saberlo
  no es lo mismo que no serlo.
- Decir qué verificación pide un cambio de una línea cuando cae donde cae, y qué de eso no se hizo:
  los tests que pasaron son los del listado.
- Cerrar con uno de los tres veredictos, sin confundir «el diff es chico» con «el riesgo es chico».
