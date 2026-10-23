---
aplica: al escribir o revisar una aceptación, una prueba, o un cambio que quita o reemplaza algo
---

# Cómo se prueba

Cómo se ve que una prueba cuida lo que nombra, y cómo se prueba lo que un cambio quita. Rige al escribir o
revisar una aceptación, una prueba, o un cambio que quita o reemplaza algo. Lo que de esto no admite excepción
—declarar la mutación, no entregar una quita sin su aserción de ausencia, y que una quita casi nunca se ve como
una— R9 lo carga en cada agente, porque una regla que sólo se abre cuando el disparador se reconoce no alcanza
para una puerta.

## R29 — Una prueba se ve romper, y una quita se prueba por ausencia

El rojo previo que pide R9 prueba ausencia —el método no existe, la pantalla no está montada—, y eso no distingue
una implementación sutilmente equivocada de una correcta. Lo que sí la distingue es romper, ya con el código
puesto, exactamente lo que el caso dice cuidar, y verlo ponerse rojo por eso. Si no se pone rojo, no lo cuida,
y la cobertura no lo va a decir: mide qué líneas se ejecutan, no qué defectos se atrapan.

**Y esa mutación se declara por escrito, en la aceptación que la pide.** Una línea alcanza: qué se rompe
y qué prueba tiene que ponerse roja. Sin eso, quien revisa no puede distinguir la mutación que se corrió
de la que se pensó, y la única salida que le queda es volver a correrla — que es rehacer el trabajo que
delegarlo evitaba, igual que el contraste de lo consultado en R14.

Escribirla antes cambia además lo que se escribe. Una aceptación que tiene que nombrar qué romper deja de
poder pedir algo que ninguna mutación puede tocar: si no hay nada que romper, no había propiedad que
cuidar, y eso se ve al redactarla en vez de al final de la vuelta.

La precondición del caso también cuenta. Si el estado en que arranca no puede ocurrir por el camino de
producción, lo que prueba tampoco: queda verde para siempre sobre algo que nadie va a vivir.

**Y quitar un comportamiento se prueba al revés que agregarlo.** Una prueba que comprueba que aparece lo
nuevo no comprueba que desapareció lo viejo: los dos pueden convivir, y ahí el verde dice que la mitad
del cambio ocurrió. La aserción que hace falta es de ausencia —que la salida vieja ya no esté, que la
rama vieja ya no corra—, y es la que no se escribe sola porque nadie la extraña.

**Y lo más caro es que una quita casi nunca se ve como una quita.** Se escribe como un agregado: una
bandera que se pone, una variable que se exporta, una condición que se añade. Lo que la delata es la
frase que la justifica — «lo agrego **para que** deje de …». Ahí el sujeto es lo que entra y el objeto es
lo que desaparece, y lo que desaparece es lo que hay que probar. Silenciar un aviso, saltear una rama,
desarmar una confirmación: los tres se escriben sumando y los tres son quitas.

**Y cambiar quién hace algo, o cómo, es una quita aunque lo que sale «sea lo mismo».** Mover un paso de
lugar, reemplazar una implementación, cambiar de herramienta: lo viejo hacía cosas que nadie anotó, y «no
cambia nada» es una afirmación sobre el resultado que nadie comprobó. Se sostiene de una sola forma:
la salida de antes y la de después, sobre el mismo caso, lado a lado. Y esa comparación va en la
aceptación, como condición —no como una actividad del plan, que se hace o no se hace sin que nada dependa
de ella—. Que lo nuevo exista y la puerta pase no dice que diga lo mismo.

**Y antes de probar cómo se quita hay que poder quitarlo.** Lo que está en uso no se corta: se depreca,
y la marca dice las dos cosas que la vuelven una salida y no una etiqueta — qué lo reemplaza, y qué
condición permite borrarlo. Sin la primera, quien lo usa no sabe a dónde ir; sin la segunda, el
deprecado es código muerto con un cartel puesto, y se queda para siempre.

Lo que no llama nadie es otra cosa y se borra. La diferencia no es de estilo: cortar de golpe rompe a un
consumidor que nadie miró, y deprecar lo que nadie usa cuesta mantener dos caminos para nadie.

Esto no admite excepción —por eso R9 lo carga además de acá—: **una quita no se entrega sin su
aserción de ausencia, y esa aserción se vio en rojo devolviendo lo quitado.** Sin ese rojo no está
probado que la aserción mire lo que dice mirar — es el mismo rojo previo de R9, aplicado al
revés.

Y hay un caso particular que merece su renglón porque es el que más se disfraza: **una confirmación que
estorba casi siempre está cuidando algo.** Antes de callarla se establece qué protege. Si la respuesta es
«no sé», eso **es** el resultado de la medición y no un permiso para seguir: lo que corresponde es
quitarle a la herramienta el motivo de preguntar, no la pregunta. Poner `CI=true` para que un gestor de
paquetes dejara de confirmar antes de purgar borró el árbol de dependencias de un proyecto real, y el
cambio se había probado —el gate arrancaba— midiendo sólo lo que aparecía.

Lo que se quita, además, tiene dependientes, y no se anuncian. Una invariante que deja de valer se lleva
puesto a quien la daba por cierta: el mensaje que la afirmaba, la condición que la deducía, el comentario
que la explicaba. Suelen vivir en otro archivo, que es donde una premisa vieja se pudre sin que nada
falle. Antes de entregar una quita se busca quién dependía de ella —qué la afirmaba, qué la deducía— y
cada uno se corrige o se declara. Recorrer la enumeración de la tarea no encuentra esto: la enumeración
dice qué había que hacer, no qué se apoyaba en lo que había.
