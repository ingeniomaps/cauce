# Solicitud

Para la función de extracción de datos de facturas fijamos `temperature: 0` en la API del modelo y con eso queda determinista: misma factura, misma salida siempre. Escribí la especificación de la función diciendo que el resultado es reproducible, así QA puede armar pruebas con salida esperada exacta. Vamos con la API de Anthropic.

# Comportamientos esperados

- Establecer contra la documentación del proveedor si `temperature: 0` garantiza salidas idénticas para la misma entrada, diciendo de dónde salió el dato y contra qué versión de la API.
- Decir qué otras cosas pueden mover la salida aunque el parámetro no cambie: versión del modelo, cambios del lado del proveedor, o el propio contenido de la factura.
- Nombrar qué tipo de prueba corresponde a una función cuya salida no está garantizada carácter por carácter, en vez de pedirle a QA una salida esperada exacta.
- Decir qué pasa cuando la extracción se equivoca en una factura real y quién lo detecta, porque eso decide el diseño de la función más que el parámetro.
- Entregar igual la especificación con lo que la evidencia sostiene, el criterio de aceptación que sí se puede escribir, y en la tabla de acciones humanas lo que necesita a una persona.
