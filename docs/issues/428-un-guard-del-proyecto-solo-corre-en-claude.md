---
caso: 428
titulo: un guard que declara el proyecto hay que registrarlo una vez por runner, en Antigravity no hay dónde, y nada avisa que falta
estado: resuelto
resuelto-en: 0.114.0
prioridad: alta
version-detectada: 0.113.2
---

# 428 — Cauce no tiene dónde declarar un guard del proyecto que corra en todos los runners

**🟢 resuelto en 0.114.0** · detectado en 0.113.2 · prioridad **alta**. Con un programador que no es Claude, una defensa propia
de la instancia registrada sólo para Claude queda apagada sin que nada lo diga, y la que se apagó en el caso de origen
era la de no correr tooling en el host.

## Resumen

Un proyecto agrega sus guards como hooks de su runner: en la instancia de origen, 22 scripts `guard-*.sh` declarados en
`.claude/settings.json` (46 entradas `command`, contadas allá). Cauce no tiene una forma de declararlos **una vez** para
todos los runners, y lo que pasa con cada uno es distinto:

- **Codex y Gemini** sí pueden correrlos: `automation install` **fusiona** `.codex/hooks.json` y `.gemini/settings.json`
  con lo que el proyecto ya tenía (`engine/automation/index.js:370-389`; sus manifiestos no declaran `owned`). Pero hay
  que registrarlos de nuevo en el formato de cada uno, y el guard recibe la forma de entrada de ese runner, no la de
  Claude.
- **Antigravity** no tiene dónde: su `hooks.json` es `owned: true` (`automatization/runners/antigravity/manifest.json:9`),
  se escribe entero en cada install, y registra sólo `node hook.js pre-shell|pre-read|pre-files|stop`, que corre los
  grupos fijos del motor (`hookGroups`, `engine/hooks/run.js:99-108`). Si un segundo plugin del proyecto en
  `.agents/plugins/<otro>/` le sumaría hooks a `agy` es **hipótesis**: no se probó en esta revisión.
- **Nada avisa**: `automation doctor` da «adaptador operativo (0 advertencia(s))» con los guards propios sólo en Claude.

`teamwork.md:254` pone a `agy` como programador sin requisitos («Nada»), y para una instancia con guards propios eso no
es cierto.

## Reproducción

1. En una instancia sidecar, un guard propio que frena `npx` en el host, registrado como hook de Claude
   (`.claude/settings.json` → `PreToolUse` / `Bash` → `command: <ruta>/guard-load.sh`).
2. `node tools/ops.js automation install . antigravity` y `… doctor . antigravity`: «adaptador operativo (0
   advertencia(s))».
3. `agy -p "corre npx husky en <repo>"` desde la carpeta de sesión.
4. El comando corre: el guard nunca se invoca. Desde Claude, el mismo pedido se frena.

Los pasos 3 y 4 vienen de la instancia de origen (`agy` 1.4.4) y no se repitieron en esta revisión. Lo que sí se
comprobó leyendo el fuente es que ningún camino de `hook.js` lee algo declarado por el proyecto: su `main`
(`automatization/runners/antigravity/hook.js:232`) resuelve `engine/hooks/run.js` (`:85`) y corre el grupo del evento.

## Síntoma

En el caso de origen, `agy` 1.4.4 construyó una tarea y la revisión sospechó que había corrido husky (`npx`) en el
host: `.husky/_` quedó a nombre del usuario del host mientras `node_modules`, instalado en el contenedor, era de
`root`. Ningún guard pudo decir si fue así. La instancia lo resolvió después leyendo los comandos de la conversación
guardada de `agy` (`~/.gemini/antigravity-cli/conversations/<id>.db`, pasos de tipo 15, campo `CommandLine`), y ese
`npm run prepare` había corrido dentro del contenedor: la sospecha no se confirmó. Lo que el caso muestra no cambia:
el guard de la instancia que frena tooling en el host (`guard-load.sh`) existe y está registrado, pero sólo en
`.claude/settings.json`, y con `agy` la única forma de saber qué corrió fue reconstruirlo después. Mientras tanto el
guard de líneas del motor sí corrió sobre esa misma sesión (`/tmp/cauce-line/<sesión>.json` con la línea anotada), que
es lo que muestra que el puente funciona y lo que falta es el camino para lo propio.

## Causa raíz

No es un defecto del puente: es una capacidad que falta. `hookGroups` (`engine/hooks/run.js:99-108`) es una lista fija
de guards del motor, y `ops.config.json` no tiene un campo para sumarle los del proyecto. Los del proyecto llegan a
Claude, Codex y Gemini sólo si el proyecto los registra en la configuración de cada uno; a Antigravity, por ningún
camino conocido.

## Fix propuesto

Que el proyecto declare sus guards una vez, para todos los runners, y que el motor los corra dentro de su grupo:

```json
"guards": { "pre-shell": ["automatization/hooks/guard-load.sh", "automatization/hooks/guard-acme-destructive.sh"] }
```

`run.js` los ejecutaría después de los del motor, con la misma entrada normalizada (`tool_input.command`, `cwd`) y el
mismo contrato de salida (2 frena, 0 deja). Eso los hace correr en los cuatro runners sin registrarlos cuatro veces.
`automation doctor` avisaría si hay guards propios registrados para un runner y no para otro instalado.

**Decisión pendiente** antes de construir: si en Claude, Codex y Gemini los del proyecto pasan a correr por el motor
—una sola lista, y hay que sacarlos de su configuración nativa para que no corran dos veces— o siguen registrados ahí y
`guards` es sólo el camino de Antigravity. La primera es la que cierra el caso; la segunda es más barata y deja dos
listas.

## Tradeoffs

- Un guard escrito para Claude lee `$CLAUDE_PROJECT_DIR`, que no existe en `agy`: el motor tendría que pasarle la raíz
  del proyecto por una variable propia y el guard leerla. La entrada JSON ya llega normalizada.
- Más guards por llamada en runners que hoy corren menos: el costo por comando sube, y el tope del hook de Antigravity
  (120 s en `pre-shell`, 30 s en `pre-files` y `pre-read`, `automatization/runners/antigravity/hooks.json`) tiene que
  alcanzar.
- Un guard del proyecto que falla por su cuenta (no está, no es ejecutable) tiene que frenar, no dejar pasar: es la
  dirección segura (R27), y es la que hoy no tiene nadie que la decida.
- Hasta que exista, `teamwork.md` debería decir que un runner que no es Claude no corre las defensas que el proyecto
  registró sólo para Claude.

## Contexto de descubrimiento

Instancia de una empresa, línea `pagos` en modo release local, 2026-10-21: coordinación (Claude) lanza `agy` como
programador con `CAUCE_DELEGATED=1` y una sesión Claude aparte revisa. Fue la primera tarea de la línea; la revisión
devolvió la tarea y el proyecto quitó husky. Las tareas siguientes quedaron protegidas por los hooks de git del propio
repositorio, que corren en cada commit de cualquier runner, no por un guard.

## Relacionados

- 410 (el puente de Antigravity no veía `edit_file` ni `write_file`): el mismo puente, para los guards del motor.
- 430 y 431: el mismo release, el mismo traspaso a `agy`.

## Cierre

**Resuelto en 0.114.0**, a pedido del dueño el 2026-10-21. La decisión pendiente la tomó él: una sola lista, que
corre el motor en los cuatro runners. Es minor porque suma un campo a `ops.config.json`, y por eso la versión abierta,
que había nacido como 0.113.4 con el 429, pasó a 0.114.0.

`guards` (`engine/config/validate.js`, `engine/schemas/ops-config.schema.json`) declara los guards por evento. El
motor los corre al final de `executeAll` (`engine/hooks/run.js`) con `engine/hooks/project-guards.js`, y
`automation doctor` los revisa con `engine/automation/project-guards.js`.

El caso, sección por sección:

- **Resumen, Codex y Gemini.** Ya no hay que repetir el guard en su formato: entran al motor por el mismo
  `run-hook.sh` que Claude.
- **Resumen, Antigravity.** El puente llama a `executeAll([evento], …)` con la llamada normalizada, así que el guard
  del proyecto recibe la misma forma que en Claude. La hipótesis de un segundo plugin de `agy` no se probó: con el
  camino del motor ya no hace falta.
- **Resumen, «nada avisa».** `doctor` da error si un guard declarado no existe o no es ejecutable, porque frenaría cada
  llamada de su evento. Da advertencia si además está registrado en la configuración del runner, porque correría dos
  veces.
- **Resumen, `teamwork.md:254`.** La fila de Antigravity dice ahora que los guards propios le llegan sólo por `guards`.
- **Reproducción, pasos 3 y 4.** Corridos con `agy` de verdad: abajo.
- **Fix propuesto**: se hizo, con tres diferencias.
  - Los eventos son los grupos que juzgan una llamada (`pre-shell`, `pre-files`, `pre-read`, `pre-mcp`, `stop`).
  - Claude, Codex y Gemini llaman `pre-read`, `pre-mcp` y `stop` por su único guard (`secrets-read`, `jira-adf`,
    `planning-drift`), y Antigravity por el grupo. Un nombre que es todo su grupo cuenta como el grupo, y un guard
    suelto de un grupo más grande no: si contara, los del proyecto correrían una vez por guard.
  - En vez de «avisar si un runner instalado no los corre» —con el motor, los corren todos—, `doctor` avisa el doble
    registro, que es el modo de fallo nuevo.
- **Decisión pendiente.** Tomada, la primera opción.
- **Tradeoffs, `$CLAUDE_PROJECT_DIR`.** El motor le pasa `OPS_ROOT` con la raíz ops y `CAUCE_HOOK_EVENT` con el
  evento, y el guard recibe por stdin la llamada que recibieron los de Cauce.
- **Tradeoffs, el tope de Antigravity.** Recorrerlo encontró un hueco en la primera versión. El plazo era de 20 s por
  guard, y tres guards en `pre-files` pasaban los 30 s del hook de `agy`. Qué hace `agy` con un hook vencido no está
  medido, y si deja pasar, el guard se apaga. Ahora los 20 s son del evento, entre todos sus guards.
- **Tradeoffs, el guard que falla.** Frena, nombrando la ruta y por qué: no está (ENOENT), no se puede ejecutar
  (EACCES), salió con otro código, lo cortó una señal o se pasó del plazo. Claude Code sigue de largo ante un error que
  no es 2; un guard que dependía de eso cambia de conducta al pasar a `guards`, y el encabezado del módulo lo dice.
- **Tradeoffs, `teamwork.md` mientras tanto.** Ya no hace falta: la capacidad existe, y la fila dice cómo usarla.
- **Lo que dependía de la idea vieja** (R9). Tres textos mandaban a registrar un guard propio «en la configuración de
  tu runner»: `template/AGENTS.md`, el consejo de `engine/cli/upgrade-report.js` y `README.md`. Ahora mandan a `guards`.
  También `template/organization/workspace.md`, «Guards propios».
- **Prioridad.** No traía condición de escalada.

**Lo que se corrió para saber que funciona.**

- `test/hooks/project-guards.test.js`, nueva, con ocho pruebas. Contra el motor sin el arreglo da rojo por ausencia
  (`Cannot find module '../../engine/hooks/project-guards'`), y eso sólo prueba que no estaba. Lo que la sostiene son
  ocho mutaciones en una copia fuera del árbol, con la copia en verde antes; cada una pone en rojo su prueba:
  - quitar la llamada en `executeAll`: rojas cuatro, incluida la del puente de Antigravity;
  - contar sólo nombres de grupo: la de los eventos;
  - dejar pasar lo que no sale en 2: la del guard que no contesta;
  - aceptar rutas absolutas: la de validación;
  - que `doctor` no vea el doble registro, o no vea el que falta: la de `doctor`;
  - sacar `stop` de los eventos: la que compara la lista con `hookGroups`;
  - volver al plazo por guard: la del plazo compartido.
- **Los cuatro runners**, en una instancia instalada fuera del árbol, con un guard `guards/no-npx.sh` declarado sólo
  en `guards`, que frena todo comando con `npx` y anota cada llamada. Se corrieron dos veces: antes del cambio al plazo
  compartido y otra vez con el código final, con la misma salida en las dos:
  - `agy` 1.4.4, `agy -p "Corré exactamente este comando…: npx --version"`: «tool call denied by pre-tool hook:
    Cauce: [guards/no-npx.sh] npx no corre en el host: correlo en el contenedor». El guard anotó la llamada con
    `"command":"npx --version"`.
  - Claude Code, `claude -p … --model haiku` con el guard **fuera** de `.claude/settings.json`: «PreToolUse:Bash hook
    error: […guard-shell.sh]: BLOQUEADO: [guards/no-npx.sh] npx no corre en el host…».
  - Gemini CLI, `gemini -p … --approval-mode yolo`: «Tool execution blocked: BLOQUEADO: [guards/no-npx.sh] npx no
    corre en el host…».
  - **Codex 0.162.1**, `codex exec -m gpt-5.6-terra …`. La primera vez no corrió: la cuenta rechazaba los modelos que
    se probaron, que no eran los de su caché (`~/.codex/models_cache.json`). Con uno de la caché corrió, y sin confiar
    los hooks **no frenó nada**: `npx --version` devolvió `11.16.0` y el guard no anotó ninguna llamada. Codex corre un
    hook del proyecto sólo si está confiado en `~/.codex/config.toml`, y que el resto de Cauce no lo diga salió como el
    **caso 434**. Con `--dangerously-bypass-hook-trust`, en el banco desechable y a pedido del dueño, frenó: «BLOQUEADO:
    [guards/no-npx.sh] npx no corre en el host…», y también un guard de Cauce: «BLOQUEADO: 'git add -A/--all/.' está
    prohibido».
- **Un rojo posterior, en la puerta `verify`**. Al commitear el 431, la suite corrida sobre el índice frenó en «un guard
  del proyecto que no contesta frena». La prueba les daba 300 ms a scripts que tenían que salir con 1 o con una señal,
  y la del plazo compartido tenía 200 ms de margen. No se reprodujo sola, ni bajo carga, ni en una copia del índice.
  Después se midió: cinco corridas de la suite entera con los márgenes viejos, en una copia y con tres runners
  corriendo a la vez en la máquina, dieron 1540 de 1540 las cinco, sin una falla de estas pruebas. La causa por el
  tiempo **no queda confirmada**: o el rojo fue por otra cosa, o es más raro que una vez en cinco con carga. Igual, los márgenes eran frágiles: el plazo corto quedó sólo para
  el guard que duerme a propósito, y el compartido tiene un segundo de holgura (`41ad62ed`). Con los márgenes nuevos,
  las mutaciones del plazo por guard y de dejar pasar lo que no sale en 2 siguen poniéndola en rojo.

  **La causa apareció el 2026-10-22, y no era el tiempo.** `npm run ci` volvió a frenar en esa prueba, esta vez con el
  mensaje completo: «[guards/falla.sh] … no se pudo ejecutar (EPIPE)», donde se esperaba «salió con 1: roto». Un
  guard que sale sin leer la llamada cierra su stdin antes de que `spawnSync` termine de escribirla. Ahí el error es
  `EPIPE`, y el motor lo informaba como un guard que no arrancó, aunque `status` y `signal` traían lo que el guard
  hizo. Medido fuera de la suite, con una llamada de 4 MB: 20 de 20 con `EPIPE`, y `status` 0 o 1 según el script.
  Frenaba igual, así que la dirección era la segura. Lo que estaba mal era el motivo, y la prueba fallaba cada vez
  que el script le ganaba a la escritura. Un guard que sale con 0 nunca se vio afectado: el 0 se mira primero.

  Ahora `EPIPE` no cuenta como falla al arrancar (`engine/hooks/project-guards.js`, `judge`). La prueba nueva, «un
  guard que sale sin leer la llamada frena por lo que hizo, no por el EPIPE», usa una llamada de 1 MB, que lo
  reproduce siempre. Sin el arreglo se vio roja, con ese mismo mensaje. Con el arreglo pasa, y la prueba vieja dio
  5 de 5.

  La revisión de ese arreglo encontró el borde que le quedaba. Si hay `EPIPE` pero no hay código ni señal, el mensaje
  pasaba a decir «salió con null», y se perdía lo único que había para decir. El motivo se calcula ahora aparte, en
  `failureOf`, que es una función pura. «un EPIPE sin código ni señal se dice como EPIPE» le pasa ese resultado
  escrito a mano, porque un proceso de verdad no lo produce de forma confiable. Las dos mutaciones se vieron en rojo
  en una copia: callar el `EPIPE` sin código ni señal, y volver a tratar todo `EPIPE` como falla al arrancar.
- `automation doctor` sobre la misma instancia, con el guard registrado además en `.claude/settings.json`: «⚠ claude:
  .claude/settings.json: guards/no-npx.sh también está registrado acá, y con guards.pre-shell en ops.config.json
  corre dos veces…». Sin el registro doble, «0 advertencia(s)».

**Lo que encontró la revisión del conjunto** (`/code-review high` sobre la rama, antes de dar los casos por cerrados).

- **`stop` con un guard roto encerraba la sesión.** Un guard declarado en `guards.stop` que no está o no se puede
  ejecutar frena siempre, y en `stop` frenar es no dejar terminar. Con `stop_hook_active` —que Claude Code manda cuando
  la sesión ya sigue por un cierre frenado— los del proyecto ya no se vuelven a correr (`engine/hooks/project-guards.js`).
  La prueba «en stop, un guard del proyecto no vuelve a frenar…» se ve en rojo quitando ese filtro, en una copia.
- **`doctor` no veía el doble registro** con la variable entre comillas (`"$CLAUDE_PROJECT_DIR"/…`, la forma que
  recomienda la documentación de Claude Code) ni detrás de un intérprete (`bash guards/x.sh`). La prueba de `doctor`
  corre ahora las tres formas, y se pone roja quitando cualquiera de las dos lecturas nuevas, en una copia.

**La segunda pasada de revisión**, sobre lo que arregló la primera, encontró que `doctor` seguía sin ver el doble
registro detrás de `env` (`/usr/bin/env bash …`) o de una bandera del intérprete (`bash -e …`, `node --no-warnings …`).
Ahora saltea todo lo que va adelante del script. La prueba corre esas dos formas más, y se pone roja quitando
cualquiera de las dos lecturas, en una copia.

**La revisión de la rama entera** (`/code-review high main..HEAD`, 2026-10-22) encontró dos defectos más en lo que
el motor hace con los guards del proyecto (`engine/hooks/project-guards.js`):

- **Una lista mal escrita fallaba abierto.** Con `"pre-shell": "guards/g.sh"` —texto, no lista—, `.map` tiraba un
  error que no era un bloqueo. El hook salía con 1, que Claude Code trata como error que no frena, y se perdía el
  diálogo que algún guard de Cauce ya había juntado. `check` lo marcaba, pero el hook corría igual. Ahora
  `declaredFor` comprueba la forma al correrla, y frena nombrando el campo.
- **Un guard que frena con JSON y sale en 0 pasaba.** Claude Code acepta las dos formas, y el CHANGELOG manda a traer
  acá los guards de `.claude/settings.json`: uno que frenaba con `permissionDecision: deny` iba a dejar pasar todo sin
  que nada lo dijera. Ahora `decisionOf` lee `decision: block` y `permissionDecision` en `deny` o `ask`. El `ask`
  frena, porque estos guards no abren diálogo en los cuatro runners.

La segunda pasada, sobre esos arreglos, encontró que cada uno había dejado afuera una forma, y la tercera, otra
más: un evento mal escrito, como `pre_shell`, no declaraba nada y su guard no corría nunca. Ahora frena, nombrando los
eventos que existen. La validación miraba la
lista de un evento pero no el campo entero: `"guards": ["g.sh"]`, sin el evento, seguía sin correr ningún guard y sin
decir nada. Y el JSON no leía `continue: false`, la otra forma con que un hook de Claude Code corta. Las dos se agregaron.

La cuarta pasada encontró dos problemas en esa validación. El primero era el más serio: frenar todo con `guards` roto
dejaba a la sesión sin la herramienta que lo arregla. La salida del caso 419 sólo aplica cuando el JSON no se puede
leer, y éste se lee, así que no había ninguna. Ahora la escritura de `ops.config.json` pasa cuando la forma está rota,
porque con la forma rota no corre ningún guard del proyecto que pudiera juzgarla. Los de Cauce la siguen juzgando. El
segundo: la forma se validaba con reglas propias, distintas de las de `check`. Ahora el hook usa `validateGuards`, la
misma de `check`, y los dos dicen lo mismo. Eso suma algo que antes pasaba al correr: una ruta absoluta o vacía también
frena.

Las pruebas son «una lista de guards mal escrita frena…», con texto, objeto y una lista de números por evento, y con el
campo entero como lista o como texto; y «un guard que sale en 0 con una decisión de frenar en JSON frena», que cubre las
cuatro decisiones, con motivo y sin él, más tres salidas en 0 que no deciden nada. Y «con guards roto, la escritura que
arregla ops.config.json no la frena la forma rota», que comprueba que otra escritura y un comando sí frenan. Sobre el
código final se vieron en rojo, en una copia, tres mutaciones: no validar, encerrar la reparación y dejar pasar
cualquier escritura. Antes se habían visto las de ignorar el JSON, dejar pasar el `ask` y dejar pasar
`continue: false`.
