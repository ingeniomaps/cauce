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
  asRun, assignedValues,
} = require('./input')
const { writesWithBase } = require('./shell-writes')
const { removesTheTree } = require('./removal')
const { steps, removals, creations, home, asRead } = require('./shell-changes')
const { landing } = require('../core/files')
const { beyond, reached, real, removed, refusal } = require('./boundary')
const AP = require('./approval')
const { publish } = require('./push')
const { selfApprovalShell } = require('./self-approval')
const { deliveryRules } = require('./delivery')

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
  const rules = [
    ...deliveryRules(input),
    [/\bgit\s+reset\s+--hard\b/, "'git reset --hard' destruye cambios locales.", true],
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
    [/\bgit\s+clean\s+-[^\s]*f/, "'git clean -f' borra archivos sin seguimiento.", true],
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
  // El tercer elemento dice si la regla tiene salida. Las que no la tienen son las que una persona tampoco
  // debería poder abrir pidiéndolo: `--amend` y el force-push de arriba, que R8 prohíbe sin excepción
  // configurable; el borrado de disco; y `rm -r` sobre raíz, home o el padre, que es la clase que gobierna
  // R23. El resto no tenía salida por omisión y no por decisión: son anteriores al canal de chat de 0.81.0
  // —por qué ese canal existe y qué distingue, en `chat.js`— y nadie volvió a pasarles por encima (117).
  //
  // El ítem que se aprueba es el comando entero tal como llegó, no el pedazo que matcheó: `git clean -f`
  // no aparece entero dentro de «corré git clean -fd», así que aprobar el fragmento no destrabaría lo que
  // la persona escribió. Entero es además lo que ella pegaría en el archivo, y lo más angosto: cualquier
  // otra bandera es otro comando y vuelve a preguntarse.
  for (const [pattern, message, open, by] of rules) {
    if (!pattern.test(command)) continue
    const parts = by && by.items(command)
    const items = parts || [String(raw).trim()]
    const held = open ? AP.pending(opsRoot(input), items, input, parts ? by.asked : undefined) : items
    if (!held.length) continue
    block(open ? `${message}\n${AP.HOW(null, held, input)}` : message)
  }
  const tree = removesTheTree(input, command)
  if (tree) block(tree)
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
// devuelve nada—, así que lo que faltaba era leer el comando.
function shellBoundary(input) {
  const allowed = writableRoots(input)
  const found = []
  for (const { raw, base } of writesWithBase(commandOf(input), cwdOf(input))) {
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
  }
  const why = refusal(input, found, (all) => 'el comando '
    + all.map(({ verb, out }) => `${verb === 'escribe' ? 'escribe en' : verb} ${reached(out)}`).join(' y '))
  if (why) block(why)
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


module.exports = { destructive, gitAdd, shellBoundary, run, MISMO }
