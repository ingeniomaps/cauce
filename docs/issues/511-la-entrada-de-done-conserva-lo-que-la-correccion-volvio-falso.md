---
caso: 511
titulo: La entrada de DONE conserva los supuestos que la corrección de Review volvió falsos, y se commitea con la contradicción a la vista
estado: resuelto
resuelto-en: 0.121.0
prioridad: media
version-detectada: 0.120.0
---

# 511 — La entrada de DONE conserva los supuestos que la corrección de Review volvió falsos, y se commitea con la contradicción a la vista

**🟢 resuelto en 0.121.0** · detectado en 0.120.0 · prioridad **media**: DONE es la evidencia que se lee sola dentro de tres meses
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

## Cierre

`review-fix` devuelve con esquema (`AMENDED`) qué notas de construcción dejó sin efecto, por su número, y cuáles agrega;
`buildNotes` se recalcula con eso, sin repetir y con el tope de `INBOX_CAP`, y es lo que llega a `decisions:`. En el camino
de dos sesiones, la entrega devuelta reemplaza las notas de la anterior, y Build repite las que siguen valiendo.

Línea de base: la entrada de DONE de la corrida del 2026-11-14 (commit `e16d096` del proyecto de prueba), con los dos
supuestos que la corrección había vuelto falsos.

Contra el caso:

- **Fix 1, la corrección devuelve las notas que siguen en pie:** se hizo distinto. Contesta qué notas deja sin efecto y
  cuáles agrega, en vez de reescribirlas todas: así una corrección que no las mira no las borra.
- **Fix 1, lo mismo en la entrega acumulada:** se hizo.
- **Fix 2, frenar el commit si el cierre ve una contradicción:** se decidió que no, por ahora. Con las notas al día, la
  contradicción que el cierre vio en la corrida no se arma; frenar por la que detecte el propio cierre es otra decisión.
- **Tradeoff, perder una nota que seguía valiendo:** atendido. La corrección no la reescribe: sólo la saca si la nombra.
- **Tradeoff, una vuelta de modelo más:** no hay vuelta más. Es la misma llamada, con esquema.

Lo que el caso no preveía: una corrección que no contesta ahora frena con `agent-unavailable`; antes seguía a la
re-revisión sin saber qué notas quedaban.

### Lista de cierre

1. hecho: la entrada de DONE de la corrida del 2026-11-14, con sus dos contradicciones.
2. hecho: en la rama `fix/e2e-120-findings`.
3. hecho: «las notas que la corrección deja sin efecto no llegan a done/», en `autobuild-review-rounds.test.js`, y la
   del handoff en `autobuild-roles.test.js`, en rojo antes y en verde después.
4. hecho: mutaciones en rojo en una copia: sin recalcular, sin las nuevas, el handoff con las notas de las dos entregas, y
   Build sin el pedido de repetir las que siguen.
5. hecho: lo que se quita es el arrastre de notas viejas. Las pruebas afirman que la nota dejada sin efecto no aparece en
   lo que llega a DONE y que el handoff ya no dice «seguidos de éstos».
6. no aplica: la persona decidió el 2026-11-15 cerrarlo sin la corrida real con corrección. La de `/autobuild` (sesión
   129bad91) no tuvo vuelta de corrección —Review aprobó de una—, así que el camino nuevo corrió sólo en el arnés. Otra
   costaba unos USD 10 sin garantía de que Review mandara a corregir, y una sola no mide si el modelo contesta bien las
   notas.
7. no aplica: por la misma decisión del punto 6, lo que depende del modelo queda en «Sin probar».
8. hecho: en el arnés corrieron la sesión sola con corrección y el camino de dos sesiones; en real, una sesión sola sin
   corrección.
9. no aplica: no coordina nada entre runners ni raíces.
10. hecho: el arnés de `autobuild` contesta la corrección con un esquema por defecto, y las pruebas de vueltas de
    corrección (caso 343 y 484) siguen en verde.
11. hecho: tres pasadas independientes; la primera pidió deduplicar y acotar las notas nuevas, y se hizo.
12. hecho: pasada uno por uno sobre el diff.
13. hecho: `npm run ci` con los cambios stageados: 1806 pruebas, 0 fallas.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.121.0`, y entrada en el CHANGELOG.

**Sin probar:** una corrida real de `/autobuild` con una vuelta de corrección de Review.
