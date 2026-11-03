---
caso: 482
titulo: `ops lines` da por desviada una línea sana cuando la rama no se llama `line/<línea>`
estado: descartado
prioridad: baja
version-detectada: 0.118.0
---

# 482 — `ops lines` da por desviada una línea sana cuando la rama no se llama `line/<línea>`

**⚪ descartado** · detectado en 0.118.0 · prioridad **baja**: es un aviso, sale en exit 0 y no frena nada. Lo sufre una instancia que nombra sus ramas `line/<persona>-<línea>` para que dos personas no compartan una, y ya lo tiene anotado en su guía.

## Síntoma

`node engine/cli/ops.js lines`, en un banco `sidecar`, 2026-11-02, con la línea `mini` y su árbol en `line/persona-mini`:

```
mini  (línea declarada)
  app  …/lines/mini/app  (line/mini)  el árbol está en line/persona-mini, no en line/mini
```

Exit 0. Sobre una línea en `line/mini` el aviso no sale.

Desde el repositorio de producto en vez de la instancia:

```
…/sidecar/app (ruta resuelta) no es una raíz ops: falta planning/BACKLOG.md
```

Esto último es correcto: esa carpeta no es la raíz. El mensaje dice qué falta y no qué raíz usar.

## Causa raíz

`plant` arma la rama como `${BRANCH}${name}` (`engine/cli/lines.js:85`), y el aviso compara contra eso (`engine/cli/lines.js:323-324`). `ops.config.json` no tiene dónde declarar otra forma.

## Fix propuesto

**Descartado el 2026-11-03, por decisión de la persona.** Lo medido abajo muestra que el único efecto es un aviso con exit 0, que esa instancia ya documenta, y que retirar una línea funciona con su rama. Las dos salidas que había —aflojar el aviso para `line/<persona>-<línea>`, o declarar la forma de la rama en la configuración— arriesgan callar un árbol que de verdad quedó en otra rama, o suman una opción por una sola instancia. Se reabre si una instancia pierde trabajo o una rama por ese nombre.

## Tradeoffs

Lo demás funciona con la rama distinta, medido en el banco con un commit que no llegó a la rama viva: `ops lines join <raíz> mini`, que en una línea declarada la retira, da exit 0 y «está en line/persona-mini, que no llegó a master: mergeá; todavía no se puede retirar». Mira la rama del árbol, no el nombre. Por lectura del código, sin correrlo: al retirar borra la rama `line/<línea>` (`engine/cli/lines-join.js:133`), así que `line/persona-mini` quedaría suelta. `currentLine`, que lee la línea de la rama, está deprecado y sólo lo usan las líneas de antes de 0.111.0.

En esa instancia hay 4 ramas con persona y 1 `line/admin` sin ella, en sus repositorios.

Quién depende del nombre `line/<línea>`: `engine/cli/lines.js` (armar y avisar), `engine/cli/lines-join.js` (traer y retirar), `engine/planning/lines.js` (estado, y la lectura deprecada) y `engine/core/line-trees.js`, que lo usa para el id del runner de una línea.

`engine/cli/lines.js:116` y `:324` son el único aviso de un árbol que quedó en otra rama por error: aflojarlo no debe callar un `line/otra` de verdad. `line/persona-mini` también podría ser otra línea llamada `persona-mini`, y una coincidencia por sufijo la confunde: hay que mirar las líneas declaradas.

## Contexto de descubrimiento

Una corrida de una instancia real, escrita por otra sesión. Se saneó el nombre de la instancia y de la persona.

## Relacionados

Casos 395, 438.

## Cierre

Descartado el 2026-11-03 por decisión de la persona, con el dato de arriba: el único efecto medido es un aviso con exit 0, y retirar la línea funciona con su rama. Se reabre si una instancia pierde trabajo o una rama por ese nombre.
