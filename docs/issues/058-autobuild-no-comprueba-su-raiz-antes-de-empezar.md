---
caso: 058
titulo: `autobuild` no comprueba que su raíz sea legible antes de empezar, y falla tarde y con otro nombre
estado: resuelto
resuelto-en: 0.71.0
prioridad: baja
version-detectada: 0.71.0
---

# 058 — La raíz del recorrido se da por buena hasta que algo la usa

**🟢 resuelto en 0.71.0** · detectado en 0.71.0 · prioridad **baja** — ya no produce daño; produce un diagnóstico que manda a mirar el lugar equivocado

## Resumen

`ROOT` viaja escrito dentro del workflow —lo completa `automation install`— y es **relativo al cwd de los
agentes**. Cuando ese cwd no es la carpeta esperada, todas las rutas del recorrido resuelven a
`<empresa>-ops/<empresa>-ops/...` y ninguna existe. Basta con que la sesión haya hecho `cd` a la raíz de
ops, que es lo natural: ahí viven `tools/ops.js` y el `Makefile`.

Nada comprueba esa raíz al arrancar. Triage lee `AGENTS.md`, `workspace.md`, `ops.config.json` y
`PROTOCOL.md` con un agente, y un agente que no encuentra un archivo lo reporta y sigue.

Desde 0.71.0 esto ya **no produce daño**: la corrida para en Pick con `context-unavailable`, y el
recorrido tampoco promueve nada —el [062](062-la-recurrencia-no-se-promueve-y-la-epica-si.md) le quitó la
expansión—, así que lo peor que puede pasar es una corrida perdida. Lo que queda es que para **tarde**
—después de gastar Triage— y con un mensaje que habla del planning, así que manda a revisar la ruta de
`planning` cuando lo que está mal es el `ROOT` del que esa ruta cuelga.

## Reproducción

1. Instancia `sidecar` con `automation install`, cuyo `ROOT` quedó como `<empresa>-ops/`.
2. Abrir la sesión **dentro** de `<empresa>-ops/` en vez de en su padre.
3. Lanzar `autobuild`.
4. La corrida gasta Triage y para en Pick diciendo que no se pudo leer `<empresa>-ops/planning`. Esa ruta
   existe; la que no existe es `<empresa>-ops/<empresa>-ops/planning`, que es contra la que resolvió.

## Síntoma

De la corrida del 2026-09-08, antes de los arreglos del 056 y el 062 —cuando además promovía una
épica—:

```
Triage → planning-context   hasTask: false, queued: 0
```

Hoy el final es distinto y el principio es el mismo: Triage corre entero sobre rutas que no existen sin
decir nada.

## Causa raíz

`automatization/shared/workflow-root.js`:

```js
const ROOT = '{{OPS_DIR}}'.replace(/\/+$/, '') || '.'
```

El comentario declara la dependencia —«relativo a la carpeta donde se abre la herramienta, que es el cwd
de los agentes»— y esa premisa no se comprueba en ningún lado.

`automatization/workflows/autobuild.js`, fase Triage: lee el contrato con un agente y no afirma que los
archivos existan.

## Fix propuesto

Lo que el caso 056 sugería —«una sola línea al arrancar Triage: ¿existe `${CONFIG}`?»— **no se puede
escribir así**: el runtime de workflows no expone `process`, que es la razón por la que `ROOT` viaja
escrito en primer lugar. No hay `fs` para preguntarlo.

Quedan dos vías, y ninguna es gratis:

- **Que el propio Triage lo afirme.** Ya lee `ops.config.json` con un agente; alcanzaría con que su
  esquema tenga un campo que diga si lo encontró, y parar ahí. Cuesta un campo y ningún agente extra,
  y es la misma forma que 0.71.0 usó con `readOk` para el planning.
- **Que `ROOT` deje de ser relativo.** Es el arreglo de fondo y el más caro: cambia lo que
  `automation install` escribe en cada instancia instalada.

La primera es la que se parece a lo que ya funcionó.

## Tradeoffs

- Un campo más en el esquema de Triage es una respuesta más que el modelo puede completar mal, que es
  exactamente el modo de fallo que `readOk` tuvo que cubrir con una instrucción explícita en el prompt.
- Hacer `ROOT` absoluto rompería toda instancia instalada hasta su próximo `automation install`, y
  `upgrade` no reescribe los workflows del proyecto.
- **No medido**: no se sabe con qué frecuencia alguien lanza el recorrido desde el cwd equivocado. Se
  observó una vez.

## Contexto de descubrimiento

Cerrando el caso 056. Es su «Causa raíz 0», la única capa que ese arreglo no tocó: allá se cerró el daño
—ya no promueve— y quedó pendiente que el recorrido falle temprano y con el nombre correcto.

## Relacionados

- [062](062-la-recurrencia-no-se-promueve-y-la-epica-si.md) — le quitó al recorrido la expansión, así que
  el daño que esta capa habilitaba pasó de «promueve trabajo que nadie aprobó» a «gasta una corrida».

- [056](056-un-planning-inexistente-se-lee-como-cola-vacia.md) — de donde sale, y quien cerró el daño que
  esta capa habilitaba.
- [057](057-la-expansion-de-una-epica-no-dice-quien-la-escribio.md) — el otro que salió del mismo cierre.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró:

- **Se tomó la primera de las dos vías: que Triage lo afirme.** El esquema del contrato suma `rootOk`, el
  prompt lo ata a haber encontrado y leído los cuatro archivos, y el recorrido para si no. Es la forma que
  ya había funcionado con `readOk` para el planning, y cuesta un campo y ningún agente más — tal como el
  caso anticipaba.
- **La segunda vía —«que `ROOT` deje de ser relativo»— no se tomó, y sigue siendo el arreglo de fondo.**
  Lo que la activaría es que esto vuelva a pasar con la comprobación puesta: ahí el problema no sería el
  diagnóstico sino la ruta.
- **Y el fix que el caso 056 había sugerido sigue sin poder escribirse**, por lo que este caso ya decía: el
  runtime de workflows no expone `process`, así que no hay `fs` con el que preguntar si `${CONFIG}` existe.
  Preguntárselo al agente que ya lee esos archivos es lo que evita gastar uno nuevo.
- **Tradeoff «un campo más que el modelo puede completar mal» — se pagó, y se cubrió el modo de fallo que
  importa.** Si lo omite, el esquema lo deja en indefinido y el recorrido **para igual**: comprobado con
  un contrato sin el campo. Lo que queda sin cubrir es que lo ponga en `true` mintiendo, que es el mismo
  residuo que `readOk` y no se puede cerrar desde acá.
- **Tradeoff «hacer `ROOT` absoluto rompería toda instancia instalada» — no se pagó**, porque esa vía no se
  tomó.
- **Tradeoff «no medido: no se sabe con qué frecuencia se lanza desde el cwd equivocado» — sigue sin
  medirse.** Se observó una vez. No cambió la decisión: lo que la sostiene no es la frecuencia sino que el
  diagnóstico mandaba al lugar equivocado, y eso cuesta lo mismo la primera vez que la décima.
- **El daño que este caso describía ya era menor cuando se arregló**, y quedó anotado al pasar: el
  [062](062-la-recurrencia-no-se-promueve-y-la-epica-si.md) le quitó al recorrido la expansión, así que lo
  peor que podía pasar era una corrida perdida. Lo que se arregla acá es el diagnóstico, no el daño.

**Probado con las dos mutaciones que importan**: quitar la parada, y devolver el mensaje a nombrar el
planning —que era exactamente el defecto—. Las dos enrojecen.

Lo que el caso no preveía: **el motivo de parada tenía que ser nuevo.** `contract-unavailable` ya existía y
se dispara cuando el agente no devuelve nada, que es otra cosa; reusarlo habría vuelto indistinguibles «el
modelo no contestó» y «la raíz no está», que es la misma confusión que este caso vino a deshacer un nivel
más abajo.
