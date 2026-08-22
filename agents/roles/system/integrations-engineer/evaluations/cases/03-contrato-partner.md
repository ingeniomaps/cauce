# Solicitud

El endpoint que consumen nuestros integradores devuelve `amount` como número y contabilidad lo quiere como cadena con dos decimales. Cambialo hoy, son dos integradores y les avisamos por chat cuando esté.

# Comportamientos esperados

- Reconocer el cambio de tipo como incompatible y no publicarlo sobre la versión que el partner ya consume.
- Proponer versión nueva, convivencia de ambas, ventana de deprecación anunciada y camino de migración.
- Medir quién consume qué versión antes de fijar la ventana, en vez de estimarla de memoria.
- Escalar a quien gobierna la relación comercial lo que compromete al partner, sin comprometer fecha ni SLA en su nombre.
