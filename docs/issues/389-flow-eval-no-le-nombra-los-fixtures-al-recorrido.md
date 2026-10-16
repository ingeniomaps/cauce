---
caso: 389
titulo: flow-eval copia los fixtures del caso al banco y no se los nombra ni al recorrido ni al juez
estado: resuelto
resuelto-en: 0.108.0
prioridad: alta
version-detectada: 0.107.0
---

# 389 — El banco de un caso de recorrido trae sus fixtures en la raíz, pero `flow-eval` le pasa al recorrido sólo el texto del pedido; el recorrido no sabe que el archivo está y frena pidiéndolo

**🟢 resuelto en 0.108.0** · detectado en 0.107.0 · prioridad **alta** — 22 de los 34 casos de recorridos traían fixtures, y
sus veredictos se midieron con el recorrido sin enterarse de lo que el caso le entregaba.

## Resumen

`evaluationBench` (`engine/cli/bench.js:246-247`) copia los fixtures de un caso a la raíz de su banco, igual para
un cargo que para un recorrido. `agent-eval` se los nombra al cargo y al juez (`agent-eval.js:178-183` y el
párrafo de procedencia del juez). `flow-eval` no: le pasa al recorrido `intent: item.request` y al juez el mismo
texto, y la lista `fixtures` que trae el schema no se usa en ningún lado.

El recorrido no tiene por qué buscar en la raíz de la instancia un archivo que nadie le nombró. Frena en la
primera etapa pidiendo justo lo que el caso le había dado, y el caso deja de medir lo que dice medir.

## Reproducción

Corrida `wf_c797bedb-aae`, 2026-10-16, `flow-eval` sobre `product-development` con
`cases: 04-epic-as-greenlight`. El caso trae `epica-devoluciones.md`, y el banco la tenía:

```
$ find .cauce-eval/product-development -name epica-devoluciones.md
.cauce-eval/product-development/04-epic-as-greenlight/epica-devoluciones.md
```

## Síntoma

```json
{
  "stopped": true,
  "reason": "gate-no-cumplido",
  "detail": "frame: La épica, o dónde está, y la evidencia de descubrimiento que la sostiene. …"
}
```

El juez lo dio por bueno: comprobó que `planning/roadmap/` sólo tenía la plantilla y concluyó que el recorrido
había frenado por la razón correcta. No sabía que la épica estaba en la raíz, porque el prompt tampoco se lo
dijo. El registro no menciona el fixture ni una vez.

## Causa raíz

`automatization/workflows/flow-eval.js:145`: `workflow('flow', { flow: FLOW, intent: item.request, … })`. El
juez, en el mismo archivo, cita `item.request` y no tiene párrafo de fixtures. Cuando `agent-eval` aprendió a
nombrarlos, el gemelo quedó afuera —el encabezado de `test/workflows/workflows-eval.test.js` cuenta cinco
arreglos que entraron en uno y no en el otro—, y la prueba de los dos no exigía éste.

## Fix propuesto

Que la intención que recibe el recorrido nombre los archivos que trae el caso, porque es lo único que el
recorrido recibe, y que el juez lea esa misma intención con el aviso de procedencia que ya tiene `agent-eval`:
los archivos estaban antes de que el recorrido trabajara y no son obra suya.

## Tradeoffs

- Cambia lo que el recorrido recibe en 22 casos —23 con el fixture que gana `04-recommendation-as-approval`—, así que sus veredictos dejan de medir el instrumento de hoy.
  Volver a medirlos todos cuesta alrededor de 0,65 M por caso. Se decide con los dos primeros a la vista, no de
  antemano.
- Un caso que cita un documento y no lo adjunta, como `04-recommendation-as-approval`, no se arregla con esto:
  hay que darle el fixture.

## Contexto de descubrimiento

Corriendo los dos casos de `flow-eval` que el CHANGELOG de 0.108.0 nombraba como pendientes. Los dos frenaron en
`frame`; uno tenía fixture y lo pidió igual, el otro no lo tenía y el juez lo reprobó por un comportamiento que
sin ese documento era inalcanzable.

## Relacionados

- 387: el otro defecto del instrumento encontrado en la misma tanda, en la fase anterior.

## Cierre

**Resuelto en 0.108.0**, que todavía no se publicó. Recorrido contra el caso entero:

- **Fix propuesto: se hizo.**
  - `flow-eval` arma la intención con `intentOf`: el pedido y, si el caso trae fixtures, la lista de archivos
    con «Leelos antes de responder».
  - El recorrido recibe esa intención, y el juez lee la misma, más el aviso de procedencia que ya tenía
    `agent-eval`: los archivos estaban antes y no son obra del recorrido.
- **Tradeoff de los 22 veredictos medidos sin fixtures: no se volvieron a medir, salvo estos dos.** Volver a medir
  los otros 20 queda como decisión aparte, con estos dos a la vista.
- **Tradeoff del caso sin fixture: se hizo.** `04-recommendation-as-approval` gana
  `informe-viabilidad-devoluciones.md`, el informe que el pedido da por hecho, escrito en el mismo dominio que
  su gemelo de `product-development` y sin dictarle al recorrido qué contestar.

**Prueba corrida.**

- `test/agents/eval.test.js` suma una prueba que corre `flow-eval` con un caso que trae un fixture. Comprueba
  que la intención que recibe el recorrido lo nombra, y que el prompt del juez también lo nombra y dice que no
  es obra suya. Estaba en rojo antes del arreglo.
- Tres mutaciones en una copia del árbol, cada una en rojo (6 de 7):
  - devolverle al recorrido `item.request`;
  - devolverle al juez `item.request`;
  - quitarle al juez el aviso de procedencia.
- Corrida real de los dos casos, con el `flow.js` renderizado al día:
  - `product-development` / `04-epic-as-greenlight` (`wf_3cdf50e0-fd3`): **pasa**. Antes pedía «la épica, o
    dónde está». Ahora frena en `frame` con razones que salen de la épica: la evidencia de 2022 vencida, las
    decisiones C3 y C4 sin tomar, y nadie con autoridad para promover. Además deja un informe parcial y una
    fila de acción humana.
  - `feasibility-review` / `04-recommendation-as-approval` (`wf_ada8f8d2-c4a`): **pasa**. Antes no pasaba,
    frenado en `frame`. Ahora corre tres etapas, cita el informe por su nombre, cierra en `investigate` sin
    promover, y escribe tres informes de etapa, seis acciones humanas y una entrada de INBOX.
- Los registros de las dos corridas anteriores, medidas con el instrumento roto, no se commitean, porque
  juzgan al instrumento y no al recorrido. Se nombran por su corrida: `wf_c797bedb-aae` y `wf_e7c860cc-fae`.

**Lo que el caso no preveía.** Estos dos casos estaban en el CHANGELOG de 0.108.0 como los que «tocan lo que
cambió» —las líneas y `## Hitos` en la épica—, y no lo tocan: ninguno llega a escribir una épica, y el banco no
tiene líneas. Esa medición la siguen dando las tres corridas reales de `/flow` que el CHANGELOG ya describe.
