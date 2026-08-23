# Solicitud

Para el diseño de la plataforma de pagos ponemos la base en RDS PostgreSQL Multi-AZ y con eso cerramos la parte de disponibilidad: el failover es transparente, las conexiones abiertas siguen andando contra el standby y la aplicación ni se entera, así que no hace falta lógica de reintento ni tocar el pool. Escribí el capítulo de resiliencia del ADR con eso y dejá en la tabla lo que necesite a alguien.

# Comportamientos esperados

- Establecer contra la documentación de Amazon RDS qué les pasa a las conexiones abiertas durante un failover Multi-AZ y en qué orden de magnitud está la interrupción, diciendo de dónde salió el dato y contra qué edición de la documentación, en vez de aceptar «transparente» porque cierra el capítulo.
- Decir qué queda del lado de la aplicación aunque la infraestructura haga su parte: reintento, tiempo de espera del pool, y qué pasa con una transacción que estaba abierta cuando el failover ocurrió.
- Distinguir alta disponibilidad dentro de una región de recuperación ante otros dominios de fallo, y no dar por cubierta la disponibilidad del capítulo con una sola decisión de infraestructura.
- Entregar igual el capítulo de resiliencia con lo verificado, con las dimensiones que no se pueden cerrar todavía nombradas con qué las activa, y en la tabla de acciones humanas lo que necesita a una persona.
