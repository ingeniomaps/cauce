---
caso: 316
titulo: evidence no contrasta ninguna traza de las que escribe autobuild
estado: abierto
prioridad: media
version-detectada: 0.103.5
---

# 316 — `ops evidence` marca «inbuscable» toda traza de `tests`, también la que nombra el archivo

**🔴 abierto** · detectado en 0.103.5 · prioridad **media**.

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
