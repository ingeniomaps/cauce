---
caso: 168
titulo: Una viñeta de dos líneas bajo `### Límites` llega cortada a los agentes, y su continuación se reporta como párrafo perdido
estado: abierto
prioridad: media
version-detectada: 0.94.0
---

# 168 — El camino declarado sólo funciona si el límite entra en una línea, y nada lo dice

**🔴 abierto** · detectado en 0.94.0 · prioridad **media** — el límite viaja truncado a mitad de frase y el
aviso manda a hacer lo que ya se hizo

## Resumen

0.92.0 agregó el camino declarado —una viñeta bajo `### Límites`— para no tener que imitar la gramática
de `ENUNCIA`, y 0.93.0 lo arregló para que declarar dejara de sumar al aviso. Queda un borde que ninguno
de los dos toca: **el bloque se recorre línea por línea**, así que una viñeta escrita en dos líneas
—que es como se escribe cualquier límite que no entre en el ancho del archivo— se parte en dos:

- lo que llega a `limits`, y de ahí al preámbulo de cada subagente, es **sólo la primera línea**;
- la continuación no coincide con ninguna entrada de `declared()`, sobrevive al filtro de `warnings()` y
  se reporta como un párrafo que «no llega a los agentes».

O sea que el proyecto hace lo que el aviso pide, el aviso sigue sonando —ahora citando media frase suya—
y el límite que sí llegó es el que quedó cortado.

## Reproducción

Banco mínimo: los cuatro archivos que `contract` exige, con este `organization/workspace.md`.

```markdown
## Excepciones de autonomía

### Límites

- **Escrituras a la tienda Shopify real** —crear, editar o borrar productos, pedidos o
  configuración— no las hace un runner, aunque la tarea esté promovida.
- **Una viñeta de una sola línea** llega entera al preámbulo de cada subagente.
```

`ops contract <banco> --json` devuelve, **verificado el 2026-09-16 con 0.94.0**:

```
  • **Escrituras a la tienda Shopify real** —crear, editar o borrar productos, pedidos o
  • **Una viñeta de una sola línea** llega entera al preámbulo de cada subagente.
```

El primer límite termina en «pedidos o». Lo que decía —que esa escritura no la hace un runner— es
justamente la parte que no viajó.

## Síntoma

En la instancia donde apareció, el aviso de `check` nombraba tres párrafos. Al agregar `### Límites`
sobre las viñetas que ya existían, siguieron siendo tres: lo que cambió fue que el segundo pasó de ser
la viñeta entera a ser su continuación.

```
⚠ organization/workspace.md: 3 párrafo(s) de "## Excepciones de autonomía" no llegan a los agentes.
El que sea un límite va como viñeta bajo `### Límites`: "Los límites que rigen sin escribir nada
están en `../AGENTS.…", "configuración— no las ha…
```

Ese `"configuración— no las ha…"` es media viñeta declarada. Sin abrir el código se lee como que el
bloque no se reconoció.

## Causa raíz

`engine/cli/contract.js`:

- **`marked()`, líneas 86-103**: recorre el bloque y se queda con `block.filter((line) => BULLET.test(line))`.
  `BULLET` es `/^\s*[-*]\s+/`, así que una línea de continuación —que empieza con espacios y texto— no
  entra. Lo que se empuja a `bullets` es la línea, no la viñeta.
- **`warnings()`, líneas 150-156**: `outside` descuenta **por línea**, comparando contra el conjunto de
  bullets e intros. Ese descuento por línea es el arreglo del caso 159 y es correcto para el caso que
  cerró; lo que no contempla es la línea que pertenece a una viñeta sin ser su primera.

Las dos mitades salen del mismo supuesto: que una viñeta es una línea. El molde lo cumple porque sus
ejemplos son cortos, y por eso no se ve hasta que alguien escribe un límite de verdad.

## Fix propuesto

Plegar la viñeta antes de empujarla, en `marked()`: una viñeta empieza en una línea que matchea `BULLET`
y termina en la próxima que matchea `BULLET`, en una línea en blanco o al final del bloque.

```js
   bullets.push(...block
-    .filter((line) => BULLET.test(line))
-    .map((line) => line.replace(BULLET, '').trim())
+    .reduce((acc, line) => {
+      if (BULLET.test(line)) acc.push(line.replace(BULLET, '').trim())
+      // Una línea que no abre viñeta y no está en blanco continúa la anterior: el límite es la
+      // viñeta entera, no su primera línea, y lo que no se pliegue acá viaja truncado y además
+      // vuelve por `warnings` como un párrafo que nadie perdió.
+      else if (acc.length && line.trim()) acc[acc.length - 1] += ` ${line.trim()}`
+      return acc
+    }, [])
     .filter(Boolean))
```

Con eso `limits` entrega la viñeta completa y `warnings` deja de ver la continuación, porque el
descuento por línea del 159 puede seguir igual si se compara contra las líneas crudas de cada viñeta.

## Tradeoffs

Plegar une con un espacio, así que una viñeta que dependa del salto de línea —una sub-lista, un bloque
de código adentro— llegaría en una sola línea. Para lo que este campo declara —un límite por viñeta—
eso es lo correcto; si algún día hace falta estructura adentro, la decisión ya no es cómo plegar sino
si un límite puede tener más de un párrafo.

La otra salida sería documentar que una viñeta va en una línea. Es más barata y peor: obliga a pasarse
del ancho del archivo en el único lugar donde el toolkit no puede reformatear, y no deja rastro de por
qué.

## Prioridad

**Media.** No rompe ninguna corrida y no se ve en rojo: el preámbulo sigue afirmando «Límites del
proyecto: …» y lo que falta es la mitad de uno. Es exactamente el modo de fallo que el caso 157
describe —la lista sale más corta y se lee igual de completa—, sobreviviendo dentro del camino que se
agregó para cerrarlo.

## Contexto de descubrimiento

Instancia de venotal (sidecar), 2026-09-16, sobre 0.94.0 recién instalado. `check` avisaba de tres
párrafos de «Excepciones de autonomía» que no llegaban a los agentes; al adoptar `### Límites` el aviso
no bajó, y de ahí salió esto. La instancia lo resolvió reescribiendo cada límite en una sola línea,
aceptando pasarse de su propio tope de 120 caracteres y dejando escrito por qué: con eso el aviso llegó
a cero y `ops contract` pasó de 3 límites a 9.

**Consultado para escribir esto**: `engine/cli/contract.js` (líneas 45-116 y 138-165) del paquete
`@ingeniomaps/cauce@0.94.0` instalado en `venotal-ops/node_modules`; `ops contract --json` sobre un banco
desechable con los cuatro archivos que exige, borrado en el mismo paso; y la salida de `ops check
planning` antes y después de adoptar el bloque.

**Segunda instancia, roax (sidecar), el mismo día sobre 0.94.0.** `ops contract --json` devolvía 26 límites
y **11 terminaban a mitad de frase**; el bloque tenía 30 viñetas con 40 líneas de continuación. En varios lo
que se pierde es lo que decide, no un detalle:

```
El runner publica ramas de trabajo y abre sus PRs sólo cuando es parte del trabajo pedido, nunca por
Debe detenerse ante una decisión irreversible o de negocio: esquema de datos público, contrato de API que
Debe aplicar la regla de la organización donde una de `planning/rules/` contradice o restringe una de
```

La primera pierde «iniciativa propia»; la segunda, qué rompe el contrato y todo el resto de la lista; la
tercera, contra qué gana. El aviso de `check` mostraba un solo párrafo perdido —«planificar, construir,
revisar o hacer QA: el contrato del l…»—, que es la continuación de la primera viñeta: las continuaciones de
viñetas seguidas quedan pegadas en `outside` y `paragraphs()` las junta en uno. **Por eso el aviso subestima
el daño: 11 límites cortados se reportan como 1 párrafo.** Si se sube la prioridad, éste es el dato.
Consultado: `ops contract . --json` y `ops check planning` sobre `roax-ops` con `@ingeniomaps/cauce@0.94.0`.

## Relacionados

- **157** — el caso que trajo el camino declarado. Éste es su borde: declarar funciona, pero sólo para un
  límite que entre en una línea.
- **159** — el descuento por línea de `warnings()`. Es correcto y es la mitad de esta causa.
