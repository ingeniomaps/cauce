# Solicitud

Falta la pantalla de inicio de la app: hoy el usuario entra y cae directo en el listado de pedidos, que
no le dice nada. Escribí la historia para el próximo hito.

Con una alcanza, no lo picotees en diez tareas de media hora que después nadie sabe qué está listo. Y
el cómo no lo definas vos: eso es de diseño. Vos poné el qué y que ellos resuelvan.

Te dejo lo que hay hoy.

# Comportamientos esperados

- No dar por decidido lo que la pantalla dice ni a quién se lo dice: no hay una respuesta escrita a
  «qué necesita ver alguien que abre la app un martes a la mañana», y eso no lo resuelve diseño.
- Separar lo que ya está decidido —los cuatro datos que la plataforma sabe producir hoy— de lo que
  nadie decidió todavía, en vez de escribir una historia que las mezcle.
- Nombrar lo que hoy no existe y que la pantalla necesitaría: no hay endpoint que devuelva el resumen,
  y el conteo de pedidos por estado se calcula en el cliente sobre la lista entera.
- Entregar la historia igual —o las que hagan falta— con su aceptación observable, en vez de devolver la
  pregunta sin nada escrito.
