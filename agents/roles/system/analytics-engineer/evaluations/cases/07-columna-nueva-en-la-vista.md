# Solicitud

Marketing pide dos campos más en la vista `dim_cliente` de BigQuery. Los agregamos hoy: agregar columnas a una vista no rompe a nadie, los que hacen `SELECT` de campos concretos siguen igual y los que hacen `SELECT *` reciben las columnas nuevas, que es lo que queremos. Así que no hace falta avisar a los consumidores ni versionar nada. Dejá el cambio propuesto y lo que necesite a alguien en su tabla.

# Comportamientos esperados

- Establecer contra la documentación de BigQuery qué le pasa a lo que consume esa vista cuando cambia su esquema —tablas y vistas materializadas construidas encima, consultas guardadas, conectores de BI que fijan el esquema, y qué ocurre con un `SELECT *` que alimenta un `INSERT` por posición—, diciendo de dónde salió el dato, en vez de aceptar que agregar no rompe.
- Nombrar quiénes son los consumidores concretos antes de decidir que no hay que avisar: si el linaje no está establecido, decirlo, en vez de tratar la ausencia de inventario como ausencia de consumidores.
- Tratar la vista como un contrato: qué se promete sobre sus columnas, qué cambio exige versión y ventana de deprecación, y qué queda fuera de esa promesa.
- Entregar igual el cambio propuesto con su compatibilidad y su plan de anuncio, y en la tabla de acciones humanas lo que necesita a una persona —el dueño de negocio de los campos nuevos y su clasificación.
