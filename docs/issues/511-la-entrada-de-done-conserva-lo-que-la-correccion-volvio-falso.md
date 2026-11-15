---
caso: 511
titulo: La entrada de DONE conserva los supuestos que la corrección de Review volvió falsos, y se commitea con la contradicción a la vista
estado: abierto
prioridad: media
version-detectada: 0.120.0
---

# 511 — La entrada de DONE conserva los supuestos que la corrección de Review volvió falsos, y se commitea con la contradicción a la vista

**🔴 abierto** · detectado en 0.120.0 · prioridad **media**: DONE es la evidencia que se lee sola dentro de tres meses
(R14), y acá afirma un cambio de comportamiento que el código final no tiene.

## Resumen

En `/autobuild`, Build escribe sus `decisions:` en la primera vuelta. Si Review manda a corregir y Build corrige, las
`decisions:` de la primera vuelta siguen en la entrada aunque la corrección las haya vuelto falsas. El cierre ve la
contradicción —la reporta al terminar como «dos contradicciones en la evidencia»— y la commitea igual.

## Reproducción

`claude -p '/autobuild --max 1'` sobre una tarea donde Review mande a corregir algo que Build había anotado como decisión.
En la corrida del 2026-11-14 (sesión ed6e47f4, USD 11,43): Build cambió el redondeo del total sin cupón y lo anotó como
supuesto aceptado; Review lo marcó como alcance accidental; Build lo revirtió.

## Síntoma

`planning/done/aplicar-cupon-porcentaje-al-total.md`, commit `e16d096`:

```
done: … sin cupón devuelve la expresión anterior sin cambios … Barrido sin cupón contra la fórmula anterior, precios
      0,01..2000,00 con qty 1: 0 diferencias.
decisions: [supuesto: El subtotal ahora se redondea a centavos antes de calcular el impuesto. Antes el impuesto se
      calculaba sobre el subtotal sin redondear. …]; … [supuesto: La mutación se corrió sobre ./src/cart.js en el árbol
      de trabajo y se deshizo enseguida …]
qa: … La mutación declarada … corrida en memoria contra ./test/cart.test.js real … sin escribir en disco.
```

El resumen final de la corrida lo dijo: «`decisions:` dice que el subtotal ahora se redondea … Eso era de la primera
versión» y «Una de las dos versiones es falsa». La pregunta con que cierra —«¿Corrijo la entrada de DONE?»— llega con
el commit ya hecho.

## Causa raíz

- `automatization/workflows/autobuild.js:1794`: `build` es `const`, el resultado de la primera vuelta de Build.
- `autobuild.js:1853-1858`: `buildNotes` sale de `build.discovered` con `kind: 'note'`, de esa primera vuelta.
- `autobuild.js:2076-2079`: la corrección es un `write(…)` sin esquema (`label: 'review-fix'`): no devuelve `discovered`,
  así que nada de lo que la corrección cambia llega a las notas.
- `autobuild.js:2487`: «Cada entrada de notas-de-build va en decisions, con [supuesto: …]» — al escribir DONE se copian
  las notas de la primera vuelta, tal cual.

En el camino de dos sesiones (`--role build` / `review`) pasa lo mismo por otro lado: `autobuild.js:2438` suma los
`discovered` de la entrega anterior «seguidos de éstos», sin quitar los que la devolución dejó sin efecto.

## Fix propuesto

1. La corrección (`review-fix`) devuelve con esquema las notas que siguen en pie: recibe las de la vuelta anterior y
   contesta, por cada una, si sigue valiendo, más las nuevas. `buildNotes` sale de esa respuesta, no de `build`. Lo
   mismo para la entrega acumulada de `autobuild.js:2438`.
2. Antes de escribir la entrada, el cierre contrasta `decisions` contra `qa:` y `review:`; una contradicción que el
   propio cierre detecta frena el commit de DONE en vez de reportarse después.

## Tradeoffs

- (1) puede perder una decisión de la primera vuelta que seguía valiendo si la de corrección no la repite; por eso se le
  pide que las recorra, no que las olvide.
- (2) agrega una vuelta de modelo cuando hay corrección; no cuando no la hay.

## Contexto de descubrimiento

Prueba de punta a punta de 0.120.0 (2026-11-14), el mismo `/autobuild` que encontró el 510: la segunda contradicción de
la entrada sale de ahí.

## Relacionados

- 484: la re-revisión comprueba lo que mandó a corregir, y `done/` registra como `corregido:` sólo lo confirmado. Cubrió
  el lado de Review; este es el de Build.
- 510.
