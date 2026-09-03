'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const F = require('../core/files')
const catalog = require('../agents/catalog')
const O = require('../core/ownership')
const M = require('../core/manifest')
const {
  RUNNER_NAMES, OPS_DIR, OPS_ROOT, packagedAutomation, runnerManifest, installRoot, opsPrefix,
  runnerPaths, resolveItem, inline, render, runnerConfig, activated,
} = require('./runners')
const { roleCatalog, roleSkill, installRoleSkills } = require('./roles')
const {
  GUARD_NAMES, groupWrappers, expectedHooks, supersededGuards,
  legacyGuardWiring, staleHooks, listHooks,
} = require('./hooks')
const {
  blockStart, mergeConfig, withoutDeliveredHooks, deliveredHookCommands, reportRemoved, includesConfig, hasHooks,
  unmergeConfig, isSharedFile, withoutBlock, mergeInstruction, blockUpToDate,
} = require('./config')

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
  // El motor puede venir de la dependencia npm o del propio repositorio, y la cascada la resuelve
  // `packagePath`. Eran tres: la copia vendorizada se retiró en 0.10.0 y esta línea la sobrevivió.
  if (!O.engineAt(root, path.join('hooks', 'run.js'))) {
    errors.push('falta engine/hooks/run.js: corré "npm install" en la raíz del repo ops')
  }
  const workflows = [
    'autobuild.js',
    'flow.js',
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
  for (const name of RUNNER_NAMES) validateRunnerManifest(root, name, errors)
  return errors
}

function validateRunnerManifest(root, name, errors) {
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
  const hookEvents = [...new Set(
    JSON.stringify(config).match(/hook\.js ([a-z-]+)/g) || [],
  )].map((entrada) => entrada.split(' ')[1])
  if (!hookEvents.length) return []

  const problems = []
  // Desde la raíz y desde una carpeta de adentro: si el runner lanza el hook con otro cwd, la ruta
  // relativa de su configuración deja de resolver y eso hay que verlo acá, no en la primera sesión.
  const sourceRoot = [paths.install, path.dirname(script)]
  for (const event of hookEvents) {
    for (const cwd of sourceRoot) {
      const payload = JSON.stringify({ toolCall: { args: { CommandLine: 'ls', Cwd: paths.install } } })
      const result = spawnSync(process.execPath, [script, event], { cwd, input: payload, encoding: 'utf8' })
      let response = {}
      try { response = JSON.parse((result.stdout || '').trim()) } catch { response = {} }
      // Cada evento tiene su respuesta sana: `stop` cierra la sesión —eso es funcionar— y el resto deja
      // pasar. El puente falla cerrado, así que `deny` en una llamada inocua es que algo se rompió antes
      // de poder juzgarla, y `continue` es el camino de error del propio `stop`.
      // Y sin `reason`: el puente sólo la manda cuando algo falló, así que un `stop` que la trae es
      // una falla de infraestructura que se dejó cerrar la sesión, no un arranque sano.
      const healthy = event === 'stop' ? 'stop' : 'allow'
      if (response.decision === healthy && !response.reason) continue
      const output = (result.stderr || 'sin respuesta').trim().split('\n')[0]
      const reason = response.reason
        || (response.decision ? `respondió ${response.decision}` : output)
      problems.push(`${bridge.target} ${event} desde ${path.basename(cwd)}/: ${reason}`)
    }
  }
  return problems
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
    if (isSharedFile(root, resolved.target)) {
      const content = render(resolved.source, opsPrefix(root), resolved.automationRoot, resolved.opsRoot)
      if (!fs.existsSync(resolved.target)) errors.push(`falta ${item.target}`)
      else if (!fs.readFileSync(resolved.target, 'utf8').includes(blockStart(name))) {
        errors.push(`${item.target}: no tiene las instrucciones de Cauce; reinstalá el adaptador`)
      } else if (!blockUpToDate(resolved.target, name, content)) {
        warnings.push(`${item.target}: su bloque de Cauce quedó viejo; reinstalá el adaptador`)
      }
      continue
    }
    // `AGENTS.md` es un nombre compartido entre herramientas y la instancia ya tiene el suyo: en
    // modo embedded el archivo del runner y el de la empresa son el mismo, y pedirle que se
    // referencie a sí mismo no significa nada.
    const ownFile = path.basename(resolved.target) === 'AGENTS.md'
    if (!fs.existsSync(resolved.target)) errors.push(`falta ${item.target}`)
    else if (!ownFile && !fs.readFileSync(resolved.target, 'utf8').includes('AGENTS.md')) {
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
    const status = deliveryState(recorded, name, resolved, opsPrefix(root))
    if (status === 'nuevo') errors.push(`falta ${item.target}`)
    else if (status === 'desactualizado') {
      warnings.push(`${item.target}: hay una versión más nueva en Cauce; reinstalá el adaptador`)
    } else if (status === 'ajeno') {
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
  for (const problem of probeBridge(paths, runner)) errors.push(problem)

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

// La sección `runners` del manifiesto anota archivo → digest; ésta es la única entrada que guarda una
// lista, porque lo que registra no es un archivo sino las entradas que dejamos dentro del archivo de
// configuración del usuario. No colisiona con ningún `target`: ninguno se llama así.
const HOOKS_KEY = 'config.hooks'

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
  const expectedItem = render(resolved.source, prefix, resolved.automationRoot, resolved.opsRoot)
  if (current === M.digestText(expectedItem)) return 'al día'
  const delivered = recorded[deliveryKey(name, resolved.item.target)]
  return delivered && delivered === current ? 'desactualizado' : 'ajeno'
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
  const kept = []
  let removed = 0

  const items = [...(runner.instructions || []), ...(runner.artifacts || [])]
  const deliveredPaths = { ...recorded }
  delete deliveredPaths[deliveryKey(name, HOOKS_KEY)]
  for (const item of items) {
    const resolved = { item, ...resolveItem(paths, root, name, item) }
    const key = deliveryKey(name, item.target)
    if (!fs.existsSync(resolved.target)) { delete deliveredPaths[key]; continue }
    if (isSharedFile(root, resolved.target)) {
      const body = fs.readFileSync(resolved.target, 'utf8')
      const clean = withoutBlock(body, name)
      if (clean !== body.trimEnd()) {
        F.atomicWrite(resolved.target, `${clean}\n`)
        removed += 1
      }
      delete deliveredPaths[key]
      continue
    }
    const status = deliveryState(recorded, name, resolved, prefix)
    if (status === 'ajeno') { kept.push(item.target); continue }
    removeFile(resolved.target, paths.install)
    delete deliveredPaths[key]
    removed += 1
  }

  // Los punteros a cargos no se registran uno por uno —son todo el catálogo y se regeneran enteros—,
  // así que se reconocen por contenido: sólo se va el que sigue siendo el que generamos.
  if (runner.capabilities.nativeSkills && runner.roleSkills) {
    const base = path.resolve(paths.install, runner.roleSkills)
    for (const role of roleCatalog(root)) {
      const file = path.join(base, role.slug, 'SKILL.md')
      if (!fs.existsSync(file)) continue
      if (M.digest(file) !== M.digestText(roleSkill(role))) {
        kept.push(path.relative(paths.install, file))
        continue
      }
      removeFile(file, paths.install)
      removed += 1
    }
  }

  if (fs.existsSync(paths.configTarget)) {
    const current = JSON.parse(fs.readFileSync(paths.configTarget, 'utf8'))
    const clean = unmergeConfig(current, runnerConfig(paths, root))
    if (clean && Object.keys(clean).length) F.atomicWriteJson(paths.configTarget, clean)
    else { removeFile(paths.configTarget, paths.install); removed += 1 }
    output.log(`✓ ${name}: ${runner.config.target} sin las entradas de Cauce`)
  }

  M.write(root, undefined, deliveredPaths)
  output.log(`✓ ${name}: ${removed} archivo(s) del toolkit quitados de ${paths.install}`)
  for (const file of kept) output.log(`= ${name}: conservado ${file} (tiene cambios tuyos)`)
  if (runner.activation) output.log(`  ${name}: si lo habías registrado a mano, quitalo también.`)
  return { removed: removed, kept: kept }
}

// `AGENTS.md` es el único nombre que el runner y la instancia comparten: en modo embebido el archivo de
// instrucciones de Codex es el mismo que el de la empresa. Conservarlo entero —lo correcto para un
// archivo del proyecto— dejaba a ese runner sin una sola línea de Cauce, así que su contenido se
// fusiona adentro, entre marcas, y todo lo demás del archivo queda intacto.
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
  const edited = resolvedItems.filter((resolved) => {
    return state.get(resolved) === 'ajeno' && !runner.instructions.includes(resolved.item)
  })
  if (edited.length && !options.force) {
    throw new Error(
      `${edited.length} archivo(s) que mantiene Cauce fueron editados y se perderían:\n`
      + `${edited.map((resolved) => `- ${resolved.item.target}`).join('\n')}\n\n`
      + 'Son del toolkit: en vez de editarlos, agregá lo tuyo al lado y registralo en la\n'
      + 'configuración de tu runner. Si el cambio ya no te sirve, repetí con --force.',
    )
  }
  // Un archivo que existe sólo porque Cauce lo creó se escribe entero. Los `settings.json` de Claude y
  // Gemini son del usuario, así que ahí se fusiona; pero fusionar conserva también lo que pusimos en
  // una versión anterior, y una entrada nuestra que quedó viva apuntando a donde ya no hay nada es un
  // guard que el runner intenta ejecutar y falla. Se quitan las nuestras y las vuelve a poner el merge.
  const live = new Set((JSON.stringify(incoming).match(/"command":"[^"]*"/g) || [])
    .map((entry) => JSON.parse(`{${entry}}`).command))
  // Lo que este adaptador anotó haber entregado la última vez. Es lo único que reconoce una entrada
  // nuestra cuyo guard el motor ya no trae: por nombre no se distingue de la que agregó el proyecto.
  const previous = new Set(recorded[deliveryKey(name, HOOKS_KEY)] || [])
  const clean = runner.config.owned
    ? { config: {}, dropped: [] }
    : withoutDeliveredHooks(current, live, previous)
  reportRemoved(name, clean.dropped, live, output)
  F.atomicWriteJson(paths.configTarget, mergeConfig(clean.config, incoming))
  // Dónde aterrizó, no sólo qué archivo: en sidecar el destino no es el repo desde el que se corrió
  // el comando, y descubrirlo por sorpresa es la diferencia entre confiar y adivinar.
  if (paths.install !== root) {
    output.log(`  ${name}: el runner se abre en ${paths.install} — ahí queda su configuración`)
  }
  output.log(`✓ ${name}: configuración instalada en ${runner.config.target}`)
  const deliveredPaths = { ...recorded }
  // Qué wiring de guards dejamos puesto, para poder retirarlo el día que el motor deje de traerlo. Se
  // anota lo que instalamos y no lo que quedó en el archivo: ahí conviven las entradas del proyecto, y
  // registrarlas nos autorizaría a borrar lo ajeno en la instalación siguiente.
  const ourHooks = deliveredHookCommands(live)
  if (ourHooks.length) deliveredPaths[deliveryKey(name, HOOKS_KEY)] = ourHooks
  else delete deliveredPaths[deliveryKey(name, HOOKS_KEY)]
  for (const resolved of resolvedItems) {
    const status = state.get(resolved)
    const ownFile = runner.instructions.includes(resolved.item)
    if (ownFile && isSharedFile(root, resolved.target)) {
      const content = render(resolved.source, opsPrefix(root), resolved.automationRoot, resolved.opsRoot)
      if (blockUpToDate(resolved.target, name, content)) {
        output.log(`= ${name}: ${resolved.item.target} ya trae sus instrucciones`)
      } else {
        mergeInstruction(resolved.target, name, content)
        output.log(`✓ ${name}: sus instrucciones quedaron dentro de ${resolved.item.target}`)
      }
      deliveredPaths[deliveryKey(name, resolved.item.target)] = M.digest(resolved.target)
      continue
    }
    if (status === 'ajeno' && ownFile) {
      output.log(`= ${name}: conservado ${resolved.item.target} (tiene cambios tuyos)`)
    } else if (status === 'al día') {
      output.log(`= ${name}: ${resolved.item.target} ya está al día`)
    } else {
      fs.mkdirSync(path.dirname(resolved.target), { recursive: true })
      const written = render(resolved.source, opsPrefix(root), resolved.automationRoot, resolved.opsRoot)
      F.atomicWrite(resolved.target, written)
      const verb = status === 'nuevo' ? 'instalado' : 'actualizado'
      output.log(`✓ ${name}: ${verb} ${resolved.item.target}`)
    }
    // Sólo se anota lo que Cauce puso: un archivo conservado con cambios de la empresa no es una
    // entrega, y registrarlo lo volvería indistinguible de uno intacto en la próxima instalación.
    if (!(status === 'ajeno' && ownFile)) {
      deliveredPaths[deliveryKey(name, resolved.item.target)] = M.digest(resolved.target)
    }
  }
  installRoleSkills(root, runner, output)
  // Cómo se lo llama acá. El nombre del recorrido es el mismo en todos los runners —`onboard`, `flow`,
  // `autobuild`—; el prefijo lo pone cada uno según su espacio de nombres, y esa diferencia es la que
  // hace que alguien no encuentre en Gemini lo que usó en Claude. Decirlo al instalar cuesta una línea
  // y ahorra buscarlo en una lista tan larga como el catálogo.
  const invocation = runner.commands && runner.commands.invocation
  if (invocation && (runner.commands.names || []).length) {
    const listing = runner.commands.names.map((nombre) => invocation.replace('{name}', nombre))
    output.log(`  ${name}: se invocan como ${listing.join(', ')}`)
  }
  if (runner.activation && activated(runner) !== true) {
    output.log(`  ${name}: falta registrarlo para que corra. Desde ${paths.install}:`)
    output.log(`    ${runner.activation.hint}`)
  }
  M.write(root, undefined, deliveredPaths)
  return runner
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
  render,
  listHooks,
  runnerManifest,
}
