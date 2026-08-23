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

## R17 — La aceptación que acumula condiciones se parte

Cinco condiciones es el borde. Pasado eso la tarea se parte antes de volver a planificarla: no se refina
ni se reordena, se parte.

Cada condición por separado puede ser correcta y estar verificada contra el código; el problema es el
conjunto. Un plan tiene que satisfacerlas todas a la vez y basta fallar una para tirar la vuelta entera,
así que la probabilidad de salir limpio se desploma con la cantidad aunque cada punto sea fácil. Y una
aceptación crece sin que nadie lo decida: se le suman condiciones de a tandas en cada rechazo de plan,
y cada tanda parece razonable.

El tope de horas no lo detecta. Una tarea de tres horas con quince condiciones entra en el tope y no se
construye nunca.


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
