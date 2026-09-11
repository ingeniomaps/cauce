# Reglas de construcción

Este archivo gobierna el qué y el cuándo. `planning/PROTOCOL.md` gobierna el flujo y
`planning/rules/` el cómo: sus reglas rigen cada tarea y se leen antes de empezar, no cuando algo sale
mal. Los tres los mantiene Cauce y valen para cualquier proyecto. Lo que este proyecto tiene de propio
—su mapa, sus integraciones, hasta dónde llega la autonomía acá— vive en `organization/workspace.md`.

## Qué sabe este proyecto y no este archivo

El mapa real —qué se construye, qué repos existen, qué está fuera de alcance—, las integraciones con su
entorno concreto y las excepciones de autonomía viven en **`organization/workspace.md`**, que es del
proyecto y `upgrade` no toca. Acá no: este archivo lo mantiene Cauce y se reemplaza entero en cada
actualización, así que lo que escribieras se perdería o te haría fusionar a mano todas las veces.

Es la misma separación que `planning/rules/system/` con las reglas propias y que `planning/delivery/`
con `project.md`: lo que el toolkit mejora, aparte de lo que sólo vos podés escribir.

## Cargos disponibles

`agents/` es un catálogo de cargos reutilizables. Cada uno declara en su `SKILL.md` cuándo actuar, qué
decide, qué no le corresponde y cuál es su entrega mínima; sus métodos viven en `references/`.

Antes de resolver algo que cae claramente en un cargo —una decisión de producto, un diseño de
arquitectura, una estrategia de pruebas—, adoptá ese contrato en vez de improvisar el criterio. Los
límites del cargo no son sugerencias: un cargo que no puede decidir solo, no decide solo. Su
contraparte es R13: el que se niega bien y no deja nada tampoco cumplió.

Para saber cuál es, una línea por cargo:

```bash
node tools/ops.js agents list                # quién hace qué y qué NO le corresponde
```

Se elige leyendo esa lista, no abriendo carpetas. Si ninguna línea encaja, el cargo no existe y el
camino es escribir el propio en `agents/roles/<slug>/`; forzar el más parecido es peor que no usar
ninguno. Si encaja pero lo querés más enfocado en esta empresa, el contexto va en
`organization/roles/<slug>.md` y el contrato sigue siendo el de Cauce.

En Claude y Antigravity los cargos aparecen como skills invocables por nombre. En Codex y Gemini no hay
mecanismo nativo: leé directamente el `SKILL.md` del cargo. Los que trae
Cauce están en `agents/roles/system/`; los propios del proyecto, en `agents/roles/`, donde un mismo
slug reemplaza al del sistema.

`flows/` compone varios cargos en etapas con gates de salida y un dueño por dominio de decisión;
`node tools/ops.js flow show <slug>` muestra el recorrido.

### El aprendizaje de tus cargos

Los cargos que trae Cauce se investigan en el toolkit: la profesión evoluciona igual para todas las
empresas, y repetir esa investigación en cada instalación produciría la misma conclusión N veces, cada
una peor. `learn` sobre uno de ellos falla y te dice dónde va lo que sí es tuyo.

Los cargos **propios** son otra cosa: nadie más los va a investigar. Su ciclo es el mismo y corre por
comando, sin cron —activarlo en tu repositorio es decisión tuya—:

```bash
node tools/ops.js agents list --own          # sólo los tuyos, sin los del catálogo
node tools/ops.js learn <slug>               # arma el informe de la semana
/agent-propose <slug>                        # escribe el cambio concreto sobre esos informes
#   ↑ firmá «Aprobación humana» en la propuesta antes de seguir
/agent-promote <slug>                        # lo aplica, registra y manda a verificar
/agent-eval <slug>                           # corre sus casos adversariales contra el contrato nuevo
```

Un cargo propio puede declarar en `learning/AUTOMATION.md` qué debe investigar y con qué frecuencia.
Si su profesión no existe fuera de tu empresa, sus fuentes son internas: lo que aprende sale de sus
propias decisiones, no de un estándar de afuera.

## Qué se puede editar y qué no

Todo directorio `system/` pertenece a Cauce y se reemplaza completo al actualizar. **Nunca editar nada
dentro de `system/`**: el cambio se pierde en la siguiente actualización y, mientras tanto, ese archivo
deja de recibir mejoras.

Para cambiar algo del sistema hay dos operaciones, las dos junto a `system/`, nunca dentro:

- **Anexar**: un archivo nuevo con nombre o ID propio. Convive con los del sistema. En
  `planning/rules/` ese ID se numera `P1..Pn`: `R` queda reservado al sistema y `check` lo exige.
- **Reemplazar**: un archivo con el mismo nombre o ID que uno de `system/`. El del proyecto manda y
  `check` lo reporta como override explícito en vez de fallar.

Aplica a `planning/business-rules/`, `planning/adr/`, `planning/rules/`, `flows/` y `agents/`.

Del resto de `planning/`, lo que lleva tu contenido es tuyo y no se toca al actualizar: roadmap, backlog,
WIP, done, inbox, acciones humanas, informes y `delivery/project.md`. Lo que es guía del toolkit se
reemplaza entero para que las mejoras lleguen, y ahí entran las seis guías de `planning/delivery/`: lo que
tu proyecto decida distinto sobre su entrega va en ese `project.md`, que es donde el toolkit no escribe.

`automatization/hooks/` es runtime del toolkit y se reemplaza entero. No tiene `system/` porque no hace
falta: lo que un proyecto necesita ya funciona sin editarlo. Los adaptadores de runner y los workflows ni
siquiera están acá — los lee el motor desde el paquete.

- **Agregar un guard propio**: creá `automatization/hooks/guard-<nombre>.sh` y registralo en la
  configuración de tu runner. Sobrevive a cada actualización, porque el toolkit no lo conoce.
- **Desactivar un guard**: quitalo de esa configuración, que es del proyecto. El archivo sigue ahí.
- **Cambiar un comportamiento**: agregá el tuyo, no edites el del toolkit.

Un guard existente **no se edita**: `upgrade` detecta el cambio y se detiene antes de pisarlo, y con
`--force` deja registrado qué descartó.

### Cuando un guard te frena con razón

Algunos bloqueos tienen salida, y conviene saber cuál antes de necesitarla — el momento en que un guard
te frena es el peor para elegir bien.

**La salida de todos ellos es la misma**: escribir en `planning/.ops-approval` las rutas que autorizás,
una por línea, con `#` para lo que no sea una ruta. Es un solo archivo para todos los guards, porque lo
que escribís son rutas y quién las mira lo decide qué guard esté juzgando esa ruta.

| lo que te frena | qué ruta aprobás |
|---|---|
| un commit que toca gobernanza —reglas, ADRs, el contrato de un cargo o lo que lo mide— | cada archivo gobernado que va en el commit |
| SQL destructivo en una migración | la migración |
| borrar o apagar una prueba | la prueba |
| un manifiesto que va sin su lockfile, o al revés | el archivo que cambió |
| los gates del stack en rojo, o una fuente sin regenerar | **todo** lo que está en el índice |
| un cambio del producto sin plan escrito —el WIP en IDLE, o con la tarea puesta y ningún paso— | el archivo que vas a tocar |

**Vale para ese conjunto y para ningún otro.** Si después sumás un archivo, ese archivo no está aprobado
y el guard vuelve a frenarte nombrándolo. Eso es lo que la hace por operación sin fecha ni contador: no
caduca, deja de coincidir. En la última fila es más visible —aprobás el índice entero, así que stagear
una cosa más la invalida—, y es a propósito: commitear en rojo se autoriza para un commit concreto.

No se borra sola, así que un commit frenado por otra cosa no te obliga a rehacerla. `check` te avisa
mientras exista, y borrarla es parte de terminar.

**Publicar un paquete o instalar algo global no se aprueba así**, porque ahí no hay ninguna ruta sobre
la cual decidir. Esa sigue siendo una acción humana y su única llave es la variable de abajo.

**Y la última fila tiene una pregunta antes**: ¿esto es trabajo de una tarea? Si lo es —aunque sea
chico—, la salida no es aprobar la ruta sino escribir el WIP con su plan, y aprobar sería saltarse la
fase que iba a mirarlo. Si no lo es —un typo en un README, un umbral que corregís de paso, «esto lo
arreglo en dos minutos»—, aprobar la ruta **es** la respuesta correcta y no un rodeo.

Lo que conviene saber antes de tomarla: ese cambio entra **sin entrada de DONE**, así que no tiene
aceptación, ni evidencia, ni carril, ni revisión, y `planning/` no lo registra. Para un typo eso está
bien y para lo demás casi nunca; el día que empiece a pasar seguido, el que está mal es el flujo y no
quien aprueba la ruta.

### Las variables siguen existiendo, y son de sesión

Cada guard se puede apagar entero con su variable. Hay que decir su alcance porque no es el que uno
espera: el guard la lee de **su propio proceso**, no del comando. Escribirla delante —`VAR=1 git
commit`— no llega. La forma que sí funciona es exportarla en el entorno desde el que arranca tu runner,
y eso lo deja apagado **hasta que cierres la sesión**, no para un comando.

| variable | qué apaga |
|---|---|
| `OPS_GOVERNANCE_OVERRIDE=1` | el guard de gobernanza |
| `OPS_MIGRATIONS_OVERRIDE=1` | el de migraciones |
| `OPS_TEST_EVIDENCE_OVERRIDE=1` | el de evidencia de pruebas |
| `OPS_DEPENDENCIES_OVERRIDE=1` | el de dependencias, incluido publicar e instalar global |
| `OPS_PLAN_FIRST_OVERRIDE=1` | el que exige plan antes de cambiar el producto |
| `OPS_SECRETS_READ_OVERRIDE=1` | el que frena leer una credencial con la herramienta del runner |
| `OPS_SKIP_VERIFY=1` | el que corre los gates |

Por eso la aprobación es la vía recomendada y esto es lo que queda cuando no alcanza: prendela para lo
que hacía falta, apagala después, y que la razón quede escrita donde alguien la lea.

## Cómo leer el estado

Antes de abrir un archivo de `planning/`, preguntarle al CLI: es determinista, no gasta contexto y no
muta nada.

- `node tools/ops.js context planning [--hito <slug>]` — gate, mutex de WIP y la tarea que corresponde
  ahora, con su aceptación y sus criterios. Es la entrada correcta para empezar a trabajar. Con `--hito`
  la cola se acota a ese hito, que es como un equipo se reparte trabajo sin coordinarse.
- `node tools/ops.js tree planning` — panorama de roadmap, backlog, WIP, inbox y done.
- `node tools/ops.js recurring planning [--promote <qué>]` — qué trabajo recurrente venció y con
  qué línea se promueve. Emite esa línea; escribirla en `BACKLOG.md` es de una persona.
- `node tools/ops.js check planning` — validación de contratos y trazabilidad.
- `node tools/ops.js evidence planning [--task <slug>]` — contrasta la evidencia de una entrada de DONE
  contra lo que no escribió su autor: si el artefacto que `tests:` nombra existe en las raíces de
  código, y qué gates corrió `verify` al commitear, con su código de salida. Al cerrar una tarea, es la
  única parte de esa evidencia que no sale de la misma mano que la afirma. No dice que la prueba
  nombrada haya corrido —eso depende del runner, y varios no la nombran al pasar— ni reemplaza a leer
  su fuente, que es lo que R9 pide.

Los cinco aceptan `--json`. Leer `BACKLOG.md`, tu `wip/<runner>.md`, `HUMAN_ACTIONS.md` o `RECURRING.md`
completos sólo cuando haga falta editarlos o cuando el CLI no responda la pregunta.

## Cómo tomar trabajo

Con equipo, la tarea que `context` devuelve puede estar libre o ya ser tuya, y la salida lo dice. Libre
se toma antes de empezar:

- `node tools/ops.js claim planning <tarea>` — la reserva a tu nombre y escribe `planning/claims/<tarea>.md`.
- `node tools/ops.js release planning <tarea>` — la devuelve a la cola.

Una tarea que declara `(depende: slug)` no se ofrece ni se puede tomar hasta que eso esté en DONE, y
`context` la muestra con una línea `WAIT`. No hay que adelantarse: lo que sigue es trabajo de quien tiene
la tarea de la que depende.

Tomar no es promover: la tarea ya estaba aprobada en `BACKLOG.md` y esto sólo dice quién la hace, así que
entra en la autonomía del runner. Lo que no entra es tocar el reclamo de otro — ni tomarlo, ni soltarlo—,
y `context` directamente no ofrece una tarea reclamada.

El reclamo hay que **commitearlo y empujarlo**: sin eso el otro runner lee lo que hay en su copia y la
reserva no existe para nadie más.

## Con qué runner arrancás

Antes de pedir trabajo hay que saber quién lo tiene. Dos sesiones en la misma máquina resuelven la misma
identidad de git, así que lo que las distingue es el `CAUCE_RUNNER` de cada una.

`node tools/ops.js runners planning [--json]` dice qué runners tienen una tarea abierta, cuál, desde
cuándo y si su rama avanzó. Según lo que devuelva:

- **Ninguno** — arrancá con un id propio y no preguntes nada. No hay trabajo que retomar.
- **Uno o más** — **preguntale a la persona** cuál retoma o si arranca uno nuevo, nombrando la tarea de
  cada uno, desde cuándo y si avanzó. Retomar el id de un agente que sigue corriendo le saca la tarea, y
  arrancar uno nuevo cuando había trabajo a medias lo deja huérfano: las dos rompen algo, y por eso la
  elección no es tuya.

Elegido el id, **exportalo vos** y usalo en cada `ops` de la sesión. **Nunca le pidas a una persona que
escriba una variable de entorno**: no es el idioma en el que trabaja, y el runner es cómo el toolkit
distingue dos sesiones, no una decisión de producto. Lo suyo es elegir; la mecánica es tuya.

- `node tools/ops.js worktree planning <tarea>` — prepara el árbol de trabajo de esa tarea y te devuelve
  la ruta con el `export CAUCE_RUNNER` hecho. No clona nada: `git worktree` comparte el mismo `.git`, y
  cada árbol queda fijado a su rama, así que ningún agente hace `checkout` sobre el trabajo de otro.

## Autonomía

El runner puede implementar una tarea promovida dentro del servicio declarado, crear pruebas y hacer
refactors locales necesarios para su aceptación.

Debe detenerse cuando falte una decisión de producto, credencial, cuenta o acción externa; cuando una
verificación siga roja tras un intento razonable; o al cruzar un hito si el protocolo exige checkpoint.
Registra la acción exacta en `planning/HUMAN_ACTIONS.md` y, si bloquea todo, crea
`planning/AWAITING_REVIEW.md`.

Nunca amplía el alcance, promueve sus propias ideas, reescribe el proceso durante una tarea, usa
`git add .`/`git add -A`, reescribe historia con `--force` o `--amend`, ni afirma éxito sin evidencia
real. Tampoco publica: sin autorización no hay `push`.

Una recurrencia vencida tampoco la promueve, y ésta es la que más se parece a una excepción: la
aceptación ya está escrita, la fecha la calculó el CLI y `context` la nombra sola. Nada de eso es la
aprobación que pide BR-OPS-002 — `context` la nombra para que la vea una persona, y quien la pega en
`BACKLOG.md` es esa persona.

Publicar es lo único de todo eso que este proyecto puede habilitar, y `runner.allowPush` en
`ops.config.json` es la autorización que R10 pide. Reescribir historia publicada no entra en el trato:
un `push --force` se frena con la llave prendida o apagada.

Eso rige sin que nadie escriba nada. Lo que este proyecto amplíe o restrinja va en
`organization/workspace.md`, con su razón; ninguna de esas prohibiciones se amplía ahí, y la
publicación tampoco se decide ahí: la decide `allowPush`.

## Definición de terminado

1. La aceptación se observa y queda cubierta por pruebas cuando existe superficie testeable.
2. Tests, lint, tipos y build aplicables terminan con exit code real.
3. QA valida el comportamiento por el camino real, no por un atajo interno.
4. La deuda residual va a `planning/INBOX.md`.
5. El cambio se commitea en el repo del servicio —uno por naturaleza del diff, y una tarea suele
   tener una sola— y el hash real queda en la evidencia de la tarea, `planning/done/<slug>.md`.
6. `node tools/ops.js check planning` queda verde.
