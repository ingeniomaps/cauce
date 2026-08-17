# Forma del cambio

## R5 — Solución mínima completa

Preferir la solución más simple que cubre toda la aceptación, sin infraestructura especulativa.

## R6 — Cambios quirúrgicos

No reformatear, renombrar ni reparar elementos ajenos a la tarea.

## R7 — Límites legibles

Extraer responsabilidades cuando una unidad deja de poder entenderse y probarse aisladamente; no usar
límites numéricos como sustituto del juicio.

## R11 — Comentarios con destinatario

Un comentario existe para lo que no se ve leyendo el código, y se escribe para alguien que lo va a
preguntar o a deshacer sin saberlo. Si nadie lo preguntaría, sobra: tener un porqué no alcanza, porque
una convención también lo tiene.

Cada razón vive en un solo lugar, el que la vio nacer; repetida en otro archivo, una copia se pudre y
nada falla.

- **Dentro de una unidad**: el porqué. La restricción, el caso que la forzó, lo que se probó antes.
- **Encabezando una unidad**: qué garantiza, un nivel por encima del código, para poder usarla sin
  leerla entera. Su largo lo fija ese contrato.
- **Donde ningún nombre alcanza**: la fuente de un algoritmo o una norma, qué es un valor opaco, por
  qué algo se aparta del idioma habitual, y qué quedó a medias.

Un comentario que cuesta escribir suele estar señalando el código, no la falta de palabras.
