---
caso: 233
titulo: la pasada de comentarios de R11 no tiene mecanismo
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 233 — R11 pide recorrer los comentarios agregados antes de entregar, y nada comprueba que se hizo

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja** — guard `comments`, apagado hasta declararlo:
listado con token, y el idioma y el largo como chequeos duros opcionales.

**Prioridad baja**: el AGENTS.md del toolkit ya lo admite («La pasada de comentarios que pide R11 no la cubre la puerta»).

## Resumen

acme-ops mecanizó la pasada: un guard lee los comentarios **agregados** en el commit, bloquea lo medible (bloques largos, idioma, separadores, emojis) y para el resto exige un token derivado de esos comentarios exactos, de modo que la pasada no se puede declarar sin haberla hecho sobre ese diff.

## Reproducción

El hueco está escrito en `AGENTS.md`. Lo que había que medir era si mecanizarlo sirve, y se midió sobre el
guard de acme: ver el Cierre.

## Síntoma

La pasada se saltea, y la puerta en verde no lo dice.

## Causa raíz

R11 (`template/planning/rules/system/code-shape.md`) y la nota de `AGENTS.md` sobre la pasada.

## Fix propuesto

Un guard opcional que liste los comentarios agregados y exija el token atado al diff, con idioma y emojis configurables.

## Tradeoffs

- Un token derivado demuestra que se miró la lista, no que se pensó cada comentario.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `acme-ops/automatization/bin/acme-comment-check.js` (310 líneas, con pruebas), commit `a2d8912`.

## Relacionados

- R11.

## Cierre

Resuelto el 2026-10-02 con las tres decisiones de Manuel: se trae el listado con token más el idioma y el largo,
apagado hasta que `ops.config.json` declare `comments`, y sin encenderlo en este repositorio.

**La medición que decidió el alcance.** Leí en sólo lectura las 15 sesiones de Claude Code que corrieron el guard
de acme desde su commit `a2d8912` (2026-09-29). Un script pareó cada bloqueo con el commit que finalmente entró:

- 113 commits entraron con el token. En 12 (11 %) el listado cambió algún comentario antes de entrar. Hubo
  referencias a tickets que se sacaron (`ACME-31`), historia que se quitó («before it is split»), 28 líneas que
  repetían el código y se borraron, y comentarios que narraban la implementación y se reescribieron.
- Hubo 9 bloqueos duros: el idioma y bloques inline de 3 a 12 líneas. Emojis, separadores y el aviso de
  proporción de comentarios no se dispararon nunca, y por eso quedaron afuera.
- Lo que la habría desmentido estaba escrito antes de medir: que ningún commit cambiara un comentario después
  del listado. No pasó.

**Lo que se corrió para saber que funciona.**

- **Tres sesiones reales** de `claude -p` en un banco instalado (instancia sidecar más un repositorio `api`, con
  `comments: {language: "es", inlineMax: 2}`):
  - La primera pidió una función con un comentario. El guard listó dos, el agente borró el encabezado que
    repetía el nombre, volvió a frenar con otro token y entró al tercer intento.
  - La segunda pidió un comentario largo dentro de la función, y **entró sin ningún bloqueo**. El pedido
    nombraba `api/math.js`, así que el guard `chat` aprobó el chequeo duro (lo diseñado), y el guard hacía
    `return` ahí, salteando también el listado. Ése era el defecto. La prueba que lo fija se vio en rojo, el
    arreglo deja seguir hasta el listado, y la sesión repetida sobre el mismo estado se frenó dos veces y
    entró con el token.
  - El chequeo duro sin aprobación se corrió por el shim con el mismo diff: frena con
    `math.js:17: 9 líneas dentro de una unidad (máximo 2)` y ofrece la aprobación.
- **Mutaciones en una copia**, cada una en rojo:
  - token ignorado;
  - merge sin intersección con `MERGE_HEAD`;
  - sin distinguir encabezado;
  - sin quitar los nombres antes de medir el idioma;
  - sin el apagado;
  - sin la aprobación;
  - sin el rastreo de comillas. Ésta sobrevivió la primera vez, porque ninguna marca entre comillas iba
    precedida de un espacio, y se agregó el caso.

**Recorrido de lo que el caso enumeraba:**

- **Un guard opcional** — se hizo: `comments`, en el grupo `pre-shell` antes de `verify` para que lo barato frene
  primero. No corre sin la clave.
- **Que liste los comentarios agregados** — se hizo, con las tres preguntas de R11 en sus palabras. Sólo cuenta lo
  agregado, y en un merge lo nuevo contra los dos padres.
- **Que exija el token atado al diff** — se hizo: `CAUCE_COMMENTS_REVIEWED`, derivado del texto de los
  comentarios. Moverlos de línea no lo cambia, y lo vio la segunda sesión.
- **Idioma y emojis configurables** — se hizo distinto: idioma y largo inline, que son los dos que la medición
  vio dispararse. Emojis y separadores no aparecieron nunca.
- **Tradeoff: el token demuestra que se miró la lista, no que se pensó cada comentario** — sigue siendo cierto y
  lo dice el encabezado de `engine/hooks/comments.js`. La medición da su alcance: en 89 % de los commits el
  token entró sin cambiar nada.

**Lo que el caso no preveía.**

- La regla de acme manda la historia del cambio fuera del comentario. R11 no: deja «el caso que la forzó»
  dentro de la unidad. El listado usa las preguntas de R11 y no las de acme.
- Los docstrings de Python y los comentarios de lenguajes fuera de la lista no se ven, y el encabezado lo dice.
- `AGENTS.md` sigue diciendo que en este repositorio la pasada no la cubre la puerta, y es cierto: encenderlo
  acá quedó para otra decisión.
