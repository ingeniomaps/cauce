'use strict'

// Los guards que juzgan un comando antes de que se ejecute: qué destruye, qué publica, qué toca una
// dependencia y qué gate hay que haber corrido. Todos leen `commandOf` y miran el índice de git —de
// ahí que vayan juntos—, y son el grupo `pre-shell` que el registro ya declaraba.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  commandOf, cwdOf, block, gitDirectory, isCommit, stagedFiles, pushAllowed,
  writableRoots, outsideRoots, DECLARE_IT,
} = require('./input')

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
  const command = isCommit(raw) ? unquoted(raw) : raw
  if (/\bgit\s+push\b/.test(command) && !pushAllowed(input)) {
    block("'git push' publica cambios y requiere una acción humana. Se habilita con runner.allowPush.")
  }
  const rules = [
    [/\bgit\s+reset\s+--hard\b/, "'git reset --hard' destruye cambios locales."],
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
      /\bgit\s+(?:checkout|restore)\s+(?:[^;&|]*?\s)?(?:--\s*(?:$|[;&|])|(?:--\s+)?(?:\.|\*|:\/)\s*(?:$|[;&|]))/,
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
      /(?:^|\s)(?:mkfs\S*|shred)\s|\bdd\s+[^;&|]*\bof=\/dev\/|>\s*\/dev\/(?:sd|nvme|disk)/,
      'Operación destructiva sobre disco o dispositivo.',
    ],
    [
      /\brm\s+(?:-[^\s]*r[^\s]*\s+)+(?:\/\*?|~\/?|\$HOME|\.\.)(?:\s|$)/,
      "'rm -r' sobre /, home o el directorio padre es catastrófico.",
    ],
  ]
  for (const [pattern, message] of rules) if (pattern.test(command)) block(message)
}

function gitAdd(input) {
  const command = commandOf(input)
  if (/\bgit\s+add\s+(?:[^;&|]*\s)?(?:-A\b|--all\b|\.)(?:\s|$|[;&|])/.test(command)) {
    block("'git add -A/--all/.' está prohibido. Stagea rutas explícitas.")
  }
}

function dependencies(input) {
  if (process.env.OPS_DEPENDENCIES_OVERRIDE === '1') return
  const command = commandOf(input)
  const unsafePackageCommand = /\b(?:npm|pnpm|yarn|bun)\s+publish\b/.test(command)
    || /\b(?:npm|pnpm|yarn)\s+(?:install|add)\b[^;&|]*(?:\s-g\b|\s--global\b)/.test(command)
  if (unsafePackageCommand) {
    block('Publicar paquetes o instalar dependencias globales requiere una acción humana explícita.')
  }
  if (!isCommit(command)) return
  const dir = gitDirectory(command, cwdOf(input))
  const staged = stagedFiles(dir)
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
  for (const [parent, state] of byDir) {
    const existingLocks = [...locks].filter((name) => fs.existsSync(path.join(dir, parent, name)))
    if (existingLocks.length > 1) {
      block(`${parent}: hay varios lockfiles (${existingLocks.join(', ')}). Conserva uno solo.`)
    }
    if (state.manifests.length && existingLocks.length && !state.locks.length) {
      block(`${parent}: cambió ${state.manifests.join(', ')} sin actualizar su lockfile.`)
    }
    if (state.locks.length && !state.manifests.length) {
      block(`${parent}: cambió ${state.locks.join(', ')} sin un cambio explícito en el manifest.`)
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
const REDIRECT = /(?:^|[\s(])&?\d*>>?\s*(?![&(])([^\s;|&<>()]+)/g
const WRITERS = /(?:^|[\s;|&(])(tee|cp|mv|install|rsync)\s+([^;|&<>()]+)/g

// Vacía lo que va entre comillas, dejando una marca que ningún patrón confunde con una ruta ni con un
// comando. Lo usan dos guards por razones distintas, y cada uno explica la suya donde lo llama.
const unquoted = (command) => String(command).replace(/'[^']*'|"[^"]*"/g, '\u0000')

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
  for (const match of clean.matchAll(WRITERS)) {
    const args = match[2].trim().split(/\s+/).filter((one) => one && !one.startsWith('-'))
    if (match[1] === 'tee') for (const arg of args) found.add(arg)
    else if (args.length > 1) found.add(args[args.length - 1])
  }
  return [...found]
    .map((one) => one.replace(/^~(?=$|\/)/, os.homedir()).replace(/^\$\{?HOME\}?(?=$|\/)/, os.homedir()))
    .filter((one) => !/[$`\u0000]/.test(one))
}

// Los destinos que no son de nadie y aparecen en cualquier comando legítimo: los descriptores del
// sistema y el temporal, que es donde el propio runner deja lo que no va al repositorio. Sin esta lista
// el guard frena `> /dev/null 2>&1`, y lo primero que hace quien lo sufre es apagarlo entero.
const NEUTRAL = [/^\/dev\/(?:null|stdout|stderr|tty|fd\/)/, new RegExp(`^${os.tmpdir()}(?:/|$)`)]

function shellBoundary(input) {
  const allowed = writableRoots(input)
  if (!allowed) return
  for (const raw of writeTargets(commandOf(input))) {
    const file = path.resolve(cwdOf(input), raw)
    if (NEUTRAL.some((pattern) => pattern.test(file))) continue
    if (outsideRoots(file, allowed)) {
      block(`el comando escribe en ${file}, fuera de las raíces declaradas en ops.config.json. ${DECLARE_IT}`)
    }
  }
}

function governance(input) {
  if (process.env.OPS_GOVERNANCE_OVERRIDE === '1') return
  const command = commandOf(input)
  if (!isCommit(command)) return
  const dir = gitDirectory(command, cwdOf(input))
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
  const governed = stagedFiles(dir).filter((file) => governedPattern.test(file))
  if (governed.length) {
    const files = governed.map((file) => `  - ${file}`).join('\n')
    block(`El commit toca gobernanza protegida:\n${files}\n` +
      'Usa OPS_GOVERNANCE_OVERRIDE=1 solo con aprobación.')
  }
}

function run(program, args, cwd) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', stdio: 'pipe', env })
  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  }
}

function verify(input) {
  if (process.env.OPS_SKIP_VERIFY === '1') return
  const command = commandOf(input)
  if (!isCommit(command)) return
  const dir = gitDirectory(command, cwdOf(input))
  const staged = stagedFiles(dir)
  const changedOpenApi = staged.some((file) => /^(?:openapi|api|spec)(?:\/.*)?\/[^/]+\.ya?ml$/i.test(file))
    || staged.some((file) => /^(?:openapi|swagger)\.ya?ml$/i.test(file))
  const changedSqlSource = staged.some((file) => /^(?:db\/queries|queries)\/.*\.sql$/i.test(file))
  const hasApiGenerated = staged.some((file) => /(?:^|\/)[^/]*(?:generated|\.gen)\.(?:go|ts|js|py)$/i.test(file))
  const hasSqlGenerated = staged.some((file) => /(?:^|\/)(?:sqlc|generated)(?:\/|.*\.(?:go|ts|js|py)$)/i.test(file))
  if (changedOpenApi && !hasApiGenerated) {
    block('Cambió una fuente OpenAPI/Swagger sin incluir código regenerado. Ejecuta el generador y stagea su salida.')
  }
  if (changedSqlSource && !hasSqlGenerated) {
    block('Cambió una consulta SQL fuente sin artefactos regenerados. Ejecuta el generador.')
  }
  if (!staged.some((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs|go|py|html|css|scss|prisma)$/.test(file))) return
  const failures = []
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const usesPnpm = fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))
      && !fs.existsSync(path.join(dir, 'package-lock.json'))
    const pm = usesPnpm ? 'pnpm' : 'npm'
    for (const script of ['test', 'lint', 'typecheck', 'build']) {
      if (!pkg.scripts || !pkg.scripts[script]) continue
      const result = run(pm, ['run', script], dir)
      if (!result.ok) failures.push(`${script} (exit ${result.status})`)
    }
  } else if (fs.existsSync(path.join(dir, 'go.mod'))) {
    const makefile = path.join(dir, 'Makefile')
    if (fs.existsSync(makefile) && /^ci:/m.test(fs.readFileSync(makefile, 'utf8'))) {
      const result = run('make', ['ci'], dir)
      if (!result.ok) failures.push(`make ci (exit ${result.status})`)
    } else {
      for (const args of [['test', './...'], ['build', './...']]) {
        const result = run('go', args, dir)
        if (!result.ok) failures.push(`go ${args[0]} (exit ${result.status})`)
      }
    }
  } else if (fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'requirements.txt'))) {
    const makefile = path.join(dir, 'Makefile')
    if (fs.existsSync(makefile) && /^test:/m.test(fs.readFileSync(makefile, 'utf8'))) {
      const result = run('make', ['test'], dir)
      if (!result.ok) failures.push(`make test (exit ${result.status})`)
    }
  }
  if (failures.length) block(`Verify falló en ${path.basename(dir)}: ${failures.join(', ')}. No se commitea en rojo.`)
}

module.exports = { destructive, gitAdd, dependencies, governance, verify, shellBoundary, run }
