---
caso: 290
titulo: verify-hollow para por una condición declarada fuera de verify
estado: resuelto
resuelto-en: 0.103.2
prioridad: media
version-detectada: 0.103.1
---

# 290 — Una condición marcada `(fuera de verify: …)` frena igual el recorrido si Verify la devuelve sin cubrir

**🟢 resuelto en 0.103.2** · detectado en 0.103.1 · prioridad **media**.

**Prioridad media**: la marca existe para que esa condición no frene, y con ella puesta la corrida para por lo mismo.

## Resumen

El caso 195 separó las condiciones que la aceptación declara fuera de Verify: no se le mandan. Pero Verify
conoce la tarea entera —está en el WIP y en la cola— y puede devolverla igual en `uncovered`. El recorrido
no la reconoce como la que apartó, la cuenta como sin cubrir y para con `verify-hollow`.

## Reproducción

Corrida real con 0.103.1. La aceptación traía cuatro condiciones, la cuarta marcada `(fuera de verify: …)`:
que el job e2e del CI de la rama quede en verde, que sólo se puede observar con la rama empujada.

## Síntoma

La parada, entre lo que le falta una prueba:

```
verify-hollow — sin test que lo codifique: …; 4. El job e2e del CI de la rama queda en verde
```

## Causa raíz

`automatization/workflows/autobuild.js`, fase Verify: `outOfVerify` se usa para armar lo que se le pide a
Verify y para Done, y no para leer lo que Verify contesta. `lacking()` cuenta todo `uncovered` que no sea
`no-surface`.

## Fix propuesto

Descartar de `uncovered` lo que coincida con una condición declarada fuera.

## Tradeoffs

- Verify reescribe la condición —la numera, le saca la marca—, así que no se puede comparar texto exacto. Una
  comparación por palabras puede confundir una condición que sí toca con una declarada fuera que se le
  parezca mucho.

## Contexto de descubrimiento

La misma corrida del 289.

## Relacionados

- 195 — la marca `(fuera de verify: …)`.
- 189 — lo que no tiene superficie no frena.

## Cierre

**Resuelto en 0.103.2.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo**, también para la causa `ambiguous`, que paraba por el otro camino.
- **Tradeoff — se paga, acotado.** Cuenta como la misma cuando comparte al menos seis de cada diez palabras
  de la más corta de las dos. La condición que de verdad falta sigue frenando, y tiene su prueba.

### Qué se corrió

- **La forma de la corrida real, en el arnés**: Verify devuelve «2. El job e2e del CI de la rama queda en
  verde» sin cubrir, con la condición marcada fuera en la aceptación. Antes paraba con `verify-hollow`; ahora
  cierra. Con otra condición sin cubrir al lado, para y nombra sólo ésa.
- **Tres mutaciones en rojo**, en una copia: lo declarado fuera frenando otra vez, todo contando como
  declarado fuera, y el criterio ambiguo declarado fuera frenando.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una corrida real con una aceptación así.
