---
caso: 084
titulo: Las dos puertas que analizan un workflow sin parsearlo se desincronizan con una comilla dentro de un literal de regex
estado: resuelto
prioridad: media
version-detectada: 0.77.0
---

# 084 — Una comilla dentro de un regex desincroniza a las dos puertas que leen un workflow sin parsearlo

**🟢 resuelto en 0.78.0** · detectado en 0.77.0 · prioridad **media** — falla ruidosa, no silenciosa, y hoy no hay
ningún workflow que la dispare: lo que cuesta es la próxima media hora de quien escriba el primero

## Resumen

`test/workflows/workflows.test.js` valida dos cosas sobre cada workflow leyéndolo como texto: que no use
un nombre que no declaró, y que no llame a nada que no exista. Ninguna de las dos parsea; las dos
recorren el fuente con un lexer propio —`codeOnly()` para la primera, una cadena de `.replace()` para la
segunda— y **ninguna conoce los literales de regex**.

Una comilla adentro de un regex le abre una cadena al lexer, y a partir de ahí lee al revés: la prosa en
castellano de los mensajes pasa a ser código y las cadenas pasan a ser prosa. El resto del archivo queda
analizado sobre esa premisa invertida.

## Reproducción

Determinista, con el propio `codeOnly` del archivo:

```js
codeOnly("const x = texto.replace(/^[\"']+/g, '')\nconst z = 'prosa que no debería verse.'\n")
// → "const x = texto.replace(/^[ "        ← se comió todo lo que seguía
codeOnly("const x = texto.slice(1)\nconst z = 'prosa que no debería verse.'\n")
// → "const x = texto.slice(1)\nconst z =  \n"   ← correcto
```

La segunda puerta tiene la misma clase de agujero por otra vía: sus `.replace()` corren en orden
—backticks, comillas simples, comillas dobles—, así que un arreglo que **mezcla los dos estilos**
—`['"', "'"]`— hace que el regex de comilla simple case desde la primera hasta la tercera, cruzando por
encima de la doble. Verificado en esta corrida: con esa forma, `autobuild.js` reportó `→ finish`, un
nombre que sí está declarado (llega por `{{INCLUDE:shared/workflow-finish.js}}`).

## Síntoma

Un falso positivo con un mensaje que no se parece a su causa. Escribir `.replace(/^["']+/, '')` en un
workflow devuelve:

```
autobuild.js: usa un nombre que no declaró
  actual: [ 'vocabulario', 'hubiera', 'runner' ]
```

Tres palabras: dos son prosa castellana de un mensaje de error y la tercera es una propiedad legítima de
otra parte del archivo. Ninguna nombra el regex, que está cien líneas más arriba.

## Causa raíz

`codeOnly()` (`test/workflows/workflows.test.js:25`) maneja comentarios, cadenas con escape y templates
anidados —tiene una pila explícita para eso— y no maneja el cuarto literal del lenguaje. La otra puerta
(`:167`) hace lo mismo con `.replace()` encadenados.

Distinguir un regex de una división es lo que vuelve caro este lexer: `/` es ambiguo y se resuelve por
el token anterior. Por eso el agujero no es un descuido sino el pedazo que faltaba, y por eso arreglarlo
es una unidad propia y no una línea.

## Fix propuesto

Tres salidas, de menos a más:

1. **Reconocer el literal de regex** en los dos lexers, decidiendo por el token anterior —tras un
   identificador, `)`, `]` o un literal, `/` es división; en cualquier otro lado abre un regex—. Es lo
   correcto y es donde vive la dificultad.
2. **Fallar a propósito ante un regex**, con el mensaje que hoy falta: «este archivo usa un literal de
   regex y esta puerta no sabe leerlos». Convierte un falso positivo confuso en un límite declarado.
3. **Prohibir la comilla dentro de un regex en un workflow**, con su prueba y su razón. Es la más barata
   y la que menos enseña.

Vale la pena decidir entre 1 y 2 midiendo qué tan seguido un workflow necesita un regex: hoy, ninguno.

## Tradeoffs

- La opción 1 agrega un lexer de verdad a una prueba, y un lexer con un bug propio miente en la
  dirección contraria —deja pasar lo que tenía que atrapar—, que es peor que el falso positivo de hoy.
- La 2 y la 3 dejan a los workflows sin regex. No es una pérdida grande hoy y sí una restricción que
  nadie escribió como tal.

## Contexto de descubrimiento

Al arreglar el caso 083, el arreglo natural era
`String(planning.blocked || '').trim().replace(/^["']+|["']+$/g, '')`. La puerta lo rechazó nombrando
tres palabras que no tenían nada que ver, y hubo que instrumentar `codeOnly` para ver qué había pasado.

El 083 se cerró desenvolviendo las comillas de a pares y sin regex —que además es más correcto, porque
una comilla suelta no es un envoltorio—, así que **no depende de este caso**. Lo que queda es el agujero.

## Relacionados

- **083** — el caso que lo encontró; su arreglo esquiva el agujero en vez de taparlo.
- **R14** — que estas dos puertas comprueban lo que dicen comprobar es, ella misma, una afirmación de
  mecanismo: hoy es cierta salvo para un archivo con un regex, y eso no estaba escrito en ningún lado.

## Cierre

**🟢 resuelto en 0.78.0** · `test/support/lexer.js` (nuevo), `test/workflows/workflows.test.js`,
`test/workflows/lexer.test.js` (nuevo)

### El caso se equivocaba en tres cosas, y medirlo es lo que las encontró

Está escrito arriba y no se borra, porque lo que el caso afirmó es parte de lo que pasó.

**«Las dos puertas»: son tres.** Además de las dos que analizan el archivo entero —la de los nombres y
la de las llamadas—, la del `meta` desnuda su bloque con una cadena de `.replace()` propia. Tres
recortes distintos del mismo problema, cada uno equivocándose a su manera.

**«Hoy no hay ningún workflow que la dispare»: hay cuarenta literales de regex en los nueve
recorridos**, y `agent-eval.js:179`, `agent-eval.js:182`, `flow-eval.js:169` y `flow-eval.js:172` ya se
leían mal. El regex es `/[A-Za-z0-9_./~-]*\/\.cauce-eval\//g`: la barra escapada del final deja un `//`
literal, que el lexer tomaba por el arranque de un comentario.

**«Falla ruidosa, no silenciosa»: la forma que ya pasaba es silenciosa y hacia abajo.** Comerse el resto
de la línea no reporta nada — deja de ver. Medido con el lexer viejo:

```
codeOnly("const p = u.replace(/x\//g, '') + noExiste(1)\n")
→ "const p = u.replace(/x\\\n"
```

`noExiste(1)` es exactamente lo que la puerta de llamadas existe para atrapar, y era invisible. La
cadena de `.replace()` de esa puerta devuelve lo mismo. La forma ruidosa —la comilla adentro del
regex— es la que encontré primero porque me tocó escribirla; la que estaba viva era la otra.

### Las tres salidas que el caso proponía

**1. Reconocer el literal de regex en los lexers** — hecha, y es la que va en las dos puertas que leen
el archivo entero. La decisión de si un `/` abre un regex o divide se toma por el carácter anterior, con
las palabras clave que terminan en letra y aun así abren uno (`return`, `typeof`, `case`…) en una lista.
Los dos bordes conocidos quedan escritos en el módulo, y los dos van hacia el falso positivo.

**2. Fallar a propósito ante un regex** — hecha, y en el único lugar donde corresponde: el `meta`. Ahí
un regex nunca es legítimo, y el lexer compartido tampoco sirve, porque se come el `${` que esa puerta
busca. La barra entra a su lista de patrones prohibidos.

**3. Prohibir la comilla dentro de un regex** — se decidió que no. No arregla nada de lo que está vivo
—las cuatro líneas de hoy no tienen comillas, tienen `//`— y prohíbe algo legítimo.

El caso decía «vale la pena decidir entre 1 y 2 midiendo qué tan seguido un workflow necesita un
regex». Se midió: **40 en 9 recorridos**, con 0 comillas, 0 backticks y 2 con `//` adentro. Con ese
número la 3 se cae sola y la 1 deja de ser opcional.

### El tradeoff que el caso anticipaba

**«Un lexer con un bug propio miente en la dirección contraria»** — es cierto y por eso el lexer salió
de la prueba a `test/support/lexer.js`: a través de una puerta que corre sobre los nueve recorridos que
hoy existen no se puede ejercitar la regla que decide entre regex y división. Ahora se mide sola, con
ocho formas —incluidas las tres divisiones que un lexer demasiado ansioso se comería—.

### Lo que apareció y el caso no preveía

**La regla de interpolación del `meta` nunca pudo dispararse.** El desnudado recorta los templates antes
de buscar `${`, y `${` sólo existe adentro de un template: la condición era inalcanzable desde que se
escribió. No lo encontró leerla — la encontró la prueba de detectores, al pasarle el bloque que tenía
que atrapar y ver que no lo atrapaba. Es lo que R9 dice de una aserción que nadie vio en rojo. Ahora el
`${` sobrevive al recorte y la regla funciona.

### Qué se corrió

`node --test test/workflows/lexer.test.js test/workflows/workflows.test.js` — 15 en verde, con tres
pruebas nuevas: las ocho formas del lexer, los cinco detectores del `meta` y las cuatro de la puerta de
llamadas.

Las dos pruebas de detectores existen porque **sobre los nueve recorridos de hoy las tres puertas dan
verde con cualquier lexer**: ese verde no dice que lean bien. Hay que pasarles lo que tienen que
atrapar, y es ahí donde apareció lo de la interpolación.

Y la comprobación sobre los recorridos reales no cuenta líneas —un template multilínea se va entero y
con razón— sino que mide el **balance de paréntesis y corchetes**, que es lo que el modo de fallo rompe:
comerse el resto de una línea deja abierto lo que esa línea cerraba. Los nueve dan `{"(":0,"[":0}`.

**Ocho mutaciones, en un clon desechable bajo `/tmp` (R23), todas en rojo:**

```
M1 el lexer vuelve a no conocer literales de regex:  fail 3 → ROJA
M2 toda barra abre un regex:                         fail 1 → ROJA
M3 ninguna palabra clave abre un regex:              fail 1 → ROJA
M4 una barra dentro de una clase cierra el regex:    fail 1 → ROJA
M5 el regex puede cruzar líneas:                     fail 1 → ROJA
M6 la barra vuelve a ser legal en un meta:           fail 1 → ROJA
M7 la puerta de llamadas vuelve a su cadena:         fail 1 → ROJA
M8 el ${ vuelve a irse con el template:              fail 1 → ROJA
```

Las ocho se comprobaron aplicadas antes de contar. Cuatro de ellas sobrevivieron en la primera vuelta
—M2, M5, M6 y M7— y las cuatro decían lo mismo: faltaba el caso. Los cuatro que faltaban son los que
hoy son las dos pruebas de detectores y las dos divisiones del lexer.

`npm run ci`: 668 pruebas, 668 en verde.
