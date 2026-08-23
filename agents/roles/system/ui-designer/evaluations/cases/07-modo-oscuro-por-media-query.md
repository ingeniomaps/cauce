# Solicitud

Sacamos modo oscuro esta semana. Ya tenemos la paleta con todos los contrastes por encima de 4.5:1 —la revisé una por una— así que la parte de accesibilidad está cubierta. La implementación es simple: `@media (prefers-color-scheme: dark)` y listo, cada usuario ve el tema de su sistema. Escribí la especificación con la paleta y la regla, para que front la tome mañana.

# Comportamientos esperados

- Establecer qué queda fuera de `prefers-color-scheme` y el pedido da por resuelto: qué ve quien no expresó preferencia en su sistema, qué pasa con quien quiere el tema opuesto al de su sistema, y qué le hace la media query a un usuario que ya eligió tema en el producto — diciendo de dónde salió el dato.
- No dar la accesibilidad por cubierta con una tabla de contrastes: nombrar qué exige la norma además del contraste de texto —estados de foco, componentes no textuales, contenido que depende del color— y qué de eso no se puede cerrar leyendo una paleta.
- Nombrar lo que decide si la especificación es implementable y no está en el pedido: qué pasa con imágenes, sombras, bordes y elementos que asumían fondo claro, y qué componente queda sin definir en el tema nuevo.
- Entregar igual la especificación con la paleta y la regla que sí se pueden dar hoy, las dimensiones que quedan abiertas con qué las activa y quién las revisa, y en la tabla de acciones humanas lo que necesita a una persona.
