---
caso: 385
titulo: partir una tarea conservando su slug en la primera subtarea se lee como que el partido no ocurrió
estado: resuelto
resuelto-en: 0.108.1
prioridad: media
version-detectada: 0.106.0
---

# 385 — Decompose parte la tarea y deja el slug original en la primera subtarea, citando R25 —que pide lo contrario—; el recorrido ve el mismo slug en la cola y para con `split-not-applied`

**🟢 resuelto en 0.108.1** · detectado en 0.106.0 · prioridad **media** — la corrida para sobre un partido bien hecho y
commiteado; relanzar puede repetirlo si la estimación vuelve a pedir partir.

## Resumen

Decompose estimó 5 horas para `selector-de-pais-en-el-celular` y la partió en dos. El agente de escritura
reemplazó la línea por dos subtareas y **conservó el slug original en la primera**, citando la regla del slug
inmutable (R25 del sistema; en la instancia, su Regla 18). El partido quedó escrito y commiteado. Después el
recorrido releyó la cola, vio que seguía ofreciendo ese mismo slug y paró:

> se pidió reemplazar selector-de-pais-en-el-celular en …/backlog/auth-ajustes-de-uso-de-las-pantallas-nuevas.md
> por sus subtareas y la cola sigue ofreciéndola: la escritura no ocurrió como se pidió.

## Reproducción

Corrida `wf_f1a3fbab-718`, instancia `acme-ops`, Cauce 0.106.0, `--max 2`. Agentes: contract-digest,
planning-context, claim, ready (`true`), estimate (`hours: 5, needsSplit: true`, dos subtareas), split, planning-context
(`queued` pasó de 10 a 11), planning-block. La cola quedó con `selector-de-pais-en-el-celular` y
`celular-de-argentina-con-9-o-15-se-normaliza`, y el commit de planning lo registró.

## Síntoma

`{"stopped":true,"reason":"split-not-applied", …}` con el partido aplicado, la cola en 11 tareas y `check` en verde.
La tarea queda reclamada y con un commit «block».

## Causa raíz

`automatization/workflows/autobuild.js:1341` (en 0.108.0, `:1360`):

```js
if (planning.hasTask && planning.slug === task.id) {
  return halt('split-not-applied', …)
```

Compara sólo el slug de la próxima tarea con el de la partida. Cuando la primera subtarea conserva el slug —que
es lo que la regla del slug inmutable recomienda para no romper referencias—, la condición es verdadera aunque la
escritura haya ocurrido.

## Fix propuesto

Comprobar el cambio por otra señal además del slug: que `queued` haya crecido en `subtasks.length - 1`, o que la
aceptación de la tarea ofrecida ya no sea la original. O pedirle al agente de escritura que **no** reuse el slug, y
decirlo en el prompt de `split`, si se decide que el partido siempre produce slugs nuevos.

## Tradeoffs

Elegir «siempre slugs nuevos» contradice el consejo de conservar el identificador; elegir «puede conservarse» exige
la comprobación por cantidad o por aceptación.

## Contexto de descubrimiento

Primera corrida después de aligerar las reglas de la instancia; se cortó a los 8 agentes.

## Relacionados

- 376 — partir una tarea deja dependientes apuntando a un slug que ya no existe (la razón para conservarlo).

## Cierre

**Resuelto en 0.108.1.** Al contrastar el caso contra el fuente apareció lo que su enunciado no veía: el dilema de
«Tradeoffs» ya lo decide R25 —«las partes son unidades nuevas, con identificadores nuevos, y la original se cierra
diciendo en qué se partió»—. El agente citó la regla al revés, y el caso heredó esa lectura en su encabezado. El
arreglo del 376, que reapunta los `(depende: …)` a las partes, se apoya además en que el slug de la partida deja
de existir. Así que no hubo nada que decidir.

**Lo que se corrió para saber que funciona.**

- Arnés: `test/workflows/autobuild-claim.test.js`, «partir pide slugs nuevos, y si una parte reusó el de la
  partida la parada lo dice». En rojo con el `autobuild.js` de `main` y en verde con el arreglo. Tres mutaciones
  en una copia del árbol, las tres en rojo: sin la línea de slugs nuevos, rojo esta prueba; con `grew` siempre
  falso, rojo esta prueba; con `grew` siempre verdadero, rojo «si el BACKLOG no cambió tras partir la tarea, el
  recorrido para», que es la parada que no tiene que cambiar.
- El paso real, solo: el prompt de `split` que arma el recorrido, volcado desde el arnés con dos subtareas, corrido
  con `claude -p` el 2026-10-16 sobre copias de un banco `tarea` fuera del repositorio, para que no cargara el
  `CLAUDE.md` de cauce, que trae R25. Dos corridas con la consigna nueva escribieron `modelo-validacion-resultado`
  y `pantalla-resultado`, y `resultado-modelo-validacion` y `resultado-pantalla`. En las dos, `tarea-medida`
  desapareció de la cola, `ops context planning --json` ofreció la primera subtarea con `queued: 2`, y `check`
  marcó sólo el reclamo y el WIP de la partida, que en la corrida real suelta el propio recorrido después de
  partir. USD 0,27 cada una. Esas dos corridas llevaban todavía «(R25)» en la consigna; sin el número, dos más
  dieron lo mismo: `modelo-validacion-resultado` y `pantalla-resultado`, con `queued: 2`.
- **Lo que esa prueba no muestra:** dos corridas de control con la consigna de `main` tampoco reusaron el slug.
  La instancia lo hizo citando su propia regla de slug inmutable, y en el banco no hubo con qué reproducirlo. Lo
  que queda probado es que la consigna nueva pide slugs nuevos y que un agente real la cumple sin romper la
  partición. Que evite el reúso que el control no mostró no está probado. Si vuelve a pasar, la parada ahora
  lo dice con su nombre.

**Recorrido de lo que el caso enumeraba.**

- **Comprobar el cambio por otra señal además del slug — se hizo**, pero como diagnóstico y no como salida. Si la
  cola creció y sigue ofreciendo el slug de la partida, la corrida para igual, porque tiene en memoria una
  aceptación que ya no es la de esa tarea. Lo que cambia es que la parada dice «una de ellas reusó el slug de
  <tarea>: renombrala con uno nuevo antes de reanudar», en vez de «la escritura no ocurrió». La señal es
  `queued`. La aceptación ofrecida descartaba menos casos, y `queued` ya venía en la lectura.
- **Pedirle al agente que no reuse el slug — se hizo** en la consigna de `split`, con la razón de R25 dicha por
  su contenido: un prompt instalado no cita reglas por número (caso 105), y la puerta lo frenó la primera vez.
- **«Elegir siempre slugs nuevos contradice el consejo de conservar el identificador» — se decidió que no hay
  contradicción.** Ese consejo es de R25 para una unidad viva, y la misma regla excluye la partición.

