---
caso: 207
titulo: lo que el Review mandó a corregir no queda en done/
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 207 — El hecho de revisión que llega a `done/` dice el veredicto, no qué se corrigió

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: no rompe ninguna entrega, pero borra el único dato con el que se puede ver que la
misma falla se corrige una y otra vez. Sube a alta el día que se decida construir el aprendizaje sobre
las revisiones (idea A del plan del 2026-10-01): sin esto no tiene qué contar.

## Resumen

Lo que Review deja anotado sin frenar va al INBOX con su origen, y lo que deja como decisión va a
`HUMAN_ACTIONS.md`. Lo que **manda a corregir** se corrige en `review-fix` y desaparece: el hecho que
viaja a la entrada de `done/` lleva el veredicto, quién revisó y qué inspeccionó. Si la misma falla se
corrige en diez tareas, ninguna entrada lo dice.

## Reproducción

```bash
grep -n "reviewFact" automatization/workflows/autobuild.js
sed -n 1064p automatization/workflows/autobuild.js
sed -n 1021,1024p automatization/workflows/autobuild.js
```

## Síntoma

```
992:  let reviewFact = 'no corrió (el carril express no convoca revisor)'
1064:    reviewFact = `${review.verdict} por ${cast.review}, sobre ${review.consulted.join(', ')}`
1085:      reviewFact += ` · ${noted.length - kept.length} anotado(s) sin volcar al INBOX`
1207:    `review=${reviewFact}; fases=${ran.join(' → ')}; build=${build.summary}; ` +
```

Los bloqueantes sólo aparecen en el pedido de corrección:

```
      await write(`Corregí sólo estos hallazgos con evidencia y actualizá el WIP: ${blockers(review).join('; ')}. `
```

y no se suman a `reviewFact` en ningún punto.

## Causa raíz

`automatization/workflows/autobuild.js:1064` arma el hecho de revisión sin los bloqueantes de la primera
pasada, que existen en `review.concerns` hasta la línea 1025 y se pierden cuando `review` se reasigna
con la re-revisión.

## Fix propuesto

Guardar los bloqueantes de la primera pasada antes de reasignar `review`, y sumarlos a `reviewFact` como
lista corta, cada uno con su `ref` (caso 206): `corregido: [<ref> — <detalle de una línea>]`. Con tope,
como el INBOX, y contando lo que pasa del tope.

Al mejorar el caso hay que mirar `engine/planning/` —el parser de las entradas de `done/`— para confirmar
que el campo nuevo no rompe la lectura y que las entradas viejas siguen válidas.

## Tradeoffs

- La entrada de `done/` crece una línea por tarea que tuvo correcciones.
- Sin el 206 el registro existe pero no se puede agrupar: dos correcciones de lo mismo dichas con
  palabras distintas no se ven como repetición. Por eso va después del 206.

## Contexto de descubrimiento

Revisión de los repositorios de Dropi del 2026-10-01: `pr-lessons` aprende de los hallazgos que el
equipo aceptó y cuenta sus repeticiones entre PRs (`dropi-tools-skills`, rama
`feature/TECH-1663-pr-lessons-skill-learn-from-merged-reviews`, `skills/pr-lessons/references/curation.md:6-17`
y `:78-90`). Buscando de dónde sacaría cauce ese dato apareció que no lo guarda.

## Relacionados

- 206 — da el `ref` que hace agrupable el registro. Va antes.
