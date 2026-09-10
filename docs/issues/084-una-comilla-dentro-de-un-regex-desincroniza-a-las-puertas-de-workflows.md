---
caso: 084
titulo: Las dos puertas que analizan un workflow sin parsearlo se desincronizan con una comilla dentro de un literal de regex
estado: abierto
prioridad: media
version-detectada: 0.77.0
---

# 084 — Una comilla dentro de un regex desincroniza a las dos puertas que leen un workflow sin parsearlo

**🔴 abierto** · detectado en 0.77.0 · prioridad **media** — falla ruidosa, no silenciosa, y hoy no hay
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
