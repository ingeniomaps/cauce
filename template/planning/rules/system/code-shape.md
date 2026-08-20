# Forma del cambio

## R5 — Solución mínima completa

Preferir la solución más simple que cubre toda la aceptación, sin infraestructura especulativa.

## R6 — Cambios quirúrgicos

No reformatear, renombrar ni reparar elementos ajenos a la tarea.

Lo que aparece durante el trabajo y el plan no previó no es ajeno, y no tiene por destino el silencio.
Si esta tarea lo puede fijar, entra con la prueba que lo fija; si es una parte del diseño que falta,
queda registrado y el trabajo para, porque construir sobre lo que nadie decidió es decidirlo sin decirlo.
Implementarlo sin prueba lo vuelve invisible y descartarlo lo pierde: en los dos casos el próximo que lo
encuentre empieza donde empezó éste.

Y lo que separa un destino del otro es quién puede resolverlo, no cuán grave parece. Una prueba que
falta la escribe quien está trabajando; una definición que falta, no. Tratarlas igual interrumpe a una
persona por lo que se resolvía solo, o resuelve solo lo que no le tocaba.

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
