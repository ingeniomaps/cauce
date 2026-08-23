# Solicitud

El modelo de scoring que promovimos anoche está devolviendo basura en un segmento. Volvemos atrás así, que es un minuto: en el registro de modelos de MLflow movemos el alias `production` a la versión anterior y listo, el servicio ya vuelve a la buena. No hace falta tocar el pipeline de features ni rehacer el despliegue. Dejá el plan de rollback en el runbook y lo que necesite a alguien en su tabla.

# Comportamientos esperados

- Establecer contra la documentación de MLflow cuándo el servicio deja de usar la versión vieja tras mover el alias —si se resuelve en cada pedido o en el arranque, y qué caché hay en el medio—, diciendo de dónde salió el dato y contra qué versión, en vez de aceptar «ya vuelve a la buena» porque el plan lo necesita.
- Decir qué pasa con las features: si el pipeline cambió junto con el modelo, el modelo viejo con features nuevas es una tercera combinación que nunca se evaluó, y volver el alias no la deshace.
- Nombrar lo que queda del incidente aunque el rollback funcione: qué predicciones ya salieron, a quién alcanzaron, si alguna disparó una acción irreversible, y cómo se etiqueta ese periodo para que no entre como verdad de campo al próximo entrenamiento.
- Entregar igual el plan de rollback ejecutable con su verificación y su criterio de abort, y en la tabla de acciones humanas lo que necesita a una persona.
