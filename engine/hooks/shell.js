'use strict'

// Los guards que juzgan un comando antes de que se ejecute: qué destruye, qué publica, qué toca una
// dependencia y qué gate hay que haber corrido. Todos leen `commandOf` y miran el índice de git —de
// ahí que vayan juntos—, y son el grupo `pre-shell` que el registro ya declaraba.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  commandOf, cwdOf, block, isCommit, stagedForCommit, pushAllowed,
  writableRoots, outsideRoots, DECLARE_IT, unquoted, opsRoot, withoutGitGlobals,
} = require('./input')
const AP = require('./approval')
const { selfApproval } = require('./self-approval')
const EV = require('../core/evidence')

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
  if (new RegExp(String.raw`\bgit\s+push\b${MISMO}*\s(?:-f|--force(?:-with-lease|-if-includes)?)\b`)
    .test(command)) {
    block("'git push --force' reescribe historia ya publicada. R8 lo prohíbe y runner.allowPush no lo "
      + 'habilita: publicá con un push normal, o registrá una acción humana.')
  }
  if (/\bgit\s+push\b/.test(command) && !pushAllowed(input)) {
    block("'git push' publica cambios y requiere una acción humana. Se habilita con runner.allowPush.")
  }
  const rules = [
    [/\bgit\s+reset\s+--hard\b/, "'git reset --hard' destruye cambios locales."],
    // R8 lo prohíbe sin excepción configurable y ningún guard lo miraba: `grep -rn amend engine/hooks/`
    // no devolvía una línea. Se bloquea por política y no por daño —un `--amend` sobre algo que nadie vio
    // no rompe nada—, así que el mensaje manda a lo que sí corresponde: otro commit.
    [
      new RegExp(String.raw`\bgit\s+commit\b${MISMO}*\s--amend\b`),
      "'git commit --amend' reescribe un commit ya creado. R8 pide uno nuevo en su lugar.",
    ],
    [/\bgit\s+clean\s+-[^\s]*f/, "'git clean -f' borra archivos sin seguimiento."],
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
    ],
    [
      /\bdocker(?:\s+\w+)*\s+(?:volume\s+(?:rm|prune)|system\s+prune|network\s+prune)\b/,
      'La limpieza global de Docker puede borrar datos compartidos.',
    ],
    [
      /\bdocker(?:\s+compose|-compose)\s+(?:\S+\s+)*(?:down|stop|kill|rm)\b/,
      'Detener un stack Compose puede interrumpir servicios compartidos.',
    ],
    [
      new RegExp(ANTES + String.raw`(?:mkfs\S*|shred)\s`
        + String.raw`|\bdd\s+${MISMO}*\bof=\/dev\/|>\s*\/dev\/(?:sd|nvme|disk)`),
      'Operación destructiva sobre disco o dispositivo.',
    ],
    [
      new RegExp(String.raw`\brm\s+(?:-[^\s]*r[^\s]*\s+)+(?:\/\*?|~\/?|\$HOME|\.\.)(?=${PALABRA})`),
      "'rm -r' sobre /, home o el directorio padre es catastrófico.",
    ],
  ]
  for (const [pattern, message] of rules) if (pattern.test(command)) block(message)
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
  const sinAprobar = (parent, names) => AP.pending(opsRoot(input),
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
const REDIRECT = /(?:^|[\s(])&?\d*>>?\s*(?![&(])([^\s;|&<>()]+)/g
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
  for (const segment of unquoted(command).split(/[;&|\n]+/)) {
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
    const own = selfApproval(input, file)
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
  const pendientes = AP.pending(opsRoot(input), governed, input)
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

// Salidas de build y cachés que cualquier gate rehace solo. Se comparan contra el nombre entero de la
// entrada para que valga también anidado —`packages/app/dist`—, y con el separador de `git status`, que
// siempre usa `/`.
const RECREABLE = new RegExp('(^|/)(?:dist|build|out|coverage|__pycache__'
  + '|\\.next|\\.nuxt|\\.svelte-kit|\\.turbo|\\.output|\\.parcel-cache|\\.pytest_cache)$')

// Dónde tiene que correr un gate: sobre lo que el commit va a grabar, que es el índice y no el árbol.
// El árbol se le parece casi siempre y por eso el error no se veía — puede tener encima otra versión de
// un archivo staged, y puede tener uno sin trackear que el commit no lleva, que es el olvido de
// `git add` de toda la vida. En los dos casos el verde se calcula sobre un código que nadie va a
// commitear, y queda escrito como si fuera el del commit.
//
// Cuando árbol e índice coinciden, el árbol **es** el próximo commit y correr donde está no cuesta nada.
// Sólo cuando difieren se materializa el índice: `checkout-index` sobre un temporal, medido en 157 ms
// para las mil quinientas rutas de este repositorio, contra los segundos que tarda cualquier gate.
//
// Lo ignorado viaja por enlace y lo sin trackear no, y esa distinción es la mitad del arreglo:
// `node_modules` o `.venv` son entorno que el commit no lleva y sin ellos no corre ningún gate, mientras
// que un fuente sin agregar es justamente lo que hay que ver fallar. `git status --ignored` ya los
// separa en `!!` y `??`, así que no hay que adivinar cuál es cuál.
//
// No se usa `git stash --keep-index`, que sería más corto: toca el árbol de quien está trabajando, y un
// gate que muere a la mitad le deja el stash puesto.
function commitTree(dir) {
  const status = run('git', ['-C', dir, 'status', '--porcelain', '--ignored'], dir)
  if (!status.ok) {
    block(`no se pudo leer el estado de ${dir}, así que no hay cómo saber qué va a grabar el commit.`)
  }
  const lines = status.output.split('\n').filter(Boolean)
  if (!lines.some((line) => !line.startsWith('!!') && line[1] !== ' ')) {
    return { root: dir, temp: null, env: {} }
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-verify-'))
  const written = run('git', ['-C', dir, 'checkout-index', '-a', `--prefix=${temp}${path.sep}`], dir)
  if (!written.ok) {
    fs.rmSync(temp, { recursive: true, force: true })
    block(`no se pudo materializar el índice de ${dir} para correr los gates: ${written.output}`)
  }
  const linked = []
  for (const line of lines) {
    if (!line.startsWith('!! ')) continue
    const name = line.slice(3).trim().replace(/\/$/, '')
    // Lo que el gate puede fabricar no se le enlaza: lo construye adentro de la copia y se descarta con
    // ella. Enlazarlo hacía dos daños a la vez. Uno es del usuario: el gate corre sobre el índice, así
    // que le dejaba la salida de build con la versión **staged** mientras su fuente en disco tenía otra,
    // y nada lo decía —medido con un `dist/` que pasó de «lo-que-estoy-editando» a «staged» (caso 069)—.
    // El otro es del propio gate: construía sobre restos de la corrida anterior del usuario, así que su
    // veredicto dependía de un estado que nadie declaró.
    //
    // La lista envejece y eso pesa menos de lo que parece, porque sólo se aplica a rutas que git ya
    // marcó como ignoradas: un `dist/` ignorado es generado por definición. Errarle por defecto —que
    // falte un nombre— deja el comportamiento de antes; errarle por exceso hace que un gate reconstruya,
    // que es más lento y no incorrecto. Lo que **sí** se enlaza es lo que un gate no puede fabricar:
    // `node_modules`, un `.env`, las credenciales de una herramienta.
    if (RECREABLE.test(name)) continue
    const link = path.join(temp, name)
    if (fs.existsSync(link)) continue
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync(path.join(dir, name), link, 'junction')
    linked.push(name)
  }
  // Un índice materializado no trae `.git`, y un gate que llama a git —listar lo trackeado— falla ahí
  // por no encontrarlo: el guard frenaría un commit correcto por su propia mecánica. La copia se vuelve
  // un repositorio propio, con su índice cargado desde lo que se acaba de materializar, así que `git`
  // contesta sobre lo que el commit va a grabar.
  //
  // Antes esto se resolvía exportando `GIT_DIR` del repositorio de verdad, y ahí el gate que **escribe**
  // con git escribía en él: la suite de un proyecto levanta repositorios de prueba y les commitea, y
  // esos commits caían en la rama del usuario junto con un `core.worktree` apuntando a un temporal ya
  // borrado. Nada lo anunciaba (caso 045).
  //
  // Lo que se pierde a cambio, y son dos cosas. La copia no tiene historia, así que un gate que lea una
  // etiqueta o un `git log` no la encuentra: falla y se ve. Y un gate cuyo efecto ES una escritura de
  // git —taggear, commitear un lockfile regenerado— la hace sobre la copia, que se borra: ese efecto se
  // pierde en silencio. Se elige el silencio de acá sobre el de antes, que era escribir en la rama de
  // quien commitea; un proyecto con un gate así tiene que sacar esa escritura del gate.
  const started = run('git', ['init', '--quiet'], temp)
  // Lo enlazado es entorno y no entra al índice de la copia, y el `.gitignore` no alcanza para eso: un
  // patrón con barra final sólo cubre directorios, y un enlace no lo es para git. `add --all` lo agregaba
  // y un gate que recorre lo trackeado lo leía como archivo del commit (caso 095).
  if (started.ok) {
    fs.mkdirSync(path.join(temp, '.git', 'info'), { recursive: true })
    fs.appendFileSync(path.join(temp, '.git', 'info', 'exclude'),
      linked.map((name) => `/${name.replace(/[\\*?[\]]/g, '\\$&')}\n`).join(''))
    run('git', ['add', '--all'], temp)
  }
  // Un gate no sólo lee su entorno: escribe en él. Lo ignorado se enlaza al original —eso es a propósito
  // y está arriba—, así que lo que el gate escriba cae en el árbol de quien commitea. Un gestor que se
  // sincroniza antes de correr un script lo lleva al extremo: ve que el árbol enlazado no coincide con
  // el lockfile de la copia y reinstala, lo que **empieza borrando** el `node_modules` del proyecto.
  //
  // Lo que se apaga es esa comprobación previa, que es el motivo por el que quiere tocar nada.
  // `verify-deps-before-run` la gobierna y tiene tres valores: `install` reinstala solo —el que trae
  // pnpm 11 y el que hace el daño—, `error` se niega y frena el gate cuando el lockfile de la copia
  // difiere de lo instalado, que es justo lo que pasa al commitear un cambio de lockfile por partes, y
  // `false` corre el script sin mirar. La copia no tiene que sincronizar nada: tiene que medir el
  // código.
  //
  // Acá estuvo `CI: 'true'` y fue una regresión (caso 070). Resolvía el síntoma del 068 —pnpm dejaba de
  // preguntar antes de purgar— desarmando la confirmación en vez de quitarle el motivo, y esa
  // confirmación era lo único que protegía al `node_modules` del proyecto: sin ella la reinstalación
  // avanza y borra por el enlace. Además encendía `frozen-lockfile`, que el propio pnpm anuncia al
  // fallar, así que la variable armaba y desarmaba guardas distintas a la vez.
  //
  // La regla que queda: no se desarma la confirmación de una herramienta, se le quita el motivo de
  // preguntar. Una confirmación que estorba casi siempre está cuidando algo.
  return { root: temp, temp, env: { npm_config_verify_deps_before_run: 'false' } }
}

function verify(input) {
  if (process.env.OPS_SKIP_VERIFY === '1') return
  const command = commandOf(input)
  if (!isCommit(command)) return
  const { dir, staged } = stagedForCommit(command, cwdOf(input))
  const changedOpenApi = staged.some((file) => /^(?:openapi|api|spec)(?:\/.*)?\/[^/]+\.ya?ml$/i.test(file))
    || staged.some((file) => /^(?:openapi|swagger)\.ya?ml$/i.test(file))
  const changedSqlSource = staged.some((file) => /^(?:db\/queries|queries)\/.*\.sql$/i.test(file))
  const hasApiGenerated = staged.some((file) => /(?:^|\/)[^/]*(?:generated|\.gen)\.(?:go|ts|js|py)$/i.test(file))
  const hasSqlGenerated = staged.some((file) => /(?:^|\/)(?:sqlc|generated)(?:\/|.*\.(?:go|ts|js|py)$)/i.test(file))
  // Acá lo aprobado es el conjunto staged entero: decir «autorizo commitear exactamente estas rutas»
  // es lo que un gate en rojo necesita, y cambia en cuanto se stagea una más. La lista sale del índice
  // y no de una regla, que es lo que la vuelve una operación y no un permiso.
  const sinAprobar = AP.pending(opsRoot(input), staged, input)
  const aprobado = !sinAprobar.length
  if (changedOpenApi && !hasApiGenerated && !aprobado) {
    block('Cambió una fuente OpenAPI/Swagger sin incluir código regenerado. Ejecuta el generador y '
      + `stagea su salida.\n${AP.HOW('OPS_SKIP_VERIFY', sinAprobar, input)}`)
  }
  if (changedSqlSource && !hasSqlGenerated && !aprobado) {
    block('Cambió una consulta SQL fuente sin artefactos regenerados. Ejecuta el generador.\n'
      + AP.HOW('OPS_SKIP_VERIFY', sinAprobar, input))
  }
  if (!staged.some((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs|go|py|html|css|scss|prisma)$/.test(file))) return
  const { root, temp, env } = commitTree(dir)
  try {
    verifyGates(root, dir, sinAprobar, env, input)
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true })
  }
}

// Corre lo que el stack declare y bloquea si algo sale en rojo. `root` es dónde corre —el índice
// materializado o el árbol, que ahí son lo mismo— y `dir` es el repositorio, que es el nombre que le
// dice algo a quien lee el mensaje.
//
// Cada gate deja su rastro en `ops`; para qué sirve ese registro lo dice `core/evidence.js`. Lo que se
// decide acá es que el rojo se anota igual que el verde: un gate que falló y se commiteó con
// aprobación es exactamente lo que alguien va a querer ver después.
// Lo que se sabe de un gate que falló, en la forma en que se va a leer. El mensaje decía sólo
// `test (exit 1)` y tiraba la salida de la herramienta: cualquier causa —una suite en rojo, un gestor
// que se negó a arrancar el script, un binario que no está— llegaba con el mismo texto. Es la misma
// forma de fallar que el caso 066 encontró en una prueba, acá en el mensaje que lee una persona.
//
// Se muestra **una** línea y acotada: la salida de un gate puede traer cualquier cosa del entorno, y lo
// que hace falta para diagnosticar es la primera línea de error, no el volcado.
const ERROR_LINE = /error|err[_!]|fail|abort|not found|cannot|no such/i
// Cómo marca un reporte de pruebas cada resultado: `node --test` en spec y en TAP, y `go test`. Van sólo
// las comprobadas contra la herramienta (caso 094): el nombre de una prueba verde puede decir «error», y
// sin mirar la marca la búsqueda por palabra se quedaba con ella y el mensaje escondía la roja.
const FAILED_TEST = /^(?:✖|not ok\b|--- FAIL:)/
const PASSED_TEST = /^(?:✔|ok\b|--- PASS:)/
const MAX_LINE = 160
function fallo(gate, result) {
  // La línea que empieza con `>` es el eco del script que npm y pnpm imprimen antes de correrlo, así
  // que lleva el comando entero y no dice nada de qué falló. Descartarla es lo que hace que la primera
  // coincidencia sea el error y no el comando — con el eco adentro, un script que **menciona** una
  // palabra de error gana siempre.
  const lines = (result.output || '').split('\n').map((one) => one.trim())
    .filter((one) => one && !one.startsWith('>'))
  const line = lines.find((one) => FAILED_TEST.test(one))
    || lines.find((one) => !PASSED_TEST.test(one) && ERROR_LINE.test(one)) || lines[0] || ''
  return { gate, status: result.status, ms: result.ms, line: line.slice(0, MAX_LINE) }
}

// Un gate que vuelve en menos de esto no corrió una suite. No se afirma que **no** haya corrido —un
// lint puede fallar rápido y de verdad— y por eso lo que se agrega es el número, no un veredicto: los
// tres gates del caso 068 volvieron a un segundo uno de otro contra los trece de la corrida real.
const DEMASIADO_RAPIDO = 2000
function comoSeLee(failures) {
  const texto = failures
    .map((one) => `${one.gate} (exit ${one.status}, ${(one.ms / 1000).toFixed(1)} s)`
      + `${one.line ? `: ${one.line}` : ''}`)
    .join('; ')
  if (!failures.every((one) => one.ms < DEMASIADO_RAPIDO)) return texto
  const cuantos = failures.length === 1 ? 'Volvió' : `Los ${failures.length} volvieron`
  return `${texto}\n${cuantos} en menos de ${DEMASIADO_RAPIDO / 1000} s: eso no alcanza para correr `
    + 'una suite, así que mirá si llegaron a ejecutarse antes de aprobar esto como un rojo conocido.'
}

function verifyGates(root, dir, sinAprobar, env, input) {
  const ops = opsRoot(input)
  const failures = []
  if (fs.existsSync(path.join(root, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const usesPnpm = fs.existsSync(path.join(root, 'pnpm-lock.yaml'))
      && !fs.existsSync(path.join(root, 'package-lock.json'))
    const pm = usesPnpm ? 'pnpm' : 'npm'
    for (const script of ['test', 'lint', 'typecheck', 'build']) {
      if (!pkg.scripts || !pkg.scripts[script]) continue
      const result = run(pm, ['run', script], root, env)
      EV.record(ops, script, result.status, result.ms)
      if (!result.ok) failures.push(fallo(script, result))
    }
  } else if (fs.existsSync(path.join(root, 'go.mod'))) {
    const makefile = path.join(root, 'Makefile')
    if (fs.existsSync(makefile) && /^ci:/m.test(fs.readFileSync(makefile, 'utf8'))) {
      const result = run('make', ['ci'], root, env)
      EV.record(ops, 'make ci', result.status, result.ms)
      if (!result.ok) failures.push(fallo('make ci', result))
    } else {
      for (const args of [['test', './...'], ['build', './...']]) {
        const result = run('go', args, root, env)
        EV.record(ops, `go ${args[0]}`, result.status, result.ms)
        if (!result.ok) failures.push(fallo(`go ${args[0]}`, result))
      }
    }
  } else if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'))) {
    const makefile = path.join(root, 'Makefile')
    if (fs.existsSync(makefile) && /^test:/m.test(fs.readFileSync(makefile, 'utf8'))) {
      const result = run('make', ['test'], root, env)
      EV.record(ops, 'make test', result.status, result.ms)
      if (!result.ok) failures.push(fallo('make test', result))
    }
  }
  if (!failures.length || !sinAprobar.length) return
  // Se dice sobre qué corrió cuando no fue el árbol: un fallo que no se reproduce escribiendo el mismo
  // comando a mano se lee como que el guard miente, y lo que pasó es que midió lo que se va a grabar.
  const donde = root === dir ? '' : '\nCorrió sobre el índice, que es lo que el commit graba: si en tu '
    + 'directorio pasa, es que en disco tenés algo que no está staged.'
  block(`Verify falló en ${path.basename(dir)}: ${comoSeLee(failures)}\nNo se commitea en rojo.${donde}\n`
    + AP.HOW('OPS_SKIP_VERIFY', sinAprobar, input))
}

module.exports = { destructive, gitAdd, dependencies, governance, verify, shellBoundary, run }
