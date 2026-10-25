'use strict'

// Los guards que juzgan el **texto** de un comando antes de que se ejecute: qué destruye, qué publica,
// qué stagea y qué escribe fuera de las raíces. Son parte del grupo `pre-shell` que el registro declara, y
// los tres parten de `commandOf` y deciden sólo con lo que el comando dice. `dependencies`, que además lee
// el índice, vive en `dependencies.js`; cómo se lee qué escribe un comando, en `shell-writes.js`.
//
// Correr los gates de un commit era lo otro que hacía este archivo y hoy vive en `verify.js`, que de acá
// no usa más que `run`; lo que un commit no toca sin una persona vive en `governance.js`, por lo mismo.
// Cambian por otra causa: una herramienta nueva, no una evasión nueva.

const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  commandOf, cwdOf, block, writableRoots, outsideRoots, DECLARE_IT, opsRoot, withoutGitGlobals, gitDirectory, owns,
  asRun, assignedValues, toplevel, realPath,
} = require('./input')
const { writesWithBase, REDIRECTIONS } = require('./shell-writes')
const { removesTheTree } = require('./removal')
const { steps, removals, creations, home, asRead } = require('./shell-changes')
const { landing } = require('../core/files')
const { beyond, reached, real, removed, refusal } = require('./boundary')
const LS = require('./line-scope')
const AP = require('./approval')
const { publish } = require('./push')
const { selfApprovalShell } = require('./self-approval')
const { deliveryRules, namesRepo, GH, DIR } = require('./delivery')

// Dónde empieza y dónde termina una palabra dentro de un comando. Tres reglas de la tabla de abajo lo
// decidían por su cuenta admitiendo sólo un espacio, el principio o el fin, y en un shell una palabra
// también termina en `;`, `&`, `|`, `)` y en una comilla. Con eso `rm -rf /; echo listo` pasaba —sin una
// sola comilla, porque lo que decidía era el espacio antes del punto y coma— y las tres se esquivaban
// envueltas en `bash -c`, `sh -c`, `eval` o un subshell, donde lo de adentro sí se ejecuta.
//
// Son dos cierres y no uno, y la diferencia es lo que evita frenar de más. PALABRA termina una palabra:
// el espacio cuenta, porque después de una ruta un espacio la termina. COMANDO termina el comando: ahí
// el espacio **no** cuenta, porque `--` seguido de un espacio significa que viene un archivo nombrado, y
// revertir un archivo nombrado es trabajo corriente que la regla no toca.
//
// Y el `\s*` va adentro del lookahead. Afuera, el cuantificador retrocede a vacío y el lookahead ve el
// espacio que él mismo habría consumido, así que `git checkout -- src/app.js` empieza a caer.
const ANTES = String.raw`(?:^|[\s;&|('"\`])`
const PALABRA = String.raw`$|[\s;&|)'"\`]`
const COMANDO = String.raw`$|[;&|)'"\`]`
// Lo que puede haber **entre** un comando y su bandera sin salir de ese comando. El salto de línea va
// adentro de lo excluido porque también separa comandos, exactamente igual que `;`, `&` y `|`: sin él,
// una bandera escrita en una línea posterior se leía como parte del primer comando. Es la causa de los
// falsos positivos del caso 067, en siete reglas a la vez — `git push origin main` seguido de
// `rm -f /tmp/x` se bloqueaba anunciando «`git push --force` reescribe historia publicada», que además
// de frenar trabajo legítimo nombraba una violación que no estaba.
const MISMO = String.raw`[^;&|\n]`

// Si algún remoto alcanza al commit que está en HEAD. Lectura local e inocua: `branch -r` mira lo que ya
// está en `refs/remotes/`, no habla con ningún servidor. Un `fetch` que nadie corrió deja la respuesta
// desactualizada hacia el lado seguro — cree que no está publicado algo que sí lo está—, y por eso esto
// acota un bloqueo y no autoriza nada: lo que decide publicar sigue siendo `push`, que mira otra cosa.
//
// Sin git, sin repositorio o con el comando fallando, la respuesta es **sí**: cerrado por defecto (R27).
// No saber si algo se publicó no es lo mismo que saber que no.
function publishedHead(input) {
  const cwd = (input && input.cwd) || process.cwd()
  const result = spawnSync('git', ['branch', '-r', '--contains', 'HEAD'], { cwd, encoding: 'utf8' })
  if (result.status !== 0) return true
  return Boolean(result.stdout.trim())
}

// Los tramos de un comando, partido por `;`, `&`, `|` y el salto de línea fuera de comillas, sin los paréntesis o
// llaves que lo agrupan ni sus redirecciones, que no cambian qué hace. El `&` de una redirección —`2>&1`, `&>`— no
// parte.
function stretches(raw) {
  const found = []
  let start = 0
  let quote = ''
  for (let at = 0; at < raw.length; at += 1) {
    const char = raw[at]
    if (quote) {
      if (char === quote) quote = ''
      else if (char === '\\' && quote === '"') at += 1
    } else if (char === '\\') at += 1
    else if (char === "'" || char === '"') quote = char
    else if (';|\n'.includes(char) || (char === '&' && raw[at - 1] !== '>' && raw[at + 1] !== '>')) {
      found.push(raw.slice(start, at))
      start = at + 1
    }
  }
  return [...found, raw.slice(start)].map((one) => one.replace(REDIRECTIONS, ' ').trim().replace(/^[({]+\s*/, '')
    .replace(/\s*[)}]+$/, '').replace(/\s+/g, ' ')).filter(Boolean)
}

// Lo que se aprueba de un comando: el tramo que la regla reconoce, si es uno solo. Lo que lo rodea —el `cd` que lo
// lleva a su carpeta, el `echo` que lee la salida— lo cambia el agente de un intento al siguiente, y con el comando
// entero como ítem el reintento era otra cosa y el «dale» de la persona no lo cubría (caso 451). Dónde corre ya lo
// dice el lugar. Con dos tramos que la regla reconoce, el comando entero: aprobar uno no aprueba el otro.
//
// Y se reduce sólo si todo lo demás es inerte: un `cd` a una ruta escrita, que es lo que el lugar sabe leer, o algo
// que sólo lee o muestra. Cualquier otra cosa puede mover la carpeta sin que el lugar lo vea —un subshell, `pushd`,
// `builtin cd`, `eval`, `source`—, y con el tramo solo la línea de `api` dejaba pasar la limpieza en `web`. Ahí queda
// el comando entero, como antes del 451: cerrado por defecto (R27).
const INERT = new RegExp(String.raw`^(?:cd\s+(['"]?)[^\s'"$\`*?~\\]+\1`
  + String.raw`|(?:echo|printf|true|tail|head|wc|sort|git\s+(?:status|log|diff|show))(?:\s.*)?)$`)
function stretchOf(raw, pattern) {
  const text = String(raw).trim()
  const all = stretches(text)
  const hits = all.filter((one) => pattern.test(withoutGitGlobals(asRun(one))))
  // Un grupo —`( … )`, `{ …; }`— devuelve la carpeta al cerrarse, y el lugar no lo sigue: queda entero.
  const grouped = /[(){}]/.test(text.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, ''))
  return hits.length === 1 && !grouped && all.every((one) => one === hits[0] || INERT.test(one)) ? hits[0] : text
}

// Dónde vale una aprobación, según la regla: el repositorio para lo que hace `git` —y para un `gh` que no lo nombra,
// que es el que va a resolver—, la carpeta para un deploy o un stack de Compose, que leen su configuración de ahí.
// Real, para que un enlace no lo convierta en otro lugar. Se calcula una vez por clase y por comando.
const REPO = 'repo'
function placesOf(raw, input) {
  const known = new Map()
  return (kind) => {
    if (!kind) return { where: '', sure: true }
    if (!known.has(kind)) {
      const { dir, sure } = AP.locate(raw, input, { shell: kind === GH })
      known.set(kind, { where: kind === DIR ? realPath(dir) : toplevel(dir), sure })
    }
    return known.get(kind)
  }
}
const UNNAMED = '`gh` elige el repositorio solo, desde la carpeta en la que corre —y en un fork, el original—, así '
  + 'que una línea sin él valdría en cualquiera. Nombrá el destino con --repo y el bloqueo va a decir qué pegar.'
const UNSURE = 'el comando no deja saber dónde corre —dos destinos distintos, o uno que el shell expande—, así que '
  + 'una línea valdría en otro lugar. Corré cada parte por separado, con la ruta escrita, y el bloqueo va a decir qué '
  + 'pegar.'

// Las reglas de `destructive`, en la forma `[patrón, mensaje, si tiene salida, cómo se lee el ítem, dónde vale]`.
// Viven aparte porque `check` las necesita también: una línea de `.ops-approval` sin el lugar que su regla pide ya
// no aprueba nada, y para saberlo hay que saber qué regla la habría frenado (caso 446).
function rulesOf(input) {
  return [
    ...deliveryRules(input),
    [/\bgit\s+reset\s+--hard\b/, "'git reset --hard' destruye cambios locales.", true, null, REPO],
    // Lo que R8 protege es la historia que **otro ya leyó**, y el motor ya hace esa distinción para el
    // push: publicar se autoriza, reescribir lo publicado no. Acá se hace la misma, mirando si algún
    // remoto alcanza a HEAD.
    //
    // Antes se bloqueaba siempre, «por política y no por daño», y eso no impedía el resultado sino el
    // comando que lo nombra: `git reset --soft HEAD~1` y volver a commitear produce exactamente lo mismo,
    // no lo frena ningún guard y no deja constancia de nada. Una regla que se cumple mejor esquivándola se
    // termina esquivando siempre (caso 178).
    //
    // Y no lleva salida por chat ni publicado ni sin publicar: sin publicar no la necesita, y publicado es
    // la misma reescritura que el force-push, que tampoco la tiene.
    ...(publishedHead(input) ? [[
      new RegExp(String.raw`\bgit\s+commit\b${MISMO}*\s--amend\b`),
      "'git commit --amend' sobre un commit ya publicado reescribe historia que otro leyó. R8 lo "
        + 'prohíbe: hacé otro commit encima.',
    ]] : []),
    // Fuerza en cualquiera de sus opciones, y no simula: mirando sólo la primera, `-d -f` borraba sin preguntar y
    // `-fdn`, que no borra nada, se frenaba (caso 452).
    [new RegExp(String.raw`\bgit\s+clean\b(?=${MISMO}*\s(?:-[a-zA-Z]*f[a-zA-Z]*|--force)\b)`
      + String.raw`(?!${MISMO}*\s(?:-[a-zA-Z]*n[a-zA-Z]*|--dry-run)\b)`),
    "'git clean -f' borra archivos sin seguimiento.", true, null, REPO],
    // `git checkout -- .` destruye lo mismo que `reset --hard` y sin recuperación, pero se escribe como
    // una limpieza. Se bloquea sólo la forma ancha —`.`, `*`, `:/`, o sin ruta—: revertir un archivo
    // nombrado es trabajo corriente y no se toca.
    //
    // Pasó dos veces en una sesión, las dos limpiando restos de una prueba: el comando revirtió también
    // el trabajo de al lado, que no estaba commiteado. Lo que engaña es que el alcance no se ve en el
    // comando — `.` es el cwd, y el cwd suele tener más de lo que uno está mirando.
    [
      // `git restore .` no lleva `--` y destruye igual: comprobado en `git restore --help` (git 2.43.0),
      // que restaura el working tree por defecto y toma el pathspec sin separador.
      new RegExp(String.raw`\bgit\s+(?:checkout|restore)\s+(?:${MISMO}*?\s)?`
        + String.raw`(?:--(?=\s*(?:${COMANDO}))|(?:--\s+)?(?:\.|\*|:\/)(?=\s*(?:${COMANDO})))`),
      "'git checkout -- .' revierte todo lo no commiteado del directorio, no sólo lo que estás mirando. "
      + 'Nombrá el archivo, o commiteá lo que quieras conservar antes.',
      true,
      null,
      REPO,
    ],
    [
      /\bdocker(?:\s+\w+)*\s+(?:volume\s+(?:rm|prune)|system\s+prune|network\s+prune)\b/,
      'La limpieza global de Docker puede borrar datos compartidos.',
      true,
    ],
    [
      /\bdocker(?:\s+compose|-compose)\s+(?:\S+\s+)*(?:down|stop|kill|rm)\b/,
      'Detener un stack Compose puede interrumpir servicios compartidos.',
      true,
      null,
      DIR,
    ],
    [
      new RegExp(ANTES + String.raw`(?:mkfs\S*|shred)\s`
        + String.raw`|\bdd\s+${MISMO}*\bof=\/dev\/|>\s*\/dev\/(?:sd|nvme|disk)`),
      'Operación destructiva sobre disco o dispositivo.',
    ],
    [
      // El destino se reconoce como lo escribe una persona y no sólo desnudo: entre comillas, con llaves,
      // detrás de `--` y con barra final. Las comillas importan más que las otras tres — `rm -rf "$HOME"`
      // es la forma *correcta* de escribirlo en bash, así que sin esto el hueco premiaba al que cita bien
      // sus variables. Y `destructive` no desentrecomilla fuera de un commit, a propósito, así que la
      // comilla tiene que entrar en el patrón (caso 167).
      new RegExp(String.raw`\brm\s+(?:-[^\s]*r[^\s]*\s+)+(?:--\s+)?['"]?`
        + String.raw`(?:\/\*?|~\/?|\$\{?HOME\}?\/?|\.\.)(?=${PALABRA})`),
      "'rm -r' sobre /, home o el directorio padre es catastrófico.",
    ],
  ]
}

// Un mensaje de commit es dato, no código. `git commit -m "fix: bloquear git push --force"` disparaba
// el guard de publicación, y lo mismo `rm -rf /` nombrado en una explicación; con el heredoc que se usa
// para un mensaje largo, el cuerpo entero entra en el comando, así que la línea que arregla esto no se
// podía commitear sin apagar el guard.
//
// Se vacía **sólo** en un commit. En cualquier otro comando lo que va entre comillas sí se ejecuta:
// `bash -c "git push origin main"` y `eval "git reset --hard"` siguen cayendo, comprobado. Queda afuera
// la sustitución dentro del propio mensaje —`git commit -m "$(...)"` corre y ya no se ve—, que es
// evasión y no la forma habitual.
function destructive(input) {
  const raw = commandOf(input)
  // Las opciones globales de `git` se sacan acá y no en cada regla: toda regla de abajo que mire un
  // subcomando lo escribe pegado a `git`, y con una en el medio dejaba de matchear. Por qué, en
  // `withoutGitGlobals`.
  const command = withoutGitGlobals(asRun(raw))
  // Ninguna de estas dos ramas tiene override, y la pregunta merece respuesta escrita porque cuatro
  // guards del motor sí lo tienen. R8 no admite excepción configurable para `force` ni para `amend`, y
  // el precedente es `git-add`, que hace cumplir la misma regla sin escapatoria. Lo que corresponde
  // cuando de verdad hace falta es una acción humana, que deja rastro; una variable de entorno no.
  //
  // Publicar se autoriza; reescribir historia publicada, no. Eran el mismo interruptor: `\bgit\s+push\b`
  // matchea igual las dos formas, así que `allowPush` habilitaba el force-push sin que nadie lo decidiera
  // y el párrafo de autonomía de `AGENTS.md` tenía que confesarlo. R8 prohíbe `force` sin excepción
  // configurable, así que esta rama va antes del permiso y no lo consulta.
  //
  // El `+` delante de una rama es el mismo force escrito en el refspec —`git push origin +main`—, y
  // pasaba como un push normal: la regla miraba sólo las banderas (caso 103).
  if (new RegExp(String.raw`\bgit\s+push\b${MISMO}*\s(?:(?:-f|--force(?:-with-lease|-if-includes)?)\b|\+\S)`)
    .test(command)) {
    block("'git push --force' reescribe historia ya publicada. R8 lo prohíbe y runner.allowPush no lo "
      + 'habilita: publicá con un push normal, o registrá una acción humana.')
  }
  publish(input, command)
  // El tercer elemento dice si la regla tiene salida. Las que no la tienen son las que una persona tampoco
  // debería poder abrir pidiéndolo: `--amend` y el force-push de arriba, que R8 prohíbe sin excepción
  // configurable; el borrado de disco; y `rm -r` sobre raíz, home o el padre, que es la clase que gobierna
  // R23. El resto no tenía salida por omisión y no por decisión: son anteriores al canal de chat de 0.81.0
  // —por qué ese canal existe y qué distingue, en `chat.js`— y nadie volvió a pasarles por encima (117).
  //
  // El ítem que se aprueba es el tramo del comando que la regla reconoce, entero —`stretchOf`, caso 451—, y no el
  // pedazo que matcheó: `git clean -f` no aparece entero dentro de «corré git clean -fd», así que aprobar el fragmento
  // no destrabaría lo que la persona escribió. Cualquier otra bandera es otro comando y vuelve a preguntarse. Y lleva
  // el lugar donde corre, cuando el efecto depende de él: el mismo texto en otro repositorio u otra carpeta es otra
  // operación (caso 446).
  const spotOf = placesOf(raw, input)
  const root = opsRoot(input)
  for (const [pattern, message, open, by, kind] of rulesOf(input)) {
    if (!pattern.test(command)) continue
    const parts = by && by.items(command)
    const texts = parts || [stretchOf(raw, pattern)]
    // Un `gh` que no nombra su repositorio no tiene línea que valga sólo para él, ni un comando cuyo lugar no se sabe:
    // para ésos el archivo no se consulta, y lo concedido en el chat queda atado al lugar desde donde corren.
    const unnamed = new Set(texts.filter((one) => kind === GH && !namesRepo(one)))
    const spots = texts.map((one) => spotOf(unnamed.has(one) ? GH : kind === GH ? '' : kind))
    const items = texts.map((one, at) => AP.placed(one, spots[at].where))
    const loose = new Set(items.filter((one, at) => unnamed.has(texts[at]) || !spots[at].sure))
    const filed = new Set(open && root ? AP.read(root) : [])
    // La línea que se escribió antes del 451, con el comando entero, sigue aprobando ese mismo comando.
    const whole = parts ? [] : [AP.placed(String(raw).trim(), spots[0].where)]
    const asked = items.filter((one) => loose.has(one) || !(filed.has(one) || whole.some((line) => filed.has(line))))
    const held = open ? AP.pending('', asked, input, parts ? by.asked : undefined) : items
    if (!held.length) continue
    const pasteable = held.filter((one) => !loose.has(one))
    const why = unnamed.size ? UNNAMED : UNSURE
    const how = () => AP.HOW(null, held, input, pasteable, { unpasteable: loose.size ? why : '' })
    block(open ? `${message}\n${how()}` : message)
  }
  const tree = removesTheTree(input, command)
  if (tree) block(tree)
}

// Las líneas de `.ops-approval` que son un comando que su regla aprueba con lugar y no lo llevan: la forma de antes
// del 446, que ya no aprueba nada. Es la misma tabla que decide el bloqueo, así que una regla nueva entra sola.
function unplaced(root, lines) {
  if (!lines.length) return []
  // Con el config ilegible la tabla no se puede armar —los `deployCommands` salen de ahí—, y eso ya lo denuncia
  // `check` como error: acá se calla en vez de tumbar la corrida.
  let rules
  try { rules = rulesOf({ cwd: root }) } catch { return [] }
  return lines.filter((line) => {
    if (AP.spokenOf(line) !== line) return false
    if (AP.isPush(line)) return true
    const command = withoutGitGlobals(asRun(line))
    return rules.some(([pattern, , open, , place]) => open && pattern.test(command)
      && (place === REPO || place === DIR || (place === GH && !namesRepo(command))))
  })
}

function gitAdd(input) {
  const raw = commandOf(input)
  // El mensaje de un commit es dato, igual que en `destructive` y por lo mismo: el commit que explica
  // esta prohibición la nombra, y sin esto no se podía escribir. Fuera de un commit lo entrecomillado
  // sí se ejecuta, así que ahí no se vacía.
  const command = withoutGitGlobals(asRun(raw))
  // Stagear por nombre es una regla de los repositorios de la sesión; por qué no alcanza a otro, en `owns`.
  if (!owns(input, gitDirectory(raw, cwdOf(input)))) return
  // Dónde termina la palabra lo decide PALABRA y no un espacio: `bash -c "git add -A"` y
  // `eval 'git add -A'` pasaban porque después de la bandera venía una comilla. Es el hueco que 028
  // cerró en las reglas de `destructive`, y esta regla se quedó afuera de aquel arreglo.
  if (new RegExp(String.raw`\bgit\s+add\s+(?:${MISMO}*\s)?(?:-A|--all|\.)(?=${PALABRA})`)
    .test(command)) {
    block("'git add -A/--all/.' está prohibido. Stagea rutas explícitas.")
  }
  // La misma regla con otra ortografía: `-a` stagea todo lo seguido sin nombrar una ruta, y encima lo
  // hace al commitear —después de este hook—, así que los guards que leen el índice tampoco lo ven.
  // `--amend` queda afuera: empieza con dos guiones y lo frena `destructive`, por otra razón.
  if (new RegExp(String.raw`\bgit\s+commit\b${MISMO}*\s(?:-[a-z]*a[a-z]*|--all)\b`).test(command)) {
    block("'git commit -a' stagea al commitear, después de este guard: nadie llega a revisar el diff "
      + 'staged, ni vos ni los guards que lo miran. Stageá las rutas por nombre y commiteá aparte.')
  }
}

// Los destinos que no son de nadie y aparecen en cualquier comando legítimo: los descriptores del
// sistema y el temporal, que es donde el propio runner deja lo que no va al repositorio. Sin esta lista
// el guard frena `> /dev/null 2>&1`, y lo primero que hace quien lo sufre es apagarlo entero.
// El temporal se juzga por dónde cae la escritura y no por cómo está escrita: un enlace que vive ahí y apunta
// afuera no es el temporal.
const DEVICES = /^\/dev\/(?:null|stdout|stderr|tty|fd\/)/
const TEMP = new RegExp(`^${real(os.tmpdir())}(?:/|$)`)

// El destino de una escritura se juzgaba sólo en `Edit`/`Write`, así que el mismo archivo se escribía
// sin obstáculo con un heredoc por `Bash`: frenaba a quien actuaba de buena fe y no a quien quería pasar.
// Registrar `workspace-boundary` en este grupo no alcanzaba —lee `filesOf`, que en un comando no
// devuelve nada—, así que lo que faltaba era leer el comando. Frena la forma habitual, como el resto de
// `destructive`; quien quiera pasar, pasa (`shell-writes.js` dice por qué no puede ser completo).
function shellBoundary(input) {
  const allowed = writableRoots(input)
  const found = []
  const strayed = []
  // Sin el cuerpo de los heredocs, también con un delimitador como `END-1` (`asRead`).
  for (const { raw, base } of writesWithBase(asRead(commandOf(input)), cwdOf(input))) {
    // Una ruta absoluta no depende del `cd`, así que un destino que no se sabe no la vuelve injuzgable.
    // Al revés sí: sin saber desde dónde se resuelve, una relativa no se puede verificar, y un guard que
    // no puede verificar no autoriza —el criterio que fijó el 031 para el índice—.
    if (!path.isAbsolute(raw) && base === null) {
      if (!allowed) continue
      block(`el comando hace \`cd\` a un destino que no se puede resolver acá, así que no hay contra qué `
        + `resolver ${raw}. Escribí la ruta absoluta, o hacé el \`cd\` en un comando aparte.`)
    }
    const file = path.resolve(base || '/', raw)
    // El canal por el que la persona aprueba no es un destino más: se juzga aunque no haya raíces
    // declaradas y aunque caiga en el temporal, que el resto de este guard deja pasar (caso 098).
    const lands = landing(base || '/', raw)
    const own = selfApprovalShell(input, file) || selfApprovalShell(input, lands)
    if (own) block(own)
    if (!allowed || DEVICES.test(file) || TEMP.test(lands)) continue
    const out = beyond(input, base || '/', raw, allowed)
    if (out) found.push({ verb: 'escribe', out })
    const off = !out && LS.strayed(input, file, lands)
    if (off) strayed.push(off)
  }
  // Borrar afuera es cambiar lo de afuera, y crear una carpeta o un archivo vacío también (caso 365). Lo que
  // no se puede resolver —una variable, un `cd` a un destino desconocido— no se juzga: `cd "$DIR" && rm -rf
  // node_modules` es la limpieza de cualquier script, y frenarla enseña a apagar el guard. Lo catastrófico de
  // esa forma lo cuida `destructive`.
  if (!allowed) return
  const command = commandOf(input)
  const assigned = assignedValues(asRead(command)) || ((text) => text)
  const ran = steps(command, cwdOf(input))
  const changes = [
    ...removals(ran).map((one) => ({ ...one, verb: 'borra', lands: removed })),
    ...creations(ran).map((one) => ({ ...one, verb: 'escribe', lands: landing })),
  ]
  for (const { raw, base, verb, lands } of changes) {
    // `${F##*/}` no es la variable: es un pedazo de su valor. Reemplazarla ahí juzgaba la ruta entera.
    const named = /\$\{\w+[^\w}]/.test(raw) ? raw : home(assigned(raw))
    if (/[$`\u0000]/.test(named) || (base === null && !path.isAbsolute(named))) continue
    const at = lands(base || '/', named)
    if (TEMP.test(at)) continue
    const out = beyond(input, base || '/', named, allowed, at)
    if (out) found.push({ verb, out })
    const off = !out && LS.strayed(input, path.resolve(base || '/', named), at)
    if (off) strayed.push(off)
  }
  // Un `git` que cambia el checkout de otra sesión no escribe en ningún destino de los de arriba (caso 423).
  for (const { dir, sub } of LS.gitTargets(ran)) {
    const off = LS.strayed(input, dir, landing(path.sep, dir), sub)
    if (off) strayed.push(off)
  }
  const why = refusal(input, found, (all) => 'el comando '
    + all.map(({ verb, out }) => `${verb === 'escribe' ? 'escribe en' : verb} ${reached(out)}`).join(' y '))
  if (why) block(why)
  const off = LS.refusal(input, strayed)
  if (off) block(off)
}

function run(program, args, cwd, extra = {}, { timeoutMs } = {}) {
  const env = { ...process.env, ...extra }
  delete env.NODE_TEST_CONTEXT
  const started = Date.now()
  const bounded = timeoutMs ? { timeout: timeoutMs, detached: true } : {}
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', stdio: 'pipe', env, ...bounded })
  const timedOut = Boolean(result.error && result.error.code === 'ETIMEDOUT')
  // Al cortar, `spawnSync` mata al proceso que lanzó y no a sus hijos: `npm run test` muere y el jest que
  // arrancó sigue comiendo memoria, huérfano. Lanzado como líder de su grupo (`detached`), se mata el grupo
  // entero —medido: sin esto el `sleep` de un script quedaba vivo después del corte (caso 240)—.
  if (timedOut) { try { process.kill(-result.pid, 'SIGKILL') } catch { /* ya no está, o no hay grupos */ } }
  return {
    ok: result.status === 0,
    status: result.status,
    ms: Date.now() - started,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    timedOut,
  }
}


module.exports = { destructive, gitAdd, shellBoundary, run, MISMO, unplaced }
