# Forma del cambio

## R5 — Solución mínima completa

Preferir la solución más simple que cubre toda la aceptación, sin infraestructura especulativa.

## R6 — Cambios quirúrgicos

No reformatear, renombrar ni reparar elementos ajenos a la tarea.

Lo que aparece durante el trabajo y el plan no previó no es ajeno, y no tiene por destino el silencio.
Si esta tarea lo puede fijar, entra con la prueba que lo fija; si es una decisión que no le toca, queda
registrada con qué la cierra y quién puede tomarla. Implementarlo sin prueba lo vuelve invisible y
descartarlo lo pierde: en los dos casos el próximo que lo encuentre empieza donde empezó éste.

Lo que impide entregar es otra cosa, y ya tenía su camino: se dice que no se pudo, con el bloqueo
nombrado. Confundirlo con lo anterior frena entregas completas por un borde que alguien iba a decidir de
todos modos —toda aceptación escrita en prosa tiene uno—, y un freno que salta siempre se termina apagando.

Y lo que separa un destino del otro es quién puede resolverlo, no cuán grave parece. Una prueba que
falta la escribe quien está trabajando; una definición que falta, no. Tratarlas igual interrumpe a una
persona por lo que se resolvía solo, o resuelve solo lo que no le tocaba.

## R7 — Límites legibles

Extraer responsabilidades cuando una unidad deja de poder entenderse y probarse aisladamente.

Un umbral no decide la división: la dispara. Al cruzarlo se revisa si la unidad mezcla dos propósitos con
ciclos de vida distintos, y recién ahí se parte, o se deja con la razón escrita. Un número usado como límite
se cumple partiendo por la mitad lo que era una sola cosa; usado como disparador encuentra lo que nadie iba
a mirar. Cuáles son esos números los fija el proyecto, porque dependen del lenguaje y de la superficie.

Lo que crece por diseño no se juzga por tamaño: un registro que sólo agrega, una salida generada o un
histórico son largos porque eso es lo que son. Y una división que duplica un hecho es peor que el archivo
largo — una de las dos copias se pudre y nada falla.

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

## R18 — Un doble se justifica y los datos salen de una fábrica

Todo doble de prueba —mock, stub, fake, spy— declara en una línea por qué existe, y se busca en el lugar
compartido antes de escribir uno nuevo. Los datos de ejemplo salen de una fábrica, nunca de un volcado de
producción ni de una credencial real.

El enemigo no es el doble: es el test que afirma estructura en vez de conducta. Una suite entera puede
quedar verde con el defecto adentro sin que sobre un solo doble — lo que faltaba era el caso que nadie
escribió. Por eso se justifica y se reúsa en vez de prohibirse: un doble sin razón escrita se copia, y la
copia deja de coincidir con lo que reemplaza sin que ninguna prueba lo note.

