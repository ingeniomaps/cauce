---
caso: 152
titulo: Los guards resuelven el id de runner por invocación, así que plan-first frena un cambio legítimo según desde qué directorio se lo pida
estado: resuelto
resuelto-en: 0.91.0
prioridad: alta
version-detectada: 0.89.0
---

# 152 — `plan-first` dice «WIP está en IDLE» mientras `ops context` ve ese mismo WIP activo

**🟢 resuelto en 0.91.0** · detectado en 0.89.0 · prioridad **alta** — se arregló a dónde manda el
bloqueo, no a quién frena: el id sigue resolviéndose por invocación y eso es trabajo del 137

## Resumen

El **137** arregló la mitad visible en el CLI: `claim` imprime el `export CAUCE_RUNNER=…` y `context`
avisa `PLAN <slug>: su plan está en wip/<id>.md`. Los dos están en el motor instalado
(`engine/cli/claims.js:86`, `engine/cli/planning.js:233-234`).

Lo que no cambió es cómo lo resuelven los **guards**. `engine/hooks/files.js:229` hace
`readWip(planning, runner())`, y `runner()` —de `engine/planning/claims`— se resuelve **por invocación**.
El hook corre con el `cwd` que tenga la sesión en ese momento, así que el mismo cambio pasa o se frena
según desde dónde se lo pida.

Medido en una instancia sidecar real, con el WIP escrito por un recorrido y la tarea reclamada:

| Quién pregunta | Qué contesta |
|---|---|
| `ops context planning --json` | `wipFile: wip/home-…-venotal-ops.md`, WIP **activo**, `phase Build`, `claimed: true` |
| `guard-files.sh` (plan-first), con el `cwd` en el repo de producto | **BLOQUEADO: … cambia el producto sin plan. WIP está en IDLE** |

El plan existía —17.405 bytes, nueve pasos tildados, `phase: Build`— y el guard lo leyó como inexistente.

## Reproducción

1. Instancia sidecar. Tomar una tarea cuyo `service:` sea otro repositorio del workspace y escribir el WIP
   (un recorrido de `autobuild` lo hace solo).
2. Desde la sesión, `cd` al repositorio de producto —cualquier comando que deje el `cwd` ahí— y editar un
   archivo de ese repositorio.
3. `plan-first` frena con «WIP está en IDLE».
4. Sin cambiar **nada** del WIP ni del archivo, volver el `cwd` a la instancia y repetir la edición
   idéntica: **pasa**.

Los dos pasos se corrieron con el mismo contenido y el mismo archivo; lo único distinto fue el directorio
desde el que salió la llamada.

## Síntoma

Lo que lo hace caro no es el bloqueo: es **la salida que ofrece**. El mensaje dice «Si esto no es trabajo de
una tarea, aprobá la ruta», y pegar esa línea en `.ops-approval` es afirmar por escrito que un cambio de
producto no pertenece a ninguna tarea — cuando pertenecía a una, con su plan y su reclamo. El registro
queda con una afirmación falsa y el cambio entra sin entrada de DONE, que es exactamente lo que
`AGENTS.md` advierte del atajo.

Y es indetectable desde el lado de quien trabaja: el CLI, preguntado en el mismo momento, dice que el WIP
está activo. No hay forma de saber que el guard está mirando otro id salvo leyendo el motor.

## Causa raíz

`runner()` deriva el id del contexto de invocación en vez de fijarlo por sesión. El 137 lo dejó dicho como
tradeoff —«toca la misma pieza de la que dependen reclamos y WIP: se gana coherencia, pero hay que mirar
los tres a la vez»— y su arreglo optó por **informar** el id correcto en vez de unificarlo. Los guards no
informan: deciden, y con el id equivocado deciden mal.

## Fix propuesto

1. **Que el guard pregunte por la tarea reclamada y no sólo por el WIP de su id.** Si existe
   `claims/<slug>.md` y su `runner` tiene un WIP activo con esa tarea, hay plan escrito: eso es
   determinista, no necesita adivinar el id y no toca la pieza que el 137 dejó explícitamente para
   después.
2. **Que el mensaje distinga «no hay ningún WIP» de «no hay WIP para mi id»**, nombrando los que sí
   existen. Hoy las dos situaciones imprimen la misma frase, y la segunda no se resuelve escribiendo un
   plan que ya está escrito.
3. **Y que la salida por aprobación no se ofrezca cuando hay un reclamo vivo sobre ese servicio**: ahí la
   respuesta correcta nunca es «esto no es trabajo de una tarea».

## Tradeoffs

El 1 agrega una lectura de `claims/` a un guard que hoy sólo lee un archivo, y los guards corren en cada
llamada: hay que medir que no se note. Unificar el id de verdad es más limpio y es lo que el 137 difirió;
este caso no lo pide, porque el 1 cierra el daño sin abrir esa puerta.

## Contexto de descubrimiento

2026-09-14/15, cerrando a mano la tarea `env-schema-yaml` de una instancia sidecar después de que su
recorrido parara en Review. El cambio frenado era el paso que faltaba para que esa misma tarea pudiera
commitearse — declarar un ajuste de pnpm en el repositorio de producto (ver **151**)— y el WIP con su plan
lo había escrito el propio recorrido dos horas antes.

## Relacionados

- **137** — resuelto en 0.89.0. Arregló la mitad del CLI; esto es la mitad de los guards, y su tradeoff ya
  anticipaba que el id se resolvía por invocación.
- **151** — el otro caso de la misma sesión: la mitigación de pnpm en `verify` no surte efecto, y el cambio
  que este guard frenaba era justamente el que lo compensa desde el proyecto.
- **124** — la familia de los bloqueos cuya salida angosta no resuelve lo que el bloqueo describe.

## Cierre

**🟢 resuelto en 0.91.0** · `engine/hooks/files.js`, `test/wiring/hooks.test.js`, `CHANGELOG.md`

El defecto es real y se reprodujo. Lo que cambió al mirarlo es **qué hay que arreglar**: no que el guard
frene —frenar está bien— sino que, cuando se equivoca de id, diga lo que no es y ofrezca la salida que
escribe una afirmación falsa.

### Contra lo que el caso enumeró

- **Fix 1, que el guard pregunte por la tarea reclamada y no sólo por el WIP de su id** — **se decidió que
  no.** Relajaría una invariante que `test/wiring/hooks.test.js` fija a propósito: el plan de un runner no
  le sirve a otro para saltear el guard, porque en sidecar hay un solo `planning/` y leer cualquiera lo
  dejaría inerte justo con dos agentes construyendo a la vez. Y no hace falta: el escenario que el fix
  quería rescatar se evita montando el árbol de la tarea, que es lo que el protocolo ya pide.
- **Fix 2, que el mensaje distinga «no hay ningún WIP» de «no hay WIP para mi id», nombrando los que sí
  existen** — **hecho**, y es el corazón del arreglo.
- **Fix 3, que no se ofrezca la salida por aprobación cuando hay trabajo vivo** — **hecho, con otro
  disparador.** El caso lo ataba a «un reclamo vivo sobre ese servicio»; se ató a que haya un plan ajeno a
  la vista, que es el mismo caso sin tener que cruzar el `service` con la raíz del archivo. Con eso el
  bloqueo tampoco anuncia la variable: la acción correcta es angosta y concreta, y `HOW` ya tiene esa forma.
- **Tradeoff «agrega una lectura de `claims/` a un guard que corre en cada llamada: hay que medir que no se
  note»** — **no aplica al arreglo que se tomó** y, aun así, está resuelto por ubicación: el listado se lee
  después de las dos salidas tempranas, así que quien tiene su plan sale antes y no lo paga. Es la misma
  razón por la que `hasTasks` se pregunta donde se pregunta.
- **«Unificar el id de verdad es lo que el 137 difirió; este caso no lo pide»** — sigue diferido, y ahora
  con la medición que dice cuánto duele: nada, si se exporta el id.

### Lo que el caso no preveía

- **El defecto está condicionado a que `CAUCE_RUNNER` no llegue al proceso del hook.** El caso dice «se
  resuelve por invocación» y omite que ésa es la **segunda** rama de `runner()`: con la variable exportada
  el guard acierta desde cualquier directorio. Medido abajo.
- **El motor afirma una contención que no cubre este camino.** El comentario de `runner()` dice que la falla
  «no queda en silencio» porque `claim` se niega a dar una segunda tarea a un runner que ya tiene una. Eso
  vale para `claim`; el guard no pasa por ahí, y ahí la falla es exactamente silenciosa.
- **Esperar por archivo se evaluó y no se construye.** Se midió que `ops worktree` funciona en una instancia
  sidecar y que dos tareas del mismo servicio quedan en árboles distintos: tres inodos distintos para «el
  mismo archivo». No hay archivo compartido que esperar, así que un registro de archivos ocupados duplicaría
  una garantía que git ya da — y frenar por dominio de colisión ya estaba rechazado, con su razón escrita,
  en `template/planning/delivery/teamwork.md`.
- **Un `BACKLOG.md` cuya línea de tarea no parsea deja al guard inerte sin decirlo.** Apareció armando la
  reproducción: sin `_Aceptación: …_` la línea no es una tarea, `hasTasks` da `false` y `plan-first` sale por
  la puerta del día uno. No es un defecto nuevo —`automation check` está para reportar que el guard quedó
  inerte— pero conviene saberlo antes de creer que el guard no muerde.

### Qué se corrió

- **Reproducción con control**, instancia sidecar y dos repositorios, el mismo archivo y el mismo WIP en las
  cuatro filas:

  | fila | resultado |
  | --- | --- |
  | control, sin ningún WIP | **bloquea** — el arnés enciende |
  | `cwd` en la instancia | pasa |
  | `cwd` en el producto | **bloquea** |
  | `cwd` en el producto, con `CAUCE_RUNNER` exportada | pasa |

  Los dos primeros intentos de reproducción **no midieron nada** y quedan dichos: uno tenía el `BACKLOG.md`
  sin parsear y el otro no tenía control, así que su «pasa en los dos lados» no era un resultado.
- **Rojo previo**: con la prueba nueva y el motor sin tocar, `hooks.test.js` va de 99/99 a **98 pass, 1 fail**,
  y el mensaje de hoy aparece entero — «WIP está en IDLE» con el plan escrito, más las dos salidas.
- **Cuatro mutaciones sobre una copia que primero corrió en verde**, las cuatro en rojo: un solo mensaje, no
  nombrar el id, volver a ofrecer la aprobación, y no listar los WIP ajenos.
- **Verde**: `npm test` **830 pruebas, 830 pass, fail 0, skipped 0**; `npm run ci` exit 0; 68 archivos en su
  piso de cobertura; las ocho pruebas de `plan-first` que ya existían siguen pasando.
- **Pasada R11 a 0.22**: la primera versión de los comentarios **falló la puerta** —`files.js` y la prueba
  repetían la misma razón— y se reescribieron para que cada uno sea dueño de una. El par más alto quedó en
  **0.200**, por debajo del umbral de inspección.
