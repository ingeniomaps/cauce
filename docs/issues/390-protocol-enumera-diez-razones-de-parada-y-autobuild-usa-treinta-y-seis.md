---
caso: 390
titulo: PROTOCOL enumera diez razones de parada y autobuild usa treinta y seis
estado: resuelto
resuelto-en: 0.109.0
prioridad: baja
version-detectada: 0.108.0
---

# 390 — `PROTOCOL.md` dice que «toda parada se nombra con una de éstas» y enumera diez; `autobuild` para con treinta y seis nombres distintos, y cuatro de los diez no los usa nunca

**🟢 resuelto en 0.109.0** · detectado en 0.108.0 · prioridad **baja** — nada falla, pero la lista que una empresa recibe como
contrato de paradas describe otro recorrido, y quien la lea para interpretar una corrida no encuentra la razón que
tiene enfrente.

## Resumen

`template/planning/PROTOCOL.md`, sección «Razones de parada», afirma un conjunto cerrado: «Toda parada se nombra con
una de éstas, en cualquier runner», y lista `awaiting-review`, `blocked-on-human`, `not-ready`, `plan-rejected`,
`review-unresolved`, `verify-regression`, `verify-inconsistent`, `qa-failed`, `commit-failed` y `budget-low`.

## Reproducción

Sobre `main` en `cc313576`, contando los nombres literales que `automatization/workflows/autobuild.js` pasa a `halt`
o a `stop`:

```
grep -oE "(halt|stop)\('[a-z-]+'" automatization/workflows/autobuild.js | sed -E "s/.*'([a-z-]+)'/\1/" | sort -u
```

Da 36 nombres. De los diez de la lista aparecen cuatro (`blocked-on-human`, `not-ready`, `qa-failed`,
`commit-failed`); `awaiting-review`, `plan-rejected`, `review-unresolved`, `verify-regression`, `verify-inconsistent`
y `budget-low` no aparecen como literal. Puede que alguno llegue por una variable: no se revisó, y es parte de lo que
el caso tiene que establecer.

## Causa raíz

Sin establecer. Lo visible es que cada parada nueva de `autobuild` nace con su nombre en el recorrido y ninguna
prueba compara esos nombres con la lista del protocolo: es la forma que R27 describe, una lista que alguien tiene
que acordarse de ampliar.

## Fix propuesto

Decidir qué es la lista. Si es el contrato, se completa y una prueba recorre los nombres del recorrido y falla
hasta que cada uno esté en ella —el comparador de R27—. Si es una clasificación —qué familias de parada hay—, se
reescribe como familias y cada nombre del recorrido declara la suya. Lo que no conviene es dejar la frase «toda
parada se nombra con una de éstas» sobre una lista que no lo cumple.

Es `template/`, así que cualquiera de las dos baja a toda empresa en su próximo `upgrade`.

## Contexto de descubrimiento

Al cerrar el caso 383, que agrega dos paradas (`governance-approval-needed` y `commit-needs-approval`). Se buscó
dónde documentarlas y la lista del protocolo ya no describía las que había.

## Relacionados

- [383](./383-un-guard-de-gobernanza-frena-el-commit-del-subagente-y-la-corrida-termina.md) — de donde salió.

## Cierre

**Resuelto en 0.109.0, con la lista por familias.** Lo que el caso dejaba sin revisar se revisó antes de decidir:

- Dos razones llegan por variable, `plan-rejected` y `plan-blocked`, que `planRejected` recibe por nombre. Con las
  dos nuevas del 383, el recorrido para con **40** nombres.
- De las diez de la lista, cinco las usa `autobuild`.
- `awaiting-review` la emite `ops context`, pero el recorrido frenaba por la misma condición con otro nombre,
  `awaiting-human-review`. Era el mismo hecho con dos nombres.
- Cuatro no las emitía nadie: `review-unresolved`, `verify-regression` (sólo en un comentario),
  `verify-inconsistent` y `budget-low`.
- La lista ya tenía un comparador, pero contra el motor: `test/planning/context.test.js` ata la prosa de
  `PROTOCOL.md` a `STOP_REASONS` de `engine/planning/parser.js`. Lo que faltaba era comparar el motor con el
  recorrido.

Se le preguntó a Manuel qué es la lista, porque es `template/` y baja a toda empresa. Eligió familias.

**El arreglo.**

- `engine/planning/stops.js` declara nueve familias (Arranque, Cola, Persona, Preparación, Plan, Construcción,
  Revisión, Verificación y Cierre), y `STOP_REASONS` sale de ellas. `PROTOCOL.md` las enumera con sus razones. El
  vocabulario vivía en `parser.js`, que con las familias pasaba las 500 líneas. Es una responsabilidad aparte del
  parser y salió a su propio módulo, en vez de registrar una excepción.
- `awaiting-human-review` pasa a ser `awaiting-review`, el nombre que el protocolo y `context` ya usaban.
- Las cuatro sin uso quedan en `DEPRECATED_STOP_REASONS`, cada una con su reemplazo y la condición para borrarla
  (1.0.0). No se borran porque el protocolo decía «en cualquier runner», y un runner propio pudo haberlas usado.

**Lo que se corrió para saber que funciona.**

- La reproducción del caso, ahora: 38 nombres literales más 2 por `planRejected`, los 40 clasificados.
- `test/workflows/autobuild-stops.test.js` es el comparador que faltaba, en los dos sentidos. Toda razón que emite el
  recorrido tiene que estar en una familia. Toda razón de una familia tiene que emitirla el recorrido. Una deprecada
  no puede emitirse y su reemplazo tiene que existir. Ninguna razón vive en dos familias. `context.test.js` exige
  además que la prosa nombre cada familia y cada deprecada.
- Con el `parser.js` y el `PROTOCOL.md` de antes, las cuatro pruebas fallan.
- Cuatro mutaciones en una copia del árbol, las cuatro en rojo:
  - una parada nueva sin clasificar;
  - una razón en una familia que nadie emite;
  - una razón repetida entre dos familias;
  - la prosa sin una de las familias.
- `test/workflows/autobuild.test.js` mide que el checkpoint humano sin resolver para con `awaiting-review`.

**Recorrido de lo que el caso enumeraba.**

- **Decidir qué es la lista — se decidió: familias**, con las razones de cada una debajo.
- **El comparador de R27 — se hizo**, y en los dos sentidos: también falla si la lista nombra lo que nadie emite, que
  es como se habían quedado las cuatro deprecadas.
- **No dejar la frase «toda parada se nombra con una de éstas» sobre una lista que no lo cumple — se hizo**: la frase
  sigue y ahora la sostiene la prueba.
- **«Baja a toda empresa en su próximo `upgrade`» — se dice en el CHANGELOG**, con el renombre de
  `awaiting-human-review`, que es lo único que cambia para quien lee la razón de una parada.

**Lo que el caso no preveía.** El renombre. Que la misma espera tuviera un nombre en `context` y otro en el recorrido
no lo veía la cuenta del caso, porque las dos formas se parecen. Apareció al buscar dónde se usaba cada nombre de la
lista.

