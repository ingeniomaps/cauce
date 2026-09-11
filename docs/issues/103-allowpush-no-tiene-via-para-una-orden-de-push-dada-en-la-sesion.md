---
caso: 103
titulo: Un push que la persona ordena en la sesión no tiene vía: la salida del 098 no llega al guard de publicación
estado: abierto
prioridad: media
version-detectada: 0.80.0
---

# 103 — Publicar lo pidió la persona, y el guard sólo sabe leer un interruptor del proyecto

**🔴 abierto** · detectado en 0.80.0, sigue en 0.81.0 · prioridad **media** — frena una orden explícita del
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
