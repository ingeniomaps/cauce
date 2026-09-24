---
caso: 190
titulo: Un guard invocado fuera de Claude Code espera stdin hasta que alguien lo cierre, y deja un node vivo por horas
estado: resuelto
resuelto-en: 0.99.0
prioridad: media
version-detectada: 0.98.0
---

# 190 — El motor de hooks lee stdin hasta EOF sin límite, así que una invocación con stdin abierto no termina

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **media**. No rompe ninguna corrida del runner: rompe la
máquina de a poco, con procesos que nadie ve porque están dormidos.

## Resumen

`readInput()` lee el descriptor 0 con `fs.readFileSync(0, 'utf8')` (`engine/hooks/input.js:18`), que
**bloquea hasta EOF**. Cuando el hook lo invoca Claude Code eso está bien: manda su JSON y el descriptor
llega a EOF. Cuando lo invoca una persona, un agente o un script —para comprobar a mano que el guard
pasa— stdin es lo que haya heredado, y si eso es una terminal, un pipe o un socket que nadie cierra, la
llamada **no vuelve hasta que el otro extremo se cierre**, que puede ser nunca.

El proceso queda dormido —`unix_stream_data_wait` si el descriptor es un socket, `pipe_read` si es un
pipe—, con 0 % de CPU, hasta que alguien lo mata, cierra el otro extremo o se cierra la sesión. No falla,
no avisa y no aparece en ninguna salida: el comando que lo lanzó simplemente no termina.

Y el guard **no llegó a hacer su trabajo**: `run.js:198` evalúa `readInput()` como argumento de
`executeAll(...)`, así que la lectura ocurre antes de despachar cualquier guard. En `planning-drift`,
`ops check` (`run.js:27`) no corre mientras se espera —medido abajo: cero procesos hijos durante la
espera—. Lo que el caso original leyó como «el resultado se produjo y se perdió» era la salida de los
comandos anteriores del mismo comando compuesto, no la del guard (ver Contexto).

*Corrección de la versión anterior de este caso*: decía que «`docs/` invita» a correr guards a mano. En
este repositorio `docs/` sólo contiene `docs/issues/`, y ninguna página documenta un procedimiento para
invocar un `guard-*.sh` a mano: `grep` de `guard-[a-z-]*\.sh` y `run-hook` sobre `docs/`, `template/` y
`automatization/hooks/README.md` sólo encuentra el diagrama de `automatization/hooks/README.md:95-105`
(los shims como entrada del runner) y la frase «Comprobado corriendo los guards directamente»
(`README.md:27-28`), que es una afirmación, no una invitación. La invocación a mano del caso original fue
decisión de quien corría la sesión.

## Reproducción

Desde la raíz de este repositorio, con `TMPDIR` apuntando a un scratch propio (el guard `planning-drift`
escribe un marcador `cauce-drift-<sesión>` en `os.tmpdir()`, `run.js:29`). Todo con `timeout` para no
dejar procesos vivos:

```sh
export TMPDIR=<scratch>

# A — stdin en /dev/null: termina
timeout 10 node engine/hooks/run.js git-add </dev/null; echo "exit $?"

# B — stdin es un pipe que no manda nada ni se cierra
sleep 30 | timeout 5 node engine/hooks/run.js git-add; echo "exit ${PIPESTATUS[1]}"

# C — stdin es un JSON que se cierra: el camino del runner
timeout 10 node engine/hooks/run.js git-add < block.json   # {"tool_input":{"command":"git add ."}}

# D — stdin cerrado
timeout 10 node engine/hooks/run.js git-add <&-

# E — el shim, igual que en el caso original
sleep 30 | timeout 5 bash automatization/hooks/guard-planning-drift.sh

# F — stdin es un socket (lo que da `child_process.spawn` con stdio 'pipe' en Linux)
node -e "const c=require('child_process').spawn(process.execPath,['engine/hooks/run.js','git-add'],
  {stdio:['pipe','inherit','inherit']}); setTimeout(()=>c.kill(),5000)"   # leer /proc/<pid>/wchan antes

# G — stdin es una terminal
script -qfec "timeout --foreground 4 node engine/hooks/run.js git-add; echo exit=\$?" /dev/null
```

Medido el 2026-09-23 sobre Cauce 0.98.0 (`83fc8698`), Node v24.18.0, Linux 6.8:

| Forma | Salida | Descriptor 0 / `wchan` |
|---|---|---|
| A, `</dev/null` | `exit 0` en 0,03 s | — |
| B, pipe abierto | `timeout` lo corta: `exit 124` | `pipe:[…]` / `pipe_read` |
| C, JSON cerrado | `BLOQUEADO: 'git add -A/--all/.' está prohibido…`, `exit 2` | — |
| D, stdin cerrado | `exit 0` | — (Node reabre el 0 sobre `/dev/null`) |
| E, shim `planning-drift` | `exit 124` | `pipe_read`, **0 hijos** durante la espera |
| F, socket | sigue vivo a los 5 s; muere por `SIGTERM` (`exit null SIGTERM`) | `socket:[…]` / `unix_stream_data_wait` |
| G, terminal (`/dev/pts/4`) | `exit=124` | — |

Y la forma E con `sleep 4` en vez de `sleep 30`: el guard espera los 4 s, recién entonces corre y sale
`exit 0` a los 4,01 s. «Para siempre» es, exactamente, «hasta que el escritor cierre».

Después de cada tanda, `pgrep -af '^node .*run\.js'` no devolvió nada.

## Síntoma

**De la corrida original (monorepo ROAX, 2026-09-23); no comprobable desde acá.** Dos invocaciones en
segundo plano, encontradas seis y siete horas después:

```
PID 4054789  ELAPSED 07:37:32  %CPU 0.0  RSS 17520 kB  node …/engine/hooks/run.js planning-drift
PID   69053  ELAPSED 06:00:57  %CPU 0.0  RSS 17524 kB  node …/engine/hooks/run.js planning-drift
wchan: unix_stream_data_wait   hijos: ninguno
```

Lo que sí se contrasta desde acá:

- `unix_stream_data_wait` es la espera de un **socket** Unix, no de un pipe: la forma F lo reproduce y
  la B da `pipe_read`. El descriptor heredado era entonces un socket —probablemente el que el runner le
  da al shell en segundo plano; hipótesis, no se comprobó cómo lo arma el runner—.
- «hijos: ninguno» coincide con que `ops check` no había corrido: la forma E tampoco tiene hijos durante
  la espera.
- La corrida original reporta que al matarlos «cerraron de inmediato con `exit 0`». Matar el `node` con
  `SIGTERM` no da 0 —la forma F termina por la señal—; un `exit 0` encaja con que lo cerrado haya sido el
  otro extremo del socket, que libera la lectura y deja correr al guard. No se puede saber desde acá cuál
  de las dos pasó.

El segundo efecto que la corrida original reporta —el runner sigue mostrando esos comandos como **en
curso**— es consecuencia del mismo defecto, no otro: el comando compuesto no terminó.

## Root cause

`engine/hooks/input.js:16-23`:

```js
function readInput() {
  let raw = ''
  try { raw = fs.readFileSync(0, 'utf8') } catch { /* sin stdin */ }
  if (!raw.trim()) return {}
  try { return JSON.parse(raw) } catch (error) {
    block(`la entrada del hook no es JSON válido (${error.message}).`)
  }
}
```

El `catch` contempla que **no haya** stdin y el `if` que venga **vacío**. Lo que no contempla es el
tercer estado: stdin **existe, está abierto y no va a mandar nada**. Ahí `readFileSync` no falla ni
devuelve vacío — espera.

`engine/hooks/run.js:198` lo llama antes de despachar:
`try { executeAll(process.argv.slice(2), readInput()) } catch (error) {`.

`automatization/hooks/run-hook.sh:34` cierra con `exec node "$runner" "$@"`, así que el descriptor se
hereda tal cual desde quien invocó el shim.

## Fix propuesto

Ponerle un límite a la **espera del primer byte**, no a la lectura entera. La entrada de un hook es un
JSON que el runner ya tiene escrito cuando lanza el proceso: si en un par de segundos no empezó a llegar,
no va a llegar; si empezó, se lee hasta EOF sin plazo.

Las dos formas que proponía la versión anterior, contrastadas:

- **Reabrir el 0 en modo no bloqueante** —`fs.openSync('/dev/stdin', O_RDONLY | O_NONBLOCK)` y sondear
  con `readSync`— **no sirve para el caso real**. Medido: sobre un pipe abre y `readSync` da `EAGAIN`,
  que es lo que hace falta; sobre un socket el `open` falla con `ENXIO`. Y el colgado original era un
  socket. Node no expone `fcntl` para poner `O_NONBLOCK` sobre el 0 sin reabrirlo.
- **Descartar por `process.stdin.isTTY`** cubre sólo la forma G. No cubre ni B ni F.

Lo que queda es leer de forma **asíncrona** —`process.stdin` con un temporizador que corre hasta el
primer `data`— y volver asíncrono el despacho de `run.js:197-202`. *Hipótesis: no se probó*; es la
forma de la que Node dispone para leer un socket con plazo sin reabrirlo. Toca además a quien importe
`readInput` —hoy sólo `run.js:12`, comprobado con `grep -rn readInput engine`—.

Lo que no sirve es resolverlo en el shim con `</dev/null`: arreglaría la invocación a mano y rompería la
real, que es justamente la que necesita leer.

## Tradeoffs

**Qué pasa al agotarse el plazo es una decisión, y la versión anterior la dejaba del lado abierto.**
Tratarlo como entrada vacía hace que el guard **deje pasar**: `commandOf` y `fileOf`
(`input.js:42-51`) caen a `OPS_HOOK_COMMAND`/`OPS_HOOK_FILE` y, sin ellas, a `''`. R27 pide lo contrario
—cerrado por defecto—, y `run-hook.sh:27` ya lo aplica a otro borde: «Un guard que no encuentra su motor
bloquea, nunca permite». Agotar el plazo sobre un pipe o socket abierto debería **bloquear** (`exit 2`)
con un mensaje que diga qué pasó y cómo invocarlo a mano (`</dev/null`, o el JSON por stdin). La
invocación a mano deja de colgarse igual —termina en 2 s con un bloqueo explicado—, que es lo que cierra
la reproducción.

**Un plazo sobre la lectura entera sí cortaría entradas legítimas.** Un `Write` con un archivo grande
manda su contenido entero en `tool_input.content`; un pipe tiene un búfer finito y el runner escribe de a
tramos. Por eso el plazo va sobre el primer byte y no sobre el total. *Hipótesis* el tamaño real que
alcanza: la documentación de hooks no menciona ningún límite de tamaño de la entrada.

**Lo que Claude Code garantiza del lado del runner** (code.claude.com/docs/en/hooks, consultado
2026-09-23): «For command hooks, input arrives on stdin», y el `timeout` por defecto de un hook `command`
es 600 s, al cabo del cual «Claude Code cancels … discarding the hook's output, so on most events a
timed-out hook renders no decision». La página no dice explícitamente que cierre stdin; que lo hace está
**verificado** en esta misma sesión: el hook `PreToolUse` `guard-git-add.sh` bloqueó en segundos un
comando que nombraba `git add .`, cosa imposible si stdin no llegara a EOF. Un plazo de 2 s al primer byte
queda lejos de esos 600 s.

Las pruebas que invocan guards por stdin no se ven afectadas: `test/hooks/chat-effects.test.js:200` y
`test/instance/lifecycle.test.js:82` usan `spawnSync(…, { input })`, y `test/tools/hooks-smoke.sh:13`
usa `printf … |`; las tres cierran stdin después de escribir. `test/hooks/registry.test.js` llama a
`executeAll` directo, sin pasar por `readInput`. El arreglo sí necesita una prueba nueva: stdin abierto
sin datos → termina en el plazo con `exit 2`.

## Decisiones que pide

1. **Plazo agotado: bloquear o dejar pasar.** Recomendación: bloquear con mensaje (R27). Dejar pasar
   convierte un runner lento en un guard apagado sin rastro.
2. **Plazo sobre el primer byte o sobre la lectura entera.** Recomendación: primer byte; lo otro corta
   entradas grandes legítimas.
3. **Despacho asíncrono.** El único camino medido que cubre el socket es leer asíncrono, y eso cambia la
   forma de `run.js:197-202`. Recomendación: aceptarlo; la alternativa sincrónica no cubre el caso
   original.

## Prioridad

**Media.** No frena ninguna corrida del runner ni produce un resultado incorrecto: lo que se pierde es que
el proceso termine. Sube si alguien automatiza invocaciones del guard fuera del runner —un `Makefile`, un
hook de git, un CI con stdin abierto—, porque cada una deja un proceso colgado.

Es, además, la forma de R26 vista desde el otro lado: una puerta que no acota su propio costo.

## Contexto de descubrimiento

**De la corrida original; no comprobable desde acá.** Sesión de trabajo en el monorepo ROAX, 2026-09-23.
Dos comandos lanzados en segundo plano para resolver una fila de `HUMAN_ACTIONS` y corregir un rótulo de
registro terminaban con `bash automatization/hooks/guard-planning-drift.sh` como verificación final. La
salida que entregaron —el trabajo hecho y un `ops check` en verde— venía de los pasos anteriores del
comando compuesto: el guard final nunca pasó de leer stdin (`run.js:198`). El runner los siguió
reportando vivos durante horas; la persona preguntó qué eran esos dos shells y de ahí salió el
diagnóstico.

El mismo guard, corrido en primer plano esa tarde, había devuelto `exit 0` en segundos —que es lo que hizo
pensar que el guard estaba bien—. Encaja con que en primer plano el descriptor 0 llegara a EOF
(formas A y D); cuál era exactamente no consta.

## Relacionados

- `sistema R26` — una puerta acota su propio costo y no escribe en el árbol que juzga.
- `sistema R27` — cerrado por defecto: decide qué hace el plazo al agotarse.
- `sistema R21` — lo hecho no es lo aprovechable: acá se creyó que el guard había terminado su trabajo y
  no había empezado.

## Cierre

**Resuelto en 0.99.0, por la vía asíncrona que el caso proponía y con las tres decisiones tomadas por el
dueño**: plazo sobre el primer byte, plazo agotado bloquea, despacho asíncrono aceptado. Recorriendo lo que
enumeró:

- **Fix propuesto → se hizo.** `readInput()` lee `process.stdin` con un temporizador que corre hasta el
  primer `data` y devuelve una promesa (`engine/hooks/input.js`, `readInput`); `run.js` despacha cuando
  resuelve. La *hipótesis* del caso —que es la forma que cubre el socket— queda **verificada**: forma F abajo.
- **Valor del plazo → 2000 ms, fijo, sin variable de entorno** (`FIRST_BYTE_MS`). El runner escribe su JSON
  al lanzar el hook, así que en el camino real el primer byte ya está en el búfer cuando Node termina de
  arrancar; dos segundos sólo cubren una máquina cargada. No se hizo configurable: estirarlo no arregla nada
  que el runner necesite, y acortarlo es la única forma de volverlo frágil.
- **«Toca a quien importe `readInput`» → comprobado, sólo `run.js`** (`grep -rn readInput engine
  automatization test`). `executeAll` y `execute` siguen sincrónicos, así que las ~30 pruebas que los llaman
  directo y `engine/automation/hooks.js` no cambian.
- **No resolverlo en el shim con `</dev/null` → respetado**: `run-hook.sh` no se tocó.
- **Tradeoff del plazo agotado → bloquea con `exit 2`**, nunca entrada vacía (R27), con un mensaje que dice
  qué pasó y las dos formas de invocarlo a mano: el JSON por stdin o `</dev/null`.
- **Tradeoff del `Write` grande → el plazo es sobre el primer byte.** La prueba lo fija con un escritor que
  manda la segunda mitad del JSON *después* de vencido el plazo —más fuerte que una demora menor, que
  pasaría también con un plazo sobre la lectura entera— y la forma E' lo repite a mano con 4 s.
- **Lo que garantiza el runner → sin cambios, y no re-medido contra este motor.** Que Claude Code cierra
  stdin estaba verificado en el caso; el camino que usa —JSON escrito y cerrado— es la forma C y E', que dan
  lo mismo que antes. Correr el motor arreglado bajo el runner real exige instalarlo, y acá no se instala.
- **Pruebas que invocan guards por stdin → no afectadas**, como el caso anticipaba: `npm run ci` en verde con
  944 pruebas, `hooks-smoke.sh` incluido.
- **Síntoma del runner que muestra el comando «en curso» → cerrado por la misma vía**: el comando compuesto
  termina a los 2 s con el bloqueo a la vista, en vez de no terminar.
- **Prioridad («sube si alguien automatiza invocaciones»)** → ya no aplica: cada invocación termina.

**Lo que el caso no preveía: el puente de Antigravity tiene su propia copia del mismo defecto, y peor.**
`automatization/runners/antigravity/hook.js` define otro `readInput()` con `fs.readFileSync(0)` que no pasa
por `input.js`. Medido acá: `sleep 6 | timeout 3 node automatization/runners/antigravity/hook.js pre-shell`
→ `exit 124`, colgado igual; y `echo '{roto' | … pre-shell` → `{"decision":"allow"}`, o sea que además deja
pasar un JSON ilegible, que es justo lo que el `readInput` del motor dejó de hacer hace tiempo. Es otro
archivo, otro runner y otra decisión —si el puente debe reusar el del motor—, así que **sale como caso
propio, el 198,** y no entra acá.

### Qué se corrió

- **La reproducción del caso, formas A–G, contra el motor arreglado** (2026-09-23, Node v24.18.0, Linux
  6.8; el tiempo es el del `node`, no el del pipeline, que espera al `sleep`):

  ```
  A </dev/null                       node: 0.072 s  exit 0
  B pipe abierto                     BLOQUEADO: no llegó nada por stdin en 2000 ms: …   node: 2.084 s  exit 2
  C JSON cerrado                     BLOQUEADO: 'git add -A/--all/.' está prohibido. …  node: 0.072 s  exit 2
  D stdin cerrado                    node: 0.072 s  exit 0
  E shim planning-drift, pipe        BLOQUEADO: no llegó nada por stdin en 2000 ms: …   node: 2.077 s  exit 2
  E' shim, JSON que termina a los 4 s                                                   node: 4.015 s  exit 0
  F socket   fd0: socket:[289559212] wchan: ep_poll
             BLOQUEADO: no llegó nada por stdin en 2000 ms: …   exit 2 null a los 2100 ms
  G terminal /dev/pts/4 (script con stdin que nadie escribe)
             BLOQUEADO: no llegó nada por stdin en 2000 ms: …   node: 2.109 s  exit=2
  leftovers: ninguno
  ```

  El mensaje entero: «no llegó nada por stdin en 2000 ms: stdin está abierto y nadie escribe (una terminal, o
  un pipe o un socket que no se cierran). Un guard que no sabe qué juzgar no autoriza. Para invocarlo a mano,
  pasale el JSON del hook —printf '%s' '{"tool_input":{"command":"…"}}' | guard-….sh— o correlo sin entrada
  con </dev/null.» En la forma F el proceso ya no duerme en `unix_stream_data_wait` sino en el `ep_poll` del
  bucle de eventos, que es lo que deja correr al temporizador. La G necesitó darle a `script` un stdin que no
  cierre: con uno cerrado, `script` manda EOF a la terminal y el guard termina en 0 como la forma D.
- **La prueba nueva, `test/hooks/stdin.test.js`**, lanza `run.js` como proceso hijo en siete formas —socket y
  pipe abiertos, JSON en dos trozos, JSON que bloquea y que pasa, `/dev/null`, stdin cerrado— y prueba
  `readInput` sobre un stream. Cada hijo tiene su tope y se mata al final; `pgrep` no encontró ninguno vivo
  después de ninguna tanda. **En rojo sobre el código de 0.98.0**: socket y pipe «no terminó solo en 8000 ms».
- **Cinco mutaciones más en una copia del árbol, las cinco en rojo**: plazo agotado como entrada vacía
  (fallan socket, pipe y `readInput`); plazo sobre la lectura entera (falla el JSON en dos trozos); no
  soltar el stream al rendirse (falla `readInput`); vacío que bloquea (fallan `/dev/null` y stdin cerrado);
  `run.js` sin `exit` en el bloqueo (fallan socket, pipe, dos trozos y el JSON que bloquea).
- `npm run ci`, exit 0.

### Prueba real en un banco instalado (2026-09-23)

Banco: `ops bench sidecar` copiado fuera del árbol de Cauce con el layout de gouduet —instancia y producto en repositorios hermanos—, `automation install` del runner y los guards invocados por los shims instalados, como los invoca el runner. Control: el mismo input con el motor 0.98.0 de gouduet-ops, cambiando sólo el enlace del banco. El shim `guard-shell.sh` instalado, con stdin de un pipe que nadie cierra: `exit=2` a los 2 s con la rama; con 0.98.0, colgado hasta el `timeout` (124). En todas las sesiones reales de Claude Code y Codex de esta tanda los hooks leyeron su entrada con el lector nuevo, sin cuelgues ni falsos «no llegó nada».

### Revisión del conjunto antes del PR (2026-09-24)

La revisión encontró que el plazo cubría sólo el primer byte: un escritor que manda el JSON entero y no cierra stdin dejaba al guard esperando para siempre. No era una regresión —0.98.0 también se colgaba—, pero es la clase que este caso cerraba. Corregido en `06e0bf4e`: llegados datos, si pasa el plazo sin nada nuevo y lo recibido ya es un JSON entero, se juzga; medio JSON sigue esperando, así que la prueba de los dos trozos con pausa sigue en verde. Caso nuevo en `test/hooks/stdin.test.js`, visto en rojo (el guard no terminaba en 8 s).
