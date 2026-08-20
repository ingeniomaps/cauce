'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const F = require('../core/files')
const H = require('../hooks/run')
const P = require('../planning/parser')
const catalog = require('../agents/catalog')
const O = require('../core/ownership')
const M = require('../core/manifest')

const RUNNER_NAMES = ['claude', 'codex', 'gemini', 'antigravity']

// Los guards que el motor implementa, tomados del registro que los ejecuta. Sale de ahí y no de un
// número escrito a mano: `automation check` anunciaba «11 guards» cuando hacía rato que eran doce, y
// un conteo que envejece solo es peor que ninguno —dice que revisó menos de lo que revisó—.
const GUARD_NAMES = Object.keys(H.guards)

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
    throw new Error('no encuentro automatization/: corré "npm install" en la raíz del repo ops')
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

// Todo lo que un adaptador copia —configuración, instrucciones, workflows— nombra rutas relativas a
// la carpeta donde se abre la herramienta. Cuando la raíz ops no es esa carpeta, cada una necesita el
// prefijo. El marcador es explícito en la fuente en vez de adivinarse con reemplazos de texto:
// `{{OPS_DIR}}` significa "acá va la raíz ops, o nada si coinciden".
//
// Un solo render, y `install` escribe exactamente lo que `doctor` compara.
const OPS_DIR = '{{OPS_DIR}}'

function render(file, prefix) {
  return fs.readFileSync(file, 'utf8').split(OPS_DIR).join(prefix)
}

function runnerConfig(paths, root) {
  return JSON.parse(render(paths.configSource, opsPrefix(root)))
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

Esas rutas se resuelven desde este directorio raíz, no desde el repositorio de operaciones: en modo
sidecar el wiring vive acá y el repo ops es uno de sus hijos.

Respetá los límites de ese contrato y las reglas de \`AGENTS.md\`. Generado por
\`cauce automation install\`: no lo edites acá.
`
}

function installRoleSkills(root, runner, output) {
  if (!runner.capabilities.nativeSkills || !runner.roleSkills) return
  const install = installRoot(root)
  const base = F.assertWithin(install, path.resolve(install, runner.roleSkills), `${runner.name}: roleSkills`)
  const roles = roleCatalog(root)
  for (const role of roles) {
    const file = path.join(base, role.slug, 'SKILL.md')
    F.assertNoSymlinkPath(install, file)
    F.atomicWrite(file, roleSkill(role))
  }
  if (roles.length) output.log(`✓ ${runner.name}: ${roles.length} cargo(s) disponibles en ${runner.roleSkills}`)
}

// Runners que además de los archivos necesitan un registro propio para que el wiring cuente. Copiar
// y quedarse ahí deja un plugin inerte: los archivos están, `doctor` da verde y nada se ejecuta.
function activated(runner) {
  if (!runner.activation) return true
  const result = spawnSync(runner.command, runner.activation.verify, { encoding: 'utf8' })
  if (result.status !== 0) return null
  return `${result.stdout || ''}`.includes(runner.activation.expect)
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

// Guards de la instancia que ya no coinciden con los del paquete. Existir y ser ejecutable no
// alcanza: un guard viejo no falla, deja de proteger sin decir nada. La instancia declaraba una
// versión y nadie comprobaba que su runtime fuera realmente esa.
function staleHooks(root) {
  const packaged = packagedAutomation(root)
  if (!packaged) return []
  const shipped = path.join(packaged, 'hooks')
  const mine = path.join(root, 'automatization', 'hooks')
  const recorded = M.read(root)
  const stale = []
  let names = []
  try { names = fs.readdirSync(shipped) } catch { return [] }
  for (const file of names) {
    const local = path.join(mine, file)
    // Los que faltan ya los reporta el chequeo de arriba; acá sólo interesa el que quedó atrás.
    if (!fs.existsSync(local)) continue
    const current = M.digest(local)
    if (current === M.digest(path.join(shipped, file))) continue
    const delivered = recorded[`automatization/hooks/${file}`]
    stale.push({ file, edited: Boolean(delivered) && delivered !== current })
  }
  return stale
}

function check(root) {
  const errors = []
  const hookDir = path.join(root, 'automatization', 'hooks')
  if (!fs.existsSync(path.join(root, 'automatization', 'AGENTS.md'))) {
    errors.push('falta automatization/AGENTS.md')
  }
  for (const name of expectedHooks()) {
    const file = path.join(hookDir, name)
    if (!fs.existsSync(file)) errors.push(`falta automatization/hooks/${name}`)
    else if (!(fs.statSync(file).mode & 0o111)) {
      errors.push(`automatization/hooks/${name} no es ejecutable`)
    }
  }
  // El motor puede venir de la dependencia npm, de la copia local o del propio repositorio.
  if (!O.engineAt(root, path.join('hooks', 'run.js'))) {
    errors.push('falta engine/hooks/run.js: corré "npm install" en la raíz del repo ops')
  }
  const workflows = [
    'autobuild.js',
    'team.js',
    path.join('integrations', 'sync.js'),
    path.join('integrations', 'promote.js'),
  ]
  const packaged = packagedAutomation(root)
  for (const name of workflows) {
    if (!packaged || !fs.existsSync(path.join(packaged, 'workflows', name))) {
      errors.push(`falta automatization/workflows/${name}: corré "npm install" en la raíz del repo ops`)
    }
  }
  for (const { file, edited } of staleHooks(root)) {
    errors.push(edited
      ? `automatization/hooks/${file}: lo editaste y es del toolkit; agregá un guard propio al lado `
        + 'o descartá tu cambio con `cauce upgrade --force`'
      : `automatization/hooks/${file}: quedó atrás del paquete y ya no protege lo que dice; `
        + 'corré `cauce upgrade` antes de instalar el runner')
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

// Un `.sh` por grupo de más de un guard: es el que registra el runner para correrlos en un proceso.
function groupWrappers() {
  return Object.entries(H.hookGroups)
    .filter(([, names]) => names.length > 1)
    .map(([group]) => [group, `guard-${group.replace('pre-', '')}.sh`])
}

// Los scripts que la instancia debe tener, derivados del registro que los ejecuta en vez de copiados
// a mano: la copia envejecía sin avisar, porque un guard nuevo del motor no entraba en la cuenta.
//
// Se comprueba en una sola dirección a propósito. Un `.sh` que no está acá no sobra: así es como una
// empresa agrega el suyo —`guard-acme.sh` al lado de los nuestros—, que es lo que `upgrade` le dice
// que haga y lo único que sobrevive a cada actualización.
function expectedHooks() {
  return [
    'run-hook.sh',
    ...groupWrappers().map(([, wrapper]) => wrapper),
    ...GUARD_NAMES.map((name) => `guard-${name}.sh`),
  ]
}

// Guards que hoy viven dentro de un grupo, con el wrapper que los reemplaza.
function supersededGuards() {
  const entries = []
  for (const [group, wrapper] of groupWrappers()) {
    for (const name of H.hookGroups[group]) entries.push({ file: `guard-${name}.sh`, wrapper })
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

// Ejecuta el puente del runner tal como él lo invoca, y desde otra carpeta. Instalado no es lo mismo que
// operativo: un bridge que el runner no puede lanzar —porque su ruta es relativa y el cwd es otro, o
// porque falta node— falla cerrado y niega cada llamada a herramienta. `doctor` veía los archivos en su
// lugar y decía «operativo» mientras nada respondía.
function probeBridge(paths, runner) {
  const bridge = (runner.artifacts || []).find((item) => item.target.endsWith('hook.js'))
  if (!bridge) return []
  const script = path.resolve(paths.install, bridge.target)
  if (!fs.existsSync(script)) return []
  let config = {}
  try { config = JSON.parse(fs.readFileSync(paths.configTarget, 'utf8')) } catch { return [] }
  const eventos = [...new Set(
    JSON.stringify(config).match(/hook\.js ([a-z-]+)/g) || [],
  )].map((entrada) => entrada.split(' ')[1])
  if (!eventos.length) return []

  const problemas = []
  // Desde la raíz y desde una carpeta de adentro: si el runner lanza el hook con otro cwd, la ruta
  // relativa de su configuración deja de resolver y eso hay que verlo acá, no en la primera sesión.
  const desde = [paths.install, path.dirname(script)]
  for (const evento of eventos) {
    for (const cwd of desde) {
      const payload = JSON.stringify({ toolCall: { args: { CommandLine: 'ls', Cwd: paths.install } } })
      const result = spawnSync(process.execPath, [script, evento], { cwd, input: payload, encoding: 'utf8' })
      let respuesta = {}
      try { respuesta = JSON.parse((result.stdout || '').trim()) } catch { respuesta = {} }
      // Cada evento tiene su respuesta sana: `stop` cierra la sesión —eso es funcionar— y el resto deja
      // pasar. El puente falla cerrado, así que `deny` en una llamada inocua es que algo se rompió antes
      // de poder juzgarla, y `continue` es el camino de error del propio `stop`.
      // Y sin `reason`: el puente sólo la manda cuando algo falló, así que un `stop` que la trae es
      // una falla de infraestructura que se dejó cerrar la sesión, no un arranque sano.
      const sana = evento === 'stop' ? 'stop' : 'allow'
      if (respuesta.decision === sana && !respuesta.reason) continue
      const salida = (result.stderr || 'sin respuesta').trim().split('\n')[0]
      const motivo = respuesta.reason
        || (respuesta.decision ? `respondió ${respuesta.decision}` : salida)
      problemas.push(`${bridge.target} ${evento} desde ${path.basename(cwd)}/: ${motivo}`)
    }
  }
  return problemas
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
    const resolved = { item, ...resolveItem(paths, root, name, item) }
    // El archivo compartido no se compara entero: alrededor del bloque vive el texto de la empresa, así
    // que su hash difiere siempre. Comparado como archivo, `doctor` avisaba cuando el bloque estaba bien
    // y callaba cuando alguien lo había borrado, que es exactamente al revés.
    if (esArchivoCompartido(root, resolved.target)) {
      const contenido = render(resolved.source, opsPrefix(root))
      if (!fs.existsSync(resolved.target)) errors.push(`falta ${item.target}`)
      else if (!fs.readFileSync(resolved.target, 'utf8').includes(bloqueInicio(name))) {
        errors.push(`${item.target}: no tiene las instrucciones de Cauce; reinstalá el adaptador`)
      } else if (!bloqueAlDia(resolved.target, name, contenido)) {
        warnings.push(`${item.target}: su bloque de Cauce quedó viejo; reinstalá el adaptador`)
      }
      continue
    }
    // `AGENTS.md` es un nombre compartido entre herramientas y la instancia ya tiene el suyo: en
    // modo embedded el archivo del runner y el de la empresa son el mismo, y pedirle que se
    // referencie a sí mismo no significa nada.
    const propio = path.basename(resolved.target) === 'AGENTS.md'
    if (!fs.existsSync(resolved.target)) errors.push(`falta ${item.target}`)
    else if (!propio && !fs.readFileSync(resolved.target, 'utf8').includes('AGENTS.md')) {
      warnings.push(`${item.target}: no referencia AGENTS.md; verifica las reglas globales`)
    }
    if (deliveryState(M.readRunners(root), name, resolved, opsPrefix(root)) === 'desactualizado') {
      warnings.push(`${item.target}: Cauce trae una versión más nueva y vos no lo tocaste; reinstalá`)
    }
  }
  // Divergir no es un error: puede ser una mejora río arriba esperando reinstalación. Reportarlo
  // como error dejaba a la empresa sin salida, porque `install` tampoco lo actualizaba.
  const recorded = M.readRunners(root)
  for (const item of runner.artifacts || []) {
    const resolved = { item, ...resolveItem(paths, root, name, item) }
    const situacion = deliveryState(recorded, name, resolved, opsPrefix(root))
    if (situacion === 'nuevo') errors.push(`falta ${item.target}`)
    else if (situacion === 'desactualizado') {
      warnings.push(`${item.target}: hay una versión más nueva en Cauce; reinstalá el adaptador`)
    } else if (situacion === 'ajeno') {
      warnings.push(`${item.target}: lo editaste y es del toolkit; `
        + 'agregá lo tuyo al lado o reinstalá con --force para volver a la versión de Cauce')
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
  // Un puente que no responde niega cada llamada del runner: es error, no advertencia.
  for (const problema of probeBridge(paths, runner)) errors.push(problema)

  const executable = spawnSync(
    'sh',
    ['-c', 'command -v "$1" >/dev/null 2>&1', 'runner-doctor', runner.command],
  )
  if (executable.status !== 0) warnings.push(`${runner.command}: CLI no encontrado en PATH`)
  else if (activated(runner) === false) {
    warnings.push(`el plugin está copiado pero no registrado, así que no se ejecuta. `
      + `Corré desde ${paths.install}: ${runner.activation.hint}`)
  }
  for (const warning of warnings) output.warn(`⚠ ${name}: ${warning}`)
  for (const error of errors) output.error(`✗ ${name}: ${error}`)
  return { runner, errors, warnings }
}

// Clave de entrega de un archivo del adaptador. Va en su propia sección del manifiesto porque puede
// caer fuera de la instancia: en sidecar el wiring vive en la carpeta de la compañía.
function deliveryKey(name, target) {
  return `${name}/${target.split(path.sep).join('/')}`
}

// En qué estado quedó un archivo que este adaptador entregó alguna vez.
//
//   nuevo          no existe todavía
//   al día         idéntico a lo que trae Cauce
//   desactualizado la empresa no lo tocó, pero río arriba cambió
//   ajeno          difiere de lo entregado: alguien lo editó acá
//
// Sin el registro de entrega, `desactualizado` y `ajeno` se ven igual. `install` resolvía esa duda
// conservando siempre, así que ninguna mejora del toolkit llegaba nunca a un runner ya instalado.
function deliveryState(recorded, name, resolved, prefix = '') {
  if (!fs.existsSync(resolved.target)) return 'nuevo'
  const current = M.digest(resolved.target)
  if (current === M.digestText(render(resolved.source, prefix))) return 'al día'
  const delivered = recorded[deliveryKey(name, resolved.item.target)]
  return delivered && delivered === current ? 'desactualizado' : 'ajeno'
}

// Quita de una estructura de configuración exactamente lo que este adaptador habría puesto, y nada más.
// Es el inverso de `mergeConfig`: una entrada del usuario nunca coincide literalmente con la nuestra, así
// que sobrevive; una que editó tampoco coincide, y por eso se conserva y se avisa en vez de borrarse.
function unmergeConfig(current, incoming) {
  if (Array.isArray(incoming)) {
    if (!Array.isArray(current)) return current
    const nuestras = new Set(incoming.map((value) => JSON.stringify(value)))
    return current.filter((value) => !nuestras.has(JSON.stringify(value)))
  }
  if (incoming && typeof incoming === 'object') {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return current
    const result = { ...current }
    for (const [key, value] of Object.entries(incoming)) {
      if (!(key in result)) continue
      const limpio = unmergeConfig(result[key], value)
      // Una clave que queda vacía por habernos ido no es del usuario: la creamos nosotros al instalar.
      const vacia = limpio === undefined
        || (Array.isArray(limpio) && !limpio.length)
        || (limpio && typeof limpio === 'object' && !Array.isArray(limpio) && !Object.keys(limpio).length)
      if (vacia) delete result[key]
      else result[key] = limpio
    }
    return result
  }
  return JSON.stringify(current) === JSON.stringify(incoming) ? undefined : current
}

// Borra el archivo y, de paso, los directorios que quedaron vacíos por haberlo sacado. Nunca sube más
// allá del límite: `.claude/` puede tener cosas del usuario aunque `.claude/workflows/` quede vacío.
function removeFile(file, boundary) {
  fs.rmSync(file, { force: true })
  let dir = path.dirname(file)
  while (dir.startsWith(boundary) && dir !== boundary) {
    try { if (fs.readdirSync(dir).length) return } catch { return }
    fs.rmdirSync(dir)
    dir = path.dirname(dir)
  }
}

// Saca el wiring de un runner dejando intacto lo que no escribimos nosotros.
//
// Existe porque desinstalar a mano es borrar `ops/` y descubrir después que cada llamada de herramienta
// ejecuta un guard que ya no está. Y porque la alternativa —borrar `.claude/` entero— se lleva puesto lo
// que el usuario haya puesto ahí, que es suyo y no tiene por qué desaparecer con el toolkit.
//
// La regla es una sola: se quita lo que Cauce entregó y sigue igual que como lo entregó. Un archivo con
// cambios propios se conserva y se nombra; decidir sobre él es de la persona, no de este comando.
function uninstall(root, name, output = console) {
  if (O.mode(root) === 'toolkit') {
    throw new Error('Acá se fabrica Cauce, no se lo consume.')
  }
  const runner = runnerManifest(root, name)
  const paths = runnerPaths(root, name, runner)
  const prefix = opsPrefix(root)
  const recorded = M.readRunners(root)
  const conservados = []
  let quitados = 0

  const items = [...(runner.instructions || []), ...(runner.artifacts || [])]
  const entregado = { ...recorded }
  for (const item of items) {
    const resolved = { item, ...resolveItem(paths, root, name, item) }
    const key = deliveryKey(name, item.target)
    if (!fs.existsSync(resolved.target)) { delete entregado[key]; continue }
    if (esArchivoCompartido(root, resolved.target)) {
      const texto = fs.readFileSync(resolved.target, 'utf8')
      const limpio = sinBloque(texto, name)
      if (limpio !== texto.trimEnd()) {
        F.atomicWrite(resolved.target, `${limpio}\n`)
        quitados += 1
      }
      delete entregado[key]
      continue
    }
    const situacion = deliveryState(recorded, name, resolved, prefix)
    if (situacion === 'ajeno') { conservados.push(item.target); continue }
    removeFile(resolved.target, paths.install)
    delete entregado[key]
    quitados += 1
  }

  // Los punteros a cargos no se registran uno por uno —son cuarenta y siete y se regeneran enteros—,
  // así que se reconocen por contenido: sólo se va el que sigue siendo el que generamos.
  if (runner.capabilities.nativeSkills && runner.roleSkills) {
    const base = path.resolve(paths.install, runner.roleSkills)
    for (const role of roleCatalog(root)) {
      const file = path.join(base, role.slug, 'SKILL.md')
      if (!fs.existsSync(file)) continue
      if (M.digest(file) !== M.digestText(roleSkill(role))) {
        conservados.push(path.relative(paths.install, file))
        continue
      }
      removeFile(file, paths.install)
      quitados += 1
    }
  }

  if (fs.existsSync(paths.configTarget)) {
    const current = JSON.parse(fs.readFileSync(paths.configTarget, 'utf8'))
    const limpio = unmergeConfig(current, runnerConfig(paths, root))
    if (limpio && Object.keys(limpio).length) F.atomicWriteJson(paths.configTarget, limpio)
    else { removeFile(paths.configTarget, paths.install); quitados += 1 }
    output.log(`✓ ${name}: ${runner.config.target} sin las entradas de Cauce`)
  }

  M.write(root, undefined, entregado)
  output.log(`✓ ${name}: ${quitados} archivo(s) del toolkit quitados de ${paths.install}`)
  for (const file of conservados) output.log(`= ${name}: conservado ${file} (tiene cambios tuyos)`)
  if (runner.activation) output.log(`  ${name}: si lo habías registrado a mano, quitalo también.`)
  return { removed: quitados, kept: conservados }
}

// `AGENTS.md` es el único nombre que el runner y la instancia comparten: en modo embebido el archivo de
// instrucciones de Codex es el mismo que el de la empresa. Conservarlo entero —lo correcto para un
// archivo del proyecto— dejaba a ese runner sin una sola línea de Cauce, así que su contenido se
// fusiona adentro, entre marcas, y todo lo demás del archivo queda intacto.
const bloqueInicio = (name) => `<!-- cauce:${name} inicio — lo reescribe "automation install", no editar -->`
const bloqueFin = (name) => `<!-- cauce:${name} fin -->`

function esArchivoCompartido(root, target) {
  return path.resolve(target) === path.resolve(root, 'AGENTS.md')
}

function sinBloque(text, name) {
  const desde = text.indexOf(bloqueInicio(name))
  if (desde === -1) return text
  const hasta = text.indexOf(bloqueFin(name), desde)
  if (hasta === -1) return text
  return `${text.slice(0, desde)}${text.slice(hasta + bloqueFin(name).length)}`.trimEnd()
}

function fusionarInstruccion(file, name, contenido) {
  const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const cuerpo = sinBloque(actual, name).trimEnd()
  const bloque = `${bloqueInicio(name)}\n\n${contenido.trim()}\n\n${bloqueFin(name)}\n`
  F.atomicWrite(file, cuerpo ? `${cuerpo}\n\n${bloque}` : bloque)
}

function bloqueAlDia(file, name, contenido) {
  if (!fs.existsSync(file)) return false
  const texto = fs.readFileSync(file, 'utf8')
  const desde = texto.indexOf(bloqueInicio(name))
  const hasta = texto.indexOf(bloqueFin(name))
  if (desde === -1 || hasta === -1) return false
  return texto.slice(desde + bloqueInicio(name).length, hasta).trim() === contenido.trim()
}

function install(root, name, output = console, options = {}) {
  // `install` arma la superficie de consumo de una empresa: punteros a cada cargo, una copia de los
  // workflows y los guards. Acá los cargos y los workflows son el producto —la copia divergiría— y
  // hay guards que contradicen el trabajo, como el que bloquea el push de cada release.
  if (O.mode(root) === 'toolkit') {
    throw new Error('Acá se fabrica Cauce, no se lo consume.')
  }
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
  for (const resolved of resolvedItems) F.assertNoSymlinkPath(paths.install, resolved.target)

  const recorded = M.readRunners(root)
  const prefix = opsPrefix(root)
  const state = new Map(resolvedItems.map((r) => [r, deliveryState(recorded, name, r, prefix)]))
  // Un archivo de instrucciones es del proyecto y se conserva; uno ejecutable es del toolkit y se
  // reemplaza. Editarlo detiene la instalación antes de pisarlo, igual que hace `upgrade`.
  const editados = resolvedItems.filter((resolved) => {
    return state.get(resolved) === 'ajeno' && !runner.instructions.includes(resolved.item)
  })
  if (editados.length && !options.force) {
    throw new Error(
      `${editados.length} archivo(s) que mantiene Cauce fueron editados y se perderían:\n`
      + `${editados.map((resolved) => `- ${resolved.item.target}`).join('\n')}\n\n`
      + 'Son del toolkit: en vez de editarlos, agregá lo tuyo al lado y registralo en la\n'
      + 'configuración de tu runner. Si el cambio ya no te sirve, repetí con --force.',
    )
  }
  const merged = pruneSupersededHooks(mergeConfig(current, incoming))
  F.atomicWriteJson(paths.configTarget, merged.config)
  for (const { wrapper, files } of merged.replaced) {
    output.log(`− ${name}: reemplazado ${[...new Set(files)].join(', ')} por ${wrapper}`)
  }
  // Dónde aterrizó, no sólo qué archivo: en sidecar el destino no es el repo desde el que se corrió
  // el comando, y descubrirlo por sorpresa es la diferencia entre confiar y adivinar.
  if (paths.install !== root) {
    output.log(`  ${name}: el runner se abre en ${paths.install} — ahí queda su configuración`)
  }
  output.log(`✓ ${name}: configuración instalada en ${runner.config.target}`)
  const entregado = { ...recorded }
  for (const resolved of resolvedItems) {
    const situacion = state.get(resolved)
    const propio = runner.instructions.includes(resolved.item)
    if (propio && esArchivoCompartido(root, resolved.target)) {
      const contenido = render(resolved.source, opsPrefix(root))
      if (bloqueAlDia(resolved.target, name, contenido)) {
        output.log(`= ${name}: ${resolved.item.target} ya trae sus instrucciones`)
      } else {
        fusionarInstruccion(resolved.target, name, contenido)
        output.log(`✓ ${name}: sus instrucciones quedaron dentro de ${resolved.item.target}`)
      }
      entregado[deliveryKey(name, resolved.item.target)] = M.digest(resolved.target)
      continue
    }
    if (situacion === 'ajeno' && propio) {
      output.log(`= ${name}: conservado ${resolved.item.target} (tiene cambios tuyos)`)
    } else if (situacion === 'al día') {
      output.log(`= ${name}: ${resolved.item.target} ya está al día`)
    } else {
      fs.mkdirSync(path.dirname(resolved.target), { recursive: true })
      F.atomicWrite(resolved.target, render(resolved.source, opsPrefix(root)))
      const verbo = situacion === 'nuevo' ? 'instalado' : 'actualizado'
      output.log(`✓ ${name}: ${verbo} ${resolved.item.target}`)
    }
    // Sólo se anota lo que Cauce puso: un archivo conservado con cambios de la empresa no es una
    // entrega, y registrarlo lo volvería indistinguible de uno intacto en la próxima instalación.
    if (!(situacion === 'ajeno' && propio)) {
      entregado[deliveryKey(name, resolved.item.target)] = M.digest(resolved.target)
    }
  }
  installRoleSkills(root, runner, output)
  // Cómo se lo llama acá. El nombre del recorrido es el mismo en todos los runners —`onboard`, `team`,
  // `autobuild`—; el prefijo lo pone cada uno según su espacio de nombres, y esa diferencia es la que
  // hace que alguien no encuentre en Gemini lo que usó en Claude. Decirlo al instalar cuesta una línea
  // y ahorra buscarlo en una lista de cincuenta skills.
  const invocacion = runner.commands && runner.commands.invocation
  if (invocacion && (runner.commands.names || []).length) {
    const lista = runner.commands.names.map((nombre) => invocacion.replace('{name}', nombre))
    output.log(`  ${name}: se invocan como ${lista.join(', ')}`)
  }
  if (runner.activation && activated(runner) !== true) {
    output.log(`  ${name}: falta registrarlo para que corra. Desde ${paths.install}:`)
    output.log(`    ${runner.activation.hint}`)
  }
  M.write(root, undefined, entregado)
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
  GUARD_NAMES,
  RUNNER_NAMES,
  check,
  doctor,
  install,
  uninstall,
  legacyGuardWiring,
  roleCatalog,
  roleSkill,
  listHooks,
  runnerManifest,
}
