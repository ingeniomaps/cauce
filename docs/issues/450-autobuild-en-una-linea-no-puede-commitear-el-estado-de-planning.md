---
caso: 450
titulo: Un /autobuild en una línea de trabajo no puede commitear el estado de planning cuando la instancia está en su rama viva, porque el recorrido manda cortar work/planning y line-scope frena todo checkout en la instancia
estado: resuelto
resuelto-en: 0.116.0
prioridad: media
version-detectada: 0.115.1
---

# 450 — Un `/autobuild` en una línea no puede commitear el estado de planning

**🟢 resuelto en 0.116.0** · detectado en 0.115.1 · prioridad **media** — todo `/autobuild <línea>` que cierra una tarea con la
instancia sidecar en `main` o `master` y sin rama de trabajo de planning.

## Resumen

Al cerrar una tarea, el recorrido commitea el estado de planning (la entrada de `done/`, las acciones humanas, el
INBOX, el checkpoint). Si la instancia está en una rama viva, el pedido le dice al agente que se pase a la rama de
trabajo de planning y, si no hay ninguna, que corte `work/planning`. En una sesión de línea, `line-scope` frena
todo `git checkout` y `git switch` en la instancia, porque la instancia es una sola para todas las sesiones. Las dos
reglas son correctas por separado y juntas no tienen salida. El cierre queda sin commitear, y el bloqueo ofrece como
única vía pegar la ruta de la instancia entera en `.ops-approval`. Esa línea es mucho más ancha que el commit de
planning que se quería hacer.

El bloqueo además se contradice: dice «Esto lo corregís vos, con lo que dice arriba: no hace falta preguntarle a
nadie» y en la línea siguiente «Esto lo aprueba una persona». El agente no tiene cómo corregirlo solo.

No es lo mismo que el 449. Allá la persona pide el `git` en el chat y la orden no lo destraba. Acá nadie pide nada:
el propio recorrido le dicta al agente un comando que el guard prohíbe siempre.

## Reproducción

Banco instalado: sidecar con `app` y `web`, línea `piloto` sobre `app`, instancia en `master` sin ramas de
trabajo, y una tarea en `backlog/primero.md` con `line: piloto`. Se corre el recorrido hasta cerrar la tarea:

```bash
claude -p '/autobuild piloto' --permission-mode bypassPermissions --output-format json
```

El guard solo, con el mismo comando y la misma sesión de línea, contra el motor de 0.115.1 y el de `7e54a2ec`:

```bash
P='{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"<sesión de la línea>",
    "tool_input":{"command":"git checkout -b work/planning"},"cwd":"<banco>/ops"}'
echo "$P" | OPS_ROOT=<banco>/ops CLAUDE_PROJECT_DIR=<banco> node <motor>/engine/hooks/run.js shell-boundary
```

## Síntoma

Medido el 2026-10-25, corrida `wf_2cfef1ed-aee`. La tarea se commiteó en el árbol de la línea (`91de16c`) y su
entrada de `done/` se escribió. Después, la fase `planning-commit` devolvió:

```
"committed":false,"branch":"master","live":true,
"reason":"… Está en `master`, que es rama viva, y no existe ninguna rama de trabajo de planning, así que había que
cortar `work/planning`. El guard de shell frenó el `git checkout -b work/planning`. Su mensaje, tal cual:
\"BLOQUEADO: esta sesión lleva la línea piloto, y escribe sólo en sus árboles (lines/piloto/…) y en la instancia:
<banco>/ops es la instancia, una sola para las dos sesiones, y `git checkout` le cambia a la otra su rama, su árbol o
su stash. … Esto lo corregís vos, con lo que dice arriba: no hace falta preguntarle a nadie. Esto lo aprueba una
persona: que pegue ella tal cual en ops/planning/.ops-approval estas líneas: <banco>/ops …\""
```

Quedaron sin commitear `done/sumar-left-pad.md`, las dos filas de `human/`, cuatro entradas de
`inbox/propuestas/` y el borrado de `backlog/primero.md`.

El guard solo, con los dos motores:

```
== 0.115.1
BLOQUEADO: esta sesión lleva la línea piloto, y escribe sólo en sus árboles (lines/piloto/…) y en la instancia: …
  <banco>/ops
exit 2
== 7e54a2ec
(la misma salida)
exit 2
```

No es una regresión de 0.116.0: el bloqueo y su línea son idénticos en 0.115.1.

## Causa raíz

- `automatization/workflows/autobuild.js:420` (`PLANNING_BRANCH`): con la instancia en una rama viva y sin rama de
  planning, el pedido es «cortá `work/planning`», sin distinguir una sesión de línea.
- `engine/hooks/line-scope.js:126` (`SHARED`): `checkout` y `switch` en la instancia salen de la línea (caso 423),
  porque le cambian la rama a la otra sesión.
- `engine/hooks/line-scope.js:222` y `engine/hooks/approval.js:162`: el bloqueo pasa `fixable: true`, que agrega
  «Esto lo corregís vos», junto a una línea para pegar que sólo puede escribir una persona.

## Fix propuesto

Pide una decisión antes de construir: cuál de las dos reglas cede en una línea.

1. **Que la línea no cambie la rama de la instancia.** En una línea, si la instancia está en una rama viva, el
   commit de planning no se intenta: el recorrido para con una parada propia que dice qué quedó sin commitear y que
   lo commitea la sesión principal (o una persona), que es la dueña de la rama de la instancia. Es lo que `line-scope`
   ya afirma.
2. **Que la rama de planning exista antes.** `ops line` crea `work/planning` en la instancia al armar la línea si no
   hay ninguna, así la línea sólo commitea en una rama que ya está. Cuesta decidir qué pasa si la sesión principal
   está parada en otra rama.

Aparte de cuál se elija: el bloqueo no debería decir «lo corregís vos» cuando lo único que ofrece es una línea para
una persona.

## Prueba de cierre

- La corrida de la reproducción, repetida: el cierre no termina en un bloqueo de `line-scope`, y lo que no se
  commitea lo dice una parada propia, no un `reason` libre.
- El bloqueo de `line-scope` sobre la instancia sin la frase «Esto lo corregís vos», con su prueba vista en rojo.

## Contexto de descubrimiento

La corrida que completó la prueba real del 448 en la rama de los huecos de 0.116.0, el 2026-10-25.

## Relacionados

- 449: el mismo guard, con la orden de la persona en el chat.
- 423: por qué `checkout` y `switch` en la instancia salen de la línea.
- 448: la corrida donde apareció.

## Cierre

**Resuelto en 0.116.0**, en la rama de los huecos de esa versión. La decisión, del 2026-10-25, fue la primera del
fix propuesto: la línea no cambia la rama de la instancia, y el recorrido para diciéndolo.

- **Que la línea no cambie la rama de la instancia.** Se hizo. En una línea, el pedido de todo commit de planning
  dice que si la instancia está en una rama viva no se cambia de rama ni se commitea (`LINE_INSTANCE`, en
  `automatization/workflows/autobuild.js`). Si el cierre de una tarea queda así, la corrida no toma otra tarea:
  termina el hito, con su checkpoint, y para con `planning-uncommitted`, una parada nueva de la familia «Persona»
  (`engine/planning/stops.js` y el `PROTOCOL.md` del molde).
- **Que la rama de planning exista antes.** Se decidió que no: era la alternativa.
- **El bloqueo que se contradecía.** Se hizo con el 449: un `git` en la instancia ya no dice «Esto lo corregís vos»,
  y lo que ofrece pegar es `git switch @ <instancia>`, no la instancia entera.

Lo que no preveía: la primera versión del arreglo paraba en el commit de planning, con `return halt(...)`. La corrida
real `wf_5cc4a84c-046` mostró que así el hito terminaba sin su checkpoint humano, que antes sí se escribía. Era una
quita, y se corrigió: la corrida marca la parada, sale del lazo de tareas, hace el cierre y el checkpoint, y para al
final.

La prueba:

- `test/workflows/autobuild-line.test.js`: en una línea, con el commit de planning devolviendo `live: true` sin
  commitear, el pedido lleva la consigna, la corrida termina en `planning-uncommitted` nombrando la tarea y la sesión
  principal, y el checkpoint del hito se pide igual. Fuera de una línea, nada cambia. En una copia, cinco mutaciones
  dieron rojo: sin la parada, sin la consigna al agente, parar a mitad del lazo, no parar al final, y no marcar la
  corrida.
- **Dos corridas reales** de `claude -p '/autobuild piloto'` en el banco sidecar, con la instancia en `master` y sin
  rama de planning:
  - `wf_5cc4a84c-046` (USD 6,37, primera versión): el commit de planning devolvió `committed: false` («Esta corrida
    lleva la línea piloto … no cambié de rama, no stageé nada»), y paró con `planning-uncommitted`. Sin checkpoint.
  - `wf_e16e9535-609` (versión final): el mismo `committed: false`, después `closing`, `human-checkpoint` (escribió
    `checkpoints/tercero.md` sin commitearlo, por la misma consigna) y `checkpoint-held`. Paró con «anotar-licencia
    quedó entregada y su estado de planning sin commitear: la instancia está en master …».
  - En las dos, después de la parada, el agente de la sesión intentó por su cuenta `git switch -c` en la instancia.
    `line-scope` lo frenó y ofreció pegar `git switch @ <banco>/ops`, la línea angosta del 449.

**La revisión de código del conjunto, el mismo día**, encontró dos cosas, y las dos se arreglaron con su prueba vista en
rojo:

- Si otra parada del cierre llegaba antes —un `check` en rojo que no se repara—, tapaba la del 450 y no se decía qué
  había quedado sin commitear. `halt` suma ahora ese detalle a cualquier parada.
- La parada final no traía la lista de tareas entregadas (`done`, `count`, `hito`) que trae el final de siempre.
  `stop` (`automatization/shared/workflow-finish.js`) acepta esos campos, y la parada los lleva.

**La segunda pasada de revisión** encontró que las dos salidas seguían sin traer todo lo del final de siempre: la
parada propia perdía `manual` y `checkpoint` (lo que el caso 380 sumó), y la parada que llega antes no traía `done`.
Las dos lo llevan ahora, con su prueba y su mutación en rojo.
