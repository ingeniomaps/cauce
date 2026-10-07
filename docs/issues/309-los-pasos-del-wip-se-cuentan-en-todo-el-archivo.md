---
caso: 309
titulo: los pasos del wip se cuentan en todo el archivo
estado: resuelto
resuelto-en: 0.103.5
prioridad: baja
version-detectada: 0.103.4
---

# 309 — Una lista numerada con casilla fuera del plan cuenta como pasos del plan

**🟢 resuelto en 0.103.5** · detectado en 0.103.4 · prioridad **baja**.

**Prioridad baja**: no se vio en ninguna corrida. Se volvió caro con el 305, que para la corrida cuando el
conteo no coincide con el plan.

## Resumen

El motor cuenta los pasos de un WIP buscando `1. [ ] …` en el archivo entero. El contrato del WIP tiene
además «Decisiones tomadas» y «Bloqueos», y el recorrido manda anotar ahí las condiciones con que la crítica
aprobó el plan. Escritas como lista numerada con casilla, suman.

## Reproducción

```
## Plan aprobado
1. [x] Escribir prueba
2. [ ] Implementar

## Decisiones tomadas
1. [ ] Condición de la crítica
2. [x] Otra, ya cumplida
```

## Síntoma

`ops context --json` devuelve `complete: 2, pending: 2` sobre un plan de dos pasos. Con el 305, eso es
`wip-malformed` sobre un WIP bien escrito.

## Causa raíz

`engine/planning/parser.js`, `parseWip`: las dos expresiones corren sobre `text`.

## Fix propuesto

- Contar bajo «Plan aprobado», que es donde el contrato pone los pasos.
- Que un WIP sin ese encabezado se siga contando entero.

## Tradeoffs

- Un WIP que tenga los pasos bajo otro encabezado y además un «Plan aprobado» vacío pasa a contar cero. El
  contrato no lo permite, y `check` ya rechaza un WIP activo sin pasos.

## Contexto de descubrimiento

Una revisión independiente del diff del 305.

## Relacionados

- 305 — la comparación que lo volvió caro.

## Cierre

**Resuelto en 0.103.5.**

### El recorrido de lo que este caso enumeró

- **Contar bajo «Plan aprobado» — se hizo.**
- **Sin encabezado, entero — se hizo.**
- **Tradeoff — se paga.**

### Qué se corrió

- **El comando**, con las tres posiciones: la otra sección después del plan, antes del plan, y ningún
  encabezado. Las dos primeras dan `complete: 1, pending: 1`; la tercera cuenta todo.
- **La prueba, vista en rojo sin el arreglo**: con el `parser.js` anterior falla.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una corrida real cuyo WIP traiga una lista así. No se vio ninguna.
