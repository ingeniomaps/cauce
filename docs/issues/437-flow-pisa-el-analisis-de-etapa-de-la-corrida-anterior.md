---
caso: 437
titulo: flow escribe el análisis de cada etapa con un nombre fijo y pisa el de la corrida anterior
estado: resuelto
resuelto-en: 0.115.0
prioridad: media
version-detectada: 0.114.0
---

# 437 — `flow` pisa el análisis de etapa de la corrida anterior

**🟢 resuelto en 0.115.0** · detectado en 0.114.0 · prioridad **media**.

## Resumen

Cada etapa de descubrimiento de `flow` escribe su análisis completo en `planning/reports/<etapa>-analisis.md`, sin
fecha ni recorrido. Dos corridas que comparten un id de etapa —el mismo recorrido corrido dos veces, o dos recorridos
con una etapa que se llama igual— escriben el mismo archivo, y la segunda borra la primera sin aviso. Son dos daños:

1. **La evidencia de la corrida anterior se pierde.** Su informe final (`<AAAA-MM-DD>-<slug>.md`) y lo que se decidió
   después citan esos análisis por ruta, y la ruta pasa a apuntar a otra cosa que se lee igual de bien. Medido en una
   instancia real (ver «Síntoma»).
2. **La síntesis de una corrida concurrente puede leer lo de otra.** El paso final lee los análisis por la ruta que
   devolvió cada etapa (`flow.js:454`, y `:504` en el camino de la épica). Si dos líneas de trabajo corren `flow` a la
   vez en la misma instancia —el `planning/` es uno solo—, el sintetizador de una puede leer el análisis que acaba de
   escribir la otra. **Deducción del código, no medida.**

Los ids que hoy se repiten entre recorridos, contados con `grep -rhoE '"id":\s*"[a-z-]+"' flows/ | sort | uniq -c`:
`decide` (4), `frame` (3: `product-development`, `technical-design`, `feasibility-review`, los tres de
descubrimiento), y `scope`, `learn`, `exposure` y `evidence` (2 cada uno).

## Reproducción

La ruta sale de una plantilla sin nada propio de la corrida, así que alcanza con leer el pedido que recibe cada etapa
—`flow.js:318`, sólo `${REPORTS}` y `${stage.id}`— para ver que dos corridas piden el mismo archivo. La prueba de
`test/flows/flow.test.js` que comprueba el pedido (`:312`) ya lo muestra con el banco del arnés: el nombre es
`encuadre-analisis.md`, el mismo en cualquier corrida.

Corrido de verdad, desde una instancia sidecar con Claude Code:

1. `/flow <una intención>`: `product-development` escribe en `planning/reports/` `frame-analisis.md`,
   `research-analisis.md`, `shape-analisis.md`, `architect-analisis.md` y `plan-analisis.md`.
2. Commitear `planning/reports/`.
3. `/flow <otra intención>`.
4. `git status -u planning/reports/` muestra los cinco como modificados, con el contenido de la segunda corrida.

No se volvió a correr para este caso: cuesta un recorrido entero de agentes y la instancia de abajo ya lo midió.

## Síntoma

En una instancia de una empresa (Acme), con 0.114.0, al terminar la corrida del 2026-10-22 de un borrador de
release de producto. Salida recortada a `planning/reports`:

```
$ git status -s -u planning/reports
 M planning/reports/architect-analisis.md
 M planning/reports/frame-analisis.md
 M planning/reports/plan-analisis.md
 M planning/reports/research-analisis.md
 M planning/reports/shape-analisis.md
?? planning/reports/2026-10-22-release-de-producto-001-parcial.md
```

Ya había pasado antes sin que nadie lo viera. Los cinco archivos entraron en `3df6f6c` (2026-09-30, corridas de
septiembre) y los reemplazó entero la corrida de la épica 030, commiteada como `0b96c53` (2026-10-22):

```
$ git show --stat 0b96c53 -- planning/reports
 planning/reports/architect-analisis.md | 852 +++++++++++++++++--------------
 planning/reports/frame-analisis.md     | 585 ++++++++++++---------
 planning/reports/plan-analisis.md      | 533 +++++++++----------
 planning/reports/research-analisis.md  | 544 +++++++-------------
 planning/reports/shape-analisis.md     | 904 +++++++++++++++------------------
```

El mensaje de ese commit no dice que reemplaza los análisis de septiembre: quien lo hizo no lo supo. La instancia ya
lo esquivaba a mano —`2026-09-24-research-analisis.md` y `2026-09-24-shape-analisis.md`, renombrados con su fecha en
`3df6f6c`—, que es justo lo que el motor no hace.

## Causa raíz

`automatization/workflows/flow.js:318` dicta el nombre del análisis de etapa:

```js
`Escribí primero tu análisis completo en ${REPORTS} como ${stage.id}-analisis.md —ahí no hay ` +
```

con `REPORTS` en `flow.js:30` (`${P}/reports`). Las otras dos escrituras del recorrido sí llevan fecha y slug: el
parcial en `flow.js:400` (`<AAAA-MM-DD>-<slug>-parcial.md`) y el informe final en `flow.js:458`
(`<AAAA-MM-DD>-<slug>.md`). El análisis de etapa es el único que no.

## Fix propuesto

El mismo prefijo que el resto, más el recorrido, porque varios recorridos comparten ids de etapa:

```diff
-    `Escribí primero tu análisis completo en ${REPORTS} como ${stage.id}-analisis.md —ahí no hay ` +
+    `Escribí primero tu análisis completo en ${REPORTS} como ${contract.today}-${FLOW}-${stage.id}-analisis.md ` +
+    `—si ya existe, no lo pises: agregá -2, -3…— y ahí no hay ` +
```

`contract.today` lo copia el paso de contrato de `ops context --json` (`flow.js:202-203`) y el recorrido ya lo usa
(`flow.js:246`); `FLOW` está en `flow.js:228`. El sintetizador no cambia: lee la ruta que devuelve la etapa, sea cual
sea.

**Prueba y mutación.** En `test/flows/flow.test.js`, el pedido de la etapa lleva la fecha del contrato y el
recorrido delante del id —`2026-09-12-<flow>-encuadre-analisis.md`— y no el nombre suelto. Mutación: volver al
nombre fijo en `flow.js:318` y ver esa prueba en rojo. La aserción de hoy (`:312`, `/encuadre-analisis\.md/`) pasa
con los dos nombres, así que no sirve como está: hay que endurecerla.

## Tradeoffs

- **Más archivos en `planning/reports/`**: uno por etapa y corrida, en vez de cinco que se reescriben. Es el costo de
  no perder evidencia, y crece por diseño (R7).
- **El «no lo pises» lo cumple el agente, no el motor**, y no cierra el daño 2 del todo: dos etapas del mismo
  recorrido corriendo el mismo día en dos líneas pueden mirar a la vez que el nombre está libre y elegir el mismo.
  Es mucho más raro que hoy —pide mismo día, mismo recorrido, misma etapa y simultaneidad— y lo que lo cerraría es
  una carpeta por corrida con un id que el motor arme. Queda declarado acá, no resuelto.
- **Quien lea `frame-analisis.md` por su nombre fijo deja de encontrarlo.** Comprobado con
  `git grep -n analisis -- ':!docs/issues'`: fuera de `flow.js:318` sólo aparece en registros viejos de evaluación
  (`flows/system/change-review/evaluations/results/`) y en las pruebas de `flow.test.js`, que usan rutas de ejemplo.
  Ningún código ni contrato lo lee por nombre.

## Contexto de descubrimiento

Corriendo `/flow` en la instancia de Acme para armar el borrador de un release de producto, el mismo día que otra
corrida armó la épica 030. El recorrido paró en su etapa `plan`; al revisar qué había escrito, `git status` mostró
los cinco análisis de la épica 030 modificados. Se restauraron con `git checkout` y los nuevos se guardaron a mano
como `2026-10-22-producto-001-<etapa>.md`.

Revisado el 2026-10-23 contra el fuente: las citas de `flow.js` se abrieron y dicen lo que el caso afirma. El fix
original usaba una constante `TODAY` que no existe, y nombraba `plan` como etapa compartida, que aparece en un solo
recorrido; los dos se corrigieron arriba.

## Relacionados

Ninguno encontrado: `grep -rln 'analisis.md' docs/issues/` no devuelve otro caso.

## Cierre

**Resuelto en 0.115.0**, a pedido del dueño el 2026-10-23 («arranca con el arreglo»). La versión es una minor y no un patch, aunque este arreglo solo no la pediría: la misma versión agrega una regla
al sistema (R29, caso 440), y el encabezado del CHANGELOG dice que un cambio en las reglas del sistema sube minor —el
último cambio de R9, caso 324, salió en 0.104.0—. Se pensó primero como 0.114.1 y se corrigió al sumarse el 440.

`automatization/workflows/flow.js` pide ahora `<fecha>-<recorrido>-<etapa>-analisis.md`, con la fecha de
`contract.today` o `<AAAA-MM-DD>` si el contrato no la trae, y «si ya existe, no lo pises: agregá -2, -3… antes de .md,
como <etapa>-analisis-2.md».

El caso, sección por sección:

- **Resumen, daño 1 (la evidencia de la corrida anterior).** Se fue: dos corridas en días distintos, o dos recorridos
  con la misma etapa, piden archivos distintos; y dos el mismo día escriben uno con `-2` sin tocar el otro (medido
  abajo).
- **Resumen, daño 2 (la síntesis concurrente).** Se achica y no se cierra: queda la carrera de dos etapas del mismo
  recorrido, el mismo día, en dos líneas a la vez. Se decidió no hacer la carpeta por corrida ahora: pide un id de
  corrida que el motor no arma, y el daño sigue sin medirse en uso real. Queda escrito en «Tradeoffs».
- **Fix propuesto**: se hizo con tres cambios que salieron después. El inciso nuevo partía la frase con rayas y dejaba
  una suelta, y va entre paréntesis. La revisión del diff encontró que `today` es opcional en el esquema del contrato:
  sin él el nombre salía `undefined-…`, igual todos los días, y ahora cae en `<AAAA-MM-DD>`, como el parcial y el
  informe final. Y que «agregá -2» no decía dónde, así que lo dice con un ejemplo.
- **Prueba y mutación**: se hicieron como estaban escritas, abajo.
- **Tradeoffs, más archivos**: aceptado, crece por diseño. **Lo cumple el agente**: medido con un agente real, abajo;
  sigue siendo un pedido y no un tope. Un reintento de la misma etapa tras un rechazo del esquema (caso 379) encuentra
  su propio primer archivo y escribe `-2`: queda un análisis que ningún handoff cita, sin pisar nada. **Quien lee por
  nombre**: `git grep -n analisis -- ':!docs/issues'` no muestra ningún lector, y el CHANGELOG avisa que los archivos
  con el nombre viejo se quedan.

**Lo que se corrió para saber que funciona.**

- La aserción de `test/flows/flow.test.js` («el análisis largo va a un archivo, no por el handoff») endurecida al
  nombre entero, al sufijo con su ejemplo y al contrato sin `today`. Cada parte se vio en rojo antes de su arreglo:
  `el análisis se escribe con la fecha, el recorrido y el id de la etapa`, el del sufijo, y
  `… como undefined-product-development-encuadre-analisis.md …` sin respaldo. Con los arreglos, 21/21.
- Mutaciones, en una copia del árbol: volver al nombre fijo → 1 en rojo; sacar el respaldo de la fecha → 1 en rojo.
- **Un agente real**, dos veces sobre el mismo banco. El pedido de la etapa `frame` se sacó del arnés con la raíz del
  banco y la fecha de su `context` (2026-10-23), y se corrió con `claude -p` pidiéndole al final el JSON de la etapa,
  que es la única diferencia con una corrida de `/flow`. La primera escribió
  `planning/reports/2026-10-23-product-development-frame-analisis.md` y devolvió esa ruta; la segunda escribió
  `…-frame-analisis-2.md`, devolvió ésa, y `sha1sum -c` del primero dio «La suma coincide». USD 0,61 y 0,59. Se corrió
  antes de agregar el ejemplo del sufijo, que el agente ya puso en el mismo lugar.
- `npm run ci`: exit 0, 1577/1577.

**Revisión del conjunto.** `/code-review high` sobre la rama entera encontró siete hallazgos; dos son de este caso y
están arriba (`today` y el sufijo). Los otros cinco son del 438 y están en su cierre.

**Segunda revisión**, acotada a lo que arregló la primera: diez hallazgos, dos de este caso.

- **El ejemplo del sufijo no llevaba la fecha ni el recorrido** (`como encuadre-analisis-2.md`), así que copiarlo
  devolvía el nombre que el caso sacó. Ahora es el nombre entero con `-2`; la prueba lo fija, y la mutación que vuelve
  al ejemplo corto la pone en rojo.
- **`<AAAA-MM-DD>` puede terminar literal en el nombre.** Se decidió que no: es la misma convención con que este
  recorrido pide el parcial y el informe final, y cambiarla acá sola dejaría tres formas en el mismo pedido.

**Revisión final de la rama.** `/code-review high` sobre `origin/main...fix/437-443` entero, ya con los cuatro commits
reagrupados y el 442 y el 443 adentro: diez hallazgos. Uno es de este caso: que con el contrato sin fecha el pedido dice «como `<AAAA-MM-DD>`-…»
sin decir que se reemplace. **Se decidió que no**, por tercera vez y por la misma razón: es la convención con que el
mismo recorrido pide el parcial y el informe final.

**Prueba real con el pedido final.** Dos corridas de un agente real con el pedido tal como quedó —el ejemplo del sufijo
con el nombre entero—, sacado del motor congelado en `HEAD`: la primera escribió
`2026-10-23-product-development-frame-analisis.md`, la segunda `…-frame-analisis-2.md`, y el primero quedó intacto
(`sha1sum -c`: «La suma coincide»). USD 0,64 y 0,71.

**Pruebas reales antes de la versión**, a pedido del dueño el 2026-10-23 («corre todas las pruebas que se puede»).

- **Un `/flow` real de punta a punta**, con `claude -p "/flow que el alta de vendedores no genere duplicados"` sobre
  una instancia `sidecar` con el motor de la rama congelado e instalado en su propia carpeta. El recorrido corrió entero
  en unos cuatro minutos: el agente del contrato trajo la fecha desde `ops context` —lo que las corridas anteriores no
  probaban, porque la fecha se les pasaba a mano—, la etapa `frame` escribió
  `planning/reports/2026-10-23-product-development-frame-analisis.md`, su gate no se cumplió, se escribió la acción humana
  y el informe parcial, y **el parcial cita el análisis por su nombre nuevo**, dos veces: quien sintetiza leyó la ruta
  que la etapa devolvió. USD 2,72.
- **La primera corrida de esa prueba estuvo mal armada, y se repitió.** Se copió una instancia ya instalada a otra
  carpeta, y el workflow instalado lleva la ruta absoluta de la instancia donde se instaló: corrió en la copia y quiso
  escribir en el original, y el guard de archivos frenó la acción humana y el parcial por estar fuera de las raíces de
  la sesión. No es un defecto de este caso —una instancia no se mueve después de instalar—, pero lo que se mide en una
  copia hay que instalarlo en la copia.

