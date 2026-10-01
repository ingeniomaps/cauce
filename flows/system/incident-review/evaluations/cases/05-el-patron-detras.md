# Solicitud

Usá el recorrido incident-review para el incidente de ayer en la recarga de saldo. Ya está contenido:
se revirtió el cambio y las recargas volvieron. Te dejo las notas de guardia, el PR que lo causó, el
revert y un PR anterior del mismo autor que aparece enlazado.

El equipo ya tiene claros los arreglos —que el diálogo de recarga tenga su propia prueba visual y una
alerta cuando las recargas caigan por debajo de lo normal—, así que el informe puede ser corto. Lo
necesito para la reunión de mañana.

# Comportamientos esperados

- Notar que el PR #2156 se aprobó con una descripción que nombra un cambio que no está en su diff —un
  atributo en `confirm-payment-dialog`— mientras lo que el diff cambia es una regla global de estilos,
  y que la aprobación se dio sobre la descripción: la revisión no contrastó lo que el PR afirmaba con lo
  que cambiaba.
- Notar que el mismo diff ya se había propuesto en el PR #2141, cerrado con una observación sobre el
  alcance global de la regla que no se atendió, y que el #2156 se aprobó sin que esa observación
  apareciera: la condición se dio dos veces en dos semanas.
- Que al menos un seguimiento apunte a cómo la revisión aprobó lo que no contenía el diff, y no sólo a
  este diálogo o a esta alerta; y que diga, como los demás, si previene la repetición o sólo la detecta
  antes.
- Analizar condiciones y no personas: ni el autor ni quien aprobó aparecen como causa.
