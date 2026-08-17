#!/usr/bin/env node
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

function readInput() {
  let raw = ''
  try { raw = fs.readFileSync(0, 'utf8') } catch { /* no stdin */ }
  try { return raw.trim() ? JSON.parse(raw) : {} } catch { return {} }
}

function commandOf(input) {
  const value = input.tool_input && (input.tool_input.command || input.tool_input.cmd)
    || input.command || input.input && input.input.command || process.env.OPS_HOOK_COMMAND || ''
  return Array.isArray(value) ? value.join(' ') : String(value)
}

function fileOf(input) {
  return String(input.tool_input && (input.tool_input.file_path || input.tool_input.path)
    || input.file_path || input.path || process.env.OPS_HOOK_FILE || '')
}

function filesOf(input) {
  const files = new Set()
  const direct = fileOf(input)
  if (direct) files.add(direct)
  const patch = String(input.tool_input && (input.tool_input.patch || input.tool_input.input)
    || input.patch || '')
  for (const match of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/gm)) files.add(match[1].trim())
  return [...files]
}

function contentOf(input) {
  return String(input.tool_input && (
    input.tool_input.content
    || input.tool_input.new_string
    || input.tool_input.patch
    || input.tool_input.input
  )
    || input.content || input.patch || '')
}

function cwdOf(input) {
  const cwd = input.cwd || input.tool_input && input.tool_input.cwd
    || process.env.OPS_ROOT || process.cwd()
  return path.resolve(String(cwd))
}

function block(message) {
  const error = new Error(message)
  error.blocked = true
  throw error
}

function gitDirectory(command, cwd) {
  const flag = command.match(/(?:^|\s)git\s+-C\s+(['"]?)([^\s'";&|]+)\1/)
  const cd = command.match(/(?:^|[;&|]\s*)cd\s+(['"]?)([^\s'";&|]+)\1/)
  return path.resolve(cwd, flag ? flag[2] : cd ? cd[2] : '.')
}

function isCommit(command) {
  return /(?:^|[;&|]\s*)git(?:\s+-C\s+\S+)?\s+commit(?:\s|$)/.test(command)
}

function stagedFiles(dir) {
  const result = spawnSync('git', ['-C', dir, 'diff', '--cached', '--name-only'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim().split('\n').filter(Boolean) : []
}

function destructive(input) {
  const command = commandOf(input)
  const rules = [
    [/\bgit\s+push\b/, "'git push' publica cambios y requiere una acción humana."],
    [/\bgit\s+reset\s+--hard\b/, "'git reset --hard' destruye cambios locales."],
    [/\bgit\s+clean\s+-[^\s]*f/, "'git clean -f' borra archivos sin seguimiento."],
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

function secrets(input) {
  for (const file of filesOf(input)) {
    const base = path.basename(file)
    if (/^(?:\.env|\.env\..+)$/.test(base) && !/\.(?:example|sample|template|schema|dist|tpl)$/.test(base)) {
      block(`${file} parece contener secretos. Edita una plantilla o registra una acción humana.`)
    }
    if (/^(?:accesos\.md|credenciales.*|credentials.*\.json|.*service-account.*\.json|.*\.(?:pem|key))$/i.test(base)) {
      block(`${file} parece un archivo de credenciales en texto plano.`)
    }
    // Nombres de credencial que la herramienta escribe sola y que la lista anterior no cubría:
    // `.npmrc` guarda el token de publicación, `.netrc` el de cualquier host, `id_*` una clave
    // privada de SSH y `~/.aws/credentials` las de AWS. Los cuatro son estándar, no exóticos.
    //
    // Esto tapa un caso conocido; no vuelve completo al guard. La forma de decidir sigue siendo el
    // nombre del archivo, así que otro formato pasa igual — ver «Qué son y qué no son» en el README.
    if (/^(?:\.npmrc|\.netrc|_netrc|\.pypirc|\.dockercfg|id_(?:rsa|dsa|ecdsa|ed25519)|credentials)$/i.test(base)) {
      block(`${file} es un archivo de credenciales que su herramienta mantiene. No lo edites a mano.`)
    }
  }
}

function integrationSnapshot(input) {
  for (const raw of filesOf(input)) {
    const file = raw.replace(/\\/g, '/')
    if (/(?:^|\/)integrations\/[^/]+\/staging\/(?:.+\/remote\.json|sync-state\.json)$/.test(file)) {
      block(`${file} pertenece al sincronizador. Cura draft.md; no edites snapshots a mano.`)
    }
  }
}

function generated(input) {
  for (const raw of filesOf(input)) {
    const file = raw.replace(/\\/g, '/')
    const base = path.basename(file)
    if (/(?:^|[._-])generated\.[^.]+$/i.test(base) || /(?:^|[._-])gen\.(?:go|ts|js|py)$/i.test(base)) {
      block(`${file} parece código generado. Modifica su fuente y ejecuta el generador; no lo edites a mano.`)
    }
  }
}

function workspaceBoundary(input) {
  const root = findOpsRoot(process.env.OPS_ROOT || process.env.CLAUDE_PROJECT_DIR || cwdOf(input))
  if (!root) return
  let config
  try { config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8')) } catch { return }
  const allowed = [root, ...(config.workspaceRoots || []).map((entry) => path.resolve(root, entry.path))]
  for (const raw of filesOf(input)) {
    const file = path.resolve(cwdOf(input), raw)
    if (!allowed.some((base) => file === base || file.startsWith(`${base}${path.sep}`))) {
      block(`${file} está fuera de las raíces declaradas en ops.config.json.`)
    }
  }
}

function migrations(input) {
  if (process.env.OPS_MIGRATIONS_OVERRIDE === '1') return
  const destructiveSql = new RegExp(
    String.raw`\b(?:drop\s+(?:table|database|schema)|truncate\s+(?:table\s+)?` +
      String.raw`|delete\s+from\s+\S+\s*(?:;|$))\b`,
    'i',
  )
  if (destructiveSql.test(contentOf(input))) {
    block('La migración contiene SQL destructivo. Requiere revisión y OPS_MIGRATIONS_OVERRIDE=1.')
  }
  for (const raw of filesOf(input)) {
    const normalized = raw.replace(/\\/g, '/')
    if (!/(?:^|\/)(?:migrations?|migrate)\/.*\.sql$/i.test(normalized)) continue
    const file = path.resolve(cwdOf(input), raw)
    if (fs.existsSync(file)) {
      block(`${raw} es una migración existente. Crea una nueva en vez de reescribir historial.`)
    }
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
  // El contrato de un cargo y lo que lo mide son gobernanza, igual que un ADR o una regla.
  //
  // Lo puntual es la firma: `agent-promote` se niega si «Aprobación humana» no está firmada, pero lo
  // único que impedía que la escribiera un agente era una frase en un prompt. Una instrucción, no un
  // candado — y el archivo no estaba protegido por nada.
  //
  // Alrededor de la firma van las otras tres piezas del mismo acto. `SKILL.md` y `references/` son lo
  // que la propuesta cambia: sin ellos, editar el contrato directo saltea el ciclo entero. Y
  // `evaluations/` es el denominador con que se juzga —el propio recorrido de propuesta dice que
  // cambiarlo «es parte de lo que se aprueba»—, así que moverlo en silencio ablanda toda medición
  // pasada sin tocar una sola regla.
  //
  // Quedan afuera las dos clases de evidencia, y por la misma razón: registran lo que pasó un día en
  // vez de decidir algo. `learning/reports/` es lo investigado esa semana, y `evaluations/results/` la
  // transcripción de una corrida —que se escribe en cada evaluación, así que gobernarla pediría un
  // override por corrida—. Por eso `evaluations/` se nombra por partes en vez de entero.
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

function findOpsRoot(start) {
  let current = path.resolve(start)
  while (true) {
    if (fs.existsSync(path.join(current, 'ops.config.json'))
      && fs.existsSync(path.join(current, 'planning'))) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) return ''
    current = parent
  }
}

function planningDrift(input) {
  const root = findOpsRoot(process.env.OPS_ROOT || process.env.CLAUDE_PROJECT_DIR || cwdOf(input))
  if (!root) return
  const local = path.join(root, 'tools', 'ops.js')
  const source = path.join(root, 'engine', 'cli', 'ops.js')
  const cli = fs.existsSync(local) ? local : source
  if (!fs.existsSync(cli)) return
  const result = run(process.execPath, [cli, 'check', path.join(root, 'planning')], root)
  const session = String(input.session_id || input.sessionId || 'nosession').replace(/[^a-zA-Z0-9_-]/g, '_')
  const marker = path.join(os.tmpdir(), `cauce-drift-${session}`)
  if (result.ok) {
    try { fs.unlinkSync(marker) } catch { /* already clean */ }
    return
  }
  if (fs.existsSync(marker)) return
  fs.writeFileSync(marker, '')
  block(`Planning o integraciones quedaron desalineados:\n${result.output}`)
}

// El motor llega por npm y se actualiza por npm. `workspace-boundary` no lo cubre: en una instalación
// `node_modules/` cae dentro de la raíz declarada, así que editar el motor le parece legítimo.
//
// Editarlo desde la empresa rompe dos veces. El próximo `npm install` borra el cambio sin avisar, así
// que el arreglo se pierde justo cuando alguien creyó haberlo hecho; y hasta entonces la empresa corre
// un motor que no coincide con la versión que declara, que es la clase de diferencia que aparece como
// un bug irreproducible. Un problema del motor se reporta y se arregla arriba, no acá.
//
// El toolkit se exceptúa, y esa distinción ya estaba escrita: en su `ops.config.json` el modo es
// `toolkit`. Ahí el motor es el producto y editarlo es exactamente el trabajo.
function engineWrites(input) {
  const root = findOpsRoot(process.env.OPS_ROOT || process.env.CLAUDE_PROJECT_DIR || cwdOf(input))
  if (!root) return
  let config
  try { config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8')) } catch { return }
  if (config.mode === 'toolkit') return
  const pkg = path.join(root, 'node_modules', '@ingeniomaps', 'cauce')
  for (const raw of filesOf(input)) {
    const file = path.resolve(cwdOf(input), raw)
    if (file !== pkg && !file.startsWith(`${pkg}${path.sep}`)) continue
    block(`${raw} pertenece al motor de Cauce, que llega por npm.\n` +
      'Un cambio acá lo borra el próximo install y mientras tanto corrés un motor que no coincide ' +
      'con la versión que declarás. Para traer una versión nueva son dos pasos —el motor y después ' +
      'las rutas del sistema de tu instancia—:\n' +
      '  npm install --save-dev --save-exact @ingeniomaps/cauce@latest\n' +
      '  node tools/ops.js upgrade\n' +
      'Y reportá el problema arriba. Lo que sí es tuyo son tus cargos, equipos e integraciones.')
  }
}

const guards = {
  destructive, 'git-add': gitAdd, secrets, generated, 'workspace-boundary': workspaceBoundary,
  migrations, dependencies, governance, verify, 'planning-drift': planningDrift,
  'integration-snapshot': integrationSnapshot, engine: engineWrites,
}

// Grupos por evento: un runner corre el grupo entero en un solo proceso en lugar de un guard por hook.
const hookGroups = {
  'pre-shell': ['destructive', 'git-add', 'dependencies', 'governance', 'verify'],
  'pre-files': ['secrets', 'generated', 'workspace-boundary', 'engine', 'migrations',
    'integration-snapshot'],
  stop: ['planning-drift'],
}

const hookMetadata = [
  {
    name: 'destructive',
    event: 'PreToolUse · shell',
    purpose: 'Bloquea publicación y comandos con pérdida de datos.',
  },
  { name: 'git-add', event: 'PreToolUse · shell', purpose: 'Exige stagear rutas explícitas.' },
  {
    name: 'dependencies',
    event: 'PreToolUse · shell',
    purpose: 'Protege manifests, lockfiles y publicación de paquetes.',
  },
  {
    name: 'governance',
    event: 'PreToolUse · shell',
    purpose: 'Impide commitear cambios de gobernanza sin aprobación.',
  },
  { name: 'verify', event: 'PreToolUse · shell', purpose: 'Ejecuta los gates reales antes de cada commit.' },
  { name: 'secrets', event: 'PreToolUse · files', purpose: 'Bloquea escritura de secretos y credenciales.' },
  { name: 'generated', event: 'PreToolUse · files', purpose: 'Impide editar código generado manualmente.' },
  { name: 'workspace-boundary', event: 'PreToolUse · files', purpose: 'Limita escrituras a las raíces declaradas.' },
  {
    name: 'engine',
    event: 'PreToolUse · files',
    purpose: 'Impide editar el motor instalado: se actualiza con npm.',
  },
  { name: 'migrations', event: 'PreToolUse · files', purpose: 'Protege migraciones existentes y SQL destructivo.' },
  {
    name: 'integration-snapshot',
    event: 'PreToolUse · files',
    purpose: 'Protege snapshots administrados por integraciones.',
  },
  {
    name: 'planning-drift',
    event: 'Stop / SessionEnd',
    purpose: 'Evita cerrar con planning o integraciones desalineados.',
  },
]

function execute(name, input) {
  const guard = guards[name]
  if (!guard) throw new Error(`Hook desconocido: ${name}`)
  guard(input)
}

// Expande grupos a guards y conserva el orden declarado; el primero que bloquea corta la ejecución.
function resolve(names) {
  const resolved = names.flatMap((name) => hookGroups[name] || [name])
  if (!resolved.length) throw new Error('Se requiere el nombre de un guard o de un grupo.')
  return resolved
}

function executeAll(names, input) {
  for (const name of resolve(names)) execute(name, input)
}

if (require.main === module) {
  try { executeAll(process.argv.slice(2), readInput()) } catch (error) {
    console.error(`BLOQUEADO: ${error.message}`)
    process.exit(error.blocked ? 2 : 1)
  }
}

module.exports = {
  execute, executeAll, findOpsRoot, guards, hookGroups, hookMetadata,
}
