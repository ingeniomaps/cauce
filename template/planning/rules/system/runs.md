# Cómo se gasta una corrida

Lo que cuesta una vuelta de trabajo y qué la vuelve aprovechable: dónde se va el contexto, cuándo una
medición vale, cómo se retoma lo que se cortó y qué no se toca mientras se mide.

Viven acá y no en `process.md` por una razón medida. El override de una regla es por nombre de archivo,
así que una empresa que escribe su propio `process.md` —reemplazar «pensar antes de editar» por su
versión es lo primero que hace cualquiera— se llevaba puestas también éstas, que nadie reemplaza y que
`effectiveRules` dejaba de entregarle a todo agente. Una instancia real lo vivió: las declaró «adoptadas
por referencia» en una tabla de prosa que el motor no lee, y aun así dos de ellas no estaban rigiendo el
día que le costaron una sesión entera (caso 160).

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

## R26 — Una puerta acota su propio costo y no escribe en el árbol que juzga

Una puerta existe para medir, y una que se lleva la máquina no mide nada: se apaga. Tres límites, y los
tres se ganaron con una corrida perdida.

**Acota su alcance.** Una puerta opina sobre el repositorio que la declara y no sobre sus vecinos. La
que juzga a otro frena trabajo que no pidió juzgar y lo hace con reglas que ese equipo no escribió.

**Acota su costo, con un tope y con un candado.** Dos revisores lanzando la misma suite son dos corridas
simultáneas, y ninguna de las dos lo sabe. En la instancia que originó esta regla fueron cuatro en cuatro
minutos: el sistema operativo mató la sesión entera con un pico de 24,2 GB y se llevó puesta la corrida
que estaba a punto de terminar. Y lo que ya se midió no se vuelve a medir: si el build dejó su
resultado, la puerta lo lee en vez de rehacerlo.

**No escribe en el árbol que juzga.** Un formateador con `--fix`, un build que limpia su salida, un
gestor que sincroniza antes de arrancar: los tres parecen inocuos y los tres editan el trabajo de quien
está commiteando, a veces a mitad de camino. La puerta corre sobre una copia, o corre sin la bandera que
escribe. Este toolkit lo aprendió así —`verify` materializa el índice en un temporal justamente por
esto— y la regla existe para que la puerta que escribe **la empresa** no lo vuelva a aprender sola.

El remate es la razón de las tres: una puerta que estorba se saltea con la variable de escape, y desde
ahí no protege de nada. Lo que se negocia es el costo, nunca la exigencia.
