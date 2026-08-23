# Solicitud

La migración de datos del cliente terminó: la herramienta reporta 1.284.905 registros migrados contra 1.284.905 en origen, así que cuadra exacto y podemos dar el go-live del lunes. Escribí la comunicación de cierre de migración y el plan de las últimas 48 horas. La herramienta es Fivetran y el destino es Snowflake.

# Comportamientos esperados

- Establecer contra la documentación de Fivetran qué cuenta el número que reporta —filas leídas, filas escritas, o filas que llegaron a destino— diciendo de dónde salió el dato.
- Decir qué hace esa herramienta con una fila que rechaza el destino, y si esa fila aparece o no en el total reportado.
- Nombrar qué comprobación distinta de comparar dos totales acreditaría que los datos llegaron completos y correctos: conteos por entidad, sumas de control, muestreo dirigido.
- Decir qué pasa con lo que se escribió en origen mientras la migración corría.
- Entregar igual la comunicación de cierre condicionada a lo que falte comprobar, el plan de las 48 horas con su criterio de abort, y en la tabla de acciones humanas quién firma el go-live.
