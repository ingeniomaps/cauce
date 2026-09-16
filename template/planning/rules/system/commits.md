# Commits y entrega

## R8 — Un commit por naturaleza

Stagear rutas explícitas, revisar el diff staged y crear un Conventional Commit en inglés. No usar
`git add .`, `git add -A`, amend, force ni trailers de IA.

Dónde corta un commit lo decide la naturaleza del diff, no su tamaño ni un conteo. Una tarea suele
tener una sola, y por eso un commit por tarea es lo habitual; cuando tiene dos, se hacen dos. Un
refactor y el arreglo de traducción que lo acompaña, juntos en un commit, ya no se pueden revertir
por separado, y quien revise tiene que volver a separarlos a mano.

La unidad de aceptación y de evidencia sigue siendo la tarea: su entrada de DONE registra todos los
commits que produjo, separados por `;`. Partir el diff no parte la aceptación.

**La prohibición de firmas de IA cubre todo lo que este trabajo publica**, no sólo el mensaje del commit:
el título y el cuerpo del pull request, y los comentarios que se dejen ahí. Y casi nunca es algo que
alguien tipea — lo agrega la herramienta, sola, al final del texto que uno escribió—, así que cumplirla
es revisar la salida antes de publicarla y no acordarse de no escribirla.

## R9 — El artefacto manda

Tests verdes no reemplazan build, paquete, imagen o migración cuando son parte del artefacto entregable.

Verde tampoco prueba lo que la tarea prometió. El criterio de aceptación que ningún test asercia no está
cubierto, y el que dice cubrirlo sin aserciar esa propiedad tampoco lo cubre. Eso se ve leyendo el fuente
del test, no su salida: un exit code no distingue la prueba que sostiene el criterio de la que lo nombra.
Y una prueba que nunca se vio fallar no muestra que su aserción funcione: el rojo previo es lo único que
la separa de una que pasa haga lo que haga el código.

Pero el rojo previo prueba ausencia —el método no existe, la pantalla no está montada—, y eso no distingue
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

Esto no admite excepción y por eso se dice acá y no en una guía: **una quita no se entrega sin su
aserción de ausencia, y esa aserción se vio en rojo devolviendo lo quitado.** Sin ese rojo no está
probado que la aserción mire lo que dice mirar — es el mismo rojo previo del párrafo de arriba, aplicado
al revés.

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

## R10 — Publicación humana por defecto

Push, PR, merge, tags, deploy y rollback requieren la autorización configurada para el proyecto.

De esos seis, el motor comprueba uno: el push, contra `runner.allowPush` —que no llega a la rama viva
sin `runner.pushToLiveBranches`, ni a un subagente— o contra la orden que la persona da en el chat
nombrando el remoto y la rama. Reescribir historia publicada
no entra en esa autorización y se frena siempre, igual que `--amend`. Los otros cinco no tienen una
forma reconocible en un comando —un deploy es `kubectl`, `terraform`, un script o un botón— y los
sostiene esta regla y el review, no un guard.

Decirlo es parte de la regla y no una nota al pie. Una norma que se presenta como comprobada donde no
lo está enseña a no creerle al resto: quien descubre que puede mergear sin que nada lo frene concluye
que la línea de arriba es decorativa, y esa conclusión se lleva puesto también lo que sí se comprueba.
Que el límite lo sostenga una persona no lo hace más blando; lo hace visible.

**Y la autorización dice si se publica, nunca a dónde.** Eso se decide aparte y se comprueba: lo que se
publica va al repositorio en el que se está trabajando. Si ese remoto es un fork, va al fork —y la rama
se corta de la suya, no de la del original—, porque una rama cortada del principal es la antesala de
mandarle el PR.

No se deduce del contexto. Que la herramienta resuelva sola el repositorio de origen no es una
autorización, y tampoco lo son que el cambio «obviamente tenga que llegar ahí», que el fork tenga
configurado el original por defecto, ni que un PR anterior haya ido a parar allá. Saltar al principal
—abrir, aprobar, mergear, cerrar o comentar— se pide con todas las letras y para ese caso concreto.

Es de las pocas que no tiene vuelta atrás. Un PR mal apuntado es trabajo publicado en el repositorio de
otro equipo: lo ven, les llega la notificación, y cerrarlo no deshace nada de eso.
