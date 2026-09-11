---
caso: 103
titulo: Un push que la persona ordena en la sesión no tiene vía: la salida del 098 no llega al guard de publicación
estado: resuelto
resuelto-en: 0.82.0
prioridad: media
version-detectada: 0.80.0
---

# 103 — Publicar lo pidió la persona, y el guard sólo sabe leer un interruptor del proyecto

**🟢 resuelto en 0.82.0** · detectado en 0.80.0 · prioridad **media** — frena una orden explícita del
usuario, que es lo que el 098 dice que Cauce no tiene que hacer nunca, y la única salida que no pasa por la
persona corriendo el comando es prender un permiso para todo el proyecto (caso 108)

## Resumen

R10 pide «la autorización configurada para el proyecto» para publicar, y `runner.allowPush` es esa
configuración (`engine/hooks/input.js:186-188`). El guard de publicación la lee y nada más: con
`allowPush: false`, un `git push` a una rama de trabajo se frena aunque la persona lo haya pedido con todas
las letras en la sesión.

El agente no debe prender el flag solo —sería otorgarse el permiso que R10 pone en una persona—, así que la
sesión queda cortada a mitad de un flujo que la persona misma pidió, y la salida es que ella corra el
comando.

En 0.81.0 el 098 cerró ese mismo hueco para los guards de escritura y lectura: un hook de mensaje
(`engine/hooks/chat.js`) registra lo que escribe la persona, y los bloqueos con salida angosta
(`engine/hooks/approval.js`) dejan pasar lo que ella nombró o aprobó con «dale». **El push quedó afuera**:
su bloqueo no consulta el registro del chat ni anota lo que frenó, así que ni nombrar el comando entero ni
contestar «dale» lo destraba (B y D en el síntoma).

La otra mitad —que `allowPush: true` deja pasar cualquier push, a la rama viva y de un subagente— es un
defecto con vida propia y salió como **108**.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable. `TMPDIR` apunta adentro del banco para que el
registro del chat, que vive en el temporal del sistema, no salga de él:

```bash
S=$(mktemp -d); mkdir -p "$S/tmp"
node engine/cli/ops.js init "$S/acme" --mode embedded --runner claude --no-install >/dev/null
TMPDIR="$S/tmp" A="$S/acme" REPO="$PWD" node - <<'EOF'
const { spawnSync } = require('child_process'); const fs = require('fs'); const path = require('path')
const { A, REPO } = process.env; const env = { ...process.env, OPS_ROOT: A }; delete env.CI
const hook = (group, input) => spawnSync('node', [path.join(REPO, 'engine/hooks/run.js'), group],
  { input: JSON.stringify({ cwd: A, session_id: 's1', ...input }), env, encoding: 'utf8', cwd: A })
const say = (prompt, id) => hook('prompt', { hook_event_name: 'UserPromptSubmit', prompt, prompt_id: id })
const probe = (label, command, extra = {}) => {
  const r = hook('pre-shell', { tool_name: 'Bash', tool_input: { command }, ...extra })
  console.log(`${label.padEnd(58)}: exit=${r.status} ${(r.stderr || r.stdout).split('\n')[0].slice(0, 90)}`) }
probe('A allowPush false, push feat/x, sin chat', 'git push origin feat/x')
say('Subí la rama: git push origin feat/x', 'p1')
probe('B el chat nombra "git push origin feat/x" (mismo prompt_id)', 'git push origin feat/x', { prompt_id: 'p1' })
say('dale', 'p2')
probe('D «dale» en el mensaje siguiente al bloqueo', 'git push origin feat/x', { prompt_id: 'p2' })
const dir = path.join(process.env.TMPDIR, 'cauce-chat')
console.log(`  registro del chat: ${fs.readFileSync(path.join(dir, 's1.json'), 'utf8')}`)
probe('C gh pr create', 'gh pr create --title x --body y')
probe('H git push sin argumentos', 'git push')
const CHAT = require(path.join(REPO, 'engine/hooks/chat.js'))
say('Arreglá el login y no subas nada', 'p3')
const left = CHAT.unauthorized({ session_id: 's1', prompt_id: 'p3' }, ['push origin feat/login'])
console.log(`R «Arreglá el login y no subas nada» con el ítem «push origin feat/login»: sin autorizar = ${JSON.stringify(left)}`)
EOF
```

`R` no es el comportamiento de hoy —hoy el push no consulta el chat—: mide qué pasaría si el arreglo
reusara la comparación del 098 tal cual.

## Síntoma

Salida real, 2026-09-11, desde el checkout de `main` en 0.81.0:

```
A allowPush false, push feat/x, sin chat                  : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Se habilita con runner
B el chat nombra "git push origin feat/x" (mismo prompt_id): exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Se habilita con runner
D «dale» en el mensaje siguiente al bloqueo               : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Se habilita con runner
  registro del chat: {"id":"p2","text":"dale","human":true,"flow":false,"approved":[],"pending":[]}
C gh pr create                                            : exit=0
H git push sin argumentos                                 : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Se habilita con runner
R «Arreglá el login y no subas nada» con el ítem «push origin feat/login»: sin autorizar = []
```

- **B**: el mensaje que originó la llamada nombra el comando literal, y el bloqueo es idéntico al de A.
- **D**: el «dale» no aprueba nada porque el bloqueo no anotó qué frenó: `pending` y `approved` vacíos.
- **C**: abrir el PR pasa. R10 lo pone en la misma lista que el push, pero el motor comprueba sólo el push, y
  eso ya está declarado en R10; lo que queda cortado del flujo que pidió la persona es el push.
- **R**: la comparación del 098 autoriza de más, ver «Causa raíz».

## Causa raíz

- `engine/hooks/shell.js:72-74`: `git push` sin `pushAllowed(input)` se bloquea con `block(...)` a secas, sin
  pasar por `AP.pending` ni por `AP.HOW`, que son los que consultan el chat y anotan lo pendiente. La rama del
  `--force`, en `shell.js:67-71`, va antes y no consulta nada, a propósito (R8).
- `engine/hooks/input.js:215-220`, `pushAllowed`: devuelve `runner.allowPush === true` del `ops.config.json`.
  No hay otra entrada: ni una aprobación por comando, ni el registro del chat.
- **Por qué no alcanza con enchufar el push a lo del 098 tal como está**: `CHAT.unauthorized`
  (`engine/hooks/chat.js:104-108`) llama a `mentions` (`chat.js:52-66`), que busca el ítem entero **y su
  `path.basename`** (`chat.js:55`). Para un ítem `push origin feat/login` el basename es `login`, y cualquier
  mensaje que diga «login» sin negarlo en la misma frase lo autoriza: en R, «Arreglá el login y no subas
  nada» deja el push sin nada pendiente. Tiene sentido para una ruta —«leé el .env» nombra
  `<banco>/.env`—; para un push, es autorizar publicar porque se habló del tema.

## Fix propuesto

Construirlo sobre el 098 en vez de al lado, en `shell.js:72`:

1. Cuando el comando es un push y `pushAllowed` da falso, **extraer `push <remoto> <rama>`** del comando.
2. **Dejarlo pasar sólo si `CHAT.said(input)` confirma persona** y ese mensaje pide ese remoto y esa rama,
   con **comparación exacta de remoto + rama**, no con `mentions`: sin basename, y con la negación por frase
   que el 098 ya tiene.
3. **Si se frena, con salida angosta**: `AP.HOW` / `CHAT.hold` con el ítem `push <remoto> <rama>`, para que
   un «dale» en el mensaje siguiente apruebe exactamente ese push y ningún otro.
4. **La rama del `--force` va antes y no se toca**: `shell.js:67-71` sigue sin override.
5. Un `git push` sin remoto o sin rama explícitos (H) no tiene qué comparar: se sigue frenando, y el mensaje
   pide nombrar remoto y rama. Resolver el upstream para compararlo es posible pero no está medido acá, y el
   caso no lo necesita para cerrar.

Las sesiones automáticas ya quedan afuera por construcción, porque todo pasa por `CHAT.said`
(`chat.js:94-100`): devuelve `null` con `CI` en el entorno, con `agent_id` (un subagente), sin
`session_id`, cuando el mensaje fue un recorrido de Cauce o cuando el `prompt_id` de la llamada es de otro
mensaje. Y `record` (`chat.js:80`) marca como no humano el texto que empieza con `<`, que es como Claude
avisa que terminó un subagente. Un `claude -p` lanzado a mano **sí** cuenta como persona, igual que en el
098: el pedido lo escribió ella.

**Decisión pendiente del usuario:**

- **P1 — ¿Qué cuenta como orden de push?** Tres lecturas posibles:
  - el comando literal (`git push origin feat/x`) — lo más seguro, y obliga a la persona a escribir shell;
  - remoto y rama nombrados en el mensaje (`push a origin feat/x`, `subí feat/x a origin`);
  - lenguaje natural sin remoto (`subí feat/x`) — lo más cómodo, y el que más cerca queda de R.

  **Recomendación**: remoto + rama nombrados, y todo lo demás se frena con el «dale» como salida. La persona
  que dijo «subí la rama» contesta una palabra, y el agente nunca publica por una frase ambigua.
- **P3 — ¿`planning/.ops-approval` acepta ítems `push <remoto> <rama>`?** Es la vía de cuando no hay chat
  (`approval.js:24-25`), y hoy `read` (`approval.js:36-40`) toma cada línea como una ruta. **Recomendación**:
  sí, la línea exacta y sin patrones —nada de `feat/*`—, porque un patrón convierte una aprobación puntual en
  un permiso, que es lo que es `allowPush` y lo que el 108 discute. El archivo ya lo protegen
  `workspace-boundary` y `shell-boundary` desde el 098, así que el agente no se lo escribe.

`allowPush: true` sigue existiendo para el proyecto que quiere que el loop publique siempre; qué alcanza ese
interruptor es el 108.

## Tradeoffs

- **Comparar exacto cansa más que comparar por nombre.** «subí la rama del login» no autoriza y termina en un
  «dale»; es el costo de que «arreglá el login» tampoco autorice.
- **Un «dale» por push** en un flujo con muchas ramas. La propuesta original admitía patrones de rama; se
  descarta por la razón de P3, y queda como pregunta abierta si alguien lo pide con uso real.
- **El rastro de la aprobación consumida** —quién, qué rama, cuándo— sería valioso porque un push no se
  deshace solo, y el 098 no lo tiene para ninguna aprobación. Es una mejora del mecanismo entero, no de este
  caso: queda como **P4** en el 108.

## Qué tiene que probar el cierre

- Con `allowPush: false` y el mensaje «push a origin feat/x», el push a `origin feat/x` pasa **y uno a
  `origin feat/y` en la misma llamada no**: aserción de ausencia, vista en rojo con una mutación que compare
  sólo el remoto.
- B y D de la reproducción terminan en `exit=0`; A sigue en `exit=2`.
- R deja el ítem pendiente: una mutación que vuelva a usar `mentions` con basename lo pone en rojo.
- El recorrido del «dale»: frena, `pending` trae `push origin feat/x`, «dale» lo aprueba y sólo eso pasa.
- Nada de lo anterior habilita `--force`: con el chat nombrando `git push --force origin feat/x`, sigue en
  `exit=2` con el mensaje de R8.
- Sesiones automáticas: el mismo mensaje con `CI=1`, con `agent_id` o con `prompt_id` de otro mensaje no
  autoriza.
- `git push` sin argumentos sigue en `exit=2` aunque el chat diga «pusheá».
- Si P3 sale que sí: una línea `push origin feat/x` en `.ops-approval` destraba ese push y no otro.
- En vivo, en una sesión real de Claude Code sobre un banco con el paquete a publicar: «push a origin
  feat/x» publica sin pedir nada más, contra un remoto desechable.

## Contexto de descubrimiento

Instancia real (sidecar), 2026-09-10. En una sesión interactiva la persona pidió publicar una rama de
trabajo y abrir su PR; el guard lo frenó, el agente —con razón— no tocó el flag, y la sesión quedó cortada:
el push lo tuvo que correr la persona a mano. La instancia lo anotó como caso para Cauce ese mismo día.

Revisado el 2026-09-11 sobre 0.81.0: el 098 ya estaba y el push siguió igual (B).

## Relacionados

- **108** — la otra mitad: `allowPush: true` no distingue la rama viva ni quién pide el push. Separado porque
  se arregla y se prueba aparte; este caso da una vía angosta, aquél acota la ancha.
- **098** — el mecanismo sobre el que se construye: el hook de mensaje, `said`, `hold` y el «dale». Su
  criterio, «Cauce no limita al usuario», es el que este caso extiende al push.
- **109** — se abre en paralelo sobre «nombrar no es pedir»: R es un ejemplo del mismo defecto aplicado a un
  push, y lo que se decida allá sobre `mentions` puede cambiar el paso 2 de acá.
- **097** — la aprobación en sidecar se nombra desde la carpeta de la sesión; si P3 sale que sí, el push
  hereda ese arreglo.

## Cierre

**🟢 resuelto en 0.82.0** · `engine/hooks/push.js` (nuevo), `engine/hooks/chat.js`, `engine/hooks/shell.js`,
`engine/hooks/approval.js`

### Contra lo que el caso enumeró

- **Fix 1, extraer `push <remoto> <rama>`** — hecho en `push.js`. Lee el remoto y cada refspec; del refspec
  vale el destino —lo que va después de `:`—, `HEAD` es la rama actual y `refs/heads/` se saca. Un push con
  dos refspecs da dos ítems, y los dos tienen que estar autorizados.
- **Fix 2, `said` y comparación exacta** — hecho: `ordersPush` en `chat.js`. El remoto y la rama tienen que
  aparecer como palabras enteras en una frase que traiga un verbo **de publicar** —no cualquiera: «revisá
  feat/x en origin» no pide un push— y sin negación antes. No pasa por `mentions`, así que el basename no
  cuenta. Todo pasa por `CHAT.said`.
- **Fix 3, salida angosta** — hecho distinto: `CHAT.hold` sí, `AP.HOW` no, porque su texto nombra una
  variable de entorno que el push no tiene. El mensaje del push es propio y dice lo mismo: esperá, un
  «dale» lo destraba, y si prefiere que la persona pegue la línea.
- **Fix 4, el `--force` no se toca** — su rama sigue antes y sin override. Se amplió a `+rama`, que es el
  mismo force escrito en el refspec: ver «Lo que el caso no preveía».
- **Fix 5, `git push` sin argumentos** — hecho distinto, por decisión del usuario: se resuelve con
  `@{push}`, una lectura local que ya aplica `push.default`. Si no resuelve —sin upstream—, queda frenado con
  el «dale» disponible y sin línea para `.ops-approval`, porque no nombra ninguna rama.
- **Sesiones automáticas** — por construcción, como decía el caso; probado con `CI`, `agent_id` y un
  `prompt_id` de otro mensaje. Un subagente además se frena antes, con cualquier permiso (108).
- **P1** — el usuario eligió remoto y rama exactos, o el «dale». Hecho así.
- **P3** — el usuario eligió que sí: la línea exacta `push <remoto> <rama>`, sin patrones. `push origin feat/*`
  y `git push` escritos en el archivo no aprueban nada, con prueba.
- **Tradeoff «comparar exacto cansa»** — se cumple: «publicala así abro el PR» terminó en un «dale», en vivo.
- **Tradeoff «un "dale" por push»** — se cumple, sin patrones de rama.
- **Tradeoff «el rastro de la aprobación consumida»** — le tocaba a otro: salió como **112**.
- **Relacionado 109** — lo que se decidió allá, que la frase tiene que pedir, se aplicó acá más estricto: el
  verbo tiene que ser de publicar.
- **Relacionado 097** — la línea del push se nombra con el mismo `where` que las demás aprobaciones, desde la
  carpeta de la sesión.
- **Cada ítem de «Qué tiene que probar el cierre»**:
  - «push a origin feat/x» pasa y `origin feat/y` en la misma llamada no, y la mutación que compara sólo el
    remoto sale roja (M1);
  - B y D en `exit=0`, A en `exit=2`: la sonda, abajo;
  - R queda pendiente, y volver a `mentions` sale rojo (M2);
  - el recorrido del «dale»: el bloqueo deja `pending: ["push origin feat/x"]` —se ve en el caso 112, que
    corrió el mismo recorrido— y el «dale» aprueba ése y no `feat/z` (D2);
  - el chat nombrando `git push --force origin feat/x`: sigue en `exit=2` con el mensaje de R8;
  - `CI=1`, `agent_id` y otro `prompt_id`: no autorizan (S1-S3);
  - `git push` sin argumentos con «pusheá»: sigue en `exit=2` (H) cuando no hay upstream que resolver;
  - la línea `push origin feat/q` destraba ese push y no `feat/r` (P3, P3b);
  - en vivo, «Subí feat/x a origin.» publicó sin pedir nada más, contra un remoto bare del banco (V1).

### Lo que el caso no preveía

- **`git push origin +rama` era un force que pasaba como push normal.** La regla del force miraba sólo las
  banderas, y con `allowPush: true` el `+` del refspec publicaba reescribiendo: en la sonda sobre el código de
  antes, `F2 allowPush true, push +feat/x : exit=0`. Ahora cae en la rama de R8 (M12).
- **«don't» no negaba.** Partir las palabras en la comilla simple lo dejaba en «don t», que la negación no
  reconoce. Lo encontró el caso que se agregó cuando la mutación de la negación sobrevivió (M10, abajo).
- **El bloqueo de la rama viva le hablaba al agente como si la línea fuera cosa suya.** En la primera sesión
  real, contestado «dale», el agente intentó escribirse `push origin main` en `.ops-approval`; lo frenó
  `shell-boundary`. Es lo mismo que el 098 corrigió para los otros bloqueos. El mensaje ahora le dice que
  espere y deja el permiso como cosa de la persona, y en la segunda corrida le pidió a ella que lo escriba.

### Qué se corrió

- **El rojo previo**: las pruebas nuevas y las dos que cambiaron, sobre `git archive` de `437170a8`: 8 de 97
  en rojo; con el arreglo, 97 de 97.
- **La reproducción del propio caso** con el arreglo, ampliada:

  ```
  A allowPush false, push feat/x, sin chat                  : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Lo destraba una person
  B el chat nombra "git push origin feat/x" (mismo prompt_id): exit=0
  B2 mismo mensaje, push a origin feat/y                    : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Decile a la persona qu
  D «dale» en el mensaje siguiente al bloqueo               : exit=0
  D2 el «dale» no aprueba otro push                         : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Decile a la persona qu
  C gh pr create                                            : exit=0
  H git push sin argumentos, chat «pusheá»                  : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Decile a la persona qu
  R «Arreglá el login y no subas nada» → feat/login         : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Decile a la persona qu
  F el chat nombra el --force                               : exit=2 BLOQUEADO: 'git push --force' reescribe historia ya publicada. R8 lo prohíbe y runner.allo
  S1 «subí feat/x a origin», agent_id                       : exit=2 BLOQUEADO: 'git push' desde un subagente no se publica, con ningún permiso: publicar lo de
  S2 mismo, con CI=1                                        : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Lo destraba una person
  S3 mismo, prompt_id de otro mensaje                       : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Lo destraba una person
  S4 mismo, sesión principal                                : exit=0
  P3 .ops-approval «push origin feat/q»                     : exit=0
  P3b .ops-approval no aprueba feat/r                       : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Decile a la persona qu
  ```

  La misma sonda sobre el código de antes da `exit=2` en B, D, S4 y P3.
- **Diecisiete mutaciones, en una copia desechable (R23)**, comprobadas aplicadas antes de contar, las diecisiete
  rojas. La de la negación (M10) sobrevivió la primera vez: «no subas» no trae un verbo de la lista, así que el
  caso frenaba por otra razón. Se agregaron dos mensajes con verbo y negación, que encontraron lo de «don't», y
  con eso salió roja.

  ```
  M1 la orden compara sólo el remoto                   ROJA    M10 la negación no cuenta en la orden        ROJA
  M2 el push vuelve a pasar por mentions (basename)    ROJA    M11 cualquier frase con remoto y rama ordena ROJA
  M3 un subagente cuenta como la sesión                ROJA    M12 el + del refspec no es force             ROJA
  M4 allowPush alcanza la rama viva                    ROJA    M13 el nombre vale dentro de otro            ROJA
  M5 la orden del chat alcanza la rama viva            ROJA    M14 la validación acepta patrones            ROJA
  M6 .ops-approval acepta la línea sin destino         ROJA    M15 el refspec toma el origen y no el destino ROJA
  M7 el bloqueo no deja anotado el push                ROJA    M16 pushToLiveBranches se ignora             ROJA
  M8 la rama por defecto del remoto no cuenta          ROJA    M17 el «dale» vale para cualquier push       ROJA
  M9 git push sin argumentos no se resuelve            ROJA
  ```
- **En vivo**, Claude Code 2.1.269 con `--model haiku`, sobre un banco con la instancia instalada desde el
  paquete de la rama (`npm pack` → `npm install`, `automation install . claude`), `allowPush: false` y un remoto
  bare que es un directorio del banco. Lo que cuenta es qué ramas tiene el remoto después:

  ```
  V1  «Subí feat/x a origin.»                        → git push origin feat/x pasó;  remoto: feat/x main
  V2  «Ya terminé con esta rama, publicala así abro el PR.»
                                                     → git push -u origin feat/y BLOQUEADO; remoto sin feat/y
  V2b «dale» (--resume de la misma sesión)           → reintentó el mismo push, pasó; remoto: feat/x feat/y main
  ```
- **La pasada de comentarios** en 0.22 contra la base: ningún par que escriba este cambio. Aparece uno
  «nuevo», `input.js:186 ↔ hooks.test.js:1067` a 0.36, y es preexistente: sacar el comentario de
  `pushAllowed`, que estaba pegado a ese párrafo sin línea en blanco, lo dejó solo y subió su solapamiento.
- `npm run ci`: código 0, 708 de 708, cobertura de 62 archivos en su piso o por encima. La primera corrida dio
  707 de 708: una prueba de `verify` que cuenta copias en el temporal compartido se cruzó con la suite de otra
  sesión que corría a la vez; sola pasa, y la puerta repetida con un temporal propio pasó entera.
