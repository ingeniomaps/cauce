'use strict'

// El ciclo de vida de una instancia —crearla, actualizarla, borrarla— y las primitivas que materializan
// el molde en un directorio. Las primitivas viven acá y no en su propio módulo porque son la operación
// que define este archivo; `evaluate` y `integration` las piden prestadas para armar un banco y para
// sembrar un proveedor, que son la misma operación con otro destino.

const fs = require('node:fs')
const path = require('node:path')
const F = require('../core/files')
const O = require('../core/ownership')
const M = require('../core/manifest')
const OB = require('../core/onboarding')
const P = require('../planning/parser')
const ST = require('../planning/state')
const A = require('../automation')
const { fail } = require('./io')
const { declareEngine, pinEngine, undeclareEngine } = require('./dependency')
const { adviceFor, previewUpgrade, reportUpgrade } = require('./upgrade-report')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

// Proveedores que el toolkit conoce, para saltearlos al copiar la plantilla: su andamiaje
// —configuración, staging/, proposed/— no se materializa hasta que alguien lo habilite. Antes cada
// instancia recibía el de un proveedor apagado que quizá no usaba nunca, y que nadie actualizaba.
function providerNames() {
  try {
    const file = path.join(PROJECT_ROOT, 'template', 'integrations', 'config.json')
    return Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).providers || {})
  } catch { return [] }
}

// Devuelve, por archivo conservado, el digest de lo que **habría** escrito. Quien registra la entrega
// necesita esos dos contenidos distintos, y el que quedó en disco no es uno de ellos.
function copyTemplate(source, target, replacements, force, skip = [], quiet = false) {
  F.assertNoSymlinkPath(path.dirname(target), target)
  fs.mkdirSync(target, { recursive: true })
  const preserved = {}
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue
    const from = path.join(source, entry.name)
    // npm no incluye un `.gitignore` dentro de un tarball —comprobado con `npm pack --dry-run` en npm
    // 11.16.0: lo deja afuera en la raíz y en subdirectorios—, así que viaja sin punto y se restituye
    // acá. Sin esto el archivo existe en el repo del toolkit y desaparece para todo consumidor real.
    const to = path.join(target, entry.name === 'gitignore' ? '.gitignore' : entry.name)
    if (entry.isDirectory()) Object.assign(preserved, copyTemplate(from, to, replacements, force, skip, quiet))
    else {
      if (fs.existsSync(to)) {
        if (!force) fail(`El destino contiene ${to}. Usa un directorio vacío o --force.`)
        if (!quiet) console.log(`= conservado ${to}`)
        let would = fs.readFileSync(from, 'utf8')
        for (const [key, value] of Object.entries(replacements)) would = would.replaceAll(key, value)
        preserved[to] = M.digestText(would)
        continue
      }
      let content = fs.readFileSync(from, 'utf8')
      for (const [key, value] of Object.entries(replacements)) content = content.replaceAll(key, value)
      F.atomicWrite(to, content)
      if (entry.name.endsWith('.js')) fs.chmodSync(to, 0o755)
      if (!quiet) console.log(`+ ${to}`)
    }
  }
  return preserved
}

// Devuelve lo conservado igual que `copyTemplate`, y por la misma razón: acá el runtime no lleva
// reemplazos, así que lo que habríamos escrito es el archivo del paquete tal cual.
function copyRuntime(source, target, preserve = false, boundary = target, skip = []) {
  F.assertNoSymlinkPath(boundary, target)
  fs.mkdirSync(target, { recursive: true })
  const preserved = {}
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) Object.assign(preserved, copyRuntime(from, to, preserve, boundary, skip))
    else if (preserve && fs.existsSync(to)) {
      console.log(`= conservado ${to}`)
      preserved[to] = M.digest(from)
    } else {
      F.assertNoSymlinkPath(boundary, to)
      fs.copyFileSync(from, to)
    }
  }
  return preserved
}

// El andamiaje de una instancia, sin leer argv. `init` es la cáscara que traduce banderas a esto, y
// el banco de evaluación lo llama directo: crear una instancia programáticamente no puede depender de
// cómo venga escrita la línea de comandos.
function scaffold(root, { name, mode, force = false, quiet = false }) {
  const preserved = copyTemplate(path.join(PROJECT_ROOT, 'template'), root, {
    '{{PROJECT_NAME}}': name,
    '{{MODE}}': mode,
    '{{WORKSPACE_PATH}}': mode === 'embedded' ? '.' : '..',
  }, force, providerNames(), quiet)
  // No se copia `.github/`: `ci.yml` valida el toolkit con `npm run ci` —que una instancia no tiene— y
  // el ciclo de aprendizaje dejó de distribuirse en 0.4.0. Copiar salteando lo que no aplica dejaba
  // `.github/workflows/` vacío en cada instancia.
  Object.assign(preserved, copyRuntime(
    path.join(PROJECT_ROOT, 'automatization', 'hooks'),
    path.join(root, 'automatization', 'hooks'),
    force,
    root,
  ))
  const version = require(path.join(PROJECT_ROOT, 'package.json')).version
  // El motor llega como dependencia para que el lockfile fije su versión. El repo ops es un sidecar:
  // declarar npm acá no convierte en Node al servicio de Go de al lado.
  declareEngine(path.join(root, 'package.json'), version)
  let deliveredPaths = {}
  for (const relative of O.trackedPaths()) {
    const dir = path.join(root, relative)
    if (fs.existsSync(dir)) deliveredPaths = M.record(root, relative, O.treeFiles(dir), deliveredPaths)
  }
  deliveredPaths = M.recordPaths(root, O.SYSTEM_FILES, deliveredPaths)
  // Adoptar Cauce en un repositorio con contenido es `init --force`, y lo que se conserva ahí lo
  // escribió la empresa. Registrarlo hasheando el disco lo declaraba entregado por Cauce con contenido
  // que Cauce nunca entregó, así que `localChanges` no veía ninguna edición y el `upgrade` siguiente lo
  // reemplazaba: entra con el digest del molde, y esa diferencia es lo que detiene al upgrade.
  //
  // Sólo se pisan claves que ya están: el manifiesto declara lo que Cauce rastrea, y un archivo propio
  // fuera de esa frontera no le incumbe.
  for (const [file, hash] of Object.entries(preserved)) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    if (relative in deliveredPaths) deliveredPaths[relative] = hash
  }
  M.write(root, deliveredPaths)
  // La instancia recuerda de qué versión salió: sin esto no hay actualización posible.
  const configFile = path.join(root, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  config.cauceVersion = version
  config.$schema = 'node_modules/@ingeniomaps/cauce/engine/schemas/ops-config.schema.json'
  F.atomicWriteJson(configFile, config)
  return root
}

function instanceVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8')).cauceVersion || ''
  } catch { return '' }
}

// Qué se pierde al borrar una instancia. Se cuenta antes de tocar nada porque es lo único que vuelve
// reversible la decisión: quien lee esto todavía puede no seguir.
// Lo cuenta el mismo parser que usan `check` y `tree`, no una expresión regular propia: los moldes traen
// ejemplos comentados, y contarlos a mano anunciaba una tarea en cola y otra terminada en una instancia
// recién creada. Un aviso que exagera lo que se pierde se deja de leer igual que uno que lo minimiza.
function whatIsLost(root) {
  const planning = path.join(root, 'planning')
  const queued = P.readBacklog(planning).reduce((total, hito) => total + (hito.tasks || []).length, 0)
  const humanActions = ST.pendingHumanActions(planning).length
  return {
    epicas: P.readEpics(planning).length,
    hechas: (P.readDone(planning).entries || []).length,
    enCola: queued,
    humanActions,
    contexto: !OB.guide(root).fresh,
    runners: [...new Set(Object.keys(M.readRunners(root)).map((key) => key.split('/')[0]))],
  }
}

// Saca la instancia entera y el wiring que dejó en cada runner. Existe porque la alternativa era una
// lista de pasos a mano —desinstalar cada runner y después `rm -rf`—, y una lista se ejecuta a medias:
// el orden importa, y borrar primero la carpeta deja al runner ejecutando guards que ya no existen.
//
// Nunca borra sin que alguien lo haya pedido dos veces. Lo que hay adentro —planning, organization, la
// evidencia de lo hecho— es del proyecto y no lo repone ningún `init`.
function destroy(dir, cli) {
  const root = path.resolve(dir || '.')
  if (!fs.existsSync(path.join(root, 'ops.config.json'))) {
    fail(`${root} no es una instancia de Cauce: falta ops.config.json.`, 2)
  }
  if (O.mode(root) === 'toolkit') fail(`${root} es el toolkit: acá se fabrica Cauce, no se lo borra.`, 2)

  const loss = whatIsLost(root)
  const lines = [
    loss.epicas && `${loss.epicas} épica(s) en el roadmap`,
    loss.enCola && `${loss.enCola} tarea(s) en la cola`,
    loss.hechas && `${loss.hechas} tarea(s) terminada(s) con su evidencia`,
    loss.humanActions && `${loss.humanActions} acción(es) humana(s) pendiente(s)`,
    loss.contexto && 'el contexto escrito en organization/',
  ].filter(Boolean)

  const embedded = O.mode(root) === 'embedded'
  if (!cli.has('--force')) {
    console.log(embedded
      ? `Sacar Cauce de ${root} se lleva:`
      : `Borrar ${root} se lleva:`)
    for (const textLine of lines) console.log(`  − ${textLine}`)
    if (!lines.length) console.log('  − nada escrito todavía: la instancia está como salió de init')
    if (loss.runners.length) {
      console.log(`  y saca el wiring de: ${loss.runners.join(', ')} (lo tuyo queda donde está)`)
    }
    if (embedded) {
      console.log('  el código del repositorio no se toca: en modo embebido la instancia es él mismo.')
    }
    console.log('\nNada de esto lo repone un init. Si es lo que querés: repetí con --force.')
    process.exit(1)
  }

  for (const runner of loss.runners) {
    try { A.uninstall(root, runner, console) } catch (error) { console.error(`  ${runner}: ${error.message}`) }
  }
  // El orden no es negociable: primero el wiring, después la carpeta. Al revés, cada llamada de
  // herramienta del runner queda ejecutando un guard que ya no está.
  // En modo embebido la instancia **es** el repositorio: borrar la carpeta se lleva el código del
  // producto, que Cauce nunca escribió y no repone nadie. Ahí se saca lo del toolkit y se deja el repo.
  if (O.mode(root) === 'embedded') {
    const ownPath = [
      'planning', 'organization', 'flows', 'integrations', 'automatization', 'tools',
      'ops.config.json', '.cauce', 'AGENTS.md',
    ]
    for (const relative of ownPath) fs.rmSync(path.join(root, relative), { recursive: true, force: true })
    console.log(`✓ ${ownPath.length} ruta(s) de Cauce quitadas de ${root}`)
    for (const line of undeclareEngine(path.join(root, 'package.json'))) console.log(`✓ ${line}`)
    const npm = ['node_modules', 'package-lock.json']
      .filter((one) => fs.existsSync(path.join(root, one)))
    if (npm.length) {
      console.log(`  queda ${npm.join(' y ')}: lo escribe npm y puede tener lo tuyo. Borralo vos si el`)
      console.log('  repositorio no usaba npm antes de instalar Cauce.')
    }
    return console.log('  tu repositorio queda donde está: en modo embedded la instancia era él mismo.')
  }
  const inside = process.cwd() === root || process.cwd().startsWith(`${root}${path.sep}`)
  fs.rmSync(root, { recursive: true, force: true })
  console.log(`✓ ${root} borrado`)
  // Correrlo desde adentro es lo natural —ahí está `tools/ops.js`— y deja la terminal en un directorio
  // que ya no existe: el próximo comando falla con un `getcwd` que no dice nada de esto.
  if (inside) console.log('  tu terminal quedó en esa carpeta: hacé "cd .." antes del próximo comando.')
}

// El rename de `teams/` a `flows/`, que ninguna instancia puede hacer sola. Mueve la carpeta y los dos
// archivos de cada recorrido propio; los del catálogo viajan en el paquete y no están acá. Si las dos
// carpetas existen no toca nada: alguien ya intervino y adivinar cuál manda sería peor que avisar.
function renameTeamsToFlows(root) {
  const before = path.join(root, 'teams')
  const after = path.join(root, 'flows')
  if (!fs.existsSync(before)) return []
  if (fs.existsSync(after)) return ['teams/ y flows/ conviven: movelo a mano, no adivino cuál manda']
  fs.renameSync(before, after)
  const moved = ['teams/ → flows/']
  for (const slug of fs.readdirSync(after)) {
    const dir = path.join(after, slug)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const [from, to] of [['team.json', 'flow.json'], ['WORKFLOW.md', 'FLOW.md']]) {
      if (!fs.existsSync(path.join(dir, from))) continue
      fs.renameSync(path.join(dir, from), path.join(dir, to))
      moved.push(`flows/${slug}/${from} → ${to}`)
    }
  }
  return moved
}

function upgrade(dir, cli) {
  const root = path.resolve(dir || '.')
  if (!fs.existsSync(path.join(root, 'ops.config.json'))) {
    fail(`${root} no es una instancia de Cauce: falta ops.config.json.`, 2)
  }
  // Acá se fabrica Cauce: `upgrade` reemplazaría con las copias de `template/` los archivos que este
  // repositorio mantiene en la raíz —`AGENTS.md` entre ellos, que es donde vive esta misma regla—.
  if (O.mode(root) === 'toolkit') {
    fail(`${root} es el toolkit: acá se edita Cauce, no se lo actualiza.`, 2)
  }
  // Antes que nada, y antes de los controles: `teams/` pasó a llamarse `flows/`, y los controles que
  // siguen miran las rutas nuevas. Sin esto `upgrade` copiaría `flows/` al lado y dejaría los
  // recorridos propios de la empresa en una carpeta que el motor ya no mira —presentes en disco e
  // invisibles para el catálogo, que es la pérdida que no avisa—.
  for (const line of renameTeamsToFlows(root)) console.log(`↳ ${line}`)

  const dry = cli.has('--check')
  const force = cli.has('--force')
  const from = instanceVersion(root)
  const to = require(path.join(PROJECT_ROOT, 'package.json')).version
  const system = O.systemPaths(root)
  const changed = O.localChanges(root)
  const overrides = O.overrides(root)

  // El código de salida lo aplica acá y no adentro: `--check` mira y cuenta, y quien decide qué hacer
  // con lo que vio es el comando. Escondido en la función que informa, el corte del flujo no se ve.
  if (dry) {
    const code = previewUpgrade({ from, to, changed })
    if (code) process.exit(code)
    return
  }

  // Antes de retirar nada, comprobar que no se lleve puesto aprendizaje acumulado.
  const rescue = O.retiredWithLearning(root)
  if (rescue.length && !force) {
    for (const file of rescue) console.error(`✗ ${file}`)
    fail(
      `\n${rescue.length} archivo(s) de aprendizaje quedaron en una ruta que Cauce ya no mantiene.\n\n` +
      'Movelos a un cargo propio en agents/roles/<slug>/learning/ y repetí, o descartalos con --force.',
    )
  }

  if (changed.length && !force) {
    for (const file of changed) console.error(`✗ ${file}`)
    fail(
      `\n${changed.length} archivo(s) que mantiene Cauce fueron editados y se perderían.\n\n` +
      `${adviceFor(changed)}\n\nSi el cambio ya no te sirve, repetí con --force para descartarlo.`,
    )
  }

  // Lo que una versión agrega y es del proyecto: se crea si falta y nunca se pisa. `systemPaths` no lo
  // incluye a propósito —lo reemplazaría en cada actualización, que es lo que un archivo del proyecto
  // no debe sufrir— así que sin este paso no llega por ninguna vía, y la instancia queda leyendo una
  // instrucción que apunta a un archivo que no tiene.
  const config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
  const added = []
  for (const relative of O.addedPaths()) {
    const target = path.join(root, relative)
    if (fs.existsSync(target)) continue
    const origin = path.join(PROJECT_ROOT, O.sourceOf(relative))
    if (!fs.existsSync(origin)) continue
    F.assertNoSymlinkPath(root, target)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    let content = fs.readFileSync(origin, 'utf8')
    for (const [key, value] of Object.entries({
      '{{PROJECT_NAME}}': config.project || path.basename(root),
      '{{MODE}}': O.mode(root),
      '{{WORKSPACE_PATH}}': O.mode(root) === 'embedded' ? '.' : '..',
    })) content = content.replaceAll(key, value)
    F.atomicWrite(target, content)
    added.push(relative)
  }

  // Qué bloque de runner se lleva puesto el reemplazo. `AGENTS.md` es del toolkit y se reemplaza
  // entero, con el bloque que `automation install` dejó adentro: la instancia lo recupera reinstalando
  // —el recordatorio de abajo ya lo pide— pero sin decir esto ese recordatorio no tiene causa visible,
  // y quien mire su archivo ve el bloque desaparecido sin explicación.
  const droppedBlocks = []
  for (const runner of [...new Set(Object.keys(M.readRunners(root)).map((key) => key.split('/')[0]))]) {
    // Sólo los archivos sueltos: `system` trae también colecciones, y un bloque de runner vive en un
    // archivo de instrucciones —hoy `AGENTS.md`—, nunca dentro de un directorio del sistema.
    for (const relative of O.SYSTEM_FILES) {
      const file = path.join(root, relative)
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue
      if (fs.readFileSync(file, 'utf8').includes(A.blockStart(runner))) droppedBlocks.push({ runner, relative })
    }
  }

  for (const relative of [...system, ...O.RUNTIME_PATHS]) {
    const origin = path.join(PROJECT_ROOT, O.sourceOf(relative))
    if (!fs.existsSync(origin)) continue
    const target = path.join(root, relative)
    // Sobrescribe lo que trae el paquete y deja intacto lo demás: un guard propio de la empresa,
    // o un adaptador de runner que el toolkit no conoce, sobreviven a la actualización.
    if (fs.statSync(origin).isDirectory()) copyRuntime(origin, target, false, root)
    else {
      F.assertNoSymlinkPath(root, target)
      F.atomicWrite(target, fs.readFileSync(origin, 'utf8'))
      // El modo también viene del paquete: `tools/ops.js` tiene shebang y sin esto cada upgrade lo
      // dejaba sin permiso de ejecución, con el cambio de modo apareciendo en el diff de la empresa.
      fs.chmodSync(target, fs.statSync(origin).mode & 0o777)
    }
  }

  // Retirar lo que el toolkit ya no distribuye, después de haber actualizado lo que sí.
  const retired = []
  for (const relative of O.RETIRED) {
    const target = path.join(root, relative)
    if (!fs.existsSync(target)) continue
    F.assertNoSymlinkPath(root, target)
    fs.rmSync(target, { recursive: true, force: true })
    retired.push(relative)
  }

  // Dejar registrado lo que se entregó, para poder distinguir después una edición local de una
  // mejora del toolkit.
  let record = M.read(root)
  for (const relative of O.trackedPaths()) {
    const dir = path.join(root, relative)
    if (fs.existsSync(dir)) record = M.record(root, relative, O.treeFiles(dir), record)
  }
  record = M.recordPaths(root, O.SYSTEM_FILES, record)
  // El registro de forks se poda igual que el de archivos: un cargo devuelto al catálogo deja su
  // entrada, y una entrada sin copia sólo puede producir avisos sobre algo que no está.
  const kept = Object.fromEntries(Object.entries(M.readForks(root)).filter(
    ([slug, record]) => fs.existsSync(path.join(root, 'agents', (record || {}).type || 'roles', slug)),
  ))
  M.write(root, M.prune(root, record), null, kept)

  config.cauceVersion = to
  F.atomicWriteJson(path.join(root, 'ops.config.json'), config)
  // Acá es donde las tres versiones se saben a la vez, así que es donde pueden quedar diciendo lo mismo.
  const pinned = pinEngine(root, to)

  reportUpgrade({ root, from, to, system, changed, retired, added, overrides, pinned, droppedBlocks })
}

module.exports = { copyTemplate, scaffold, providerNames, upgrade, destroy, PROJECT_ROOT }
