'use strict'

// Los guards que juzgan un comando antes de que se ejecute: qué destruye, qué publica, qué toca una
// dependencia y qué gate hay que haber corrido. Todos leen `commandOf` y miran el índice de git —de
// ahí que vayan juntos—, y son el grupo `pre-shell` que el registro ya declaraba.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  commandOf, cwdOf, block, gitDirectory, isCommit, stagedFiles, pushAllowed,
} = require('./input')

function destructive(input) {
  const command = commandOf(input)
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
      // `git restore .` no lleva `--` y destruye igual: es la forma moderna del mismo comando.
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

module.exports = { destructive, gitAdd, dependencies, governance, verify, run }
