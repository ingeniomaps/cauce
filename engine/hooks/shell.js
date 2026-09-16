'use strict'

// Los guards que juzgan el **texto** de un comando antes de que se ejecute: qué destruye, qué publica,
// qué toca una dependencia y qué gobierna. Es el grupo `pre-shell` que el registro declara, y de lo que
// parten los cinco es `commandOf`. Dos miran además el índice —`dependencies` y `governance`, los dos
// acotados a un commit—; los otros tres deciden sólo con lo que el comando dice.
//
// Correr los gates de un commit era lo otro que hacía este archivo y hoy vive en `verify.js`, que de acá
// no usa más que `run`. Cambia por otra causa: una herramienta nueva, no una evasión nueva.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  commandOf, cwdOf, block, isCommit, stagedForCommit,
  writableRoots, outsideRoots, DECLARE_IT, unquoted, opsRoot, withoutGitGlobals,
} = require('./input')
const AP = require('./approval')
const CHAT = require('./chat')
const { publish } = require('./push')
const { selfApprovalShell } = require('./self-approval')

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
  const command = withoutGitGlobals(isCommit(raw) ? unquoted(raw) : raw)
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
    [/\bgit\s+reset\s+--hard\b/, "'git reset --hard' destruye cambios locales.", true],
    // R8 lo prohíbe sin excepción configurable y ningún guard lo miraba: `grep -rn amend engine/hooks/`
    // no devolvía una línea. Se bloquea por política y no por daño —un `--amend` sobre algo que nadie vio
    // no rompe nada—, así que el mensaje manda a lo que sí corresponde: otro commit.
    [
      new RegExp(String.raw`\bgit\s+commit\b${MISMO}*\s--amend\b`),
      "'git commit --amend' reescribe un commit ya creado. R8 pide uno nuevo en su lugar.",
    ],
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
  for (const [pattern, message, open] of rules) {
    if (!pattern.test(command)) continue
    const item = String(raw).trim()
    if (open && !AP.pending(opsRoot(input), [item], input).length) continue
    block(open ? `${message}\n${AP.HOW(null, [item], input)}` : message)
  }
}

function gitAdd(input) {
  const raw = commandOf(input)
  // El mensaje de un commit es dato, igual que en `destructive` y por lo mismo: el commit que explica
  // esta prohibición la nombra, y sin esto no se podía escribir. Fuera de un commit lo entrecomillado
  // sí se ejecuta, así que ahí no se vacía.
  const command = withoutGitGlobals(isCommit(raw) ? unquoted(raw) : raw)
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

function dependencies(input) {
  if (process.env.OPS_DEPENDENCIES_OVERRIDE === '1') return
  const command = commandOf(input)
  const unsafePackageCommand = /\b(?:npm|pnpm|yarn|bun)\s+publish\b/.test(command)
    || new RegExp(String.raw`\b(?:npm|pnpm|yarn)\s+(?:install|add)\b${MISMO}*(?:\s-g\b|\s--global\b)`)
      .test(command)
  if (unsafePackageCommand) {
    block('Publicar paquetes o instalar dependencias globales requiere una acción humana explícita.')
  }
  if (!isCommit(command)) return
  const { dir, staged } = stagedForCommit(command, cwdOf(input))
  const manifests = new Set(['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml'])
  const locks = new Set([
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
    'poetry.lock',
    'uv.lock',
    'go.sum',
    'Cargo.lock',
  ])
  const byDir = new Map()
  for (const file of staged) {
    const base = path.basename(file)
    if (!manifests.has(base) && !locks.has(base)) continue
    const parent = path.dirname(file)
    const state = byDir.get(parent) || { manifests: [], locks: [] }
    state[manifests.has(base) ? 'manifests' : 'locks'].push(base)
    byDir.set(parent, state)
  }
  // Lo que se juzga acá es el archivo staged, así que la aprobación por ruta lo expresa: autorizar
  // `package.json` dice «este manifiesto va sin su lock a propósito» y deja de valer en cuanto el
  // conjunto cambie. La rama de publicar no pasa por acá y no tiene ruta: sigue arriba, con su variable.
  const sinAprobar = (parent, names) => AP.pendingNow(opsRoot(input),
    names.map((name) => path.posix.join(parent === '.' ? '' : parent, name)), input)
  // Un lock cuenta si está en disco **o** si el commit lo va a llevar, y la unión no es un detalle: el
  // disco solo perdía el que alguien borró del árbol sin stagear el borrado —sigue en el índice, sigue
  // en el próximo commit— y ahí la comprobación dejaba de dispararse justo cuando más hacía falta. Es
  // la misma forma que `verify` en chico. El índice se lee una vez y sólo si hay algo que decidir.
  const index = byDir.size ? run('git', ['-C', dir, 'ls-files'], dir) : { ok: true, output: '' }
  if (!index.ok) {
    block(`no se pudo leer el índice de ${dir}, así que no hay cómo saber qué lockfiles va a llevar el `
      + 'commit.')
  }
  const enElIndice = new Set(index.output.split('\n').filter(Boolean))
  for (const [parent, state] of byDir) {
    const enParent = (name) => (parent === '.' ? name : path.posix.join(parent, name))
    // La regla de «varios lockfiles» sí es sobre el disco y sólo sobre el disco: lo que rompe ahí es que
    // el gestor que corra elija uno, y el que corre lee el árbol.
    const onDisk = [...locks].filter((name) => fs.existsSync(path.join(dir, parent, name)))
    const existingLocks = [...new Set([...onDisk, ...[...locks].filter((n) => enElIndice.has(enParent(n)))])]
    if (onDisk.length > 1) {
      block(`${parent}: hay varios lockfiles (${onDisk.join(', ')}). Conserva uno solo.`)
    }
    const manifests = sinAprobar(parent, state.manifests)
    if (state.manifests.length && existingLocks.length && !state.locks.length && manifests.length) {
      block(`${parent}: cambió ${state.manifests.join(', ')} sin actualizar su lockfile.\n`
        + AP.HOW('OPS_DEPENDENCIES_OVERRIDE', manifests, input))
    }
    const lockfiles = sinAprobar(parent, state.locks)
    if (state.locks.length && !state.manifests.length && lockfiles.length) {
      block(`${parent}: cambió ${state.locks.join(', ')} sin un cambio explícito en el manifest.\n`
        + AP.HOW('OPS_DEPENDENCIES_OVERRIDE', lockfiles, input))
    }
  }
}

// El destino de una escritura se juzgaba sólo en `Edit`/`Write`, así que el mismo archivo se escribía
// sin obstáculo con un heredoc por `Bash`: frenaba a quien actuaba de buena fe y no a quien quería pasar.
// Registrar `workspace-boundary` en este grupo no alcanzaba —lee `filesOf`, que en un comando no
// devuelve nada—, así que lo que faltaba era leer el comando.
//
// **Esto no puede ser completo y no se presenta como si lo fuera.** `eval`, una variable armada dos
// líneas antes, un heredoc dentro de `bash -c`, un `python -c "open(...)"` o un script propio escriben
// igual y ningún patrón los ve. Frena la forma habitual, como el resto de `destructive`; quien quiera
// pasar, pasa. Presentarlo como un límite invitaría a confiar en él más de lo que aguanta.
// Tres familias, porque los comandos no nombran su destino igual: `tee` y `truncate` escriben en cada
// argumento, `cp` y sus hermanos en el último, y `sed` sólo escribe con `-i` —sin él lee y manda a
// stdout, y esa redirección la ve REDIRECT—.
//
// El salto de línea termina una lista de argumentos igual que `;`. Sin excluirlo, la de un `cp` seguía
// leyendo la línea de abajo y el destino terminaba siendo el comando siguiente: un bloqueo que nombraba
// `…/python3`, una ruta que no aparecía en el comando. Se veía con un heredoc debajo, pero el heredoc no
// era la causa —sólo hacía que la lectura frenara en un token que sobrevive—: sin él la lista cruzaba
// igual y el último token era la marca de lo entrecomillado, que el filtro final descarta. O sea que
// pasaba de casualidad, y aserciar que pasa no fijaba nada.
// Y el `|` después de `>` es el override de `noclobber`, no una tubería: `>| destino` escribe igual que
// `> destino` aunque el shell esté configurado para no pisar. Sin admitirlo acá el guard no veía ese
// destino —el `|` está fuera de la clase que captura la ruta, así que la coincidencia moría—, y con él
// se perdían los tres guards que salen de `writesWithBase` a la vez. Lo que un agente se escribía por
// ese hueco era su propia `.ops-approval` (caso 164).
const REDIRECT = /(?:^|[\s(])&?\d*>>?\|?\s*(?![&(])([^\s;|&<>()]+)/g
const EVERY_ARG = /(?:^|[\s;|&(])(tee|truncate)\s+([^;|&<>()\n]+)/g
const LAST_ARG = /(?:^|[\s;|&(])(cp|mv|install|rsync)\s+([^;|&<>()\n]+)/g
const SED = /(?:^|[\s;|&(])sed\s+([^;|&<>()\n]+)/g
const IN_PLACE = /(?:^|\s)-{1,2}i/

// Los argumentos que no son flags. El valor de un flag se cuela —`truncate -s 0 log` trae el `0`— y no
// hace falta sacarlo: un token así resuelve contra el cwd, que está adentro de la raíz, así que nunca
// decide un bloqueo. Filtrarlo sería una rama que ninguna prueba puede ver caer.
const positional = (text) => text.trim().split(/\s+/).filter((one) => one && !one.startsWith('-'))

// Un `>` adentro de una cadena no redirige nada. Pierde el destino entrecomillado, que es un falso
// negativo — el error barato en un guard que ya es incompleto, porque el caro es frenar un comando
// legítimo y que alguien apague el guard entero.
//
// `$HOME` y `~` se expanden porque son como se escribe el destino que esto vino a ver; el incidente que
// lo originó decía `> $HOME/.claude/...`. Cualquier otra variable queda sin resolver y no se juzga:
// adivinar su valor sería inventarlo, y un límite inventado frena lo que nadie pidió frenar.
function writeTargets(command) {
  const clean = unquoted(command)
  const found = new Set()
  for (const match of clean.matchAll(REDIRECT)) found.add(match[1])
  for (const match of clean.matchAll(EVERY_ARG)) for (const one of positional(match[2])) found.add(one)
  for (const match of clean.matchAll(LAST_ARG)) {
    const args = positional(match[2])
    // Con un solo argumento no hay destino: `cp solo` está a medio escribir, no escribe en `solo`.
    if (args.length > 1) found.add(args[args.length - 1])
  }
  for (const match of clean.matchAll(SED)) {
    const args = positional(match[1])
    if (IN_PLACE.test(match[1]) && args.length) found.add(args[args.length - 1])
  }
  return [...found]
    .map((one) => one.replace(/^~(?=$|\/)/, os.homedir()).replace(/^\$\{?HOME\}?(?=$|\/)/, os.homedir()))
    .filter((one) => !/[$`\u0000]/.test(one))
}

// Los destinos que no son de nadie y aparecen en cualquier comando legítimo: los descriptores del
// sistema y el temporal, que es donde el propio runner deja lo que no va al repositorio. Sin esta lista
// el guard frena `> /dev/null 2>&1`, y lo primero que hace quien lo sufre es apagarlo entero.
const NEUTRAL = [/^\/dev\/(?:null|stdout|stderr|tty|fd\/)/, new RegExp(`^${os.tmpdir()}(?:/|$)`)]

// A dónde deja parado un `cd`. `null` significa que no se sabe, que no es lo mismo que la raíz: un
// destino con variable o un `cd -` dependen de un estado que este proceso no tiene.
function cdTarget(argument, base) {
  if (argument === undefined) return os.homedir()
  if (argument === '-' || /[$`\u0000]/.test(argument)) return null
  if (/^~(?=$|\/)/.test(argument)) return argument.replace(/^~/, os.homedir())
  return path.resolve(base, argument)
}

// Las escrituras de un comando, cada una con el directorio contra el que hay que resolverla. El `cd`
// del propio comando cambia eso para todo lo que viene después y es lo primero que el shell ejecuta;
// sin mirarlo, el guard juzgaba una ruta que nadie iba a escribir, y fallaba en los dos sentidos.
//
// Se recorre por tramos y se lleva la cuenta, en vez de mirar sólo el primero como hace `gitDirectory`.
// Ahí alcanza porque un comando elige un repositorio; acá cada escritura puede caer bajo un `cd`
// distinto, y juzgar la primera contra el último sería cambiar un error de lugar en vez de arreglarlo.
//
// Los tramos salen del texto ya sin comillas, así que un `;` adentro de una cadena no parte nada.
function writesWithBase(command, cwd) {
  const found = []
  let base = cwd
  // El `|` que sigue a un `>` no parte nada: es el override de `noclobber`, no una tubería. Partir ahí
  // separaba la redirección de su destino —`echo x >| ruta` quedaba como `echo x >` y ` ruta`— y el
  // destino no lo veía nadie, que es por donde se colaba escribir la propia `.ops-approval` (caso 164).
  for (const segment of unquoted(command).split(/[;&\n]+|(?<!>)\|+/)) {
    const cd = segment.match(/^\s*cd(?:\s+(\S+))?\s*$/)
    if (cd) { base = base === null ? null : cdTarget(cd[1], base); continue }
    for (const raw of writeTargets(segment)) found.push({ raw, base })
  }
  return found
}

function shellBoundary(input) {
  const allowed = writableRoots(input)
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
    const own = selfApprovalShell(input, file)
    if (own) block(own)
    if (!allowed || NEUTRAL.some((pattern) => pattern.test(file))) continue
    if (outsideRoots(file, allowed)) {
      block(`el comando escribe en ${file}, fuera de las raíces declaradas en ops.config.json. ${DECLARE_IT}`)
    }
  }
}

function governance(input) {
  if (process.env.OPS_GOVERNANCE_OVERRIDE === '1') return
  const command = commandOf(input)
  if (!isCommit(command)) return
  // Con una persona conduciendo el turno, este guard no pregunta nada. Frena por **política** —qué archivos
  // toca un commit— y no por un defecto de hecho, y esa pregunta a quien está dando instrucciones no le
  // corresponde: lo que el guard contiene es al agente decidiendo solo (caso 126). `said` ya distingue las
  // dos cosas —devuelve nada para un subagente, para un recorrido de Cauce y en CI—, así que la exención no
  // alcanza a nada de eso. Es la misma forma que usa `plan-first` en `files.js`.
  //
  // Sus dos vecinos de gate no llevan esta exención y la diferencia no es quién pidió el commit: `verify` y
  // `dependencies` frenan por algo que está mal —una verificación que falla, un manifiesto sin su lockfile—
  // y callarlos porque hay alguien hablando sería tapar un rojo.
  if (CHAT.said(input)) return
  // El contrato de un cargo y lo que lo mide son gobernanza, igual que un ADR o una regla. La firma de
  // «Aprobación humana» sólo estaba protegida por una frase en un prompt; `SKILL.md` y `references/`
  // son lo que la propuesta cambia, y editarlos directo saltea el ciclo entero; y `evaluations/` es el
  // denominador con que se juzga, así que moverlo ablanda toda medición pasada sin tocar una regla.
  //
  // Quedan afuera las dos clases de evidencia, que registran lo que pasó un día en vez de decidir algo:
  // `learning/reports/` y `evaluations/results/` —esta última se escribe en cada corrida, así que
  // gobernarla pediría un override por evaluación—. Por eso `evaluations/` se nombra por partes.
  const governedPattern = new RegExp(
    String.raw`^(?:(?:template\/)?planning\/(?:rules\/|adr\/|PROTOCOL\.md|` +
      String.raw`METHODOLOGY\.md|FLOW\.md)|automatization\/|engine\/` +
      String.raw`|agents\/[a-z0-9-]+\/(?:system\/)?[a-z0-9-]+\/(?:SKILL\.md|references\/` +
      String.raw`|evaluations\/(?:cases\/|expected-behaviors\.yaml)|learning\/proposals\/))`,
  )
  const governed = stagedForCommit(command, cwdOf(input))
    .staged.filter((file) => governedPattern.test(file))
  if (!governed.length) return
  // La aprobación vale para lo que nombra y para nada más: lo que quede sin cubrir es lo que se
  // reporta. Así una aprobación vieja no autoriza el archivo que se sumó después, que es la diferencia
  // entre una llave por operación y una puerta que quedó abierta.
  const pendientes = AP.pendingNow(opsRoot(input), governed, input)
  if (!pendientes.length) return
  block(`El commit toca gobernanza protegida.\n${AP.HOW('OPS_GOVERNANCE_OVERRIDE', pendientes, input)}`)
}

function run(program, args, cwd, extra = {}) {
  const env = { ...process.env, ...extra }
  delete env.NODE_TEST_CONTEXT
  const started = Date.now()
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', stdio: 'pipe', env })
  return {
    ok: result.status === 0,
    status: result.status,
    ms: Date.now() - started,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  }
}


module.exports = { destructive, gitAdd, dependencies, governance, shellBoundary, run, writesWithBase }
