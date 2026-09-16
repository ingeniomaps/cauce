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

## R17 — Una unidad de trabajo se parte por lo que acumula, y hay dos formas de acumular

Dos barras, y cada una encuentra lo que la otra deja pasar: **cinco condiciones de aceptación** en una
tarea, y **cuatro horas de esfuerzo humano**. Arriba de la tarea el conteo sigue: siete criterios en una
épica, nueve tareas en un hito.

Y hay una tercera que no se mide antes sino después: **un plan que ninguna crítica aprueba**. Las dos
primeras miran la unidad escrita; ésta mira lo que pasó al intentarla, y por eso es la evidencia más
directa de las tres — y la única que no se puede tener de antemano. Cuando nadie pudo escribir un plan
que sobreviva, lo que sigue no es escribir un tercero: es mirar la unidad.

Dos rechazos sobre lo mismo dicen más que dos rechazos sobre cosas distintas. Si los dos señalan la misma
dimensión de la aceptación, ahí está la costura por donde parte. En el caso que originó esto, una crítica
objetó cómo se probaba un número con unidades y la otra un estado que ya se cumplía: dos formas de
comprobar dentro de una sola aceptación, que es la definición de dos resultados con vidas distintas.

Lo que la hace fácil de perder es que llega **después** de que las otras dos dieron el visto bueno, y las
dos acertaron: la aceptación era concreta y las condiciones no cruzaban el umbral. Una unidad puede estar
bien escrita y no ser planificable, y eso sólo se sabe habiéndolo intentado.

Ninguna de las tres decide la división: la dispara. Al cruzarla se revisa si la unidad mezcla dos
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


## R25 — El identificador de una unidad de trabajo no cambia mientras está viva

El slug con el que una tarea se escribe es el mismo con el que se cierra. Renombrarlo a mitad de camino
—porque se entendió mejor el alcance, porque se partió en dos, porque el nombre viejo quedó feo— rompe
lo único que ata la cola con lo entregado.

Y rompe **sin que nada falle**, que es lo que lo vuelve caro. El estado de una unidad no está escrito en
ningún lado: se deriva cruzando el identificador entre la cola, lo reclamado y lo hecho. Con el nombre
cambiado, las dos mitades dejan de cruzarse y cada lado se lee coherente por separado: la cola muestra
una tarea pendiente que ya está construida, y lo hecho muestra una entrega que nadie pidió. La puerta
pasa en verde. En la instancia que originó esta regla, una tarea partida en cuatro se cerró con dos
nombres nuevos y la corrida siguiente gastó 594k tokens para descubrir que tres de ellas ya estaban
hechas.

Cuando el nombre de verdad tiene que cambiar, la salida es barata y hay que escribirla: el nuevo lleva
el viejo al lado —`slug-nuevo (antes: slug-viejo)`— hasta que la unidad se cierra. Ahí el cruce vuelve a
existir y lo puede hacer una persona leyendo.

Partir una unidad es otra cosa y no la toca: las partes son unidades nuevas, con identificadores nuevos,
y la original se cierra diciendo en qué se partió. Lo que R25 prohíbe es que la misma unidad viva con
dos nombres.

## R28 — Un estado lo dice el contenido de un archivo, nunca su presencia

Un bloqueo, una pausa o un trabajo en curso que se representan con «el archivo está» tienen un modo de
fallo que no se ve: resolverlos exige acordarse de borrar, y el que revisa lee lo que el archivo dice
—que ya está resuelto— mientras el mecanismo sigue leyendo que existe.

Se paga entero y en la puerta de entrada: la corrida arranca, lee el estado completo, y recién ahí
descubre que lo que la frena es un archivo que alguien dejó puesto. En la instancia que originó esta
regla pasó dos veces el mismo día —la segunda después de haber dicho que no se repetiría— a 42k tokens
por vez.

El archivo se queda y su contenido dice en qué estado está. Es lo que ya hace el WIP de este toolkit:
`status: IDLE` es un estado escrito, no un archivo ausente, así que quien lo lee y quien lo comprueba
leen lo mismo. Un centinela cuya única información es existir obliga a que el borrado sea parte de la
resolución, y eso es una convención que alguien va a olvidar.
