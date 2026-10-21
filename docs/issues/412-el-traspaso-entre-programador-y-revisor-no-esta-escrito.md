---
caso: 412
titulo: el protocolo no escribe el traspaso entre quien construye y quien revisa, y el revisor que cierra no puede soltar el reclamo
estado: resuelto
resuelto-en: 0.112.0
prioridad: media
version-detectada: 0.112.0
---

# 412 — Cuando una tarea la construye una sesión y la revisa otra, no hay un estado escrito para «construida, espera revisión», y `check` manda a soltar el reclamo con un comando que al revisor se le niega

**🟢 resuelto en 0.112.0** · detectado en 0.112.0 · prioridad **media**. Es lo que quedó del experimento del caso 406. Con los arreglos de
410 y 411, la jerarquía coordinador, líder, programador y revisor funciona con lo que hay. Lo que falta es escribir cómo se
pasan la tarea: hoy sale bien sólo si el pedido de cada sesión lo explica, y el último paso deja un reclamo colgado.

## Resumen

La máquina por tarea de `PROTOCOL.md` la recorre **una** sesión de punta a punta, de Pick a Done. Cuando se reparte —un
programador construye, un revisor juzga y cierra— aparecen tres huecos:

1. **No hay estado de traspaso.** El WIP tiene `phase:`, de texto libre (`template/planning/wip/README.md`), y en el
   experimento `phase: Review` sirvió: es contenido y no presencia (R28), y el revisor lo encontró. Pero ningún documento lo
   nombra, ni dice qué hace cada rol con él. El programador lo escribió porque su pedido se lo dijo.
2. **El revisor que cierra no puede soltar el reclamo.** El paso 13, Done, dice «limpiar WIP, soltar el reclamo»
   (`template/planning/PROTOCOL.md:88`), pero el reclamo es del id del programador, y `ops release` se niega con otro id
   (`engine/cli/claims.js:118-119`). `check` igual le dice que lo suelte con `ops release` (`engine/planning/claims.js:131`).
3. **Desde 411, dos roles en la misma línea comparten id.** Sin `CAUCE_RUNNER`, el programador y el revisor de la línea `web`
   son los dos `<instancia>#line/web`, así que comparten el WIP. Eso facilita el traspaso —el revisor ve el plan del
   programador como propio—, pero con las dos sesiones abiertas a la vez el WIP es el mutex de las dos (gate 2 de
   `PROTOCOL.md`). Hay que decidir si es lo que se quiere o si cada rol declara su id.

## Reproducción

**El experimento del 406, el 2026-10-20**, en un banco instalado: el programador (`agy`) dejó el WIP en `phase: Review` porque el
pedido decía «dejá en tu WIP phase: Review y no la cierres»; el revisor (Claude) aprobó, escribió `done/` y sacó la tarea del
backlog; y `check` terminó con:

```
⚠ claims/unificar-color-primario.md: unificar-color-primario ya está en DONE; soltala con `ops release`
```

**Que el revisor no puede soltarlo**, sobre `ops bench tarea` (una tarea reclamada), el mismo día: con la tarea cerrada en
`done/` y fuera del backlog:

```
== check
⚠ claims/tarea-medida.md: tarea-medida ya está en DONE; soltala con `ops release`
== release como el revisor (otro id)
tarea-medida es de banco@cauce.local. Si se abandonó, borrá claims/tarea-medida.md a mano.
exit=1
== release como quien reclamó
✓ tarea-medida soltada; volvió a la cola
```

La última línea es un cuarto hallazgo, chico: dice «volvió a la cola» de una tarea que está en DONE.

## Causa raíz

- `template/planning/PROTOCOL.md:70-92`: la máquina por tarea supone una sola sesión; no nombra un traspaso.
- `engine/cli/claims.js:118-119`: `release` exige el mismo id, también para un reclamo cuya tarea ya está en DONE, donde no queda
  trabajo de nadie que liberar.
- `engine/planning/claims.js:131`: el aviso de `check` recomienda ese comando sin decir que sólo le sirve a quien reclamó.
- `engine/cli/claims.js:122`: «volvió a la cola» se imprime sin mirar si la tarea está en DONE.

## Fix propuesto

Dos piezas, y la primera pide una decisión:

**1. Escribir el traspaso**, en `PROTOCOL.md` y en `delivery/teamwork.md`, que es donde se lee cómo se trabaja en equipo:

- quien construye termina en Commit, deja el WIP en `phase: Review` y no escribe `done/`;
- quien revisa toma la tarea por ese estado, juzga con lo que está en disco —aceptación, WIP, diff, la mutación corrida en una
  copia— y cierra, o devuelve: hallazgos en `## Bloqueos` y `phase: Build`;
- el que cierra suelta el reclamo.

**A decidir:** si los roles de una misma línea comparten id (lo que pasa hoy después de 411, y lo que hace que el revisor herede
el WIP) o si cada rol declara el suyo con `CAUCE_RUNNER`. Lo primero es más simple y obliga a que no estén abiertos a la vez sobre
la misma tarea; lo segundo permite sesiones en paralelo y necesita que el revisor pueda leer el WIP de otro id.

**2. Que `ops release` suelte un reclamo cuya tarea ya está en DONE**, venga de quien venga, y que lo diga como cierre y no como
«volvió a la cola». Ahí no hay trabajo de otro que liberar: el reclamo ya no reserva nada, y negarlo sólo deja la basura que
`check` señala. Un reclamo de una tarea que no está en DONE se sigue negando como hoy (`claims/README.md`: «liberar el trabajo
de otro es una decisión, no un comando»).

La aceptación pide las mutaciones: con la excepción de DONE quitada, la prueba que suelta como otro runner un reclamo de una tarea
cerrada vuelve a recibir la negativa y falla; con la excepción sin mirar DONE, la prueba que intenta soltar el reclamo de una tarea
en curso de otro runner deja de negarse y falla.

Y la prueba real es el experimento del 406 repetido sin explicar el traspaso en los pedidos: el programador y el revisor lo hacen
porque lo dice el protocolo, y `check` termina sin avisos.

## Tradeoffs

- Escribir el traspaso en `PROTOCOL.md` cambia lo que recibe cada empresa en su próximo `upgrade`, y mueve el peso de las reglas
  (la prueba de KB). Va en `teamwork.md` lo que es manera de trabajar, y en `PROTOCOL.md` sólo lo que el motor lee.
- Soltar un reclamo cerrado sin ser su dueño borra un archivo de otro; como la tarea está en DONE, lo que se pierde es sólo la
  fecha de cuándo se tomó, que `done/` ya registra.

## Contexto de descubrimiento

El experimento del caso 406, el 2026-10-20, después de arreglar 410 y 411.

## Relacionados

- 406 — la jerarquía entre runners; esto es lo que le falta para quedar escrita.
- 410, 411 — los dos defectos que el mismo experimento encontró.

## Cierre

**Resuelto en 0.112.0, con id compartido.** La decisión que el caso pedía la tomó el dueño: los roles de una misma línea
comparten el id, el de la instancia con la línea.

- `template/planning/delivery/teamwork.md`, sección nueva «Una sesión construye y otra revisa»: quien construye llega hasta
  Commit y deja el WIP en `phase: Review`, sin tocar `done/` ni la cola; quien revisa juzga con lo que está en disco y cierra
  entero —`done/`, cola, WIP, `ops release`— o devuelve con los hallazgos en `## Bloqueos` y `phase: Build`. Con id
  compartido el revisor continúa el WIP del programador, y por eso no trabajan la misma línea a la vez; para trabajar en
  paralelo, cada uno declara su `CAUCE_RUNNER`.
- `template/planning/PROTOCOL.md`, paso 12: si la tarea la revisa otra sesión, quien construye se detiene ahí con
  `phase: Review`, y quien revisa la juzga sobre lo commiteado y hace Done. Remite a `teamwork.md`.
- `engine/cli/claims.js` (`release`): el reclamo de una tarea que ya está en DONE lo suelta cualquiera, y lo dice como cierre:
  «soltada: ya estaba en DONE, el reclamo no reservaba nada». El de una tarea en curso de otro se sigue negando.

El enunciado, ítem por ítem:

- **1. Escribir el traspaso**: hecho, como arriba. En `PROTOCOL.md` va sólo la frase del paso 12, porque el motor no lee la
  fase; la manera de trabajar va en `teamwork.md`, como pedía el tradeoff.
- **La decisión del id**: compartido. Por qué no trabajan a la vez y qué hacer si hace falta, en `teamwork.md`.
- **2. `release` de un reclamo cerrado**: hecho, con el mensaje de cierre. El cuarto hallazgo, «volvió a la cola» sobre una
  tarea en DONE, también: ese texto queda sólo para la que de verdad vuelve.
- **Las dos mutaciones del caso**, y una más: abajo.
- **La prueba real del experimento sin explicar el traspaso**: abajo.
- **Tradeoff, el peso de las reglas**: `PROTOCOL.md` no está en `rules/system/`, y `npm run ci` pasa entero.

**Lo que se corrió para saber que funciona.**

- `test/planning/claims.test.js`, «el reclamo de una tarea cerrada lo suelta quien la cerró, aunque la haya tomado otro»:
  `check` avisa el reclamo colgado; el revisor, con otro id, lo suelta con el mensaje de cierre, sin «volvió a la cola», y
  `check` deja de avisar; el reclamo de una tarea en curso de otro se sigue negando. Roja antes del cambio (la negativa de
  siempre).
- Mutaciones en una copia fuera del árbol, las tres en rojo: sin la excepción de DONE; la excepción sin mirar DONE (también
  soltaba lo ajeno en curso, y se puso roja también «dos personas no reciben la misma tarea…», la
  prueba que ya lo fijaba); el mensaje de siempre.
- La reproducción del caso, con el motor de la rama sobre `ops bench tarea`: con la tarea cerrada, `CAUCE_RUNNER=revisor ops
  release` sale 0 con «✓ tarea-medida soltada: ya estaba en DONE, el reclamo no reservaba nada», y `check` ya no avisa.
- **Real, el experimento del 406 repetido sin explicar el traspaso**, en un banco instalado fuera del árbol con el motor de la
  rama, Claude y Antigravity instalados y la línea `web`. Los pedidos sólo nombran el rol: al programador, «construila
  siguiendo el protocolo de Cauce y sus guías de trabajo en equipo. Esta tarea la revisa y la cierra otra sesión»; al
  revisor, «revisá la tarea de tu línea que espera revisión, siguiendo el protocolo y sus guías».
  - Programador, `agy -p` en el árbol de la línea: leyó `PROTOCOL.md` y `teamwork.md` (aparecen en su registro), reclamó,
    dejó el WIP bajo `<instancia>#line/web` con tres pasos tachados y `phase: Review`, commiteó en `line/web` (`31d7b92`,
    cinco archivos), y no tocó `done/` ni la cola.
  - Revisor, `claude -p` en la carpeta de sesión (USD 0,88): aprobó, escribió `done/unificar-color-primario.md` con `commit`,
    `qa` y `review`, sacó la tarea de la cola, limpió el WIP y soltó el reclamo. `check` sale 0 y ya no avisa ningún reclamo
    colgado. El único aviso que quedó, «2 commit(s) … que ninguna entrada de DONE nombra», es de los dos commits con que se
    armó el banco. La mutación de la aceptación, repetida aparte en una copia: roja.
  - Lo que esta corrida no prueba: los dos roles tenían el mismo id, así que el revisor podía soltar el reclamo también sin el
    cambio de `release`. Esa parte la prueba la reproducción de arriba.

**Lo que encontró la revisión del conjunto**: `release` armaba el `snapshot` entero del planning sólo para preguntar si la
tarea está en DONE. Ahora lee `P.readDone`, que es de donde el `snapshot` saca su `done`, así que la respuesta es la misma.
Mutación en rojo: con `closed = false`, la prueba de este caso vuelve a negar la liberación.
