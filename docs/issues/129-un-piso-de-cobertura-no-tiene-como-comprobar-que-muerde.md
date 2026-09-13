---
caso: 129
titulo: Un piso de cobertura se registra sin comprobar que muerda, y la distancia contra lo real lo vuelve decorativo sin que nada avise
estado: abierto
prioridad: media
version-detectada: 0.86.0
---

# 129 — Nada comprueba que un piso de cobertura sirva para algo

**🔴 abierto**

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
un piso de 505; `repo.test.js` recorre lo trackeado y muere con `EISDIR`. O sea que el método de mutación
en copia —el que R23 pide para apagar una defensa— **sirve para una suite concreta y no para estas dos
puertas**. Comprobar un piso hoy exige medir el lcov a mano, quitando la prueba en el árbol y
restituyéndola.

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
