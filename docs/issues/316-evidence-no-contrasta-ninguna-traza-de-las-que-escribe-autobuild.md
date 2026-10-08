---
caso: 316
titulo: evidence no contrasta ninguna traza de las que escribe autobuild
estado: resuelto
resuelto-en: 0.103.6
prioridad: media
version-detectada: 0.103.5
---

# 316 — `ops evidence` marca «inbuscable» toda traza de `tests`, también la que nombra el archivo

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: la herramienta que existe para contrastar la evidencia no contrasta nada de lo que el recorrido escribe.

## Resumen

`ops evidence` busca en el código lo que cada traza de `tests` nombra. Sólo busca si la traza es una palabra
sin espacios. Las que escribe `autobuild` traen el archivo y el nombre del caso, así que ninguna se busca.

## Reproducción

En un banco, la misma entrada con cinco formas de escribir la traza:

```
A → app/test/suma.test.js                                [encontrado]
A → test/suma.test.js                                    [encontrado]
A → app/test/suma.test.js — 'la suma de dos numeros'     [inbuscable] — describe la prueba en vez de nombrarla
A → la suma de dos numeros (app/test/suma.test.js)       [inbuscable]
A → app/test/suma.test.js › la suma de dos numeros       [inbuscable]
```

Las tres últimas son las formas que salen de las corridas reales. Lo reportaron dos sesiones distintas.

## Causa raíz

`engine/core/evidence.js`, `searchable`: `/^[^\s]{4,}$/`. El comentario lo explica —buscar una frase en el
código devuelve siempre que no— y es cierto para una frase. Una traza con archivo y nombre de caso no es una
frase: tiene dos cosas buscables adentro.

## Fix propuesto

- Sacar de la traza lo que se puede buscar: la primera palabra con forma de ruta, y lo que venga entre
  comillas. Buscar cada una.
- `encontrado` si aparece el archivo; decir además si el nombre del caso aparece dentro de él.
- Lo que no tenga ni ruta ni comillas sigue `inbuscable`.

## Por qué hacerlo

R9 y R14 piden poder contrastar lo afirmado sin rehacer el trabajo. Esta es la herramienta que lo hace para
las pruebas, y hoy devuelve «no pude mirar» para toda entrada de `autobuild`.

## Riesgos y regresiones

- **Un `encontrado` falso** enseña a confiar de más: el archivo existe y el caso no. Por eso el nombre del
  caso se informa aparte y no se da por bueno.
- **Un `ausente` falso** por una ruta escrita relativa a otra carpeta. Hay que probar con rutas relativas al
  servicio y a la raíz.
- **Regresión**: es un informe y no una puerta: `check` no depende de él. Lo que hoy da `encontrado` tiene que
  seguir dándolo.

## Qué habría que probar

- Las cinco formas de arriba, más las de las entradas reales de una instancia.
- Un archivo que existe con un caso que no: no puede salir como `encontrado` a secas.

## Recomendación

**Hacerlo.** Riesgo bajo, y recupera una comprobación que hoy no existe en la práctica.

## Relacionados

- 072 — el punto y coma que partía la traza.

## Cierre

**Resuelto en 0.103.6**, distinto de lo propuesto en dos puntos.

### El recorrido de lo que este caso enumeró

- **Sacar de la traza la ruta y lo entrecomillado, y buscar cada una — se hizo.** El archivo se busca por
  dónde termina su ruta; el caso, sólo dentro de los archivos que la traza nombra. Valen varios archivos, la
  ruta con línea (`:12:3`, `#L12`), con `./`, con barras de Windows o entre backticks, y los nombres
  anidados con `›` o con ` > `.
- **«`encontrado` si aparece el archivo; decir además si el nombre del caso aparece» — se hizo distinto.** El
  archivo que existe sin el caso nombrado sale con un veredicto propio, `parcial`, y la nota dice qué nombre
  faltó. Es el riesgo que este caso anotaba: como nota al lado de un `encontrado` no se lee.
- **Lo que no tiene ni ruta ni comillas sigue `inbuscable` — se cumplió.**
- **Rutas relativas al servicio y a la raíz — se probaron**: las dos se encuentran. Una ruta escrita desde
  una carpeta que no está en el árbol sale `ausente`.
- **Lo que ya daba `encontrado` lo sigue dando — se cumplió** para la palabra sola, con una excepción buscada:
  la que sólo aparecía en `planning/`, abajo.
- **Las entradas reales de una instancia — no se hizo.** Se probaron las tres formas que las dos sesiones
  reportaron, no sus entradas.

### Lo que este caso encontró y no preveía

- **La entrada se encontraba a sí misma.** Con la raíz por defecto, el recorrido incluye `planning/done/`, así
  que el nombre de una prueba inventada aparecía: en la propia entrada. Ya pasaba con la palabra sola
  —`TestInventadoXyz` daba `encontrado`—, y buscar lo entrecomillado lo extendía a todo. Ahora el `planning/`
  de la instancia no se recorre. Lo encontró la revisión; mi prueba usaba una raíz que lo dejaba afuera.
- **El resto de la traza no es el nombre del caso.** La primera versión tomaba por caso todo lo que quedaba al
  sacar el archivo, y `node --test src/test/suma.test.js` salía `parcial` porque «node --test» no está en el
  archivo. El molde admite «nombre de prueba o comando». Ahora el caso es lo entrecomillado o lo que va con
  `›`; si la traza no lo marca así se comprueba el archivo y la salida lo dice.

### Lo que queda como está, y dicho

- **El nombre se busca como texto.** Da por bueno el que es parte de otro más largo o está sólo en un
  comentario, y los tramos anidados no se comprueban en orden.
- **Dos archivos con la misma cola de ruta** cuentan los dos: `a/b.js` encuentra el caso si está en cualquiera.
- **Sin archivo reconocido, lo entrecomillado se busca en todo el árbol**, también en un README.
- **Salen `ausente` o `parcial` trazas que dicen la verdad** cuando la ruta es absoluta, trae `..` o difiere
  en mayúsculas, cuando el nombre viene entre comillas tipográficas o lleva un apóstrofo entre comillas
  simples, y cuando el código arma el nombre con una variable.
- **El tope de 5000 archivos** del recorrido es anterior y se hereda.

### Qué se corrió

- **El comando real, sobre una instancia con una prueba y diecisiete formas de trazarla**, antes y después:

  | | Antes | Después |
  |---|---|---|
  | `encontrado` | 3 | 10 |
  | `parcial` | — | 1 |
  | `ausente` | 1 | 4 |
  | `inbuscable` | 13 | 2 |

  Las tres formas de las corridas reales dan `encontrado`. El archivo con un caso que no existe da
  `parcial — el archivo existe; no aparece en él: un caso que no existe`. Siguen `inbuscable` la frase suelta
  y `npm test`.
- **Una instancia con la raíz por defecto**: lo entrecomillado que no existe y `TestInventadoXyz` dan
  `ausente`; con el motor anterior la palabra daba `encontrado`.
- **39 mutaciones en rojo, en una copia.** En la última vuelta sobrevivieron nueve, casi todas por lo mismo:
  las pruebas traían el caso bien escrito, y así una ruta sin reconocer caía a buscar el nombre en todo el
  árbol y daba `encontrado` igual. Cada forma de ruta tiene ahora su gemela con el caso mal. Una resultó
  inobservable y se sacó del código. La revisión había encontrado quince sobre la primera versión.
- **Una revisión independiente**, con unas ochenta formas, un árbol de 6000 archivos (tiempos iguales a los de
  antes) y entradas raras sin ninguna excepción. Nada más en el repositorio lee estos veredictos.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una instancia real.
