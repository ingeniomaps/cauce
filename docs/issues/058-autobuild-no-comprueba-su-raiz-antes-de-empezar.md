---
caso: 058
titulo: `autobuild` no comprueba que su raíz sea legible antes de empezar, y falla tarde y con otro nombre
estado: abierto
prioridad: baja
version-detectada: 0.71.0
---

# 058 — La raíz del recorrido se da por buena hasta que algo la usa

**🔴 abierto** · detectado en 0.71.0 · prioridad **baja** — ya no produce daño; produce un diagnóstico que manda a mirar el lugar equivocado

## Resumen

`ROOT` viaja escrito dentro del workflow —lo completa `automation install`— y es **relativo al cwd de los
agentes**. Cuando ese cwd no es la carpeta esperada, todas las rutas del recorrido resuelven a
`<empresa>-ops/<empresa>-ops/...` y ninguna existe. Basta con que la sesión haya hecho `cd` a la raíz de
ops, que es lo natural: ahí viven `tools/ops.js` y el `Makefile`.

Nada comprueba esa raíz al arrancar. Triage lee `AGENTS.md`, `workspace.md`, `ops.config.json` y
`PROTOCOL.md` con un agente, y un agente que no encuentra un archivo lo reporta y sigue.

Desde 0.71.0 esto ya **no produce daño**: la corrida para en Pick con `context-unavailable` en vez de
promover una épica. Lo que queda es que para **tarde** —después de gastar Triage— y con un mensaje que
habla del planning, así que manda a revisar la ruta de `planning` cuando lo que está mal es el `ROOT` del
que esa ruta cuelga.

## Reproducción

1. Instancia `sidecar` con `automation install`, cuyo `ROOT` quedó como `<empresa>-ops/`.
2. Abrir la sesión **dentro** de `<empresa>-ops/` en vez de en su padre.
3. Lanzar `autobuild`.
4. La corrida gasta Triage y para en Pick diciendo que no se pudo leer `<empresa>-ops/planning`. Esa ruta
   existe; la que no existe es `<empresa>-ops/<empresa>-ops/planning`, que es contra la que resolvió.

## Síntoma

De la corrida del 2026-09-08, antes del arreglo del 056 —cuando además promovía—:

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

- [056](056-un-planning-inexistente-se-lee-como-cola-vacia.md) — de donde sale, y quien cerró el daño que
  esta capa habilitaba.
- [057](057-la-expansion-de-una-epica-no-dice-quien-la-escribio.md) — el otro que salió del mismo cierre.
