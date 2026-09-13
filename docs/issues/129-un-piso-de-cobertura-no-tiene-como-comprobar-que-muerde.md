---
caso: 129
titulo: Un piso de cobertura se registra sin comprobar que muerda, y la distancia contra lo real lo vuelve decorativo sin que nada avise
estado: resuelto
resuelto-en: 0.86.0
prioridad: media
version-detectada: 0.86.0
---

# 129 — Nada comprueba que un piso de cobertura sirva para algo

**🟢 resuelto en 0.86.0**

## Resumen

`test/tools/coverage-baseline.json` registra un piso por archivo y `coverage-files.js` falla si la
medición baja. Lo que **no** existe es una comprobación de que ese piso **muerda**: un piso lo bastante
por debajo de lo real deja pasar la pérdida de pruebas enteras y la puerta sigue en verde, que es
exactamente lo que la puerta existía para evitar.

No es hipotético y no es de un solo archivo. Medido el 2026-09-13 comparando cada piso contra lo que la
corrida completa mide:

| archivo | piso | mide | distancia |
|---|---|---|---|
| `automatization/runners/antigravity/hook.js` | 33 | 78,3 | **45** |
| `engine/cli/catalog.js` | 38 | 48,6 | 11 |
| `engine/automation/index.js` | 54 | 60,2 | 6 |
| `engine/agents/learning-seal.js` | 68 | 68,6 | 1 |

La primera fila cita el piso del puente **como estaba al destapar esto**; el registro ya dice 75, corregido
en el mismo trabajo. Las otras tres coinciden con lo que el registro tiene hoy.

La última está a propósito: **no todos los pisos están flojos**. `learning-seal.js` tiene el suyo pegado a
lo real, que es lo que se le pide a un piso, y muestra que el problema no es el mecanismo sino que nada
obliga a mirar la distancia ni avisa cuando crece.

El del puente se corrigió a 75 en 0.86.0 **comprobando dónde cae**: quitando la prueba que traduce
decisiones al protocolo nativo, el archivo baja a 69 %; con el piso en 70 eso pasa —`SLACK` se come el
punto— y con 75 cae. Los demás quedaron como estaban, y ninguno tiene esa comprobación.

## Reproducción

```bash
# 1. El piso del puente antes de 0.86.0 era 33 y lo real 78,3.
# 2. Se quita una prueba central —la que traduce decisiones al protocolo nativo—:
#    el archivo cae a 69 % y la puerta de cobertura sigue saliendo 0.
npm run coverage   # exit 0, "cobertura por archivo: N archivo(s) en su piso o por encima"
```

La pérdida no aparece por ninguna vía: no la ve `coverage`, no la ve `dead-code` —la prueba borrada no
deja imports huérfanos— y `suite.test.js` sólo la cuenta si el total baja del piso de la suite entera.

## Causa raíz

Registrar un piso y comprobar que sirve son dos actos distintos, y sólo el primero tiene mecanismo.
`coverage-files.js` sabe subir un piso a mano y sabe negarse a subirlo solo —«nadie sube un piso por
suerte»— pero nada responde la pregunta siguiente: **con este número, ¿qué pérdida concreta haría fallar
la puerta?** Sin esa respuesta, un piso es una afirmación sin contraste, y la distancia contra lo real
crece sola: lo real sube cuando alguien agrega pruebas, y el piso se queda donde estaba.

## Fix propuesto

No está decidido. Tres formas, de menos a más ambiciosa:

1. **Avisar la distancia.** `coverage:update` ya imprime `= archivo: métrica llegó a X (piso sigue en Y)`.
   Hacer que `coverage` lo diga también, o que marque los que están a más de N puntos, convierte un dato
   que hoy sólo se ve al actualizar en algo que se ve en cada corrida.
2. **Comprobar el corte al registrar.** Al subir un piso a mano, medir además con qué pérdida cae. Es lo
   que se hizo para el puente y lo que dio el 75 en vez del 70; automatizarlo pide poder quitar una
   prueba y volver a medir, que es caro.
3. **Fijar la distancia máxima.** Que la puerta falle si un piso queda a más de N puntos de lo medido, con
   el mismo trato que hoy tiene bajar uno: se acepta a mano y con razón escrita.

## Tradeoffs

- La opción 1 no cierra nada, lo hace visible — y es la más barata con diferencia.
- La opción 3 obliga a tocar pisos que hoy nadie mira, y puede volverse ruidosa: **no está medido** a
  cuántos archivos alcanzaría con cada N.
- Comprobar el corte (2) es lo único que responde la pregunta de verdad, y hoy no se puede hacer en copia
  desechable: ver abajo.

## Lo que además hay que saber

**Una copia hecha con `git ls-files` no puede correr `npm run coverage` ni la puerta del repositorio.**
Las dos interrogan a git: `suite.test.js` cuenta pruebas con `git ls-files` y en la copia declara 0 contra
un piso de 505; `repo.test.js` recorre lo trackeado y muere con `EISDIR`.

**Lo que este caso escribió a continuación era falso, y conviene dejarlo dicho**: de ahí se concluyó que
el método de mutación en copia «sirve para una suite concreta y no para estas dos puertas», y que
comprobar un piso exigía medir el lcov a mano en el árbol de trabajo. La limitación es **del método, no de
las copias**. Una copia hecha con `tar` se lleva el `.git` y lo que no está trackeado, así que git
responde ahí igual que en el original: medido el 2026-09-13, `npm run coverage` y `npm run ci` salen las
dos en 0 sobre una copia de 76 MB —excluyendo `.claude/worktrees`—, con 1698 archivos trackeados. Las seis
mutaciones de este cierre se corrieron ahí, que es lo que R23 pide y lo que el caso creía imposible.

## Prioridad

**Media.** No pierde trabajo ni rompe nada: lo que hace es que una puerta prometa más de lo que cumple, y
eso enseña a no creerle al resto —que es el mismo argumento que R10 usa para decir cuál de sus seis actos
comprueba el motor—. Sube a alta si alguna vez se pierde una prueba y el piso no lo dice.

## Contexto de descubrimiento

Salió subiendo el piso del puente de Antigravity en 0.86.0. La primera corrección lo puso en 70 «con
holgura», y al comprobar dónde caía resultó que 70 no distinguía la pérdida de la prueba central: pasaba
igual. El piso quedó en 75 por medición y no por criterio, y la pregunta que lo destapó —«¿con este
número, qué pérdida haría fallar la puerta?»— no la responde nada en el repositorio.

La tabla de arriba también se escribió mal la primera vez, y conviene decirlo porque es el mismo error
que el caso denuncia: sus números salieron de filtrar la salida de `ci` con un grep, que leyó la columna
de líneas en vez de la de ramas. Así `catalog.js` figuraba midiendo 86,8 cuando mide 48,6, y
`learning-seal.js` aparecía sin piso cuando tiene 68. Los números de esta versión salen de medir los
cuatro archivos dirigidamente, uno por uno.

## Relacionados

- **106** — por qué la cobertura empezó a contar dos ramas tampoco se estableció; misma familia de
  preguntas sobre el instrumento.
- **082** — la cobertura de trabajo registrado, el otro número que se mira y que nadie contrasta.

## Cierre

**🟢 resuelto en 0.86.0** · `test/tools/coverage-files.js`, `test/tools/coverage-baseline.json`,
`test/repo/coverage-floors.test.js`, `test/README.md`

Se tomaron las opciones 1 y 3 **juntas**: la distancia se ve en cada corrida por encima de quince puntos y
falla por encima de veinticinco, con el mismo trato que ya tiene bajar un piso —se acepta a mano y con la
razón escrita, en `far` al lado del piso que excusa, y esa razón falla cuando deja de hacer falta—. La
opción 2 no se automatizó y se aplicó a mano a los tres pisos que estaban lejos: de ahí salen sus números.

### Contra lo que el caso enumeró

- **«Nada comprueba que un piso muerda»** — lo comprueba la puerta, y lo comprueban seis casos en
  `test/repo/coverage-floors.test.js`. Hasta hoy `coverage-files.js` **no tenía ninguna prueba**: la
  herramienta que juzga la cobertura de los 67 archivos del motor no la miraba nadie, y eso es lo que hacía
  posible este caso entero. El enunciado no lo preveía y es su hallazgo más grande.
- **La tabla de cuatro filas** — contrastada contra el registro antes de tocar nada: 75, 38, 54 y 68, las
  cuatro ciertas. `learning-seal.js` sigue siendo el contraejemplo sano que la tabla prometía.
- **La reproducción** — se rehízo entera y dio más de lo que decía. Los tres pisos lejanos dejaban pasar la
  pérdida de una suite completa: quitando `learning.test.js` (22 pruebas) `learning.js` cae a 68 contra un
  piso de 59; quitando `core.test.js`, `validate.js` cae a 34 contra 52; quitando `integrations.test.js`,
  `registry.js` cae a 38 contra 47. Los tres con la puerta en verde.
- **Opción 1, avisar la distancia** — hecha, y en `coverage` y no sólo en `coverage:update`, que es donde
  el dato ya existía y donde sólo lo ve quien se acuerda de correrlo.
- **Opción 2, comprobar el corte al registrar** — no se automatizó, y no por lo que el caso suponía: se
  aplicó a mano a los tres pisos, y el procedimiento quedó escrito acá. Automatizarlo sigue costando una
  corrida de la suite por piso, que es lo caro.
- **Opción 3, fijar la distancia máxima** — hecha, con el umbral medido y no elegido.
- **Tradeoff «la 3 puede volverse ruidosa: no está medido a cuántos archivos alcanzaría con cada N»** —
  medido, y era la pregunta que decidía. Sobre 201 pares archivo-métrica: con N=25 quedan 3 pares, con 20
  quedan 5, con 15 nueve y con 30 ninguno. Ya con los tres pisos subidos, N=25 deja **cero**.
- **Tradeoff «la 1 no cierra nada»** — cierto, y por eso no se eligió sola.
- **Tradeoff «comprobar el corte no se puede hacer en copia desechable»** — falso; arriba queda corregido.
- **Prioridad: «sube a alta si alguna vez se pierde una prueba y el piso no lo dice»** — esa condición ya no
  se puede cumplir en silencio para los tres archivos medidos: perder cualquiera de esas tres suites ahora
  falla nombrando el archivo. Para el resto la condición sigue viva y por eso el umbral avisa antes de
  frenar.
- **Relacionados** — el **106** sigue abierto como pregunta declarada sobre el instrumento y este caso no lo
  contesta; el **082** no se tocó.

### Lo que el caso no preveía

- **`coverage-files.js` leía su registro desde una ruta fija**, así que no había forma de ejercitarlo sin
  editar el registro del propio repositorio —romper la puerta para mirarla—. Se le abrió una sola costura,
  `--baseline=`, y con eso las pruebas arman sus propios números.
- **`--update` reconstruye cada entrada desde cero**, así que la primera actualización habría borrado en
  silencio una razón escrita a mano. Nadie la habría extrañado: el diff es de un archivo generado. Se
  preserva, y tiene su caso y su mutación.
- **`engine/hooks/push.js` mide 96 contra un piso de 97** y pasa sólo porque `SLACK` se come el punto. Es
  exactamente el borde para el que `SLACK` existe, no un defecto, pero conviene que quede escrito.
- **`registry.js` no es estable**: 59, 73, 59, 75 y 59 en cinco corridas limpias. Su piso quedó en 58, por
  debajo del mínimo observado y no cerca de lo real, porque un piso en 66 —el número «razonable»— habría
  fallado al azar en tres de cada cinco corridas. Es la misma razón por la que existe `SLACK`.
- **La puerta del repositorio atrapó dos defectos míos en la prueba nueva**: un `rmSync` recursivo escrito a
  mano teniendo `discard` al lado —que es R23 hecho mecanismo: `discard` se niega si el destino no cuelga de
  algo desechable— y una razón repetida de `repo.test.js`, que ahora se cita en vez de reescribirse.

### Qué se corrió

- **Rojo previo**, con la regla ausente: 2 de 5 casos en rojo —la distancia grande y la razón vieja— y 3 en
  verde. Dos de esos verdes son legítimos (no dependen de la regla) y el tercero, «una razón escrita acepta
  la distancia», pasaba **vacíamente**: sin regla no falla nada. Quedó probado por mutación, no por el rojo.
- **Verde**: 6 de 6 casos, y `npm run ci` en 0 con las seis líneas de distancia impresas —`archive.js` a 24
  y `ops.js` a 23 son las más cercanas al umbral, y no varían ni un punto en cinco corridas—.
- **Seis mutaciones, en copia por `tar`, con verde de control antes y después de cada una.** Umbral
  inoperante (`> 999`) mata a la distancia grande; umbral estricto (`>=`) mata al borde; `false` en la rama
  de la razón vieja mata a su caso; quitar la preservación de `far` mata al de `--update`; quitar
  `&& !excused` mata a «una razón escrita acepta la distancia»; y `distance > -1` mata a tres, entre ellos
  el control. **Ninguna sobrevivió y ningún caso quedó sin verse en rojo.**
- **Los tres pisos nuevos, comprobados uno por uno**: con `learning.js` en 80, quitar su suite lo pone en
  rojo `bajó de 80% a 68%`; con `validate.js` en 72, `bajó de 72% a 34%`; con `registry.js` en 58, `bajó de
  58% a 38%`. Los tres con lcov limpio en verde.

### Por qué no lleva entrada en el CHANGELOG

`files` de `package.json` no incluye `test/`, así que nada de esto viaja a una instancia, y el encabezado
del CHANGELOG dice que lo que sólo se observa desde este repositorio no va porque quien lee no puede actuar
sobre eso. El precedente es de esta misma versión: meter el barrido de imports muertos en `ci` —`f6ac1896`,
0.86.0— tampoco dejó entrada, y se documentó en `test/README.md`. Ahí va la regla de distancia.
