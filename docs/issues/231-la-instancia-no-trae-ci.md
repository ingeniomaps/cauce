---
caso: 231
titulo: la instancia no trae CI
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 231 — `init` no deja ningún CI en la instancia, y las dos relevadas lo escribieron a mano

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: sin CI, un PR a la instancia puede romper un guard propio o el formato del planning sin que nada lo frene.

## Resumen

`init` no copia `.github/` a propósito, porque el `ci.yml` del toolkit corre `npm run ci`, que una instancia no tiene. roax-ops y conorbi-ops escribieron su propio `ci.yml`: `ops check`, las pruebas de sus guards propios, `bash -n` de los hooks y, en roax, compilar los workflows propios y escanear secretos.

## Reproducción

Verificado leyendo: `engine/cli/instance.js:104-106` dice por qué no se copia.

## Síntoma

Cada instancia rearma lo mismo, o se queda sin CI.

## Causa raíz

`engine/cli/instance.js:104-106`.

## Fix propuesto

Un `ci.yml` de molde propio de la instancia —distinto del del toolkit— con `ops check planning` y la sintaxis de hooks y workflows propios, y un modo de `check` que tolere raíces de trabajo ausentes en CI diciendo cuántas saltó.

## Tradeoffs

- Un workflow de molde es una cosa más que mantener por versión.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 223 — los hooks y workflows propios que ese CI probaría.
