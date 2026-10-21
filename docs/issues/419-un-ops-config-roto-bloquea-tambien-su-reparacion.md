---
caso: 419
titulo: con ops.config.json ilegible, los guards frenan toda herramienta, también la que lo repara
estado: resuelto
resuelto-en: 0.113.0
prioridad: media
version-detectada: 0.112.0
---

# 419 — Un `ops.config.json` con marcas de conflicto deja la sesión sin ninguna herramienta, incluida la que lo arregla

**🟢 resuelto en 0.113.0** · detectado en 0.112.0 · prioridad **media**. No rompe nada ni deja pasar nada: es cerrado por defecto, como
debe ser. Pero el único camino de salida queda del lado de la persona, y ningún mensaje lo nombra.

## Resumen

`configOf` (`engine/hooks/input.js:175-182` al abrir el caso) bloquea con `ops.config.json no se puede leer (…). Un guard no decide sin él.`
cuando el archivo no es JSON válido. Lo llaman los guards de shell y de archivos antes de mirar qué hace la llamada, así que
con el archivo roto se frena **todo**: un `git checkout HEAD -- ops.config.json`, un `python3` que lo reescribe y un `Edit`
sobre el mismo archivo para sacarle las marcas. El comentario de `ops-config.js:63-66` promete una salida para el JSON
ilegible («mandá el archivo entero en una sola escritura»), pero ésa es para el contenido **entrante** de un `Edit`; con el
archivo en disco roto, `configOf` frena antes de llegar ahí.

La sesión no tiene cómo repararlo. Lo destrabó la persona corriendo el comando en el prompt con `!`, que no pasa por los hooks,
y para eso tuvo que entender que ésa era la salida: el mensaje del bloqueo no lo dice.

## Reproducción

El 2026-10-20 en una instancia sidecar con Claude Code, en una rama de planning:

1. `git stash push ops.config.json` con un cambio local, `git merge main` (que tocaba la línea de al lado) y `git stash pop`.
   El pop deja `<<<<<<< Updated upstream … >>>>>>> Stashed changes` dentro del archivo.
2. Bash `python3 -` que reescribe el archivo: `guard-shell.sh: BLOQUEADO: ops.config.json no se puede leer (Expected
   double-quoted property name in JSON at position 497 (line 25 column 1)). Un guard no decide sin él.`
3. `Edit` que reemplaza el bloque del conflicto: `guard-files.sh: BLOQUEADO:` con el mismo mensaje.
4. Bash `git checkout HEAD -- ops.config.json`: el mismo mensaje.
5. El Stop hook (`guard-planning-drift.sh`) además frena el cierre del turno con `✗ ops.config.json: JSON inválido`.

El `Write` con el archivo entero, que el caso dejaba como supuesto, se verificó al mejorarlo: frena igual. El 2026-10-20,
sobre un banco `ops bench suelto` con marcas de conflicto en `ops.config.json`, el grupo `pre-shell` y el `pre-files` como
proceso, antes del arreglo:

| Llamada | Archivo sano | Archivo roto |
|---|---|---|
| `ls` | pasa | frena |
| `git checkout HEAD -- ops.config.json` | pasa | frena |
| `git restore ops.config.json` | pasa | frena |
| `Write` de `ops.config.json` entero y válido | pasa | frena |
| `Edit` que saca las marcas | frena (contenido parcial) | frena |
| `Write` de `notas.md` | pasa | frena |

O sea que no se frena sólo la reparación: con el archivo roto la sesión se queda sin ninguna herramienta.

## Qué haría falta

- Que la escritura **de `ops.config.json` mismo** con un contenido completo y válido pase aunque el de disco esté roto: lo
  que se compara no existe, pero lo entrante sí se puede leer y juzgar solo (¿amplía `allowPush`, las raíces?) contra los
  defaults. O, más chico, que `git checkout`/`git restore` de ese archivo hacia un commit pase: deja un contenido que ya
  estuvo commiteado.
- Que el mensaje nombre la salida que hay hoy: «corré `! git checkout HEAD -- ops.config.json` desde el prompt» o la
  equivalente de cada runner.
- Vale mirar si `planning/` roto (otro archivo que los guards leen antes de decidir) tiene la misma forma.

## Cierre

**Resuelto en 0.113.0.** Con `ops.config.json` ilegible pasa una sola cosa: volver al contenido del último commit, con
`git checkout HEAD -- ops.config.json` o `git restore --source=HEAD`, solo y sin nada que el shell expanda. La decisión es
`restoresConfig` (`engine/hooks/ops-config.js:210`), y `executeAll` la consulta antes de cualquier guard
(`engine/hooks/run.js:277`), que es por donde entran los cuatro runners. El bloqueo de `configOf` nombra esa salida con la
ruta de la instancia, y la de la persona para cuando no hay commit al que volver.

El enunciado, ítem por ítem:

- **Que pase la escritura de `ops.config.json` entero y válido aunque el de disco esté roto**: se decidió que no. Con el de
  disco ilegible no hay contra qué comparar lo que entra, así que dejarla pasar es decidir cómo se juzga un `ops.config.json`
  sin referencia, y la frecuencia no lo justifica. Sigue frenando, con su aserción.
- **O, más chico, que pase `git checkout`/`git restore` hacia un commit**: hecho distinto. Pasa sólo hacia `HEAD`: desde
  otra rama o desde el índice puede venir un permiso —`allowPush`, una raíz— que nadie aprobó en ésta, así que
  `git checkout otra -- ops.config.json`, `git checkout -- ops.config.json` y `git restore ops.config.json` siguen frenando.
  Tampoco pasa con algo encadenado, con un prefijo de entorno ni con `$(…)` o comillas invertidas: correrían sin un guard
  que los mire.
- **Que el mensaje nombre la salida**: hecho. Nombra `git -C "<raíz>" checkout HEAD -- ops.config.json`, que descarta el
  cambio local del archivo, y la salida de la persona en Claude Code (`!` delante del comando). Que un `git stash pop` con
  conflicto deja el stash guardado, como dice el mensaje, se verificó con git 2.43.0: «La entrada de stash se guardó en caso
  de ser necesario nuevamente», `git stash list` en 1.
- **Mirar si `planning/` roto tiene la misma forma**: se miró, y no. Con marcas de conflicto en el WIP, en `BACKLOG.md` o en
  un reclamo, `ls` pasa, `git checkout HEAD -- <archivo>` pasa y lo único que frena es lo que depende del archivo dañado
  —con el WIP roto, escribir en el producto frena por falta de plan—; `check` marca los otros dos. Tampoco
  `ops.config.local.json`: roto, `engine/config/validate.js:310-317` descarta sus rutas y no bloquea.

**Lo que el caso no preveía.** La revisión del diff señaló que restaurar el archivo corre el `post-checkout` del
repositorio, y que con la excepción ese hook correría sin ningún guard. Se midió con git 2.43.0: `git checkout HEAD --
f.json`, `git restore --source=HEAD f.json` y la forma con `--staged --worktree` lo corren las tres, con el flag de archivo
(`0`). Así que la excepción no vale si git va a correr un `post-checkout` en ese repositorio, contando `core.hooksPath`
(`runsCode`, en `engine/hooks/ops-config.js`). La segunda pasada sumó lo que corre por el mismo camino: un filtro de
`.gitattributes` sobre el archivo y `core.fsmonitor`. En los tres casos la salida es la de la persona, y el bloqueo ahora lo
dice —«o si restaurar corre código —un hook post-checkout, un filtro—, lo arregla la persona»—, porque antes nombraba un
comando que en ese repositorio se volvía a frenar. La prueba los cubre a los tres, y también una raíz que no es
repositorio, donde no se puede preguntar y se frena.

La tercera revisión encontró dos huecos en el mensaje, y salió a un módulo propio (`engine/hooks/unreadable-config.js`),
porque `input.js` estaba en el límite de 500 líneas. Con una ruta que la excepción rechaza —un paréntesis, una comilla,
una barra invertida— el comando que ofrecía se volvía a frenar: ahora no lo ofrece y nombra la salida de la persona. Y
restaurar descarta el cambio local, que puede ser de la persona que editaba el archivo cuando quedó roto: el mensaje
ahora le pide al agente que pregunte antes si el cambio no es suyo. Las dos con su aserción, y sus mutaciones en rojo.

El Stop hook no entra en bucle con el archivo roto: `planningDrift` frena una vez por sesión
y después deja cerrar (`engine/hooks/run.js`, el marcador `cauce-drift-<sesión>`).

**Lo que se corrió para saber que funciona.**

- `test/hooks/registry.test.js`, «con la configuración ilegible pasa volver a la del último commit, y nada más»: las seis
  formas que pasan, las diez que siguen frenando, el `Write` entero que sigue frenando, el mensaje con la salida y la
  excepción callada con la configuración sana.
- Mutaciones en una copia fuera del árbol, las ocho en rojo: sin la consulta en `executeAll`, sin el filtro de expansiones,
  cualquier origen en `checkout`, `restore` sin `--source=HEAD`, decidir con la configuración sana, cualquier archivo y el
  mensaje sin el comando. El filtro de expansiones sobrevivió primero: la forma con `$(echo <raíz>)` llevaba un espacio y la
  regex ya la rechazaba sola. La prueba ahora usa `git -C $(id)x …`, que sin el filtro pasaría y ejecutaría el `$(…)`.
  Después, la de ignorar el `post-checkout`, el filtro, `core.fsmonitor` o una raíz sin repositorio, y la del mensaje que no
  nombra el hook: las cinco en rojo.
- El mismo banco de la reproducción, con el arreglo: `git checkout HEAD -- ops.config.json` pasa los guards, corrido de
  verdad deja un JSON válido, y lo demás de la tabla frena igual que antes.
- Una sesión real de Claude Code (`claude -p`, `bypassPermissions`) sobre un banco instalado en `/var/tmp`, con marcas de
  conflicto en `ops.config.json`, pidiéndole listar la carpeta y dejar el archivo como en el último commit: el `ls` frenó,
  el checkout encadenado a otros comandos frenó, el checkout solo —el que da el mensaje— pasó, y después el `ls` corrió y
  `git diff HEAD -- ops.config.json` salió vacío. USD 0,62.
