---
caso: 431
titulo: lo que un carril saltea sólo lo sabe el workflow de Claude; PROTOCOL.md lo describe distinto y el traspaso entre sesiones no lo lleva
estado: resuelto
resuelto-en: 0.114.0
prioridad: media
version-detectada: 0.113.2
---

# 431 — Fuera del workflow de Claude, una tarea `lite` pesa lo que diga quien arma el pedido

**🟢 resuelto en 0.114.0** · detectado en 0.113.2 · prioridad **media**. El carril existe para no pagar ceremonia de más ni de
menos, y fuera del recorrido de Claude no la gradúa nadie.

## Resumen

El carril se decide al promover o lo decide el clasificador (`automatization/workflows/autobuild.js:444`,
`CLASSIFY_RULES`, y el esquema de `:468`, `lane: enum ['manual', 'express', 'directo', 'lite', 'full']`), y de él sale
qué fases corren. Lo que cada carril saltea está escrito en dos lugares que no dicen lo mismo:

- **El workflow** (`autobuild.js:1192-1201`): `lite` saltea Decompose (`:1381`) y Critique (`:1481`), y su QA es «la
  comprobación de aceptación real más barata» (`:2106-2108`) en vez de ejercitar el comportamiento que ve quien lo usa.
- **`PROTOCOL.md:118`**, que es lo que leen los demás runners: «`lite`: […] agrega Ready, Plan y QA» sobre `directo`.
  No dice que saltea Critique —en la máquina por tarea, Plan y Critique son un solo paso (`:79`)— ni que su QA es la
  barata.

El skill compartido (`automatization/shared/skills/autobuild/SKILL.md:8-9`) no nombra el carril, pero manda a leer
`PROTOCOL.md` entero, y ahí está la sección «Lanes» (`:97-124`). Un agente que la siga hace la versión del protocolo,
no la del workflow. Gemini no usa ese skill: tiene su comando propio
(`automatization/runners/gemini/commands/cauce/autobuild.toml`), que también remite a `PROTOCOL.md`.

Y en el traspaso de 0.112.0 (`teamwork.md:218-230`) el carril no viaja hacia quien revisa: está en el WIP (`lane:`,
`template/planning/wip/README.md:15`), pero el texto del traspaso no dice que el revisor gradúe su revisión por él.

## Reproducción

1. Leer `PROTOCOL.md:97-124` y `autobuild.js:1192-1201`, `:1381`, `:1481`, `:2106-2108` lado a lado: los dos dicen
   qué corre `lite` y no coinciden en Critique ni en QA.
2. Leer `teamwork.md:218-230`: el revisor «juzga con lo que está en disco» y no hay mención del carril.

Es una divergencia de texto: se reproduce leyendo, y lo que hace cada agente con ella no se midió acá.

## Síntoma

En la instancia de origen, las cinco tareas del release eran `[lite]`. Coordinación (Claude) armó a mano el pedido de
cada rol, para `agy` y para las sesiones Claude que revisaban, y todas recibieron el trato completo: dos subagentes de
revisión y QA con todos los casos. Medido allá: una revisión costó entre US$ 2,69 y 2,86, el doble que una QA, por los
dos subagentes.

Lo que ese número mide es el pedido armado a mano, no el skill: el sobrecosto estuvo en las sesiones revisoras, que
eran Claude, y ninguna corrió el workflow. La descripción de `lite` con que la instancia lo contó —«sin Decompose ni
Critique, 1 revisor, QA-lite»— no está escrita en ningún archivo de Cauce; sale del workflow. Y el «1 revisor» no es de
`lite`: el workflow corre un solo agente de revisión en todos los carriles (`autobuild.js:1780-1784`), que actúa como el
cargo de revisión por defecto más los que nombra el `cast` (`:1207-1208`). Dos subagentes no los pide ningún carril.

## Causa raíz

Dos, de la misma clase:

1. `PROTOCOL.md:103-121` describe los carriles con menos detalle que `autobuild.js:1192-1201`, y es la única versión
   que llega a un runner sin workflow.
2. El traspaso de `teamwork.md:218-230` no dice que el carril, que está en el WIP, gradúa también la revisión de quien
   revisa.

## Fix propuesto

- Que `PROTOCOL.md` diga por carril exactamente qué fases corren y cuán profunda es su QA, lo mismo que hace el
  workflow, y que una prueba compare las dos: es un hecho escrito en dos lugares, y sin comparador una de las copias se
  pudre (R7, R27).
- Que el traspaso de `teamwork.md` diga que quien revisa lee `lane:` del WIP y revisa con lo que ese carril pide, y que
  quien arma el pedido de un rol lo saque de ahí.

## Tradeoffs

- `PROTOCOL.md` se alarga, y cada runner lo carga entero.
- Un agente puede ignorar un texto que el workflow de Claude impondría: el carril en un protocolo es una instrucción,
  no una fase.
- Si el fix del 430 da un rol al recorrido, `--role review` es el lugar natural para que el carril gradúe la revisión
  sin depender del pedido; los dos casos se tocan ahí.

## Contexto de descubrimiento

Instancia de una empresa, 2026-10-21: al medir el costo por rol del primer release de la línea `pagos`, quien aprueba
notó que «los carriles normales que ya tenemos no están funcionando».

## Relacionados

- 430 (el mismo traspaso, sin rol).

## Cierre

**Resuelto en 0.114.0**, a pedido del dueño el 2026-10-21. La forma la eligió él: `PROTOCOL.md` dice por carril lo
que hace el recorrido, y una prueba compara las dos.

`PROTOCOL.md`, «Lanes», tiene ahora una tabla con las fases que corre cada carril de Ready a Done y qué QA le toca. La
divergencia era de texto, y la tabla dice lo que hace `automatization/workflows/autobuild.js` (`:1347`, `:1403`,
`:1488`, `:1503`, `:1803`, `:2138`):

- `lite` saltea Decompose y Critique, y su QA es la comprobación de aceptación más barata;
- en `express` y `directo` Ready corre igual cuando el carril lo escribió una persona.

El caso, sección por sección:

- **Resumen, la divergencia.** La tabla la cierra, y `test/workflows/autobuild-lanes-table.test.js` corre el recorrido
  en cada carril y compara las fases con la tabla, en los dos sentidos.
- **Resumen, el skill.** Ya no dice «ejecuta Build, Review, Verify y QA en orden» para toda tarea: manda a las fases
  de su carril, con la tabla. Lo mismo el comando de Gemini, que no usa el skill y el caso daba por cubierto con él.
- **Resumen, el traspaso.** `teamwork.md` dice que quien construye corre las fases de su carril hasta Commit, y que
  quien revisa revisa y hace QA con el `lane:` del WIP.
- **Síntoma, los dos subagentes de revisión.** No los pide ningún carril, y la tabla no los nombra: el recorrido corre
  un solo agente de revisión en todos (`autobuild.js:1780-1784`). Venían del pedido armado a mano, que ahora tiene de
  dónde sacar el carril. Que quien arma el pedido lo use no lo puede garantizar Cauce, y por eso el 430 le da al
  recorrido el rol: con `--role review` el carril lo aplica el recorrido, no el pedido.
- **Fix propuesto, «que el skill lea el carril».** Hecho, por la tabla. «Que una tarea pese lo mismo en cualquier
  runner» lo sostiene la prueba para el recorrido de Claude; en los demás es una instrucción, como decía el segundo
  tradeoff.
- **Tradeoffs, el largo.** `PROTOCOL.md` creció nueve líneas, que cada runner carga entero.
- **Tradeoffs, el agente que ignora el texto.** Sigue en pie y no se puede cerrar desde acá: fuera de Claude el carril
  es una instrucción. Lo único que lo acota es que la instrucción ahora es una tabla que no contradice al recorrido.
- **Prioridad.** No traía condición de escalada.

**Lo que se corrió para saber que funciona.**

- `test/workflows/autobuild-lanes-table.test.js`, nueva. Contra el `PROTOCOL.md` de HEAD da rojo en dos de sus tres
  pruebas: no había tabla que leer. Tres mutaciones en una copia fuera del árbol, con la copia en verde antes, se
  ponen rojas:
  - la tabla dándole Critique a `lite`, en «cada carril corre exactamente las fases que la tabla le da»;
  - el recorrido dándole Critique a `lite`, en la misma;
  - el recorrido salteando Ready en los mecánicos escritos a mano, en «escrito a mano, un carril mecánico corre
    además Ready».
- Lo que reciben los tres runners sin recorrido, comprobado instalando en una instancia nueva: el `SKILL.md` de
  Antigravity (`.agents/plugins/cauce/skills/autobuild/`) y el de Codex (`.agents/skills/autobuild/`) dicen «ejecuta en
  orden las fases que pide su carril —el de la tarea, en la tabla de «Lanes» de `PROTOCOL.md`—», y el comando de
  Gemini, lo mismo.
- Lo que hace un agente con la tabla **no está medido**. Las corridas reales del 430 se instalaron antes de este
  cambio, así que leyeron el skill con el rol y sin la tabla, y no cuentan como prueba de éste. Medirlo pide correr
  una tarea de cada carril en un runner sin recorrido y leer su conversación fase por fase; salió como el **caso
  433**, que dice cómo medirlo.
