# Proceso

## R1 — Pensar antes de editar

Leer aceptación, contexto y código actual; escribir el plan antes del primer cambio.

## R2 — Ejecutar por objetivo

Cada paso termina en un estado verificable, no en una lista de archivos a tocar.

## R3 — Review proactivo

Buscar fallos de corrección, seguridad, compatibilidad y operabilidad antes de Verify.

Un veredicto tiene tres salidas y no dos: aprobar, aprobar con lo que haya que corregir antes de entregar,
y no poder aprobar. Con dos, las dos últimas se confunden y lo que no se resuelve dentro de este cambio
gasta igual la vuelta de corrección que no lo va a arreglar.

Y dentro del veredicto, el hallazgo que impide entregar se separa del que no. Mandar a tocar código por una
mejora opinable cuesta una vuelta y un riesgo que nadie pidió; no anotarla la pierde. Se corrige lo primero
y se registra lo segundo.

## R4 — Sincronización de estados

El estado se mueve de forma atómica entre contratos; nunca se copia para representar progreso.

## R16 — El costo es el contexto, no las palabras

Cada llamada reenvía el contexto entero, así que gasta más quien da más vueltas que quien escribe más.
Los comandos independientes van en una sola invocación; el CLI antes que el archivo; el fragmento antes
que el archivo entero; un subagente o un workflow sólo cuando el trabajo no entra en la corrida actual.

Entre etapas viaja lo que la siguiente necesita para decidir, no todo lo que la anterior produjo. El
análisis completo queda donde se escribió y lo lee una sola vez quien sintetiza al final; lo que se
arrastra en el handoff se reenvía en cada etapa que sigue, así que lo que costó una vez pasa a costar
una vez por etapa. Son requisitos opuestos y por eso no son el mismo texto: el resumen quiere ser corto
porque viaja, y la síntesis quiere estar completa porque decide.

Se lee para escribir, no para confirmar: un archivo se lee una vez y se escribe entero. Releerlo para
comprobar que quedó no comprueba nada que un error no hubiera dicho.

Verificar es la excepción, y no se negocia. Ahorrar una llamada nunca justifica afirmar sin haber
comprobado —R14 no admite descuentos— ni dar por terminado lo que no se corrió.

## R17 — Una unidad de trabajo se parte por lo que acumula, y hay dos formas de acumular

Dos barras, y cada una encuentra lo que la otra deja pasar: **cinco condiciones de aceptación** en una
tarea, y **cuatro horas de esfuerzo humano**. Arriba de la tarea el conteo sigue: siete criterios en una
épica, nueve tareas en un hito.

Ninguna de las dos decide la división: la dispara. Al cruzarla se revisa si la unidad mezcla dos
resultados con vidas distintas, y recién ahí se parte, o se deja con la razón escrita —igual que R7 con
el código—. Un número usado como límite se cumple partiendo por la mitad lo que era una sola cosa.

Lo que no es una salida es cruzar el umbral sin decidir. Por eso la razón se escribe donde vive la
unidad —`(sin partir: <razón>)`— y `check` la exige: sin ella la escapatoria no dejaba rastro y era
prosa sin mecanismo, que es lo que esta regla entera fue hasta que se la midió. La razón la lee quien
tome la unidad dentro de tres meses; escribirla para que el mensaje se calle la desperdicia.

**La aceptación que acumula condiciones.** Cada condición por separado puede ser correcta y estar
verificada contra el código; el problema es el conjunto. Un plan tiene que satisfacerlas todas a la vez
y basta fallar una para tirar la vuelta entera, así que la probabilidad de salir limpio se desploma con
la cantidad aunque cada punto sea fácil. Y una aceptación crece sin que nadie lo decida: se le suman
condiciones de a tandas en cada rechazo de plan, y cada tanda parece razonable.

**El esfuerzo que nadie descompuso.** El conteo de condiciones no lo ve, porque el problema es el
opuesto: «crear la página de inicio» tiene una sola condición de aceptación y son tres días de trabajo.
No está acumulada, está sin pensar — no dice qué mensaje, qué interacción, qué se decide y qué ya está
decidido, y quien la tome va a decidir todo eso solo y tarde. La barra de cuatro horas obliga a esa
conversación antes: de ahí salen «definir propósito y mensaje» y las que siguen, cada una con un
resultado que se puede mirar. Y sirve de medida — dos tareas entran en una jornada humana, y con IA
bastantes más según cuán definidas estén—, que es lo que vuelve planificable un hito en vez de una
apuesta.

Las dos barras juntas, y en los dos sentidos: una tarea de tres horas con quince condiciones entra en
el tope de esfuerzo y no se construye nunca; una tarea de una condición y tres días lo pasa por el otro
lado. Medir una sola deja pasar la mitad de los casos.

## R20 — Una medición se lanza contra lo que podría refutarla

Antes de una tanda cara —evaluaciones, corridas, barridos— se escribe qué se espera encontrar y **qué
resultado lo desmentiría**. Sin esa segunda mitad no hay medición: hay recolección, y recolectar
confirma siempre.

El tamaño sale de ahí y no de la lista: se corre el mínimo que pueda refutar, no lo que cubra todo.
Y se relee la hipótesis en la primera tanda, porque cuando ya está contestada, seguir cuesta lo mismo
que la primera vez y no agrega nada.

La exhaustividad tiene su lugar y es otro: cuando cada elemento puede fallar por su cuenta —medir
cincuenta cargos que nunca se midieron—, no hay señal común que una muestra revele. Lo que no
corresponde es tratar una pregunta de sí o no como si fuera un censo.

El costo de equivocarse acá no se ve mientras pasa: cada corrida termina bien, entrega su resultado y
parece trabajo. Lo que se gasta es la vuelta que no se dio en otra cosa, y eso no aparece en ninguna
salida.

Repetir una medición que falló pide lo mismo. Una re-corrida sirve para dos cosas y conviene decir cuál:
comprobar un cambio, y entonces ese cambio tiene que poder mover **ese** veredicto —tocar lo que el caso
mide, no cualquier parte del contrato—; o estimar cuánto varía el resultado sin que nada cambie, y
entonces se declara así y se repite varias veces, porque una sola no estima nada. Volver a correr
esperando que esta vez salga distinto no es ninguna de las dos: es comprar un número nuevo con la misma
información.

Un cambio que no toca lo que el caso mide no compra una re-corrida. La medición vuelve a costar entera y
lo que devuelve es la varianza que ya estaba ahí — y esa varianza existe: en la sesión que originó esta
regla, cargos que habían pasado todos sus casos fallaron uno al día siguiente sin que el motivo tocara
nada de lo que se había cambiado.

Y lo que se repite es el caso que falló, no la batería. Un sujeto que falla uno de seis vuelve a correr
ese uno: los otros cinco veredictos ya se tienen, y volver a mirarlos cuesta lo mismo que obtenerlos la
primera vez. El registro parcial que sale de ahí no vale solo —cubre menos casos de los que existen— y
se compone con los veredictos que no se volvieron a medir, diciendo de qué corrida viene cada uno.

## R21 — Retomar empieza por establecer qué quedó hecho

Un trabajo caro que se corta —por un límite, una caída, una interrupción— deja trabajo hecho. Antes de
volver a lanzarlo se establece cuál es: qué artefactos hay en disco, qué resultados se escribieron, qué
elementos ya tienen veredicto. Recién con esa lista se decide, y lo que se corre es la diferencia.

«Continuá» no autoriza a relanzar. Pide exactamente lo contrario: seguir desde donde se quedó, que es
imposible sin haber mirado antes dónde fue. Relanzar entero cobra de nuevo lo que ya se pagó, y quien
lo pide no tiene cómo saber que eso está pasando —la corrida se ve igual empiece donde empiece—.

Y cuando el pedido sí es relanzar —«de nuevo», «desde cero», «reiniciá»— tampoco se ejecuta derecho:
primero se entrega el veredicto de lo avanzado y se pregunta si aun así quiere la corrida entera. Puede
quererla, y hay razones legítimas: el sujeto cambió, lo anterior quedó sospechoso, se busca medir
varianza. Lo que no puede es tirarse trabajo sin que nadie lo haya decidido.

El veredicto existe para que se pueda decidir, así que tiene que traer con qué. Cuatro cosas:

- **Qué ya tiene resultado**, elemento por elemento, y cuál es.
- **Qué quedó a medias y si sirve.** Son dos preguntas distintas y la segunda no se contesta viendo que
  el archivo está.
- **Cuánto cuesta rehacer cada parte**, con el número de lo que ya se gastó al lado.
- **Cómo se puede partir.** Casi nunca es todo o nada: si un pedazo cuesta la mitad del total, va
  separado para que se pueda correr uno y decidir el otro después, con el primero a la vista.

**Lo hecho no es lo aprovechable, y la diferencia sólo se ve mirando.** Un trabajo interrumpido deja
artefactos que parecen completos: la etapa que escribió su análisis y murió antes de devolverlo se ve
igual que la que cerró, y los archivos de dos corridas distintas conviven en el mismo directorio sin
que nada los distinga salvo la fecha. Comprobar cuál es cuál cuesta minutos; suponerlo cuesta la
corrida entera y encima produce una medición contaminada — un resultado calculado sobre insumos que ya
fueron sobrescritos, que es peor que no tenerlo porque se lee igual que uno bueno.

Por eso el veredicto puede terminar en «desde cero», y eso no lo invalida. Establecer que no había nada
rescatable **es** el trabajo de la regla: lo que R21 impide no es relanzar, es relanzar sin saber.

Un elemento que ya tiene veredicto no se vuelve a medir por venir en la misma tanda: cuesta lo mismo que
la primera vez y su resultado no puede cambiar, que es lo que R20 nombra. Si existe un filtro para correr
sólo lo que falta, usarlo no es una optimización: es la forma correcta de la corrida.

Un mecanismo de reanudación se comprueba, nunca se supone —R14 no hace excepción con las herramientas
propias—. Después de reanudar se mira si efectivamente reutilizó: cuántas unidades de trabajo nuevas
aparecieron, cuánto se gastó. La sesión que originó esta regla creyó estar reanudando desde caché y
volvió a correr entero dos veces: siete millones de tokens para un solo veredicto, con los archivos de
las etapas ya cumplidas a la vista en el directorio de trabajo, y con el filtro que lo evitaba escrito
por quien reanudaba tres horas antes.

## R22 — Lo que se mide no se toca mientras se mide

Mientras una medición corre, el sujeto y todo aquello contra lo que resuelve se quedan quietos. No se
edita el contrato que se está midiendo, ni el motor que la corrida usa, ni el entorno del que lee.

Lo que lo vuelve difícil de ver es que no avisa. La corrida termina, entrega su resultado y **ese
resultado se lee exactamente igual que uno limpio**: no hay señal que diga «esto midió dos versiones».
Quien lo reciba va a decidir sobre él sin saber que se movió el piso.

Y el camino por el que entra casi nunca es el archivo obvio. Un banco desechable puede resolver la
herramienta por un enlace al repositorio vivo, así que editar ahí cambia lo que la corrida lee sin que
nada del banco se haya tocado. La pregunta no es «¿toqué el sujeto?» sino «¿toqué algo que el sujeto
alcanza?».

Si hace falta trabajar igual, se trabaja donde la medición no mira: otra copia, otra rama sin
materializar, o se espera. Esperar es más barato que descubrir que la tanda no vale.

Y si ya pasó, se dice: qué medición, qué cambió y cuándo. Un resultado cuyo entorno se movió es una
hipótesis, no un veredicto —lo mismo que R21 nombra para lo que quedó a medias—, y guardarlo sin esa
marca es la forma cara del error, porque el número sobrevive a la sesión que sabía.
