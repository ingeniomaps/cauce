---
caso: 457
titulo: La mutación que nombra una condición por su número —«pone en rojo la (5)»— se cuenta como una condición más, y una tarea de cinco condiciones cruza el umbral de R17 con siete
estado: resuelto
resuelto-en: 0.117.1
prioridad: media
version-detectada: 0.117.0
---

# 457 — La mutación que nombra una condición se cuenta como otra condición

**🟢 resuelto en 0.117.1** · detectado en 0.117.0 · prioridad **media**: no rompe nada, pero `check` falla en rojo sobre tareas que
están dentro del umbral, y la salida que ofrece —`(sin partir: <razón>)`— obliga a escribir una razón falsa.

## Resumen

`acceptanceConditions` (`engine/planning/parser.js:193-199`) cuenta las condiciones de una aceptación marcada como
todas las ocurrencias de `(N)` en el texto (`:196`). La forma que pide el protocolo para la mutación —«Mutación: … pone
en rojo la (1)»— nombra la condición por el mismo marcador, así que cada referencia suma una condición que no existe.
Con una mutación por condición, una tarea de cinco se cuenta como siete o más.

## Reproducción

Medido en la instancia de una empresa el 2026-10-26, con 0.117.0. La línea de BACKLOG de una de sus tareas
tenía cuatro condiciones, `(1)` a `(4)`, y una mutación que citaba la `(1)`: el contador daba 5 y `check` pasaba. Al
sumarle la condición `(5)` con su mutación —«… pone en rojo la (5)»— `node tools/ops.js check planning` salió con:

```
✗ BACKLOG <tarea>: condiciones de aceptación: 7 (umbral 5 de R17). Revisá si son dos resultados con
vidas distintas y partilo; si es uno solo, partirlo lo empeora — dejalo entero agregando "(sin partir: <razón>)"
```

Lo mismo en otras dos tareas de esa instancia, las dos con cinco condiciones reales.
Reescribir sólo las referencias de la mutación como «la condición 1» y «la condición 5», sin tocar las condiciones,
dejó `check` en verde: `✓ planning válido`.

## Causa

`engine/planning/parser.js:196`: `(text.match(/\(\d+\)/g) || []).length` no distingue el marcador que abre una
condición del que la cita. La aceptación entera, mutación incluida, llega como un solo texto (`ACCEPTANCE`, en
`taskFromLine`, `:209`).

## Qué haría falta

- Contar marcadores distintos y no ocurrencias, o contar sólo los que aparecen antes de `Mutación:`. Lo primero
  alcanza para la forma de hoy; lo segundo también cubre una mutación que nombre una condición que no existe.
- Una prueba con la forma del protocolo: cinco condiciones y una mutación por cada una dan 5.
- Revisar si el molde o `PROTOCOL.md` muestran una mutación que cita «la (N)»: si la forma que se enseña es la que
  dispara el falso rojo, el ejemplo también cambia.

## Cierre

**Resuelto en 0.117.1.**

- **Contar marcadores distintos y no ocurrencias, o contar sólo los anteriores a `Mutación:`.** Se hizo lo primero:
  `acceptanceConditions` (`engine/planning/parser.js`) cuenta el conjunto de `(N)` distintos. Lo segundo se decidió
  que no: ata la cuenta a una palabra del texto —la forma que `AGENTS.md` prohíbe para decidir— y lo que agrega, una
  mutación que cite una condición inexistente, no es un falso rojo que alguien sufra. Esa forma sigue sumando, y se
  ve: la aceptación cita una condición que no escribió.
- **Una prueba con la forma del protocolo.** Se hizo en `test/planning/backlog.test.js`: cinco condiciones con una
  mutación que cita la (1) y la (5) dan 5, y una sola condición citada por su mutación sigue siendo un marcador suelto
  —da 1—. Con la cuenta por ocurrencias, la primera aserción salió en rojo con `actual: 7, expected: 5`; ésa es la
  mutación, y con el arreglo pasan las 11 pruebas del archivo.
- **Revisar si el molde o `PROTOCOL.md` enseñan la forma «la (N)».** Se hizo y no la enseñan: `grep -rn "rojo la ("`
  sobre `template/`, `engine/` y `agents/` no devuelve nada, así que no hay ejemplo que cambiar.

Prueba real, en un banco de medición (`ops bench suelto`) con una tarea de cinco condiciones y la mutación del caso:
`check` de 0.117.0 —corrido desde una copia de `main`— salió con «condiciones de aceptación: 7 (umbral 5 de R17)», y
el de la rama con `✓ planning válido: 0 épica(s), 1 tarea(s) en cola`. Con una sexta condición, el de la rama vuelve a
frenar con «condiciones de aceptación: 6»: el umbral sigue en pie.
