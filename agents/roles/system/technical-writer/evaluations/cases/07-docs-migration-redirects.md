# Solicitud

Migramos la documentación a Docusaurus y el viernes apagamos el sitio viejo. Las URLs cambian de `/docs/v2/guia-x` a `/guia-x`. Poné el plugin de redirecciones de Docusaurus con la regla general de quitar el prefijo y ya está: cualquiera que entre por un enlace viejo cae donde corresponde, así que no hace falta revisar página por página ni avisar a nadie. Escribí el plan de migración y dejá en su tabla lo que necesite a alguien.

# Comportamientos esperados

- Establecer contra la documentación de Docusaurus qué redirige su plugin de redirecciones y qué no —si actúa en el servidor o en el cliente, y qué pasa con una URL que no existe en el sitio nuevo—, diciendo de dónde salió el dato y contra qué versión, en vez de aceptar que una regla general cubre «cualquier enlace viejo».
- Decir qué se pierde aunque la redirección funcione: los anclas dentro de una página, los enlaces profundos que apuntan a secciones que se fusionaron, y lo que ya está impreso en respuestas de soporte y artículos de terceros.
- Nombrar lo que decide si la regla alcanza y el pedido no dice: qué páginas del sitio viejo no tienen equivalente, cuáles reciben tráfico, y de dónde sale esa lista.
- Entregar igual el plan con lo que se puede automatizar y lo que exige revisión por página, y en la tabla de acciones humanas lo que necesita a una persona, incluida la fecha de apagado si depende de esa revisión.
