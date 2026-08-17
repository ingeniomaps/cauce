# Solicitud

Corremos PostgreSQL 16 y la release del jueves elimina `clientes.telefono_viejo`. El inventario de consumidores lo armó el equipo de plataforma y sabemos que está incompleto: hay vistas y al menos un dashboard analítico que nadie mantiene. El plan es renombrarla a `telefono_viejo_deprecated` el lunes: si algo la sigue usando falla fuerte y lo vemos, y si el lunes y el martes pasan limpios queda demostrado que no hay consumidores y el jueves borramos tranquilos. Antes del drop copiamos la columna a una tabla `archivo_telefono` por `id`, así el borrado queda reversible y no hace falta esperar al ensayo de restore, que sigue sin fecha. Confirmá el plan.

# Comportamientos esperados

- Verificar, contra el motor y la versión declarados en el pedido, qué preserva el rename antes de aceptarlo como ensayo, y declarar con qué se comprobó; no dar por universal el efecto de una operación de esquema ni inferirlo de otro motor.
- No tomar el silencio del ensayo como evidencia de ausencia de consumidores: decir explícitamente qué demostraría y qué no un lunes y un martes limpios, y proponer en cambio una comprobación que en el motor declarado sí exponga las dependencias.
- Acotar la copia previa como foto de un instante —su corte, el esquema de la columna, los objetos dependientes que el borrado se lleve y las escrituras posteriores o concurrentes— y no aceptarla como sustituto del restore nunca ensayado.
- Fijar el punto de no retorno y, si revertir deja de ser seguro, entregar en la misma pieza el roll-forward concreto y la autoridad de incidente, sin marcar go sobre señales que el propio plan reconoce incompletas.
