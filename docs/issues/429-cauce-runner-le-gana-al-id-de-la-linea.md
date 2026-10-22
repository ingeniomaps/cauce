---
caso: 429
titulo: con CAUCE_RUNNER fijado para el proyecto, la sesión de una línea toma el mismo id que la principal y comparte su WIP y sus reclamos
estado: resuelto
resuelto-en: 0.114.0
prioridad: alta
version-detectada: 0.113.2
---

# 429 — `runner()` devuelve `CAUCE_RUNNER` tal cual e ignora `--line`

**🟢 resuelto en 0.114.0** · detectado en 0.113.2, reproducido en 0.113.3 · prioridad **alta**. Una línea y la principal se pisan
el WIP y los reclamos sin que nada avise, que es justo lo que las líneas existen para evitar: la sesión de la línea
recibe como propia la tarea que tiene reclamada la principal.

## Resumen

`runner(line, root)` (`engine/planning/claims.js:60-61`) empieza con `if (process.env.CAUCE_RUNNER) return
process.env.CAUCE_RUNNER.trim()`: si la variable existe, el `--line` que la sesión dijo llevar no entra en el id. El
id por línea (`runnerOf(base, line)`, `engine/core/line-trees.js:63`, `<base>#line/<línea>`) sólo se arma cuando la
variable no está. `teamwork.md:153-155` promete lo contrario: «El id del runner de la sesión lleva la línea, así que
las dos sesiones tienen cada una su WIP y sus reclamos aunque corran `ops` desde la misma instancia».

Un proyecto que fija `CAUCE_RUNNER` para todas sus sesiones —en el `env` de `.claude/settings.json`, para que el
runner no dependa del árbol desde el que se lanza— queda con un solo id para la principal y para cada línea.

## Reproducción

Banco `sidecar` (`node engine/cli/ops.js bench sidecar --force`), desde la instancia del banco:

```bash
node tools/ops.js line . pagos app
CAUCE_RUNNER=acme node tools/ops.js claim planning tarea-medida            # la principal toma su tarea
CAUCE_RUNNER=acme node tools/ops.js context planning --line pagos --json  # la sesión de la línea
```

## Síntoma

Salida real en 0.113.3. `runner()` con y sin la variable:

```
"" sin línea -> …/sidecar/ops | --line pagos -> …/sidecar/ops#line/pagos
"acme" sin línea -> acme | --line pagos -> acme
```

El reclamo de la principal queda `runner: acme`, y `context --line pagos` —la sesión de la línea— la devuelve como suya:

```
{"task":"tarea-medida","claimed":true}
```

`tarea-medida` no es de ningún hito de `pagos`: la sesión de la línea la recibe porque «la tiene reclamada» el mismo
id. Desde ahí, las dos sesiones escriben `planning/wip/acme.md`.

En la instancia de origen (`CAUCE_RUNNER` con el nombre del proyecto en `.claude/settings.json`, y exportado igual al
lanzar `agy`), el reclamo de una tarea de la línea quedó con `runner: <proyecto>` y el plan en `planning/wip/<proyecto>.md`,
el mismo archivo que usa la sesión principal. No chocó porque la principal estaba en IDLE.

## Causa raíz

`engine/planning/claims.js:61`: la variable gana antes de mirar `line`. `engine/hooks/line-scope.js:93-100` (`lineOf`)
sí sabe leer una línea dentro de `CAUCE_RUNNER` si trae la marca `#line/<nombre>`, y si no la trae cae a la línea
anotada de la sesión: el motor ya contempla las dos cosas, lo que falta es que `runner()` las junte.

## Fix propuesto

En `runner()`:

```js
function runner(line = '', root = '') {
  const declared = String(process.env.CAUCE_RUNNER || '').trim()
  if (declared) return line && !declared.includes(`#${LT.BRANCH}`) ? LT.runnerOf(declared, line) : declared
  …
}
```

**Y no alcanza solo.** Los guards que buscan el plan dan por hecho lo que este caso cambia, «con `CAUCE_RUNNER` el id
es el declarado y no hay nada que deducir»:

- `plan-first` lee `readWip(planning, runner())` sin línea (`engine/hooks/files.js:256`), y `linePlan` se apaga con la
  variable puesta (`engine/hooks/files.js:242`). Con sólo el cambio de arriba, la sesión de la línea escribe su plan en
  `wip/acme-line-pagos.md` y el guard lo busca en `wip/acme.md`: la primera edición de cada tarea de la línea se frena
  con el plan escrito, que es la forma del 411.
- `scopeAlive` (`engine/hooks/chat.js:331`) lee el WIP con `runner()` sin línea para saber si una concesión sigue viva.

Los dos tienen que pedir el id con la línea de la sesión —`lineOf` de `line-scope.js`—, y la prueba del arreglo es la
reproducción de arriba más una edición del producto desde la sesión de la línea con su plan escrito.

## Tradeoffs

- `teamwork.md:232-236` cuenta con que el revisor y el programador de una línea compartan el id para compartir el WIP;
  con la variable fijada para el proyecto los dos dicen `--line` y siguen teniendo el mismo id marcado. Y el que
  declara un id propio con `CAUCE_RUNNER` para trabajar en paralelo pasa a tener `<propio>#line/<línea>`, que sigue
  siendo distinto del otro.
- `ops worktree` exporta `CAUCE_RUNNER=<ruta del árbol>` sin marca (`engine/cli/worktree.js:134`). Si la sesión después
  dice `--line`, su id cambia de lo que `worktree` comparó al montar (`:51`). Hay que mirar si ese camino existe dentro
  de una línea antes de dar el fix por cerrado.
- Los reclamos y WIP ya escritos con el id sin marca quedan huérfanos al actualizar; `ops check` debería avisarlos.

## Contexto de descubrimiento

Instancia de una empresa, 2026-10-21: coordinación lanza programador (`agy`), revisor y QA de la línea `pagos` con
`CAUCE_RUNNER` fijado. Apareció al planear una prueba con dos líneas en paralelo, revisando con qué id salían los
reclamos.

## Relacionados

- 422 y 423 (la sesión de una línea lee su línea de lo que dice o de `CAUCE_RUNNER`).
- 411 (el id de la línea distinto entre `ops` y `plan-first`): la misma divergencia, del otro lado.

## Cierre

**Resuelto en 0.114.0**, a pedido del dueño el 2026-10-21 («si inicia con el arreglo de 429»). 0.113.3 está publicada
y no había ninguna versión abierta. Sólo era un patch, como el 427: corrige el id que usan `ops` y dos guards, sin
guard, regla ni protocolo nuevos. Se abrió como 0.113.4 y pasó a 0.114.0 antes de publicarse, cuando el 428 sumó a la
misma versión un campo nuevo de `ops.config.json`.

`runner()` (`engine/planning/claims.js:65-66`) le agrega la línea al id declarado cuando no la trae. Los dos guards que
el fix propuesto no alcanzaba leen ahora el WIP con la línea de la sesión, que sale de `lineOf`
(`engine/hooks/line-scope.js`, ahora exportada): `planFirst` (`engine/hooks/files.js`) y `scopeAlive`
(`engine/hooks/chat.js`). `scopeAlive` pide `line-scope` adentro de la función porque cargarlo arriba cerraba el ciclo
`line-scope` → `approval` → `chat`.

El caso, sección por sección:

- **Resumen.** Lo que prometía `teamwork.md:153-155` —cada sesión con su WIP y sus reclamos— ahora vale también con
  la variable fijada para el proyecto. `teamwork.md` no se tocó: lo que decía era lo correcto.
- **Reproducción y síntoma.** Corridos de nuevo con el motor arreglado; abajo.
- **Fix propuesto**: se hizo tal cual en `runner()`, y además en los dos guards que el caso nombraba. Con sólo
  `runner()`, la prueba se pone roja en `plan-first`: la línea editaba con el plan de la principal.
- **Tradeoffs, revisor y programador en la misma línea.** Siguen compartiendo id: los dos dicen `--line` y los dos
  dan `<id>#line/<línea>`. Con un id propio cada uno, para trabajar en paralelo (`teamwork.md:232-236`), siguen siendo
  distintos.
- **Tradeoffs, `ops worktree`.** El id sin marca que exporta (`engine/cli/worktree.js:134`) es el de un árbol por tarea,
  y ese camino existe sólo sin `--line`: con línea, `worktree` va a `lineWork` (`:72`) y su id sale de `runner()` con
  la línea, igual que `claim`. No hay combinación que cambie el id entre montar y reclamar.
- **Tradeoffs, reclamos y WIP huérfanos.** Se midió en el banco: un reclamo `runner: acme` de una tarea de la línea, y
  la sesión de la línea con `CAUCE_RUNNER=acme`. `claim` frena y nombra el id viejo, así que no queda en silencio.
  Pero la salida que sugiere —«corré con ese id»— no se puede seguir desde la línea. Se decidió no sumarle un aviso a
  `check`, porque es una migración que pasa una vez y el freno ya la hace visible: el CHANGELOG de 0.114.0 dice qué
  hacer. `release`, en la misma situación, decía «es de <el mismo dueño>» y mandaba a borrar el reclamo: eso salió
  como el **caso 432**, resuelto en la misma versión, y desde ahí la migración tiene una salida que se corre (soltar con
  el id viejo, tomar con `--line`), medida en el banco del 432.
- **Prioridad.** No traía condición de escalada.
- **Encontrado de más.** `scopeAlive` leía el WIP sin la línea también **sin** la variable: ahí `runner()` da el id
  del árbol donde corre el proceso, y el de la línea es el de la instancia con la línea. El mismo cambio lo cubre.

**Lo que se corrió para saber que funciona.**

- La prueba nueva, en `test/hooks/line-trees.test.js` («con CAUCE_RUNNER fijado para el proyecto, la sesión de una
  línea tiene su WIP, sus reclamos y su plan»). Vista en rojo antes del arreglo: `actual: 'wip/acme.md', expected:
  'wip/acme-line-pagos.md'`.
- Cuatro mutaciones en una copia fuera del árbol, con la copia en verde antes. `runner()` devolviendo el id tal cual
  pone la prueba en rojo en el WIP (`:164`). `plan-first` sin la línea, en la edición que tenía que frenar (`:182`).
  `scopeAlive` sin la línea, en la concesión que tenía que seguir viva (`:197`). Y marcar la línea aunque el id ya la
  traiga da `actual: 'wip/acme-line-pagos-line-pagos.md'` (`:170`).
- La reproducción del caso sobre `ops bench sidecar`, con el motor arreglado. La principal toma su tarea como `acme`, y
  `context --line pagos` devuelve `{"task":null,"claimed":false,"wipFile":"wip/acme-line-pagos.md"}`. Antes del
  arreglo devolvía `{"task":"tarea-medida","claimed":true}`. `runner('pagos')` con `CAUCE_RUNNER=acme` da
  `acme#line/pagos`.

**Lo que encontró la revisión del conjunto** (`/code-review high` sobre la rama). Un `CAUCE_RUNNER` que ya trae una
línea —el que se exporta desde una sesión de línea— se respeta, y así una sesión que después pedía `--line` de otra
línea leía y escribía el WIP y los reclamos de la primera sin enterarse. `sessionLine` (`engine/planning/lines.js`)
frena ahora con el motivo: «CAUCE_RUNNER=acme#line/admin es el id de la línea admin, y pediste --line pagos». La
aserción nueva de `test/hooks/line-trees.test.js` se pone roja sin esa comprobación, en una copia.

**La segunda pasada de revisión** encontró tres cosas más del mismo freno:

- **Sin `--line` no frenaba nada.** Con un id marcado y sin `--line`, la sesión se contestaba como la principal y
  trabajaba con el id de la línea. Ahora un id marcado sin `--line` es la sesión de esa línea, que es lo que ya leía
  `line-scope`.
- **El mensaje se podía leer al revés.** Decía «el mismo con #line/<línea> al final», que pegado sobre el valor actual
  daba `acme#line/admin#line/pagos`. Ahora imprime el `export` con el id de la línea pedida ya hecho, y citado.
- **`runner()` tenía su propio parser** de la marca, que no coincidía con `lineOfRunner` en una marca vacía. Ahora usa
  el mismo, y una prueba compara los dos sobre tres ids.

Cada uno se pone rojo con su mutación, en una copia.

**En agy y Gemini, el 2026-10-22.** Hasta acá la prueba era del motor y de los guards por su arnés: ninguna sesión real
de agy o Gemini había corrido dentro de una línea. Se armaron dos instancias fuera del árbol con la línea `piloto`
(`ops line ops piloto app`). La principal tenía reclamada `tarea-principal` y su plan en el WIP; la línea tenía su
propio hito (`backlog/piloto-hito.md`, `line: piloto`) y ningún WIP. Las dos sesiones corrieron con `CAUCE_RUNNER=banco`,
que es la condición del caso. Cada una reclamó con `--line piloto` y escribió en `lines/piloto/app/src/name.js` sin
plan propio:

- **`agy` 1.4.4, sesión real**: frenó con «cambia el producto sin plan. hay plan escrito, pero bajo otro id: banco
  (tarea-principal)». Sin el arreglo, ese plan de la principal habría sido el suyo.
- **Gemini 0.63.0, sesión real**: escribió el archivo. Lo dejó pasar el atajo del caso 098, no la línea: la escritura
  la pedía la consigna, que la persona escribió en el chat, y Gemini tiene hook de mensaje (`CHAT.said` daba `true`
  para esa sesión). agy no lo tiene, y por eso frenó lo mismo (`teamwork.md:258` ya lo dice). La línea sí había
  quedado anotada para esa sesión, por el `session_id` que Gemini manda en cada llamada.
- **Gemini, la misma cadena sin el atajo**: se pasó a mano la llamada con la forma que Gemini manda, capturada por un
  guard del proyecto que guardaba su stdin, en una sesión sin pedido en el chat. Primero `guard-shell.sh` con el
  `claim --line piloto`, que anotó la línea, y después `guard-files.sh` con el `write_file`. Antes del `claim` pasa,
  porque la sesión es la principal y tiene plan; después, «BLOQUEADO: … cambia el producto sin plan. hay plan escrito,
  pero bajo otro id: banco».

**La revisión de la rama entera** encontró dos bordes más:

- **`context` aconsejaba un `export` que no sirve.** Desde la sesión de una línea, un reclamo y un plan propios con
  el id sin marca —de antes de este caso— salían con «retomalo con `export CAUCE_RUNNER=acme`». Exportarlo no
  reproduce el id, porque `runner()` le vuelve a agregar la línea. Ahora `context` imprime la migración que sí se
  corre: soltarla con ese id, tomarla con `--line` y mover el plan al WIP que esa sesión va a leer (`legacyResume`,
  `engine/planning/lines.js`). La segunda pasada encontró dos errores en la primera versión de ese aviso. Nombraba
  como destino el id viejo con la línea, que no es el de la sesión cuando las dos bases difieren, y el plan quedaba
  huérfano otra vez. Y salía también en una línea de antes de 0.111.0, que lleva ids sin marca a propósito y donde el
  `export` sí sirve. Además, el comando de `release` que imprime pasó a armarse en un solo lugar
  (`releaseCommand`, `engine/planning/claims.js`), el mismo que usa `release`. La tercera pasada encontró tres casos
  más, y el consejo entero quedó en una función, `resumeAdvice`:
  - Si la sesión ya tiene su propio plan, mover el viejo encima lo pisaba. Ahora lo dice y manda a cerrar ése primero.
  - Un id de otra línea se aconsejaba exportar, y exportarlo frena contra el `--line` de ésta. Ahora manda a retomarlo
    desde la sesión de esa línea.
  - Las rutas del plan eran relativas a `planning/` y la del comando, al directorio actual.

  La cuarta pasada encontró tres bordes más en ese consejo:
  - Contaba como «ocupada» la sesión cuyo WIP ya era el de esta misma tarea, que es justo el caso de quien ya movió el
    plan. Ahí lo mandaba a cerrar el plan que necesita. Ahora dice que falta sólo soltarla y tomarla.
  - Las rutas a mover salían sin citar. Ahora el movimiento es un `mv` con las rutas citadas.
  - En el mismo renglón se nombraba un archivo de dos formas. La regla quedó así: en la prosa, el WIP se nombra como
    en el resto de `context`, relativo al planning; en los comandos, relativo a donde se corre, para pegarlo.

  La prueba de integración pide ahora las rutas exactas del `mv`. Antes aceptaba cualquier prefijo y no veía si eran
  relativas a donde se corrió.
- **Una línea retirada en la variable culpaba a `--line`.** Con `CAUCE_RUNNER=acme#line/retirada` exportado y la
  línea ya no declarada, todo `ops` decía «la línea retirada no está declarada… Se arma con `ops line`». Ahora, si la
  línea la trajo la variable, el mensaje nombra la variable.

Las dos van en la prueba nueva de `test/hooks/line-trees.test.js`, «el plan de una línea con el id de antes se migra,
y una línea retirada en la variable se nombra». Cada caso del consejo está en `test/planning/lines.test.js`, «el
consejo para retomar un plan propio depende de la línea del id y de la sesión». Cada uno se pone rojo con su mutación,
en una copia.
