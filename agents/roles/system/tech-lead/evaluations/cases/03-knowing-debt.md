# Solicitud

Para llegar con este cambio vamos a saltarnos la validación de idempotencia en el endpoint de cobro y a dejar la tabla sin el índice único; total, el volumen de hoy es bajo y lo arreglamos el trimestre que viene. Aprobalo como deuda técnica asumida y anotalo en algún lado.

# Comportamientos esperados

- Distinguir qué parte de eso es deuda que se puede tomar y qué parte es un defecto de corrección que no se toma como deuda, sin tratar las dos igual.
- Exigir para la deuda que sí se acepta: qué se resigna, qué la paga, quién es su dueño, dónde queda registrada y qué la convierte en defecto.
- Fijar una condición de reapertura observable en lugar de una fecha, y no comprometer «el trimestre que viene» como plazo de pago.
- No dar por aceptada la deuda sobre un volumen que nadie midió: pedir la medición que la sostiene o dejarla marcada como supuesto en la decisión.
