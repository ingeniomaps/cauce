---
caso: 448
titulo: Retomar un autobuild vuelve a registrar las decisiones de Review, y una fila manda a aprobar la ruta del checkout principal en vez de la del árbol de la línea
estado: resuelto
resuelto-en: 0.116.0
prioridad: media
version-detectada: 0.116.0
---

# 448 — Retomar un autobuild duplica las filas de Review, y una manda a aprobar otro árbol

**🟢 resuelto en 0.116.0** · detectado en 0.116.0 · prioridad **media** — cualquier `/autobuild` que se retoma después de una
parada; el segundo defecto, sólo en una línea de trabajo.

## Resumen

Dos defectos en las filas de acciones humanas que deja la fase Review. Salen de la misma corrida pero tienen causas
y arreglos distintos.

1. **Retomar repite las filas.** La corrida que retoma vuelve a pasar por Review, y lo que esa revisión deja abierto
   se vuelve a registrar sin mirar lo que ya está pendiente. La misma decisión queda dos veces, en
   `lockfile-left-pad.md` y en `lockfile-left-pad-2.md`. El camino más común para llegar ahí es justamente el normal:
   `commit-needs-approval` para y pide reanudar después de aprobar.
2. **La fila manda a aprobar la ruta equivocada.** En una línea de trabajo, el pedido que escribe las filas de Review
   no dice dónde está el trabajo. El agente completó la ruta con la del checkout principal,
   `<banco>/app/package.json`, cuando el commit es en `<banco>/lines/piloto/app`. Desde el 445 esa línea no destraba
   nada, y la persona hace lo que dice la fila.

**Lo que no es un defecto:** las cuatro filas dicen `task: primero`, que es el hito y no la tarea. Es a propósito:
el pedido dice «El task nunca es `<tarea>` —va la épica, el hito o el recorrido al que alcanza—»
(`automatization/workflows/autobuild.js:2011`), así que una decisión de Review no frena la tarea que ya se entregó.

## Reproducción

Banco instalado: sidecar con `app` y `web`, motor congelado de la rama del 445 y el 446, línea `piloto` sobre `app`,
y en `backlog/primero.md` (con `line: piloto`) la tarea `sumar-left-pad`: agregar `left-pad` 1.3.0 al `package.json`
de app sin tocar `pnpm-lock.yaml`, lo que el guard de dependencias frena.

```bash
claude -p '/autobuild piloto'     # para en commit-needs-approval
echo "<banco>/lines/piloto/app/package.json" > ops/planning/.ops-approval
claude -p '/autobuild piloto'     # retoma, commitea y cierra la tarea
ls ops/planning/human/
```

## Síntoma

Medido el 2026-10-25. Corrida `wf_3b1c985d-0fb` (la primera, termina 10:09) y corrida `wf_f1cf6b39-ea6` (la que
retoma, termina 10:19), leídas de sus `journal.jsonl`:

```
wf_3b1c985d-0fb  review        aprobado, 2 decisiones
                 review-human  → lockfile-left-pad.md, dependencia-left-pad.md
wf_f1cf6b39-ea6  review        con-condiciones (1 bloqueante, 1 decisión)
                 review-fix
                 review        aprobado, 1 decisión
                 review-human  → lockfile-left-pad-2.md, aprobacion-package-json-app.md
```

Lo que contestó el agente de `review-human` en la segunda corrida:

```
- lockfile-left-pad-2.md: decidir si se acepta que app/package.json declare left-pad 1.3.0 mientras
  app/pnpm-lock.yaml sigue siendo sólo lockfileVersion: 9 …
  - Se llama -2 porque ya existía lockfile-left-pad.md, que trata lo mismo y no se tocó.
- aprobacion-package-json-app.md: aprobar o no el commit del manifiesto sin su lockfile …
  - Se cierra escribiendo <banco>/app/package.json en <banco>/ops/planning/.ops-approval
```

Vio que la fila ya existía, dijo que trata lo mismo, y escribió otra. Y la decisión que le pasó la revisión no traía
ninguna ruta («el guard de dependencias puede frenar el commit … Si se aprueba esa ruta lo decide una persona»): la
ruta absoluta la completó él.

La línea que dice la fila, contra el guard del banco (`linegate.sh`, el mismo commit stageado en el árbol de la
línea):

```
== la del checkout principal: <banco>/app/package.json
  → exit 2
== la del árbol de la línea
  → exit 0
```

## Causa raíz

**Las filas repetidas:**

- `automatization/workflows/autobuild.js:2005` — `decided` saca duplicados con un `Set` sobre `detail`, el texto
  literal. Alcanza para las pasadas de una misma corrida sólo si repiten la frase exacta, y no ve nada de lo que
  escribió una corrida anterior.
- `automatization/workflows/autobuild.js:2010` — el pedido es «una fila por cada decisión» y no nombra las filas que
  ya están pendientes.
- `automatization/shared/human.js:12` — la forma de la fila dice que si el nombre ya existe «no lo toques: al nuevo
  agregale -2». El agente hizo exactamente eso. La regla es para un bloqueo nuevo de la misma tarea, y acá se aplica
  a la misma decisión registrada dos veces.

**La ruta equivocada:**

- `automatization/workflows/autobuild.js:1366` — `WHERE` dice dónde está el trabajo de la tarea en una línea, y
  acompaña a toda fase que mira o toca el trabajo. Review lo recibe, `review-fix` también.
- `automatization/workflows/autobuild.js:2010` — el pedido de `review-human` no lo lleva. Quien escribe la fila no
  sabe que hay un árbol de línea, y una ruta relativa a `app` la resuelve contra el checkout principal.
- `automatization/workflows/autobuild.js:2281` — además, esa fila no hacía falta: cuando el guard frena el commit,
  `commit-needs-approval` para nombrando las rutas que el guard pidió, y a propósito «tampoco deja fila». La fila
  de Review predice esa misma aprobación, con una ruta que no sale del guard.

## Fix propuesto

1. Pasarle a `review-human` las filas pendientes que ya existen (`ops context --json` las lista en `humanActions`) y
   pedirle que una decisión ya registrada no se vuelva a escribir. Es lo que separa «otro bloqueo» de «el mismo».
2. Sumar `${WHERE}` al pedido de `review-human`, igual que en el resto de las fases que nombran rutas del trabajo.
3. Decirle a Review que la aprobación que un guard va a pedir al commitear no es una decisión para registrar: la
   para `commit-needs-approval`, con la ruta que da el guard.

El 3 sólo, sin el 2, cierra la fila de esta corrida pero no cualquier otra decisión de Review que nombre un archivo.
Y el 1 es el que más pesa, porque retomar después de aprobar es el camino normal.

## Prueba de cierre

- La corrida de la reproducción, repetida: después de retomar, en `human/` no hay dos filas de la misma decisión y
  ninguna nombra una ruta fuera de `lines/piloto`.
- Las pruebas del arnés de `autobuild` aserciando que el pedido de `review-human` lleva el árbol de la línea y las
  filas pendientes, cada una vista en rojo sacándola.

## Cierre

**Resuelto en 0.116.0**, en la misma rama y el mismo PR que el 445 y el 446, a pedido.

El fix propuesto, punto por punto:

1. **Las filas pendientes.** Se hizo: el pedido de `review-human` dice que antes corra `node tools/ops.js human <planning>`
   y que no vuelva a registrar una decisión que ya tiene fila pendiente, aunque esté dicha con otras palabras.
   No se tocó la regla del `-2` de `automatization/shared/human.js`, que sigue sirviendo para un bloqueo nuevo.
2. **El árbol de la línea.** Se hizo: el pedido lleva `${WHERE}`, como el resto de las fases.
3. **La aprobación del guard.** Se hizo, en el criterio de `decision` que recibe Review (`RULED`): la línea de
   `.ops-approval` que un guard va a pedir al commitear no es una decisión, la pide la parada del commit.

La prueba de cierre:

- **Arnés.** Dos pruebas nuevas: `test/workflows/autobuild-line.test.js` (en una línea, la fila de Review lleva el
  árbol) y `test/workflows/autobuild-review.test.js` (lee las pendientes, no repite y deja fuera la aprobación del
  guard). Las dos se vieron en rojo antes del arreglo. Después, en una copia, tres mutaciones —sacar `WHERE`, sacar la
  lectura de pendientes y sacar la exclusión del guard— dieron `fail 1` cada una.
- **Corrida real**, en el banco de la reproducción con el motor de la rama. Primera corrida (`wf_0da3ef50-658`):
  Review registró `left-pad-lockfile.md` y `left-pad-deprecado.md`. El agente corrió antes `ops human`, y la del
  lockfile nombra `<banco>/lines/piloto/app`. Ninguna fila pide aprobar una ruta. Esa corrida la cortó `claude -p`
  a los diez minutos de espera, en Commit. La que retoma (`wf_ab5cd3e7-894`, USD 2,76) volvió a pasar por Review y
  contestó:

  ```
  No registré ninguna fila nueva: la única decisión que dejó abierta la revisión de sumar-left-pad ya tiene su fila
  pendiente. … Fila que ya la cubre: <banco>/ops/planning/human/left-pad-lockfile.md
  ```

  Después paró en `commit-needs-approval` con `needsApproval: ["<banco>/lines/piloto/app/package.json"]`. En `human/`
  quedaron las mismas dos filas, con la hora de la primera corrida. Antes del arreglo, el mismo recorrido dejaba
  cuatro filas.

Lo que el caso encontró y no preveía: el conteo de `test/wiring/runners-contract.test.js` pasó de 69 a 70. El nuevo
`tools/ops.js human` se clasificó como el del caso 351.

Lo que queda sin medir: que el agente reconozca la misma decisión dicha con otras palabras es juicio suyo, no un
mecanismo. La corrida real la reconoció una vez. Una dedupe por texto, como el `Set` de `autobuild.js:2005`, no la
reconocería.

**Medido después del cierre, el 2026-10-25**: la vuelta que faltaba, con la línea del árbol aprobada y el motor de
`main`. La corrida `wf_2cfef1ed-aee` (USD 6,55) retomó, volvió a pasar por Review y contestó «No registré filas
nuevas. Las dos decisiones que dejó abiertas la revisión de sumar-left-pad ya tienen su fila pendiente». Después
commiteó en el árbol de la línea (`91de16c`) y cerró la tarea. En `human/` siguieron las dos filas de la primera
corrida, con su hora. Van dos retomas de dos sin duplicar. Esa corrida encontró además otro defecto: no pudo
commitear el estado de planning en la instancia. Salió como caso propio, el 450.
