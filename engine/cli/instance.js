'use strict'

// El ciclo de vida de una instancia —crearla, actualizarla, borrarla— y las primitivas que materializan
// el molde en un directorio. Las primitivas viven acá y no en su propio módulo porque son la operación
// que define este archivo; `evaluate` y `integration` las piden prestadas para armar un banco y para
// sembrar un proveedor, que son la misma operación con otro destino.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const F = require('../core/files')
const O = require('../core/ownership')
const CL = require('../core/changelog')
const M = require('../core/manifest')
const OB = require('../core/onboarding')
const P = require('../planning/parser')
const ST = require('../planning/state')
const I = require('../integrations/registry')
const A = require('../automation')
const { fail } = require('./io')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

function providerNames() {
  try {
    const file = path.join(PROJECT_ROOT, 'template', 'integrations', 'config.json')
    return Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).providers || {})
  } catch { return [] }
}

function copyTemplate(source, target, replacements, force, skip = [], quiet = false) {
  F.assertNoSymlinkPath(path.dirname(target), target)
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue
    const from = path.join(source, entry.name)
    // npm no incluye un `.gitignore` dentro de un tarball, así que viaja sin punto y se restituye
    // acá. Sin esto el archivo existe en el repo del toolkit y desaparece para todo consumidor real.
    const to = path.join(target, entry.name === 'gitignore' ? '.gitignore' : entry.name)
    if (entry.isDirectory()) copyTemplate(from, to, replacements, force, skip, quiet)
    else {
      if (fs.existsSync(to)) {
        if (!force) fail(`El destino contiene ${to}. Usa un directorio vacío o --force.`)
        if (!quiet) console.log(`= conservado ${to}`)
        continue
      }
      let content = fs.readFileSync(from, 'utf8')
      for (const [key, value] of Object.entries(replacements)) content = content.replaceAll(key, value)
      F.atomicWrite(to, content)
      if (entry.name.endsWith('.js')) fs.chmodSync(to, 0o755)
      if (!quiet) console.log(`+ ${to}`)
    }
  }
}

function copyRuntime(source, target, preserve = false, boundary = target, skip = []) {
  F.assertNoSymlinkPath(boundary, target)
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isDirectory()) copyRuntime(from, to, preserve, boundary, skip)
    else if (preserve && fs.existsSync(to)) console.log(`= conservado ${to}`)
    else {
      F.assertNoSymlinkPath(boundary, to)
      fs.copyFileSync(from, to)
    }
  }
}

// Declara el motor como dependencia exacta: el lockfile decide qué versión corre, no una copia.
// Conserva el manifiesto existente porque el repo anfitrión puede tener el suyo.
function declareEngine(manifest, version) {
  let pkg = { name: path.basename(path.dirname(manifest)), private: true, version: '0.0.0' }
  if (fs.existsSync(manifest)) {
    try { pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) } catch (error) {
      fail(`package.json inválido en ${manifest}: ${error.message}`)
    }
  }
  pkg.devDependencies = { ...pkg.devDependencies, '@ingeniomaps/cauce': version }
  F.atomicWriteJson(manifest, pkg)
}

// La inversa exacta de `declareEngine`: saca la clave que puso y nada más. El resto del manifiesto es
// del repo anfitrión aunque hoy no tenga otra cosa —un `package.json` vacío puede ser lo que alguien
// escribió para tener scripts— así que el archivo se borra sólo si es idéntico al que `declareEngine`
// habría creado desde cero, sin dependencias, sin scripts y con su `version: 0.0.0`.
//
// Lo que no se toca nunca es `node_modules/` ni el lockfile: los escribe npm, pueden tener dependencias
// del proyecto y borrarlos por nuestra cuenta destruye trabajo ajeno. Se nombran en la salida, que es
// la mitad que faltaba: `destroy` decía «tu repositorio queda donde está» y dejaba un `package.json`
// cuya única dependencia era Cauce. En un repo Rust eso es basura conspicua y nadie avisaba.
function undeclareEngine(manifest) {
  if (!fs.existsSync(manifest)) return []
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) } catch { return [] }
  const dev = pkg.devDependencies || {}
  if (!('@ingeniomaps/cauce' in dev)) return []
  delete dev['@ingeniomaps/cauce']
  pkg.devDependencies = dev
  const generado = !Object.keys(dev).length && !Object.keys(pkg.dependencies || {}).length
    && !Object.keys(pkg.scripts || {}).length && pkg.private === true && pkg.version === '0.0.0'
  if (generado) {
    fs.rmSync(manifest, { force: true })
    return ['package.json (lo había creado init: sin dependencias ni scripts propios)']
  }
  if (!Object.keys(dev).length) delete pkg.devDependencies
  F.atomicWriteJson(manifest, pkg)
  return ['package.json: se quitó la dependencia del motor y el resto queda como estaba']
}

// Proveedores que el toolkit conoce, para saltearlos al copiar la plantilla: su andamiaje
// —configuración, staging/, proposed/— no se materializa hasta que alguien lo habilite. Antes cada

// El andamiaje de una instancia, sin leer argv. `init` es la cáscara que traduce banderas a esto, y
// el banco de evaluación lo llama directo: crear una instancia programáticamente no puede depender de
// cómo venga escrita la línea de comandos.
function scaffold(root, { name, mode, force = false, quiet = false }) {
  copyTemplate(path.join(PROJECT_ROOT, 'template'), root, {
    '{{PROJECT_NAME}}': name,
    '{{MODE}}': mode,
    '{{WORKSPACE_PATH}}': mode === 'embedded' ? '.' : '..',
  }, force, providerNames(), quiet)
  // No se copia `.github/`: `ci.yml` valida el toolkit con `npm run ci` —que una instancia no tiene— y
  // el ciclo de aprendizaje dejó de distribuirse en 0.4.0. Copiar salteando los dos únicos archivos
  // que existen dejaba `.github/workflows/` vacío en cada instancia.
  copyRuntime(
    path.join(PROJECT_ROOT, 'automatization', 'hooks'),
    path.join(root, 'automatization', 'hooks'),
    force,
    root,
  )
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
  M.write(root, deliveredPaths)
  // La instancia recuerda de qué versión salió: sin esto no hay actualización posible.
  const configFile = path.join(root, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  config.cauceVersion = version
  config.$schema = 'node_modules/@ingeniomaps/cauce/engine/schemas/ops-config.schema.json'
  F.atomicWriteJson(configFile, config)
  return root
}

// Qué trae la versión nueva, leído del paquete: sin esto el reemplazo de system/ es a ciegas.
function printChangelog(from, to) {
  const notes = CL.between(CL.read(PROJECT_ROOT), from, to)
  if (!notes.length) return
  for (const note of notes) {
    console.log(`\n  ── ${note.version} ──`)
    for (const line of note.body.split('\n')) if (line.trim()) console.log(`  ${line}`)
  }
  console.log('')
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
function loQueSePierde(root) {
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

  const loss = loQueSePierde(root)
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

// Actualiza sólo lo que el toolkit declara suyo. Todo lo demás —planning, organization, reglas
// propias, agentes editados— queda intacto por construcción, no por comparación.
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

  if (dry) {
    if (from === to) {
      // Contra el motor instalado, no contra lo publicado: la comparación es local y sin red. Decirlo
      // importa porque `init` fija la versión exacta, así que el motor no se mueve solo y esta línea,
      // a secas, se leía como «no hay nada nuevo» durante todas las versiones siguientes.
      console.log(`= ${to}: la instancia está al día con el motor instalado`)
      return console.log('  para traer una versión más nueva: npm install --save-dev @ingeniomaps/cauce@latest')
    }
    // Hacia atrás también es legítimo —una versión rompió algo y se vuelve—, pero anunciarlo como «hay
    // una versión más nueva» era mentir con el número a la vista. Y lo que corresponde imprimir es lo
    // contrario: no lo que se gana, sino lo que se deja.
    if (CL.compare(to, from) < 0) {
      console.log(`↩ volvés a ${to} desde ${from}. Esto es lo que dejás de tener:`)
      printChangelog(to, from)
    } else {
      console.log(`⚠ hay una versión más nueva: ${to} (la instancia tiene ${from || 'una previa'})`)
      printChangelog(from, to)
    }
    for (const file of changed) console.log(`  editado localmente: ${file}`)
    process.exit(1)
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
    // Tres clases distintas, y antes eran dos: todo lo que no vivía bajo `system/` recibía el consejo
    // del runtime, así que editar el protocolo respondía con cómo desactivar un guard. Cada una tiene
    // su salida y decirle la ajena manda a buscar una configuración que no existe.
    const ruleFiles = changed.filter((file) => file.includes('/system/'))
    const runtime = changed.filter((file) => !file.includes('/system/')
      && O.RUNTIME_PATHS.some((base) => file.startsWith(`${base}/`)))
    const docs = changed.filter((file) => !ruleFiles.includes(file) && !runtime.includes(file))
    const advice = []
    if (ruleFiles.length) {
      advice.push(
        'Las ruleFiles y decisiones bajo system/ son del toolkit. Para cambiar una, escribí la tuya al\n'
        + 'lado con el mismo ID: el proyecto manda y `check` lo reporta como override explícito.',
      )
    }
    if (runtime.length) {
      advice.push(
        'El runtime es del toolkit: en vez de editarlo, agregá lo tuyo al lado con otro nombre —un\n'
        + 'guard propio sobrevive a cada actualización— y registralo en la configuración de tu runner,\n'
        + 'que sí es del proyecto. Para desactivar un guard alcanza con quitarlo de esa configuración.',
      )
    }
    if (docs.length) {
      advice.push(
        'Esos docs son del toolkit y no llevan una línea de la empresa: se reemplazan enteros en\n'
        + 'cada actualización para que las mejoras lleguen. Lo que tu proyecto decide distinto va donde sí\n'
        + 'es suyo —una ADR propia, una regla propia, o `planning/delivery/project.md` para la entrega—.',
      )
    }
    fail(
      `\n${changed.length} archivo(s) que mantiene Cauce fueron editados y se perderían.\n\n` +
      `${advice.join('\n\n')}\n\nSi el cambio ya no te sirve, repetí con --force para descartarlo.`,
    )
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

  const config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
  config.cauceVersion = to
  F.atomicWriteJson(path.join(root, 'ops.config.json'), config)

  console.log(`✓ Cauce ${from || '(previa)'} → ${to}`)
  // Descartar con --force es legítimo; hacerlo sin dejar rastro no. Queda en la salida del comando,
  // que es la evidencia que el protocolo pide para cualquier cambio.
  for (const file of changed) console.log(`− descartado tu cambio en ${file}`)
  for (const relative of retired) console.log(`− retirado ${relative}: Cauce ya no lo distribuye`)
  printChangelog(from, to)
  console.log(`  ${system.length} ruta(s) del sistema y ${O.RUNTIME_PATHS.length} del runtime actualizadas`)
  for (const override of overrides) {
    console.log(`= conservado ${override.collection}/${override.project}: sobrescribe ${override.system}`)
  }
  console.log('  planning, organization y todo lo propio quedaron intactos')
  // No se borra: sin la dependencia declarada, quitarle `.ops/` la dejaría sin motor. Se avisa y
  // decide una persona.
  if (fs.existsSync(path.join(root, '.ops', 'engine'))) {
    console.log('\n⚠ esta instancia tiene el motor vendorizado en .ops/, que Cauce ya no distribuye.')
    console.log('  Corré "npm install" para tenerlo como dependencia y después borrá .ops/ a mano.')
  }
  // El wiring del runner no se actualiza solo: vive fuera de la instancia y lo escribe otro comando.
  // Sin este recordatorio, una mejora en un workflow o en el catálogo se queda en el paquete.
  const runners = Object.keys(M.readRunners(root))
    .map((key) => key.split('/')[0])
    .filter((name, index, all) => all.indexOf(name) === index)
  for (const name of runners) {
    console.log(`  reinstalá tu runner para que el wiring quede al día: make install-${name}`)
  }
  // Después de aplicar, no antes: recién acá el paquete tiene la versión nueva y la comparación dice
  // algo. Es además el momento en que alguien está mirando qué le trajo la actualización.
  const FK = require('../agents/fork')
  for (const entry of FK.drift(root)) console.log(`  ⚠ ${FK.driftLine(entry)}`)
}

module.exports = { copyTemplate, scaffold, providerNames, upgrade, destroy, PROJECT_ROOT }
