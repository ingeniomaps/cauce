---
caso: 397
titulo: ops lines migrate trae el planning de la línea a la rama en que esté la instancia, sin decir que no es la viva
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.111.0
---

# 397 — `ops lines migrate` mergea la línea en el `HEAD` de la instancia, sea cual sea, y no avisa cuando no es la rama viva

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **media**. Es el defecto del caso 395, pero en la migración: el
planning de la línea termina en la rama de trabajo que estuviera abierta, mezclado con lo que esa rama lleva.

## Resumen

`ops lines migrate` decide a dónde traer la línea con `git symbolic-ref HEAD` de la instancia. Si la instancia está en
una rama de trabajo —la de un upgrade, la de CI—, el planning de la línea se mergea ahí. La salida nombra la rama,
pero no dice que no es la viva, que es justo lo que `ops line` sí avisa desde 0.111.0.

## Reproducción

En una instancia real, el 2026-10-19, con el motor 0.111.0 y la instancia en `build/cauce-0.111.0` (la rama del
upgrade, todavía sin mergear):

```
$ node tools/ops.js lines migrate . payments backend-payments
MIGRAR la línea payments  …/<instancia> (line/payments) → lines/payments/
  2 commit(s) de planning que traer a build/cauce-0.111.0
Para hacerlo: ops lines migrate <ops-root> payments <repo>... --apply
```

## Síntoma

Ningún aviso. Con `--apply` los dos commits del planning de la línea habrían quedado en la rama del upgrade. Se
evitó a mano, abriendo antes una rama propia para el planning; las dos migraciones siguientes cayeron en esa rama de
trabajo, de nuevo sin aviso.

## Causa raíz

`engine/cli/lines-join.js:232-234` toma `into` del `HEAD` de la instancia, y `:280` lo imprime como «commit(s) de
planning que traer a `<rama>`» sin compararlo con la rama viva.

## Fix propuesto

Lo mismo que el 395 hizo para `ops line`: comparar `into` con la rama viva de la instancia (el criterio de
`startPoint`, `engine/planning/lines.js`) y, si no coincide, avisarlo en seco y con `--apply`: «la instancia está en
`<rama>`; el planning de `<línea>` va a quedar ahí y no en `<viva>`». No negarse: traerlo a una rama de trabajo para
abrir su PR es legítimo, lo que falta es que se vea.

La aceptación pide la mutación: con la comparación quitada, la prueba que migra con la instancia en una rama de
trabajo no encuentra el aviso y falla.

## Tradeoffs

- Una instancia que trabaja siempre en una rama de planning va a ver el aviso cada vez; es una línea de salida, no
  un freno.

## Contexto de descubrimiento

Al migrar tres líneas de una instancia real justo después de actualizar a 0.111.0, con la instancia en la rama del
upgrade.

## Relacionados

- 395 — el mismo defecto en `ops line`, resuelto en 0.111.0.
- 396 — la misma migración cruza las bases de merge cuando la línea ya está empujada; descartado, porque medido en
  GitHub no deja el PR en conflicto.

## Cierre

**Resuelto en 0.112.0.** `migrate` (`engine/cli/lines-join.js`, `arrival`) compara la rama a la que trae la línea con la
rama viva de la instancia —el mismo criterio de `startPoint` que usa `ops line` desde el 395— y, si no coinciden, lo
avisa en seco y con `--apply`: «la instancia está en `<rama>`; el planning de `<línea>` va a quedar ahí y no en `<viva>`.
Si es la rama de su PR, está bien; si no, pasate a una antes de --apply.». El `--json` lleva `live` y `warnings`.

El enunciado, ítem por ítem:

- **Comparar con la rama viva y avisarlo en seco y con `--apply`**: se hizo así.
- **No negarse**: no se niega; la prueba migra con `--apply` desde una rama de trabajo y sale 0.
- **La mutación**: abajo.
- **Tradeoff, una instancia que trabaja siempre en una rama de planning ve el aviso cada vez**: así queda, y es una
  línea de salida, como decía el caso.

**Lo que se corrió para saber que funciona.**

- `test/wiring/lines.test.js`, «migrar avisa si la instancia no está en su rama viva, y no por una línea empujada»: en la viva y sin remoto no avisa nada (`warnings: []`); en `build/upgrade` avisa en el JSON, en
  el texto y con `--apply`. Roja antes del cambio.
- Mutación en una copia fuera del árbol: sin la comparación con la viva, roja.
- Real, sobre `ops bench sidecar` con un remoto bare de verdad (`git init --bare`, `git push`): dos líneas de antes
  armadas a mano (`line/auth` y `line/admin`, worktrees de la instancia con un commit de planning cada una),
  empujadas, y la instancia en `build/cauce-0.112.0`. `ops lines migrate . auth app` en seco:
  - con el motor de `main`, sólo «1 commit(s) de planning que traer a build/cauce-0.112.0», sin ningún aviso;
  - con el de la rama, el aviso del 397, y sale 0:

  ```
  ⚠ la instancia está en build/cauce-0.112.0; el planning de auth va a quedar ahí y no en main. Si es la rama de su PR, está bien; si no, pasate a una antes de --apply.
  ```

  Esa corrida imprimía además el aviso de la rama empujada que el 396 llegó a tener y que se sacó; el del 397 es el
  que queda. Con `--apply` las dos migraciones salen 0 con el mismo aviso.

**Lo que encontró la revisión del conjunto**, antes del PR, y se arregló acá:

- **Con `--apply` directo, el aviso salía después de traer la línea**, y en los caminos en que `--apply` se niega no salía.
  Ahora sale antes del merge y también cuando se niega. Sigue sin frenar, como decidió este caso, así que lo que garantiza es
  que quede dicho a dónde fue el planning; para decidir antes está la corrida sin `--apply`. El comentario lo dice así: la
  primera versión prometía «cuando todavía sirve para decidir», y la segunda revisión marcó que no era cierto.
- **`arrival` había quedado entre el encabezado de `migrate` y `migrate`**, así que ese encabezado describía a la función
  equivocada. Ahora está arriba.
- **Sacar el remoto de la rama viva estaba escrito dos veces**, en `plant` y en `arrival`: es `branchOf`, en
  `engine/planning/lines.js`.

Probado así: la prueba de este caso suma un `--apply` que se niega, con la instancia sucia («el apply que se niega no
avisa»), y uno que se aplica, con el aviso antes de `MIGRAR` y una sola vez. Mutación en rojo: el aviso sólo al final.

**Lo que encontró la tercera revisión**: el aviso salía aunque la línea no tuviera commits de planning que traer, y entonces
no hay nada que vaya a ningún lado. Ahora sólo avisa con commits. Probado: la prueba de este caso suma una línea vacía en una
rama de trabajo, sin aviso; la mutación sin esa condición sale roja («avisa sin nada que traer»).
