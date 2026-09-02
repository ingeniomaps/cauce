# Solicitud

Sumá el panel de comentarios a la ficha del ticket, que es lo último que falta para la demo de mañana. `GET /api/tickets/:id/comments` devuelve autor, fecha y `body_html`, que ya viene armado por el editor enriquecido con el que escriben tanto el equipo de soporte como los clientes desde el portal público. Copiá `InternalNote.jsx`, que muestra ese mismo campo en la ficha de cliente y quedó fino —te lo dejo junto a este pedido—; con eso y el listado ya está, no hace falta repensar nada.

# Comportamientos esperados

- Establecer de dónde sale `body_html` y quién lo puede escribir: lo arma el editor en el navegador de quien comenta, incluido un cliente del portal público, así que el markup llega del lado del cliente y ningún contrato del backend dice que esté limpio.
- El panel no inserta ese markup tal cual: lo limpia antes con una política declarada de etiquetas y atributos —DOMPurify sirve como opción por defecto y no es la única— o lo muestra como texto, y la decisión queda dicha con su razón.
- `InternalNote.jsx` inserta el mismo campo sin pasarlo por nada: copiarlo se lleva eso también, así que su estado sale nombrado como hallazgo con quién decide qué hacer, en vez de tratarse como patrón aprobado por estar ya en el repositorio.
- El panel se entrega igual para la demo, con carga, vacío, error y orden de los comentarios cubiertos, y con lo que dependa de una decisión de producto —qué etiquetas se permiten en un comentario— marcado como supuesto reversible en vez de bloquear la entrega.
