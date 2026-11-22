---
caso: 463
titulo: Cerrar una tarea con otro slug no da error ni aviso, y la tarea sigue en cola para volver a tomarse
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.117.2
---

# 463 — Cerrar una tarea con otro slug no da error ni aviso, y la tarea sigue en cola para volver a tomarse

**🟢 resuelto en 0.124.0** · detectado en 0.117.2 · prioridad **media**: reabierto el 2026-11-21 porque se cumplió su `reabrir-si`.
Una instancia registró una corrida de 594k tokens que tomó de la cola una tarea ya construida y cerrada con otro slug.
Se aplazó el 2026-10-31 diciendo que no había incidente; el incidente ya existía y no se conocía.

## Resumen

R25 dice que con el nombre cambiado «la puerta pasa en verde», y es literal: una entrada de `done/` con un slug que nadie
reclamó ni está en la cola no produce nada en `ops check`, y la tarea original se sigue ofreciendo.

## Reproducción

```bash
B=$(node engine/cli/ops.js bench tarea --force)
cd "$B" && export CAUCE_RUNNER="$PWD"
cat > planning/done/renombrada.md <<'E'
- [x] **renombrada** — Otra cosa
  acept: conducta observable
  fecha: 2026-11-21
  done: se construyó y `make test` salió 0
  qa: observado por el camino real
  tests: A → make test
  commit: n/a — banco de medición
E
node <cauce>/engine/cli/ops.js check planning
node <cauce>/engine/cli/ops.js release planning tarea-medida
node <cauce>/engine/cli/ops.js context planning --json
```

## Síntoma

Salida real, 0.123.1, 2026-11-21. `check` sale 0 y sus avisos hablan del formato de la entrada, no de su origen:

```
⚠ planning/done: 1 entrada(s) sin lane:, así que no se puede comprobar sobre el registro que la ceremonia que recibieron fue la que su superficie pedía (OPS-006)
⚠ planning/done: 1 entrada(s) sin review:, que es la dimensión con la que OPS-006 dice que se mide si el carril elegido fue el correcto
✓ planning válido: 0 épica(s), 1 tarea(s) en cola, 1 terminada(s)
exit=0
✓ tarea-medida soltada; volvió a la cola
{"task":"tarea-medida"}
```

En 0.117.2 (2026-10-31) daba lo mismo, con un aviso de commit inexistente en vez de los de `lane:` y `review:`.

## Causa raíz

`validateState` (`engine/planning/contracts.js:130-137`) arma el conjunto de slugs de la cola y sólo reporta los duplicados
de DONE. `warnings` (`engine/planning/claims.js:133-137`) cruza en el otro sentido: un reclamo cuyo slug ya está en DONE.
Y R25 (`template/planning/rules/system/process.md:89`) describe el efecto sin nombrar qué lo comprueba.

**Lo que hace difícil comprobarlo:** una entrada de DONE cuyo slug no está en la cola es el estado normal de toda tarea
cerrada, porque estar en las dos es un error (`engine/planning/contracts.js:225`). Y el reclamo se suelta. Mirando el
estado no queda nada que distinga «salió de la cola» de «nunca estuvo».

**Y el recorrido tampoco lo comprueba.** Done de `/autobuild` le pide al agente que escriba `done/<slug>.md` con el slug
de la tarea (`automatization/workflows/autobuild.js:2490`), pero después no mira que esa tarea haya quedado en `done/` y
fuera de la cola: el cierre corre `check` (`autobuild.js:2615-2620`), que pasa en verde por lo de arriba. El nombre del
archivo lo pone el pedido; el slug que cuenta es el de la viñeta, y ése lo escribe el agente.

## Fix propuesto

Esta revisión descartó el 2026-10-31 que `check` avisara de una entrada que no pasó por un reclamo ni por la cola: con
el estado solo no se puede saber. Hay cuatro formas. La 3 y la 4 son nuevas de esta reapertura:

1. **Sellar el origen**: `ops claim` deja un rastro que la entrada de DONE cita. Pide un campo más, y sólo cubre lo que
   pasó por un reclamo.
2. **Mirar la historia**: `check` compara con `git log` si el commit que agregó la entrada sacó su slug de la cola. No
   escribe nada, pero `check` pasa a depender de la historia, y falla con un clon superficial.
3. **Parecido de slugs** (lo que construyó la instancia): `check` avisa cuando un slug en cola se parece a uno en DONE
   del mismo servicio. Cuenta palabras compartidas (al menos dos y la mitad de las del más corto), toma como iguales las
   que comparten un prefijo de cinco letras y descarta las que el servicio repite en cinco o más slugs cerrados. Una
   marca `(no-dup: slug)` en la línea calla un par ya revisado. Es heurística y sólo avisa; la instancia la usa desde
   2026-10-30, y bajó de 3 avisos a 0 en su árbol después de descontar las palabras comunes.
4. **Comprobar el cierre donde ocurre**: el que cierra sabe qué tarea tomó. Done de autobuild —y el `ops done <tarea>`
   del paso 3 del plan— comprueba al terminar que `<slug>` quedó en `done/` y fuera de la cola, y frena si no. Es
   determinista y no adivina nada, pero cubre sólo los cierres que pasan por esas dos vías, no el manual.

**Recomendación**: la 4 primero, porque es exacta y cubre el camino del incidente (un cierre del recorrido). Si después
de eso aparece un cierre manual con otro nombre, la 3 como aviso. La 1 y la 2 cuestan más de lo que agregan sobre la 4.
**Decide la persona**: la 4 cambia lo que hace Done de autobuild.

## Tradeoffs

- Las bitácoras viejas no tienen rastro, así que la 1 y la 2 rigen desde una fecha.
- El alias de R25 (`antes: <slug>`) es para que lo lea una persona: `engine/planning/` no lo interpreta (`grep -rn
  "antes:" engine/planning` sólo da un comentario de `parser.js:46`). Si un aviso lo acepta como salida, hay que enseñarle
  al parser a leerlo.
- La 3 está calibrada en español: descarta artículos y preposiciones con una lista fija. Esa lista no decide un permiso,
  así que no choca con «un guard no decide con una lista de palabras permitidas», pero en un repo en otro idioma da
  más ruido.
- La 4 frena un cierre ya construido. Tiene que decir qué falta («`<slug>` sigue en la cola» o «no hay entrada con ese
  slug») para que la reparación sea mecánica, igual que el `closing-repair` que ya existe.

## Contexto de descubrimiento

Una entrada de deuda de una instancia, revisada entre releases. Allí los slugs se cierran por reclamo y no se vio el
defecto: la medición fue de la comprobación ausente, no de un incidente.

**Reapertura, 2026-11-21.** Auditoría de otra instancia sidecar real. Su historial de reglas cuenta el incidente del
2026-08-28: Decompose partió una tarea en cuatro subtareas y Done cerró dos con otros nombres. Una tercera se cerró
dentro de la revisión de otra tarea, sin entrada propia. Quedaron tres duplicadas en la cola, y la corrida siguiente
tomó una, gastó **594k tokens** en Triage, Pick, Ready y Decompose, y paró para reportar que ya estaba construida. El
incidente es anterior a los casos 376 (0.108.0) y 385 (0.109.0), que arreglaron cómo se escriben las partes al partir,
pero ninguno de los dos toca cómo se cierra una: la reproducción de arriba, sobre 0.123.1, lo confirma.

## Relacionados

- 376 y 385: partir una tarea en Decompose, resueltos; no cubren el cierre con otro slug.
- 535: un WIP que apunta a una tarea hecha se ofrece como la tarea en curso; mismo costo por otro camino.
- Paso 3 del plan de la auditoría (`ops done <tarea>`): es donde la forma 4 cubre los cierres fuera de autobuild.

## Cierre

Se construyó la forma 4, decidida por la persona el 2026-11-21 sobre la recomendación de este caso. Se recorrió el caso
entero:

- **Fix propuesto, forma 4** — se hizo, en dos partes. En el motor, `ops check --closed <tarea>[,<tarea>]`
  (`engine/planning/contracts.js`, `closedErrors`; `engine/cli/validate.js`; `engine/cli/args.js`): cada tarea que quien
  cierra declara se busca en `done/` por su slug, y si falta sale `✗ <slug>: se dio por cerrada y no tiene entrada en
  done/ con ese slug, y sigue en la cola. Si la entrada quedó con otro nombre, la viñeta lleva el mismo slug que la cola
  (R25)`. En `/autobuild`, el pedido `done` de cada tarea corre `check --closed <su slug>` y dice cómo corregirlo. La
  lectura de `check` al cerrar la corrida pasa las tareas que completó, y `closing-repair` y `closing-human` citan ese
  mismo comando, así que el que repara y la persona ven el error. Distinto de lo propuesto: el caso decía «frena»; acá
  es un error de `check`, que dentro del recorrido entra por la reparación y la fila humana que ya existían en vez de
  un freno nuevo.
- **Formas 1, 2 y 3** — se decidió que no, por ahora: la 4 es exacta y cubre el camino del incidente. La 3 queda como la
  siguiente si aparece un cierre manual con otro nombre; el `ops done <tarea>` del paso 3 del plan de la auditoría va a
  reusar `closedErrors`, y eso cubre el cierre fuera de autobuild con la misma exactitud.
- **Tradeoffs: rige desde una fecha (formas 1 y 2)** — no aplica a la 4: no mira el historial, sólo lo que se declara
  cerrado en esa corrida.
- **Tradeoffs: el alias `antes:`** — no hizo falta: la 4 no acepta alias, pide el slug de la cola, que es lo que dice R25.
- **Tradeoffs: la 3 en español** — no se construyó.
- **Tradeoffs: la 4 frena un cierre construido y tiene que decir qué falta** — el mensaje nombra si falta la entrada y si
  la tarea sigue en la cola, y cómo se arregla.
- **Del enunciado de 0.117.2, que la reapertura sacó de Tradeoffs: `autobuild.js:43` arma la ruta de `done/` con el
  slug** — sigue siendo cierto, y por eso el riesgo no era el archivo sino la viñeta; ahora la viñeta se comprueba.
- **Resumen y Prioridad** — la tarea cerrada con otro slug sigue pasando `check` **sin** la bandera (medido abajo): quien
  cierra a mano sin declarar qué cerró no está cubierto, y eso es lo que el paso 3 (`ops done`) va a cubrir. La
  prioridad no traía condición de escalada.
- **Lo que el enunciado no preveía** — que `closing-repair` y la fila humana citaban `check` sin la bandera: con el error
  nuevo, quien reparaba podía correrlo, verlo en verde y no reparar nada, y la persona recibía un comando que no lo
  reproducía. Lo encontró la revisión independiente y se arregló en la misma tanda. También que `check x --closed --json`
  toma `--json` como slug: es la clase de toda bandera con valor de `engine/cli/args.js` (`--line`, `--task`) y ya pasaba
  antes; autobuild no llega ahí porque sólo agrega la bandera con tareas. Se anota acá y no sale como caso: no tiene peso
  propio.

Lo que se corrió:

- Línea de base (0.123.1), en «Síntoma» de arriba: `check` sale 0 y `context` vuelve a ofrecer `tarea-medida`.
- Pruebas nuevas, vistas en rojo antes de implementar (`PC.closedErrors is not a function`; la bandera rechazada; las
  aserciones de los pedidos `done`, `closing-repair` y `closing-human` sin `--closed T-1`; la instrucción de corrección de
  `done`) y en verde después: `test/planning/closed.test.js`, `test/workflows/autobuild-closing.test.js` y
  `test/workflows/autobuild-claim.test.js`, 27 pass.
- Mutaciones en una copia (`git ls-files -co --exclude-standard`), verde sin mutar y roja con cada una de las diez:
  `closedErrors` vacía, sin «sigue en la cola», marcando también la que cerró, `check` sin llamarla, la coma suelta como
  tarea, autobuild sin `--closed` en la lectura del cierre, en `done`, en `closing-repair` y en `closing-human`, y `done`
  sin decir que la tarea sale de la cola.
- Prueba real sobre el commit del arreglo (`78b90b61`), repetida a las 21:24 después de commitear, banco nuevo (`bench
  tarea --force`), con la reproducción de este caso: sin
  `--closed`, `✓ planning válido`, exit 0 (el comportamiento sin declarar no cambia); con `--closed tarea-medida`, el
  error de arriba, exit 1; con la entrada escrita con su slug y la tarea fuera de la cola, `✓`, exit 0.
- `npm run ci` con todo stageado: 1855 pass, 0 fail, exit 0.
- **Corrida real de `/autobuild`**, 2026-11-21, Claude Code 2.1.330 en una sesión interactiva por tmux, sobre un banco
  `sidecar` copiado fuera del árbol, con el motor congelado en el árbol de trabajo de este cambio y una tarea `lite`
  (`sumar-dos-numeros`). 9 minutos, 24 agentes y 754.617 tokens: cerró la tarea y dejó el checkpoint. Las transcripciones
  de los subagentes muestran que el pedido `done` corrió `check …/planning --closed sumar-dos-numeros` y la lectura del
  cierre `check …/planning --json --closed sumar-dos-numeros`. La primera dio `planning válido: 0 épica(s), 0 tarea(s)
  en cola, 1 terminada(s)`, y la segunda `{"ok":true,"epics":0,"queued":0,"done":1,"errors":[],"warnings":[]}`.
  `closing-repair` no se llamó: en el camino normal la bandera no marca de más.
- **`closing-repair` con modelo real**, sobre ese mismo banco con la forma del incidente sembrada: la entrada reescrita
  como `suma-de-enteros` y la tarea de vuelta en la cola. `check --closed sumar-dos-numeros` daba el error de arriba. Se
  le dio a `claude -p` el párrafo de la reparación tal como lo rinde el arnés, con las rutas del banco. Diferencia con la
  corrida real: sin el preámbulo de reglas, que el arnés arma para otro proyecto, y con la forma del JSON pedida al final,
  porque `claude -p` no impone esquema. USD 0,36, 5 turnos. Renombró archivo y viñeta a `sumar-dos-numeros` y sacó la
  tarea de la cola. El cuerpo de la entrada quedó idéntico (comparado con `diff` contra la copia sembrada) y `check
  --closed` volvió a `✓`, exit 0. Una corrida intermedia salió en rojo («ningún comentario
  quedó separado del código que describe») por una línea en blanco que el cambio metió entre un comentario existente y
  `module.exports`; se quitó y se repitió.

**Sin probar:** la rama de autobuild sin tareas completadas (sin bandera), que no tiene prueba propia; es de bajo riesgo
porque deja el comando como estaba.

### Lista de cierre

1. hecho: la reproducción de «Síntoma», corrida sobre 0.123.1 el 2026-11-21 antes de tocar el código.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas se vieron en rojo antes de implementar y en verde después, 27 pass.
4. hecho: diez mutaciones en una copia, las diez rojas; la copia sin mutar, verde.
5. no aplica: agrega una comprobación y una bandera; sin la bandera, `check` sale igual que antes (medido en el banco).
6. hecho: banco real con el motor enlazado; se midió que lo viejo —la tarea con otro slug pasando en verde— se fue cuando se declara el cierre, y que sin declarar sigue igual.
7. hecho: la persona pidió la corrida real el 2026-11-21. Un `/autobuild` real corrió con `--closed` sin falso rojo, y `closing-repair` con modelo real reparó la forma del incidente sin tocar la evidencia; las dos, con su salida, en «Lo que se corrió». Que el propio Done escriba otro slug no se puede provocar en una corrida normal: se sembró ese estado.
8. hecho: «Lo que se corrió» enumera los caminos, incluidos los dos con modelo; el banco, las mutaciones y las corridas reales son sobre la versión final del código.
9. no aplica: el cambio no coordina runners, raíces ni ramas; varias tareas en una lista se probaron (`'alta, baja'` en la revisión, dos slugs en la prueba de unidad).
10. hecho: dependían del texto del pedido de cierre `autobuild-closing.test.js:33` y `autobuild-claim.test.js:436`, actualizados; `lines-join.js:87` corre `check` sin la bandera y no cambia; README y `ops help` revisados.
11. hecho: revisión independiente en dos pasadas; la primera halló tres cosas que el cambio empeoraba (pedidos de reparación y fila humana sin la bandera, `done` sin ella, la función pegada a un comentario ajeno), arregladas; la segunda, sobre lo cambiado, no halló nada que impida entregar.
12. hecho: pasada de comentarios; el de autobuild repetía la razón del de `contracts.js` y quedó en una línea que apunta al caso.
13. hecho: `npm run ci` con todo stageado, 1855 pass, exit 0.
14. hecho: este cierre recorre Fix propuesto, Tradeoffs, Resumen, Prioridad y lo que el enunciado no preveía.
15. hecho: nombra lo corrido con su salida y lleva su línea `**Sin probar:**`.
16. hecho: estado `resuelto` en el frontmatter y en el encabezado, `resuelto-en: 0.124.0` —la versión abierta— y entrada en «Corregido» del CHANGELOG.
