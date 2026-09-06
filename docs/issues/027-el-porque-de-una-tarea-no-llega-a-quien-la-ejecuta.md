---
caso: 027
titulo: El contexto de la épica no viaja al ejecutor, que además tiene prohibido ir a buscarlo
estado: resuelto
prioridad: media
version-detectada: 0.60.1
resuelto-en: 0.61.0
---

# 027 — La tarea llega con su qué y sin su porqué

**🟢 resuelto en 0.61.0** · detectado en 0.60.1 · prioridad **media** — se construye la letra del criterio

## Resumen

`ops context` resuelve la épica de la tarea —la busca, la encuentra y filtra sus criterios citados— y de
ella imprime **número, título y estado**. La sección donde vive el porqué no viaja.

Cuál es esa sección importa, y no es la que este caso decía primero. El molde de épica no tiene
«Objetivo» —ése es el nombre que le puso el proyecto donde se descubrió—: tiene `## Contexto relevante`,
y el propio molde la describe como **«lo que el ejecutor lee antes de decidir el cómo»**. Con eso el
hueco es peor de lo que parecía: `check` **exige** esa sección —`contracts.js:339` da error si falta— y
después nadie se la manda a quien tenía que leerla.

Y el ejecutor no puede ir a buscarlo: `autobuild.js` le dice, textual, que lea `AGENTS.md`,
`organization/workspace.md`, `ops.config.json` y `PROTOCOL.md` **«una sola vez y no leas nada más»**. El
`roadmap/` sólo se abre en la expansión, cuando la cola está vacía. Así que quien construye recibe el
resultado a lograr y la condición que lo cierra, nunca la razón por la que existe.

Se construye la letra del criterio. Con una aceptación mecánica alcanza; con una que describe una
conducta de producto —«la oferta declara si compite»— una implementación literal la satisface y pierde
el punto, porque el punto estaba en el Objetivo.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.60.1 init ops --mode sidecar --install --runner claude

# una épica con objetivo y una tarea que la cita
node ops/tools/ops.js context ops/planning        # EPIC muestra número y título; el objetivo no aparece
grep -n 'no leas nada más' .claude/workflows/autobuild.js
grep -n 'ROADMAP' .claude/workflows/autobuild.js  # sólo en la expansión
```

## Síntoma

```
TASK   offer-competes-flag [lite]  service: api  hito: catalog-offer
CAST   backend-engineer → product-manager
EPIC   012 Catálogo canónico — separar el ítem de la oferta [active]
ACEPT  el proveedor cambia esa marca sobre su oferta; una oferta que no compite no se ofrece sola…
```

El título de la épica insinúa el tema; lo que explica contra qué se construye —que sin esa marca el ruteo
no puede distinguir a quién ofrecerle una orden ajena, y la marca blanca pierde su base— no está por
ningún lado. En ese proyecto vivía en una sección «Objetivo» propia; en el molde le corresponde
`## Contexto relevante`.

## Causa raíz

`engine/cli/planning.js:211` encuentra la épica y `:212` arma el reporte con `{ num, title, status }`.

`engine/planning/parser.js:140` es la otra mitad, y es la que sorprende: `readEpics` **ya mira** la
sección, pero sólo para saber si está —`hasContext: /^##\s+Contexto relevante/im.test(text)`—. El texto
está en la mano y se descarta en el mismo renglón donde se lo comprueba. Convertir ese booleano en el
contenido es casi todo el fix; no hay que enseñarle al parser a encontrar nada.

Y `automatization/workflows/autobuild.js:274-275` cierra la puerta por el otro lado: «Leé …/AGENTS.md,
…/workspace.md, … y …/PROTOCOL.md una sola vez y no leas nada más». Es una economía deliberada y
correcta —el contrato se lee una vez y viaja como texto— pero deja afuera el único texto que explica
para qué existe la tarea. El `roadmap/` aparece una sola vez más en ese archivo, en la línea 334, que es
la expansión: se abre cuando la cola está vacía, no cuando se ejecuta.

Se cita el fuente y no `.claude/workflows/autobuild.js`, que es la copia que instala el runner: editar
ahí se pierde en el próximo `automation install`.

## Fix propuesto

Que el objetivo viaje en el mismo reporte que ya resuelve la épica:

```diff
-    epic: epic ? { num: epic.num, title: epic.title, status: epic.status } : null,
+    // El título nombra el tema; el contexto dice contra qué se construye, que es lo que separa cumplir
+    // el criterio de cumplir su letra. Viaja acá porque el ejecutor tiene prohibido ir a buscarlo.
+    epic: epic ? { num: epic.num, title: epic.title, status: epic.status, context: epic.context } : null,
```

y una línea más en la salida de texto, debajo de `EPIC`. En `readEpics`, `hasContext` pasa de booleano a
texto —`section(text, /Contexto relevante/i)`, que es la función que ya usa para Criterios e Historias—
y `contracts.js:339` sigue preguntando lo mismo con `!epic.context`.

Queda por decidir una cosa que este caso no cierra: **si viaja entera o cortada**. `## Contexto
relevante` es una lista de viñetas —«estado actual y rutas reales… los ADR y las invariantes que rigen
este resultado»— y puede ser larga. Cortar «por el primer párrafo» funciona en prosa y no en una lista:
la primera viñeta no es un resumen de las otras. Las salidas honestas son mandarla entera y medir cuánto
pesa, o cortar por cantidad de viñetas diciendo que se cortó.

## Tradeoffs

Contexto que crece en cada corrida, que es justo lo que la instrucción de «no leas nada más» protege. Una
sección por tarea es barata comparada con abrir el roadmap entero, y es la diferencia entre ejecutar un
criterio y ejecutar su letra. Pero a diferencia de un párrafo de objetivo, `## Contexto relevante` no
tiene tope: el molde invita a listar rutas, ADR e invariantes, así que lo que viaje hay que mirarlo con
una épica real y no con la plantilla.

Una alternativa más barata —pedir que cada tarea escriba su propio porqué en la línea— duplica en
cincuenta tareas lo que ya está escrito una vez en la épica, y envejece en cincuenta lugares.

## Contexto de descubrimiento

El dueño de `gouduet` pidió revisar que sus épicas, hitos y tareas fueran entendibles «para poder
ejercer» (2026-09-06). La estructura estaba sana: los trece hitos con su nota de por qué existen, treinta
y nueve de cincuenta y una tareas apuntando a su épica o a un criterio, las diecisiete épicas con
objetivo, criterios e historias. El hueco no estaba en lo escrito sino en lo que llega: siguiendo qué
recibe el ejecutor, el porqué se detiene en el título de la épica.

## Relacionados

- [017](017-autobuild-lee-los-limites-solo-de-agents-md.md) — el otro caso donde la lectura única de
  `autobuild` dejó afuera un archivo que sí importaba.
