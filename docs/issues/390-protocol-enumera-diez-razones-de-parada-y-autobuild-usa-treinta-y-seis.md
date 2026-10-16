---
caso: 390
titulo: PROTOCOL enumera diez razones de parada y autobuild usa treinta y seis
estado: abierto
prioridad: baja
version-detectada: 0.108.0
---

# 390 — `PROTOCOL.md` dice que «toda parada se nombra con una de éstas» y enumera diez; `autobuild` para con treinta y seis nombres distintos, y cuatro de los diez no los usa nunca

**🔴 abierto** · detectado en 0.108.0 · prioridad **baja** — nada falla, pero la lista que una empresa recibe como
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
