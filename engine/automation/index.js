'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const F = require('../core/files')
const H = require('../hooks/run')
const P = require('../planning/parser')
const catalog = require('../agents/catalog')
const O = require('../core/ownership')

const RUNNER_NAMES = ['claude', 'codex', 'gemini', 'antigravity']

// Adaptadores y workflows viven en el paquete, no en la instancia: son definiciones que el motor
// consume y que ninguna empresa edita —`RUNNER_NAMES` es cerrado, así que ni siquiera puede agregar
// uno propio—. Los hooks sí se quedan en el proyecto: la configuración del runner los nombra por
// ruta literal y no sabe resolver en cascada.
// Se busca por `runners/` y no por `automatization/`: toda instancia tiene el segundo —ahí viven sus
// hooks— y encontrarlo daría por buena una dependencia sin instalar.
function packagedAutomation(root) {
  const runners = O.packagePath(root, path.join('automatization', 'runners'))
  return runners ? path.dirname(runners) : ''
}

function runnerManifest(root, name) {
  if (!RUNNER_NAMES.includes(name)) {
    throw new Error(`runner debe ser ${RUNNER_NAMES.join(', ')}`)
  }
  const packaged = packagedAutomation(root)
  if (!packaged) {
    throw new Error('no encuentro automatization/: instalá la dependencia o restaurá .ops/')
  }
  const file = path.join(packaged, 'runners', name, 'manifest.json')
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) {
    throw new Error(`${name}: manifest inválido (${error.message})`)
  }
}

function mergeConfig(current, incoming) {
  if (Array.isArray(incoming)) {
    const values = [...(Array.isArray(current) ? current : []), ...incoming]
    const seen = new Set()
    return values.filter((value) => {
      const key = JSON.stringify(value)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  if (incoming && typeof incoming === 'object') {
    const object = current && typeof current === 'object' && !Array.isArray(current)
    const result = object ? { ...current } : {}
    for (const [key, value] of Object.entries(incoming)) {
      result[key] = mergeConfig(result[key], value)
    }
    return result
  }
  return incoming
}

function includesConfig(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item) => {
      return actual.some((value) => JSON.stringify(value) === JSON.stringify(item))
    })
  }
  if (expected && typeof expected === 'object') {
    return actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => {
      return includesConfig(actual[key], value)
    })
  }
  return actual === expected
}

// Dónde abre el dev su herramienta, que no siempre es la raíz ops. En modo sidecar el repo ops es
// un hermano de los repos de producto: `aparatejo-ops/` coordina, `aparatejo/` es lo que se abre.
// Instalar dentro del sidecar dejaría al runner sin ver una sola línea de código.
function installRoot(root) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
    if (config.mode === 'sidecar') return path.resolve(root, '..')
  } catch { /* sin configuración legible, instalar donde está */ }
  return root
}

// Cómo se nombra la raíz ops desde ahí: `aparatejo-ops/` en sidecar, vacío cuando coinciden.
function opsPrefix(root) {
  const relative = path.relative(installRoot(root), root)
  return relative ? `${relative.split(path.sep).join('/')}/` : ''
}

function runnerPaths(root, name, runner) {
  const automationRoot = packagedAutomation(root)
  const sourceDir = path.join(automationRoot, 'runners', name)
  const install = installRoot(root)
  const configSource = F.assertWithin(
    sourceDir,
    path.resolve(sourceDir, runner.config.source),
    `${name}: config.source`,
  )
  const configTarget = F.assertWithin(
    install,
    path.resolve(install, runner.config.target),
    `${name}: config.target`,
  )
  return { automationRoot, sourceDir, configSource, configTarget, install }
}

function resolveItem(paths, root, name, item) {
  return {
    source: F.assertWithin(
      paths.automationRoot,
      path.resolve(paths.sourceDir, item.source),
      `${name}: source`,
    ),
    target: F.assertWithin(
      paths.install,
      path.resolve(paths.install, item.target),
      `${name}: target`,
    ),
  }
}

// La configuración del runner nombra cada guard por ruta relativa a donde se abre la herramienta.
// Si eso ya no es la raíz ops, hay que reescribir el prefijo o el runner buscaría los guards en la
// carpeta equivocada. Se hace en un solo lugar: `install` lo escribe y `doctor` compara contra esto.
function runnerConfig(paths, root) {
  const raw = fs.readFileSync(paths.configSource, 'utf8')
  const prefix = opsPrefix(root)
  return JSON.parse(prefix ? raw.split('automatization/hooks/').join(`${prefix}automatization/hooks/`) : raw)
}

// Cargos del catálogo, con el frontmatter que el runner indexa para elegir a quién invocar.
function roleCatalog(root) {
  return catalog.list(root)
    .map((role) => {
      const field = P.frontmatter(fs.readFileSync(path.join(role.dir, 'SKILL.md'), 'utf8'))
      const reference = path.relative(installRoot(root), role.dir).split(path.sep).join('/')
      return { ...role, reference, description: field('description') }
    })
    .filter((role) => role.description)
}

// Puntero fino: conserva nombre y descripción —lo único que el runner lee hasta invocar— y remite
// al contrato completo. Evita duplicar el catálogo entero dentro de la configuración del runner.
function roleSkill(role) {
  return `---
name: ${role.slug}
description: ${role.description}
---

# ${role.slug}

Leé \`${role.reference}/SKILL.md\` para el contrato completo del cargo: cuándo actuar,
qué decide, qué no le corresponde y cuál es su entrega mínima. Sus métodos y formatos de salida están
en \`${role.reference}/references/\`.

Respetá los límites de ese contrato y las reglas de \`AGENTS.md\`. Generado por
\`cauce automation install\`: no lo edites acá.
`
}

function installRoleSkills(root, runner, output) {
  if (!runner.capabilities.nativeSkills || !runner.roleSkills) return 0
  const install = installRoot(root)
  const base = F.assertWithin(install, path.resolve(install, runner.roleSkills), `${runner.name}: roleSkills`)
  const roles = roleCatalog(root)
  for (const role of roles) {
    const file = path.join(base, role.slug, 'SKILL.md')
    F.assertNoSymlinkPath(install, file)
    F.atomicWrite(file, roleSkill(role))
  }
  if (roles.length) output.log(`✓ ${runner.name}: ${roles.length} cargo(s) disponibles en ${runner.roleSkills}`)
  return roles.length
}

function hasHooks(config) {
  if (config.hooks && Object.keys(config.hooks).length) return true
  const events = [
    'PreToolUse',
    'PostToolUse',
    'PreInvocation',
    'PostInvocation',
    'Stop',
    'SessionEnd',
  ]
  return Object.values(config).some((entry) => {
    return entry && typeof entry === 'object' && events.some((event) => event in entry)
  })
}

function check(root) {
  const errors = []
  const hookDir = path.join(root, 'automatization', 'hooks')
  if (!fs.existsSync(path.join(root, 'automatization', 'AGENTS.md'))) {
    errors.push('falta automatization/AGENTS.md')
  }
  const hooks = [
    'run-hook.sh',
    'guard-shell.sh',
    'guard-files.sh',
    'guard-destructive.sh',
    'guard-git-add.sh',
    'guard-secrets.sh',
    'guard-generated.sh',
    'guard-workspace-boundary.sh',
    'guard-migrations.sh',
    'guard-dependencies.sh',
    'guard-governance.sh',
    'guard-verify.sh',
    'guard-planning-drift.sh',
    'guard-integration-snapshot.sh',
  ]
  for (const name of hooks) {
    const file = path.join(hookDir, name)
    if (!fs.existsSync(file)) errors.push(`falta automatization/hooks/${name}`)
    else if (!(fs.statSync(file).mode & 0o111)) {
      errors.push(`automatization/hooks/${name} no es ejecutable`)
    }
  }
  // El motor puede venir de la dependencia npm, de la copia local o del propio repositorio.
  if (!O.engineAt(root, path.join('hooks', 'run.js'))) {
    errors.push('falta engine/hooks/run.js: instalá la dependencia o restaurá .ops/engine')
  }
  const workflows = ['autobuild.js', 'team.js', path.join('integrations', 'sync.js')]
  workflows.push(path.join('integrations', 'promote.js'))
  const packaged = packagedAutomation(root)
  for (const name of workflows) {
    if (!packaged || !fs.existsSync(path.join(packaged, 'workflows', name))) {
      errors.push(`falta automatization/workflows/${name}: instalá la dependencia o restaurá .ops/`)
    }
  }
  for (const name of RUNNER_NAMES) validateRunner(root, name, errors)
  return errors
}

function validateRunner(root, name, errors) {
  try {
    const runner = runnerManifest(root, name)
    if (runner.name !== name || runner.schemaVersion !== 1
      || !runner.config || !runner.capabilities) {
      errors.push(`${name}: manifest incompleto`)
      return
    }
    const paths = runnerPaths(root, name, runner)
    const config = runnerConfig(paths, root)
    if (runner.capabilities.nativeHooks && !hasHooks(config)) {
      errors.push(`${name}: declara hooks nativos pero no los configura`)
    }
    for (const item of [...(runner.instructions || []), ...(runner.artifacts || [])]) {
      const resolved = resolveItem(paths, root, name, item)
      if (!fs.existsSync(resolved.source)) errors.push(`${name}: falta ${item.source}`)
    }
  } catch (error) {
    errors.push(`${name}: configuración inválida (${error.message})`)
  }
}

// Guards que hoy viven dentro de un grupo, con el wrapper que los reemplaza.
function supersededGuards() {
  const entries = []
  for (const [group, names] of Object.entries(H.hookGroups)) {
    if (names.length < 2) continue
    const wrapper = `guard-${group.replace('pre-', '')}.sh`
    for (const name of names) entries.push({ file: `guard-${name}.sh`, wrapper })
  }
  return entries
}

// Reemplaza las entradas sueltas que este mismo toolkit escribió por el grupo que ya las cubre.
// Sin esto, una instalación previa ejecuta cada guard dos veces por herramienta: con `verify` eso
// significa correr la suite de tests del proyecto dos veces en cada commit.
function pruneSupersededHooks(config) {
  const registered = JSON.stringify(config)
  const targets = supersededGuards().filter((entry) => registered.includes(entry.wrapper))
  const replaced = new Map()
  if (!targets.length) return { config, replaced: [] }

  const isEmptyEntry = (item) => item && typeof item === 'object'
    && Array.isArray(item.hooks) && !item.hooks.length
  const walk = (node) => {
    if (Array.isArray(node)) {
      const kept = []
      for (const item of node) {
        const command = item && typeof item === 'object' ? String(item.command || '') : ''
        const hit = targets.find((entry) => command.endsWith(entry.file))
        if (hit) {
          replaced.set(hit.wrapper, [...(replaced.get(hit.wrapper) || []), hit.file])
          continue
        }
        const walked = walk(item)
        if (!isEmptyEntry(walked)) kept.push(walked)
      }
      return kept
    }
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, walk(value)]))
    }
    return node
  }

  const pruned = walk(config)
  return { config: pruned, replaced: [...replaced].map(([wrapper, files]) => ({ wrapper, files })) }
}

// Wiring heredado: guards que ahora corren agrupados pero siguen registrados uno por uno.
// Conviven sin romper nada, a costa de ejecutar el guard dos veces por herramienta.
function legacyGuardWiring(config) {
  const text = JSON.stringify(config)
  const superseded = []
  for (const [group, names] of Object.entries(H.hookGroups)) {
    if (names.length < 2 || !text.includes(`guard-${group.replace('pre-', '')}.sh`)) continue
    superseded.push(...names.filter((guard) => text.includes(`guard-${guard}.sh`)))
  }
  return superseded
}

function doctor(root, name, output = console) {
  const runner = runnerManifest(root, name)
  const paths = runnerPaths(root, name, runner)
  const errors = []
  const warnings = []
  try {
    const expected = runnerConfig(paths, root)
    const actual = JSON.parse(fs.readFileSync(paths.configTarget, 'utf8'))
    if (!includesConfig(actual, expected)) {
      errors.push(`${runner.config.target}: configuración instalada incompleta o divergente`)
    }
    const legacy = legacyGuardWiring(actual)
    if (legacy.length) {
      warnings.push(`${runner.config.target}: ${legacy.join(', ')} siguen registrados sueltos junto al grupo; `
        + 'cada uno se ejecuta dos veces. Borrá esas entradas del archivo para quedarte sólo con el grupo')
    }
  } catch (error) {
    errors.push(`${runner.config.target}: ${error.message}`)
  }
  for (const item of runner.instructions || []) {
    const resolved = resolveItem(paths, root, name, item)
    if (!fs.existsSync(resolved.target)) errors.push(`falta ${item.target}`)
    else if (!fs.readFileSync(resolved.target, 'utf8').includes('AGENTS.md')) {
      warnings.push(`${item.target}: no referencia AGENTS.md; verifica las reglas globales`)
    }
  }
  for (const item of runner.artifacts || []) {
    const resolved = resolveItem(paths, root, name, item)
    if (!fs.existsSync(resolved.target)) errors.push(`falta ${item.target}`)
    else if (fs.readFileSync(resolved.source, 'utf8')
      !== fs.readFileSync(resolved.target, 'utf8')) {
      errors.push(`${item.target}: difiere de la fuente canónica`)
    }
  }
  // Un cargo que quedó fuera, o cuya descripción cambió en el catálogo, deja al runner eligiendo
  // con información vieja. Se reinstala, no se repara a mano.
  if (runner.capabilities.nativeSkills && runner.roleSkills) {
    const missing = []
    const stale = []
    for (const role of roleCatalog(root)) {
      const file = path.join(paths.install, runner.roleSkills, role.slug, 'SKILL.md')
      if (!fs.existsSync(file)) missing.push(role.slug)
      else if (fs.readFileSync(file, 'utf8') !== roleSkill(role)) stale.push(role.slug)
    }
    if (missing.length) {
      warnings.push(`${missing.length} cargo(s) sin instalar en ${runner.roleSkills}: reinstalá el adaptador`)
    }
    if (stale.length) {
      warnings.push(`${stale.length} cargo(s) desactualizados en ${runner.roleSkills}: reinstalá el adaptador`)
    }
  }
  const executable = spawnSync(
    'sh',
    ['-c', 'command -v "$1" >/dev/null 2>&1', 'runner-doctor', runner.command],
  )
  if (executable.status !== 0) warnings.push(`${runner.command}: CLI no encontrado en PATH`)
  for (const warning of warnings) output.warn(`⚠ ${name}: ${warning}`)
  for (const error of errors) output.error(`✗ ${name}: ${error}`)
  return { runner, errors, warnings }
}

function install(root, name, output = console) {
  const runner = runnerManifest(root, name)
  const errors = check(root)
  if (errors.length) throw new Error(`La automatización no es instalable:\n- ${errors.join('\n- ')}`)
  const paths = runnerPaths(root, name, runner)
  const incoming = runnerConfig(paths, root)
  let current = {}
  if (fs.existsSync(paths.configTarget)) {
    try { current = JSON.parse(fs.readFileSync(paths.configTarget, 'utf8')) } catch (error) {
      throw new Error(`${runner.config.target} contiene JSON inválido (${error.message})`)
    }
  }
  const items = [...(runner.instructions || []), ...(runner.artifacts || [])]
  const resolvedItems = items.map((item) => ({ item, ...resolveItem(paths, root, name, item) }))
  F.assertNoSymlinkPath(paths.install, paths.configTarget)
  for (const resolved of resolvedItems) {
    F.assertNoSymlinkPath(paths.install, resolved.target)
    if (fs.existsSync(resolved.target)
      && !runner.instructions.includes(resolved.item)
      && fs.readFileSync(resolved.target, 'utf8') !== fs.readFileSync(resolved.source, 'utf8')) {
      throw new Error(`${resolved.item.target} existe y difiere de la fuente canónica`)
    }
  }
  const merged = pruneSupersededHooks(mergeConfig(current, incoming))
  F.atomicWriteJson(paths.configTarget, merged.config)
  for (const { wrapper, files } of merged.replaced) {
    output.log(`− ${name}: reemplazado ${[...new Set(files)].join(', ')} por ${wrapper}`)
  }
  // Dónde aterrizó, no sólo qué archivo: en sidecar el destino no es el repo desde el que se corrió
  // el comando, y descubrirlo por sorpresa es la diferencia entre confiar y adivinar.
  if (paths.install !== root) {
    output.log(`  ${name}: el runner se abre en ${paths.install} — ahí quedan .claude/ y CLAUDE.md`)
  }
  output.log(`✓ ${name}: configuración instalada en ${runner.config.target}`)
  for (const resolved of resolvedItems) {
    if (fs.existsSync(resolved.target)) {
      output.log(`= ${name}: conservado ${resolved.item.target}`)
    } else {
      fs.mkdirSync(path.dirname(resolved.target), { recursive: true })
      fs.copyFileSync(resolved.source, resolved.target)
      output.log(`✓ ${name}: instalado ${resolved.item.target}`)
    }
  }
  installRoleSkills(root, runner, output)
  return runner
}

function listHooks(output = console) {
  const nameWidth = Math.max(...H.hookMetadata.map((hook) => hook.name.length))
  const eventWidth = Math.max(...H.hookMetadata.map((hook) => hook.event.length))
  for (const hook of H.hookMetadata) {
    output.log(`${hook.name.padEnd(nameWidth)}  ${hook.event.padEnd(eventWidth)}  ${hook.purpose}`)
  }
}

module.exports = {
  RUNNER_NAMES,
  check,
  doctor,
  includesConfig,
  install,
  legacyGuardWiring,
  pruneSupersededHooks,
  roleCatalog,
  roleSkill,
  listHooks,
  mergeConfig,
  runnerManifest,
}
