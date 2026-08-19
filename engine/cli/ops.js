#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const P = require('../planning/parser')
const B = require('../planning/business-rules')
const PC = require('../planning/contracts')
const I = require('../integrations/registry')
const L = require('../agents/learning')
const A = require('../automation')
const F = require('../core/files')
const O = require('../core/ownership')
const CL = require('../core/changelog')
const M = require('../core/manifest')
const SC = require('../core/scan')
const OB = require('../core/onboarding')
const C = require('../config/validate')
const T = require('../teams/registry')
const AG = require('../agents/catalog')
const EV = require('../agents/evaluations')
const { FLAGS, parse } = require('./args')
const BOOT = require('./bootstrap')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

// Dónde aterriza una instancia cuando nadie eligió: una carpeta propia junto al código.
const DEFAULT_TARGET = 'ops'

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

function usage() {
  console.log(`Uso:
  ops init [destino] [--name <nombre>] [--mode embedded|sidecar] [--force]
           [--runner claude|codex|gemini|antigravity] [--integration <proveedor>] [--install|--no-install]
  ops scan [workspace] [--json]
  ops onboard [ops-root] [--json]
  ops check <planning-dir> [--json]
  ops tree <planning-dir> [--no-color] [--json]
  ops context <planning-dir> [--json]
  ops upgrade <ops-root> [--check] [--force]
  ops archive <planning-dir> <NNN>
  ops integration list <ops-root>
  ops integration enable <ops-root> <provider>
  ops integration disable <ops-root> <provider>
  ops integration check <ops-root> [provider]
  ops integration sync <ops-root> <provider> [--fixture <json>]
  ops integration promote <ops-root> <provider> <remote-key>
  ops integration reset <ops-root> <provider> <remote-key>
  ops integration rebase <ops-root> <provider> <remote-key>
  ops integration reconcile <ops-root> <provider> <remote-key>
  ops integration writeback-plan <ops-root> <provider>
  ops automation list <ops-root>
  ops automation list-hooks <ops-root>
  ops automation check <ops-root>
  ops automation doctor <ops-root> claude|codex|gemini|antigravity
  ops automation install <ops-root> claude|codex|gemini|antigravity
  ops learn <agent> [--proposal] [--applied [--period <AAAA-MM>]]
  ops evaluate <agent> [--cases [--json]] [--bench [caso]] [--record [AAAA-MM-DD]]
  ops agents list [ops-root] [--own|--system] [--json]
  ops agents fork <cargo> [ops-root]
  ops team list
  ops team check <team>
  ops team show <team>`)
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

// Proveedores que el toolkit conoce, para saltearlos al copiar la plantilla: su andamiaje
// —configuración, staging/, proposed/— no se materializa hasta que alguien lo habilite. Antes cada
// instancia recibía el de un proveedor apagado que quizá no usaba nunca, y que nadie actualizaba.
function providerNames() {
  try {
    const file = path.join(PROJECT_ROOT, 'template', 'integrations', 'config.json')
    return Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).providers || {})
  } catch { return [] }
}

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
  let entregado = {}
  for (const relative of O.trackedPaths()) {
    const dir = path.join(root, relative)
    if (fs.existsSync(dir)) entregado = M.record(root, relative, O.treeFiles(dir), entregado)
  }
  entregado = M.recordPaths(root, O.SYSTEM_FILES, entregado)
  M.write(root, entregado)
  // La instancia recuerda de qué versión salió: sin esto no hay actualización posible.
  const configFile = path.join(root, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  config.cauceVersion = version
  config.$schema = 'node_modules/@ingeniomaps/cauce/engine/schemas/ops-config.schema.json'
  F.atomicWriteJson(configFile, config)
  return root
}

// Un banco de trabajo desechable donde un cargo del catálogo puede realmente trabajar.
//
// Hace falta porque el toolkit no es una raíz ops: el único `planning/` que vive acá es
// `template/planning`, el molde que se distribuye. Un cargo cuya entrega es una épica no tiene dónde
// escribir, así que se niega —con razón—, y su caso cuenta como fallo: eso midió una configuración.
//
// Uno por caso, y se aprendió corriendo: con un banco compartido los casos se leen entre sí, y uno
// tomó por «una sesión anterior de este mismo cargo» lo que otro acababa de escribir. La
// independencia entre casos es la premisa de medir con ellos.
//
// Se recrea entero en cada corrida —si no, lo que escribió el lunes es contexto del martes— y queda
// en disco, gitignorado: después de un veredicto raro uno quiere mirar qué escribió el cargo.
function evaluationBench(root, agent, caso, force) {
  const safe = (value) => {
    if (!/^[a-z0-9_][a-z0-9._-]*$/i.test(value) || value.includes('..')) {
      fail(`nombre inválido para el banco: ${value}`, 2)
    }
    return value
  }
  const dir = path.join(root, '.cauce-eval', safe(agent), safe(caso || '_libre'))
  // Recrear un banco donde alguien ya trabajó borra la evidencia de esa corrida, y el registro de la
  // evaluación se escribe **desde** el banco. Pasó de verdad: se rehizo un banco para probar otra cosa
  // y con él se fue lo que el cargo había escrito; el juez leyó un directorio vacío y concluyó que la
  // respuesta afirmaba algo inexistente. Con el banco versionado, «acá se trabajó» es una pregunta que
  // git contesta exacto.
  const sucio = spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' })
  if ((sucio.stdout || '').trim() && !force) {
    fail(`${dir} tiene trabajo sin recoger. Guardá el registro de esa corrida antes de rehacerlo, `
      + 'o usá --force si ya lo tenés.', 2)
  }
  fs.rmSync(dir, { recursive: true, force: true })
  scaffold(dir, { name: 'Banco de evaluación', mode: 'sidecar', quiet: true })
  // El motor por symlink: la misma resolución que en una instancia real —`node_modules/@ingeniomaps`—
  // sin pagar un `npm install` por corrida. El cargo llega a un banco donde el CLI funciona.
  const scope = path.join(dir, 'node_modules', '@ingeniomaps')
  fs.mkdirSync(scope, { recursive: true })
  fs.symlinkSync(PROJECT_ROOT, path.join(scope, 'cauce'), 'dir')

  // El artefacto del caso, si lo tiene: la guía del proveedor que el pedido manda implementar, el CSV
  // con instrucciones adentro. Entra antes del commit limpio a propósito — si entrara después, `status`
  // se lo atribuiría al cargo y el juez leería como obra suya el documento que vino a resistir.
  if (caso) {
    const artefacto = EV.fixtures(root, agent, caso)
    if (artefacto.files.length) fs.cpSync(artefacto.dir, dir, { recursive: true })
  }

  // Versionado desde su estado limpio porque la entrega de un cargo puede no estar en su respuesta:
  // uno contestó un resumen y escribió el contrato entero en su `INBOX.md`, y el juez —que sólo leía
  // la respuesta— lo dio por ausente. Con git, `status` y `diff` muestran qué produjo, separado del
  // andamiaje. Se ignora `node_modules`: es un symlink al toolkit, no obra del cargo.
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  fs.appendFileSync(path.join(dir, '.gitignore'), '\nnode_modules/\n')
  git('init', '-q')
  git('config', 'user.email', 'banco@cauce.local')
  git('config', 'user.name', 'banco de evaluación')
  git('add', '-A')
  git('commit', '-q', '-m', 'banco limpio')
  return dir
}

// Dónde va la instancia cuando nadie eligió destino. Parada frecuente: el dev ya creó `acme-ops/` y
// corre `init` adentro. Sin esto la instancia caía en `acme-ops/ops/` —una carpeta del toolkit dentro
// de otra— y el proyecto quedaba llamándose «acme-ops». La carpeta que ya nombra al toolkit es la
// instancia; no hay una segunda adentro.
function implicitTarget(cwd) {
  const base = path.basename(cwd)
  return base === DEFAULT_TARGET || base.endsWith('-ops') ? '.' : DEFAULT_TARGET
}

// El nombre sale de la carpeta del proyecto, no de la que aloja la instancia: `ops/` y `acme-ops/`
// nombran al toolkit, y quien lee `project` en la configuración espera leer «acme».
function defaultName(root) {
  const base = path.basename(root)
  return base === DEFAULT_TARGET ? path.basename(path.dirname(root)) : base.replace(/-ops$/, '')
}

// El motor no se instala solo: `npm install` baja el paquete que `init` acaba de declarar, y sin él el
// shim, los cargos, los equipos y los adaptadores no se resuelven. Correrlo desde acá es lo que hace que
// una instalación sea un comando y no una lista. En Windows el ejecutable es `npm.cmd`.
function npmInstall(root) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npm, ['install'], { cwd: root, stdio: 'inherit' })
  if (result.error) {
    console.error(`  no pude ejecutar npm (${result.error.code || result.error.message}).`)
    return 1
  }
  return result.status === null ? 1 : result.status
}

// Un `cli` que no tiene banderas, para reusar un comando desde otro: el `--force` de `init` habla del
// molde y no del wiring del runner, así que pasarle el suyo instalaría a la fuerza algo que nadie pidió.
const SIN_BANDERAS = { has: () => false, value: (_flag, fallback = '') => fallback }

// Lo que quedó pendiente, y sólo eso: cuando la instalación corrió, `check` ya se ejecutó y repetirlo
// como sugerencia hace dudar de que haya pasado.
function initSteps(enter, resultado) {
  if (resultado.instalado) return []
  const pasos = ['npm install']
  if (resultado.runner !== BOOT.SIN_RUNNER) {
    pasos.push(`node tools/ops.js automation install . ${resultado.runner}`)
  }
  pasos.push('node tools/ops.js check planning')
  return pasos.map((paso, indice) => `  siguiente: ${indice === 0 ? enter : ''}${paso}`)
}

async function init(target, cli) {
  // Sin destino la instancia va a `ops/` y en modo sidecar, en vez de volcarse donde esté parado el
  // dev: un monorepo que recibe `planning/`, `teams/`, `organization/` y `AGENTS.md` en su primer
  // nivel deja de distinguir qué es suyo y qué llegó del toolkit. Es el layout que `automation
  // install` ya asume —el wiring del runner va al padre, donde se abre la herramienta—, así que lo
  // único que faltaba era que fuera lo que pasa cuando no se elige nada.
  const root = path.resolve(target || implicitTarget(process.cwd()))
  const mode = cli.value('--mode', target ? 'embedded' : 'sidecar')
  if (!['embedded', 'sidecar'].includes(mode)) fail('--mode debe ser embedded o sidecar.', 2)
  const name = cli.value('--name', defaultName(root))
  const force = cli.has('--force')
  // `.git` no cuenta como contenido: es lo único que hay en la carpeta que alguien acaba de crear y
  // versionar para la instancia, y el toolkit no escribe nada adentro. Sin esta excepción el camino
  // más natural —`mkdir acme-ops && git init && cauce init`— pedía `--force` para no pisar nada.
  const existing = (fs.existsSync(root) ? fs.readdirSync(root) : []).filter((entry) => entry !== '.git')
  if (existing.length && !force) {
    fail(`El destino no está vacío: ${root}. Usa --force para agregar solo archivos faltantes.`)
  }
  scaffold(root, { name, mode, force })
  const relative = path.relative(process.cwd(), root)
  const enter = relative && relative !== '.' ? `cd ${relative} && ` : ''
  console.log(`\n✓ ${name}: sistema ops creado en ${root} (modo ${mode})`)

  // Preguntar exige una terminal, e instalar baja un paquete y escribe `node_modules`: las dos cosas
  // pasan cuando hay alguien mirando. Una corrida automatizada —CI, un contenedor, estas pruebas—
  // recibe la instancia materializada y decide por bandera, sin descargas ni preguntas implícitas.
  const interactivo = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  const opciones = {
    runner: cli.value('--runner'),
    integration: cli.value('--integration'),
    runners: A.RUNNER_NAMES,
    providers: providerNames(),
    interactive: interactivo,
    install: cli.has('--install') || (interactivo && !cli.has('--no-install')),
  }
  let resultado
  try {
    resultado = await BOOT.run(root, opciones, {
      log: console.log,
      npm: npmInstall,
      installRunner: (runner) => automation('install', root, runner, SIN_BANDERAS),
      enableProvider: (provider) => INTEGRATION.enable.run(root, provider),
    })
  } catch (error) { fail(error.message, 2) }

  if (resultado.instalado) {
    check(path.join(root, 'planning'), SIN_BANDERAS)
    // Una instancia recién instalada funciona y no sabe nada de este proyecto: `organization/` es el
    // molde y el roadmap está vacío. Llenarlo exige leer el repositorio y decidir qué es cada cosa, que
    // es justo lo que un CLI determinista no puede hacer; el recorrido vive en el runner, así que lo
    // único útil acá es decir cuál es y con qué se abre.
    // Las preguntas van acá y no en el recorrido del runner: quien acaba de instalar todavía no sabe
    // qué hace la herramienta, y mandarlo a invocar algo «con contexto» es pedirle que adivine qué
    // contexto. Esto es determinista, así que no cuesta nada imprimirlo siempre.
    console.log('')
    onboard(root, SIN_BANDERAS)
    if (resultado.runner !== BOOT.SIN_RUNNER) {
      console.log(`\nAbrí ${resultado.runner} en este directorio para que las escriba por vos.`)
    }
    console.log(`El ciclo empieza en ${path.join(relative || '.', 'planning', 'FLOW.md')}.`)
  }
  for (const paso of initSteps(enter, resultado)) console.log(paso)
  if (resultado.error) fail(`${resultado.error}: la instancia quedó creada pero todavía no funciona.`)
}

// Qué hay en el workspace, antes de que nadie razone sobre él. La raíz ops se saltea: no es un servicio
// del proyecto, y su `package.json` sólo declara el motor.
function scan(target, cli) {
  // Sólo el sidecar tiene su workspace afuera: la instancia es hija de la carpeta donde vive el código.
  // Cualquier otro modo —embedded, y este mismo repositorio, que es `toolkit`— escanea donde está
  // parado. Confundirlos hacía que un `scan` sin argumentos se fuera a recorrer la carpeta de al lado.
  const sidecar = O.mode(process.cwd()) === 'sidecar'
  const root = path.resolve(target || (sidecar ? path.join(process.cwd(), '..') : '.'))
  const result = SC.scan(root, sidecar ? process.cwd() : '')
  if (cli.has('--json')) return console.log(JSON.stringify(result, null, 2))
  console.log(`workspace ${result.root}`)
  if (result.rootManifests.length) {
    console.log(`. ${result.rootManifests.join(', ')}${comandos(result.rootCommands)}`)
  }
  for (const service of result.services) {
    console.log(`${service.path} [${service.runtimes.join(', ')}]${comandos(service.commands)}`)
  }
  const total = result.services.length + (result.rootManifests.length ? 1 : 0)
  console.log(`${total} candidato(s). Cuál es el producto y cuál quedó muerto lo decide una persona.`)
}

// Sólo lo declarado y de dónde salió: un comando inventado se lee igual que uno real.
function comandos(commands) {
  const entries = Object.entries(commands || {})
  if (!entries.length) return ' — sin comandos declarados'
  return ` — ${entries.map(([kind, value]) => `${kind}: ${value.command} (${value.source})`).join(', ')}`
}

// La guía de arranque: qué hay, qué falta y qué preguntar. Determinista y en milisegundos, porque es lo
// primero que ve alguien que acaba de instalar y todavía no sabe qué hace la herramienta.
function onboard(rootArg, cli) {
  const root = path.resolve(rootArg || '.')
  const sidecar = O.mode(root) === 'sidecar'
  const workspace = sidecar ? path.resolve(root, '..') : root
  const { services } = SC.scan(workspace, sidecar ? root : '')
  const state = OB.guide(root, services)
  if (cli.has('--json')) return console.log(JSON.stringify({ ...state, workspace, servicios: services }, null, 2))
  console.log(services.length
    ? `${services.length} servicio(s) en ${workspace}: ${services.map((service) => service.path).join(', ')}`
    : `Ningún proyecto en ${workspace} todavía.`)
  if (!state.fresh) {
    const escrito = [state.written.organization && 'organization/', state.written.roadmap && 'el roadmap']
      .filter(Boolean).join(' y ')
    console.log(`Esta instancia ya tiene ${escrito} escrito: el arranque no la va a pisar.`)
    return
  }
  console.log('\nPara arrancar hacen falta cuatro respuestas que el repositorio no puede dar:\n')
  for (const [index, question] of state.questions.entries()) console.log(`  ${index + 1}. ${question.text}`)
  console.log('\nContestalas y el recorrido de arranque escribe con eso organization/, el mapa real de')
  console.log('AGENTS.md y la primera épica. Con un runner instalado: /onboard <tus respuestas>.')
}

function check(dir, cli) {
  const root = path.resolve(dir || '.')
  const errors = []
  const warnings = []
  const required = ['BACKLOG.md', 'WIP.md', 'DONE.md', 'INBOX.md', 'HUMAN_ACTIONS.md', 'PROTOCOL.md']
  for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`falta ${file}`)

  const configPath = path.join(root, '..', 'ops.config.json')
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8')
      const config = JSON.parse(raw)
      if (!raw.includes('{{')) {
        errors.push(...C.validateOpsConfig(config))
        if (Array.isArray(config.workspaceRoots)) {
          for (const workspace of config.workspaceRoots) {
            if (workspace && workspace.name && workspace.path
              && !fs.existsSync(path.resolve(path.dirname(configPath), workspace.path))) {
              errors.push(`ops.config.json: no existe la raíz ${workspace.name} (${workspace.path})`)
            }
          }
        }
      }
    } catch (error) {
      errors.push(`ops.config.json: JSON inválido (${error.message})`)
    }
  } else {
    warnings.push(`no existe ${path.relative(root, configPath)}`)
  }

  const epics = P.readEpics(root)
  const milestones = P.readBacklog(root)
  const done = P.readDone(root)
  errors.push(...B.validate(path.join(root, 'business-rules')))
  errors.push(...PC.validateRoadmapStructure(root))
  const backlog = milestones.flatMap((milestone) => milestone.tasks)
  const backlogSlugs = new Set(backlog.map((task) => task.slug))
  const epicNums = new Set()
  const storySlugs = new Set()

  for (const duplicate of done.duplicates) errors.push(`DONE duplicado: ${duplicate}`)
  for (const epic of epics) {
    const at = `roadmap/${epic.file}`
    errors.push(...PC.validateEpic(epic, done.set))
    if (!/^\d{3}$/.test(epic.num)) errors.push(`${at}: epic debe ser NNN`)
    if (epicNums.has(epic.num)) errors.push(`${at}: número de épica duplicado ${epic.num}`)
    epicNums.add(epic.num)
    if (!epic.title) errors.push(`${at}: falta title`)
    if (!P.EPIC_STATES.includes(epic.status)) errors.push(`${at}: status inválido "${epic.status}"`)
    if (!epic.criteria.length) errors.push(`${at}: falta al menos un criterio observable`)
    if (!epic.stories.length) errors.push(`${at}: falta al menos una historia`)
    if (!epic.hasContext) errors.push(`${at}: falta "## Contexto relevante"`)
    const criteria = new Set(epic.criteria.map((criterion) => criterion.id))
    for (const story of epic.stories) {
      if (storySlugs.has(story.slug)) errors.push(`${at}: slug de historia duplicado ${story.slug}`)
      storySlugs.add(story.slug)
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(story.slug)) errors.push(`${at}: slug inválido ${story.slug}`)
      if (!story.criteria.length) errors.push(`${at}: ${story.slug} no rastrea a un criterio`)
      for (const criterion of story.criteria) {
        if (!criteria.has(criterion)) errors.push(`${at}: ${story.slug} cita ${criterion}, que no existe`)
      }
      if (!story.service) errors.push(`${at}: ${story.slug} no declara (service: <ruta>)`)
    }
    const missing = epic.stories.filter((story) => !done.set.has(story.slug))
    if (epic.status === 'active' && !missing.length) errors.push(`${at}: active sin historias pendientes; debe cerrar`)
  }

  const milestoneSlugs = new Set()
  for (const milestone of milestones) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(milestone.slug)) errors.push(`hito con slug inválido: ${milestone.slug}`)
    if (milestoneSlugs.has(milestone.slug)) errors.push(`hito duplicado: ${milestone.slug}`)
    milestoneSlugs.add(milestone.slug)
    for (const task of milestone.tasks) {
      if (!task.service) errors.push(`BACKLOG ${task.slug}: falta (service: <ruta>)`)
      if (!task.acceptance && !(task.epic && task.criteria.length)) {
        errors.push(`BACKLOG ${task.slug}: falta aceptación explícita o criterio heredado`)
      }
      const storyExists = epics.some((epic) => {
        return epic.num === task.epic && epic.stories.some((story) => story.slug === task.slug)
      })
      if (task.epic && !storyExists) {
        errors.push(`BACKLOG ${task.slug}: no existe en epic-${task.epic}`)
      }
      if (done.set.has(task.slug)) errors.push(`${task.slug}: está en BACKLOG y DONE`)
    }
  }

  const wip = P.readWip(root)
  if (wip && !backlogSlugs.has(wip.task) && !done.set.has(wip.task)) {
    errors.push(`WIP ${wip.task}: no existe en BACKLOG ni DONE`)
  }
  for (const entry of done.entries) {
    if (!entry.acceptance) errors.push(`${entry.source} ${entry.slug}: falta acept:`)
    if (!entry.done) errors.push(`${entry.source} ${entry.slug}: falta done:`)
    if (!entry.qa) errors.push(`${entry.source} ${entry.slug}: falta qa:`)
    if (!entry.commit) errors.push(`${entry.source} ${entry.slug}: falta commit:`)
    errors.push(...PC.validateDoneEntry(entry))
  }

  const integration = I.validate(path.resolve(root, '..'))
  errors.push(...integration.errors)
  warnings.push(...integration.warnings)

  // Sobrescribir una entrada de system/ es legítimo y esperado; lo que no puede pasar es que
  // ocurra en silencio, porque esa entrada deja de recibir las mejoras del toolkit.
  for (const override of O.overrides(path.resolve(root, '..'))) {
    warnings.push(`${override.collection}/${override.project} sobrescribe ${override.system} (override explícito)`)
  }
  // Misma regla para los cargos, que es donde más caro sale: un fork se hace una vez y se olvida.
  const FK = require('../agents/fork')
  for (const entry of FK.drift(path.resolve(root, '..'))) warnings.push(FK.driftLine(entry))

  if (cli.has('--json')) {
    console.log(JSON.stringify({
      ok: !errors.length,
      epics: epics.length,
      queued: backlog.length,
      done: done.entries.length,
      wip: wip ? wip.task : null,
      errors,
      warnings,
    }))
    if (errors.length) process.exit(1)
    return
  }

  for (const warning of warnings) console.warn(`⚠ ${warning}`)
  for (const error of errors) console.error(`✗ ${error}`)
  if (errors.length) fail(`\n${errors.length} error(es), ${warnings.length} advertencia(s)`)
  console.log(
    `✓ planning válido: ${epics.length} épica(s), ${backlog.length} tarea(s) en cola, ` +
      `${done.entries.length} terminada(s)`,
  )
}

// Estado observable de planning sin mutar nada; base común de `tree` y de sus salidas.
function snapshot(root) {
  const milestones = P.readBacklog(root)
  return {
    epics: P.readEpics(root),
    milestones,
    done: P.readDone(root),
    wip: P.readWip(root),
    inbox: P.readInbox(root),
    queued: new Set(milestones.flatMap((m) => m.tasks.map((t) => t.slug))),
  }
}

function treeJson({ epics, milestones, done, wip, inbox, queued }) {
  const state = (slug) => done.set.has(slug) ? 'done' : queued.has(slug) ? 'queued' : 'pending'
  console.log(JSON.stringify({
    roadmap: epics.map((epic) => ({
      num: epic.num,
      title: epic.title,
      status: epic.status,
      stories: epic.stories.map((story) => ({ slug: story.slug, state: state(story.slug) })),
    })),
    backlog: milestones.map((milestone) => ({
      slug: milestone.slug,
      tasks: milestone.tasks.map((task) => ({ slug: task.slug, tier: task.tier || '' })),
    })),
    wip: wip ? { task: wip.task, phase: wip.phase, complete: wip.complete, pending: wip.pending } : null,
    inbox: { deuda: inbox.deuda, ideas: inbox.ideas, propuestas: inbox.propuestas, lecciones: inbox.lecciones },
    done: done.entries.length,
  }))
}

function tree(dir, cli) {
  const root = path.resolve(dir || '.')
  const state = snapshot(root)
  if (cli.has('--json')) return treeJson(state)
  const { epics, milestones, done, wip, inbox, queued } = state
  const color = process.stdout.isTTY && !cli.has('--no-color')
  const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text
  console.log(`\n${paint('1', 'CAUCE')}\n`)
  console.log(paint('1', 'ROADMAP'))
  if (!epics.length) console.log('  (sin épicas)')
  for (const epic of epics) {
    const mark = epic.status === 'closed' ? '✓' : epic.status === 'active' ? '◐' : '●'
    console.log(`  ${mark} epic-${epic.num} ${epic.title} [${epic.status}]`)
    for (const story of epic.stories) {
      const mark = done.set.has(story.slug) ? '✓' : queued.has(story.slug) ? '▶' : '○'
      console.log(`      ${mark} ${story.slug}`)
    }
  }
  console.log(`\n${paint('1', 'BACKLOG')}`)
  if (!milestones.length) console.log('  (sin hitos activos)')
  for (const milestone of milestones) {
    console.log(`  ${milestone.heading}`)
    for (const task of milestone.tasks) console.log(`      ☐ ${task.slug}${task.tier ? ` [${task.tier}]` : ''}`)
  }
  const wipText = wip
    ? `▶ ${wip.task} · ${wip.phase} · ${wip.complete}✓/${wip.pending}○`
    : 'idle'
  console.log(`\n${paint('1', 'WIP')}  ${wipText}`)
  console.log(
    `${paint('1', 'INBOX')}  ${inbox.deuda} deuda · ${inbox.ideas} ideas · ` +
      `${inbox.propuestas} propuestas · ${inbox.lecciones} lecciones` +
      // Sin esto, doce viñetas sin nombre se veían como un inbox vacío y nadie se enteraba.
      (inbox.skipped ? `  (${inbox.skipped} sin contar: falta el nombre en **negrita**)` : ''),
  )
  console.log(`${paint('1', 'DONE')}   ${done.entries.length} tareas\n`)
}

// Acciones humanas pendientes: filas de la tabla que todavía no declaran un estado resuelto.
function pendingHumanActions(root) {
  const rows = P.read(path.join(root, 'HUMAN_ACTIONS.md')).split('\n')
    .filter((line) => /^\|/.test(line) && !/^\|\s*-+/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
  return rows.filter((cells) => cells.length >= 4 && !/^tarea$/i.test(cells[0])
    && !/resuelt|cerrad|done|listo/i.test(cells[1]))
    .map((cells) => ({ task: cells[0], state: cells[1], action: cells[3] }))
}

// Selecciona la tarea que un runner debe ejecutar ahora, con la misma precedencia que el protocolo:
// WIP activo primero —es el mutex y manda incluso si tiene una acción humana abierta—, si no la
// primera tarea no terminada y no bloqueada del primer hito.
function currentTask({ milestones, done, wip }, blockers = []) {
  const queue = milestones.flatMap((milestone) => milestone.tasks.map((task) => ({ ...task, hito: milestone.slug })))
  if (wip) {
    const active = queue.find((task) => task.slug === wip.task)
      || { slug: wip.task, hito: '', tier: '', service: wip.service, acceptance: '', epic: '', criteria: [] }
    return { task: active, skipped: [] }
  }
  const blocked = new Set(blockers.map((action) => action.task))
  const pending = queue.filter((task) => !done.set.has(task.slug))
  return {
    task: pending.find((task) => !blocked.has(task.slug)) || null,
    skipped: pending.filter((task) => blocked.has(task.slug)).map((task) => task.slug),
  }
}

// Contexto mínimo suficiente para ejecutar una tarea, en lugar de releer roadmap, BACKLOG y WIP enteros.
function context(dir, cli) {
  const root = path.resolve(dir || '.')
  const state = snapshot(root)
  const gate = path.join(root, 'AWAITING_REVIEW.md')
  const humanActions = pendingHumanActions(root)
  const { task, skipped } = currentTask(state, humanActions)
  const epic = task ? state.epics.find((candidate) => candidate.num === task.epic) : null
  const criteria = epic ? epic.criteria.filter((criterion) => task.criteria.includes(criterion.id)) : []
  const report = {
    blocked: fs.existsSync(gate) ? 'awaiting-review' : '',
    task: task && {
      slug: task.slug, hito: task.hito, tier: task.tier, service: task.service,
      // Una tarea puede heredar su aceptación del criterio citado; el runner necesita el texto, no la cita.
      acceptance: task.acceptance || criteria.map((criterion) => criterion.text).join(' '),
      epic: task.epic,
    },
    criteria,
    epic: epic ? { num: epic.num, title: epic.title, status: epic.status } : null,
    wip: state.wip ? { phase: state.wip.phase, complete: state.wip.complete, pending: state.wip.pending } : null,
    queued: state.milestones.reduce((total, milestone) => total + milestone.tasks.length, 0),
    blockedTasks: skipped,
    humanActions,
  }
  if (cli.has('--json')) return console.log(JSON.stringify(report))

  if (report.blocked) {
    const first = P.read(gate).split('\n').find((line) => line.trim() && !line.startsWith('#')) || ''
    return console.log(`BLOCKED  awaiting-review — ${first.trim()}`)
  }
  if (!report.task) return console.log('TASK   (sin tarea disponible)')
  console.log(`TASK   ${report.task.slug}${report.task.tier ? ` [${report.task.tier}]` : ''}` +
    `${report.task.service ? `  service: ${report.task.service}` : ''}` +
    `${report.task.hito ? `  hito: ${report.task.hito}` : ''}`)
  if (report.epic) console.log(`EPIC   ${report.epic.num} ${report.epic.title} [${report.epic.status}]`)
  if (report.task.acceptance) console.log(`ACEPT  ${report.task.acceptance}`)
  for (const criterion of criteria) console.log(`${criterion.id.padEnd(6)} ${criterion.text}`)
  const wip = report.wip ? `${report.wip.phase} · ${report.wip.complete}✓/${report.wip.pending}○` : 'idle'
  console.log(`WIP    ${wip}`)
  if (report.blockedTasks.length) console.log(`SKIP   ${report.blockedTasks.join(', ')} (acción humana abierta)`)
  for (const action of report.humanActions) console.log(`HUMAN  ${action.task}: ${action.action}`)
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
  const dry = cli.has('--check')
  const force = cli.has('--force')
  const from = instanceVersion(root)
  const to = require(path.join(PROJECT_ROOT, 'package.json')).version
  const system = O.systemPaths(root)
  const changed = O.localChanges(root)
  const overrides = O.overrides(root)

  if (dry) {
    if (from === to) return console.log(`= ${to}: la instancia está al día`)
    console.log(`⚠ hay una versión más nueva: ${to} (la instancia tiene ${from || 'una previa'})`)
    printChangelog(from, to)
    for (const file of changed) console.log(`  editado localmente: ${file}`)
    process.exit(1)
  }

  // Antes de retirar nada, comprobar que no se lleve puesto aprendizaje acumulado.
  const rescatar = O.retiredWithLearning(root)
  if (rescatar.length && !force) {
    for (const file of rescatar) console.error(`✗ ${file}`)
    fail(
      `\n${rescatar.length} archivo(s) de aprendizaje quedaron en una ruta que Cauce ya no mantiene.\n\n` +
      'Movelos a un cargo propio en agents/roles/<slug>/learning/ y repetí, o descartalos con --force.',
    )
  }

  if (changed.length && !force) {
    for (const file of changed) console.error(`✗ ${file}`)
    const reglas = changed.filter((file) => file.includes('/system/'))
    const runtime = changed.filter((file) => !file.includes('/system/'))
    const guia = []
    if (reglas.length) {
      guia.push(
        'Las reglas y decisiones bajo system/ son del toolkit. Para cambiar una, escribí la tuya al\n'
        + 'lado con el mismo ID: el proyecto manda y `check` lo reporta como override explícito.',
      )
    }
    if (runtime.length) {
      guia.push(
        'El runtime es del toolkit: en vez de editarlo, agregá lo tuyo al lado con otro nombre —un\n'
        + 'guard propio sobrevive a cada actualización— y registralo en la configuración de tu runner,\n'
        + 'que sí es del proyecto. Para desactivar un guard alcanza con quitarlo de esa configuración.',
      )
    }
    fail(
      `\n${changed.length} archivo(s) que mantiene Cauce fueron editados y se perderían.\n\n` +
      `${guia.join('\n\n')}\n\nSi el cambio ya no te sirve, repetí con --force para descartarlo.`,
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
  const retirado = []
  for (const relative of O.RETIRED) {
    const target = path.join(root, relative)
    if (!fs.existsSync(target)) continue
    F.assertNoSymlinkPath(root, target)
    fs.rmSync(target, { recursive: true, force: true })
    retirado.push(relative)
  }

  // Dejar registrado lo que se entregó, para poder distinguir después una edición local de una
  // mejora del toolkit.
  let registro = M.read(root)
  for (const relative of O.trackedPaths()) {
    const dir = path.join(root, relative)
    if (fs.existsSync(dir)) registro = M.record(root, relative, O.treeFiles(dir), registro)
  }
  registro = M.recordPaths(root, O.SYSTEM_FILES, registro)
  // El registro de forks se poda igual que el de archivos: un cargo devuelto al catálogo deja su
  // entrada, y una entrada sin copia sólo puede producir avisos sobre algo que no está.
  const vivos = Object.fromEntries(Object.entries(M.readForks(root)).filter(
    ([slug, record]) => fs.existsSync(path.join(root, 'agents', (record || {}).type || 'roles', slug)),
  ))
  M.write(root, M.prune(root, registro), null, vivos)

  const config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
  config.cauceVersion = to
  F.atomicWriteJson(path.join(root, 'ops.config.json'), config)

  console.log(`✓ Cauce ${from || '(previa)'} → ${to}`)
  // Descartar con --force es legítimo; hacerlo sin dejar rastro no. Queda en la salida del comando,
  // que es la evidencia que el protocolo pide para cualquier cambio.
  for (const file of changed) console.log(`− descartado tu cambio en ${file}`)
  for (const relative of retirado) console.log(`− retirado ${relative}: Cauce ya no lo distribuye`)
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

// La raíz ops de un comando que no la recibe. El shim `tools/ops.js` la exporta porque sabe dónde
// vive: sin eso, invocarlo desde otra carpeta —lo normal en sidecar— la resolvía contra el cwd.
function opsRoot(dir) {
  return path.resolve(dir || process.env.OPS_ROOT || '.')
}

function agentsFork(slug, dir) {
  const root = opsRoot(dir)
  if (!slug) fail('Falta el cargo: ops agents fork <cargo> [ops-root]', 2)
  let result
  const date = new Date().toISOString().slice(0, 10)
  try { result = require('../agents/fork').fork(root, slug, date) } catch (error) { fail(error.message, 2) }
  console.log(`+ ${path.relative(root, result.dir)} (${result.files.length} archivo(s))`)
  if (result.skipped.length) {
    console.log(`  quedan en el catálogo: ${result.skipped.length} artefacto(s) que ganó su versión`)
  }
  console.log(`  copiado de Cauce ${result.version || '(versión desconocida)'}; desde ahora lo mantenés vos`)
  console.log(`  reinstalá tu runner para que ${slug} apunte a tu copia`)
}

// Lista los cargos visibles resolviendo la precedencia; evita que cada consumidor —CI incluido—
// reimplemente el recorrido del catálogo.
function agents(action, dir, extra, cli) {
  if (action === 'fork') return agentsFork(dir, extra)
  if (action !== 'list') fail(`Acción de agents desconocida: ${action || '(vacía)'}`, 2)
  const root = opsRoot(dir)
  // Una empresa mantiene sus cargos, no los nuestros: `learn` sobre uno del catálogo se niega, así que
  // recorrer los 48 para encontrar el suyo es ruido. `--own` es lo que hace ejecutable ese recorrido.
  const own = cli.has('--own')
  const system = cli.has('--system')
  const roles = AG.list(root).filter((role) => (own ? !role.system : true) && (system ? role.system : true))
  if (cli.has('--json')) {
    // `path` viene resuelto: quien consuma esto no debería reconstruir dónde ganó la precedencia.
    return console.log(JSON.stringify(roles.map((role) => ({
      slug: role.slug, type: role.type, system: role.system, summary: role.summary,
      path: path.relative(root, role.dir).split(path.sep).join('/'),
    }))))
  }
  // Una línea por cargo, alineadas, para elegir a quién asignarle una tarea sin abrir 47 carpetas.
  const ancho = roles.reduce((max, role) => Math.max(max, role.slug.length), 0)
  for (const role of roles) {
    const marca = role.system ? '' : ' (propio)'
    console.log(`${role.slug.padEnd(ancho)}${marca}  ${role.summary || '— sin resumen'}`)
  }
  // La respuesta negativa tiene que ser tan barata como la positiva: si ninguna línea encaja, el
  // camino no es forzar el cargo más parecido, es escribir el propio.
  if (roles.length && !own) {
    console.log('\nSi ninguno encaja, escribí el tuyo en agents/roles/<slug>/ — es tuyo y gana sobre '
      + 'el catálogo.\nSi encaja uno pero lo querés más enfocado en tu empresa: '
      + 'organization/roles/<slug>.md para el contexto, u "ops agents fork <slug>" para adoptarlo.')
  }
}

function archive(dir, rawNum) {
  const root = path.resolve(dir || '.')
  const num = String(rawNum || '').padStart(3, '0')
  if (!/^\d{3}$/.test(num)) fail('La épica debe ser NNN.', 2)
  const epic = P.readEpics(root).find((candidate) => candidate.num === num)
  if (!epic) fail(`No existe epic-${num}.`, 2)
  if (epic.status !== 'closed') fail(`epic-${num} no está cerrada (status: ${epic.status}).`)
  const target = path.join(root, 'done', `epic-${num}.md`)
  const source = path.join(root, 'DONE.md')
  const content = P.read(source)
  const slugs = new Set(epic.stories.map((story) => story.slug))
  const entries = P.readDone(root).entries.filter((entry) => entry.source === 'DONE.md' && slugs.has(entry.slug))
  if (!entries.length) {
    if (fs.existsSync(target)) return console.log(`= epic-${num} ya estaba archivada`)
    fail(`No hay entradas de epic-${num} en DONE.md.`)
  }
  let updated = content
  for (const entry of entries) updated = updated.replace(entry.raw, '').replace(/\n{3,}/g, '\n\n')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (!fs.existsSync(target)) {
    F.atomicWrite(
      target,
      `---\nepic: ${num}\nstatus: archived\n---\n\n# DONE — ${epic.title}\n\n` +
        `${entries.map((entry) => entry.raw).join('\n\n')}\n`,
    )
  }
  F.atomicWrite(source, `${updated.trimEnd()}\n`)
  console.log(`✓ epic-${num}: ${entries.length} entrada(s) archivadas`)
}

// El registro de proveedores, leído igual por todos los que lo tocan. `list` lo parseaba suelto y un
// archivo roto salía como un error de JSON sin contexto.
function providerRegistry(root) {
  const file = path.join(root, 'integrations', 'config.json')
  try { return { file, config: JSON.parse(fs.readFileSync(file, 'utf8')) } } catch (error) {
    return fail(`integrations/config.json ilegible: ${error.message}`)
  }
}

// Si el proveedor terminó su propia configuración. Son dos interruptores y `sync` exige los dos: el
// del registro dice que está conectado al proyecto, éste que hay a dónde apuntar.
function providerReady(root, name) {
  try {
    const suyo = path.join(root, 'integrations', name, 'config.json')
    return JSON.parse(fs.readFileSync(suyo, 'utf8')).enabled === true
  } catch { return false }
}

function switchProvider(root, provider, enabled) {
  const { file, config } = providerRegistry(root)
  if (!config.providers || !config.providers[provider]) {
    fail(`${provider} no está en integrations/config.json.`)
  }
  config.providers[provider].enabled = enabled
  F.atomicWriteJson(file, config)
}

// Una entrada por acción, con lo que exige antes de correr. Eran nueve `if` seguidos, cada uno
// repitiendo su propia validación de argumentos; acá el despachador la hace una vez y lee de la tabla.
const INTEGRATION = {
  list: {
    run: (root) => {
      for (const [name, entry] of Object.entries(providerRegistry(root).config.providers || {})) {
        const listo = providerReady(root, name)
        const estado = !entry.enabled ? '○' : (listo ? '●' : '◐')
        const nota = estado === '◐'
          ? `  — falta completar integrations/${name}/config.json y poner enabled: true`
          : ''
        console.log(`${estado} ${name} [${entry.adapter}]${nota}`)
      }
    },
  },
  enable: {
    falta: 'Falta <provider>.',
    run: (root, provider) => {
      const source = path.join(PROJECT_ROOT, 'template', 'integrations', provider)
      if (!fs.existsSync(source)) fail(`Cauce no trae un adaptador para ${provider}.`, 2)
      // Habilitar no es inicializar: repone lo que falte y conserva lo que ya esté. Una instancia que
      // trae el andamiaje de una versión anterior —o que ya tiene snapshots— sólo quiere el interruptor.
      providerRegistry(root)
      copyTemplate(source, path.join(root, 'integrations', provider), {}, true)
      switchProvider(root, provider, true)
      console.log(`✓ ${provider}: conectado al proyecto y andamiaje en integrations/${provider}/.`)
      // Sólo se pide lo que falta: reencender un proveedor ya configurado no debería mandar a
      // completar un archivo que la empresa terminó hace meses.
      if (providerReady(root, provider)) {
        console.log(`  Su configuración ya estaba completa: "integration sync" puede correr.`)
        return
      }
      console.log(`  Falta lo tuyo: completá integrations/${provider}/config.json y poné enabled: true ahí.`)
      console.log(`  Hasta entonces "integration sync" se niega, que es lo correcto: no hay a dónde apuntar.`)
    },
  },
  // Apagar no desinstala: `integrations/<proveedor>/` puede tener snapshots y borradores de la
  // empresa, y borrarlos para desconectar una integración sería perder trabajo suyo. El andamiaje
  // queda, callado, y volver a encenderlo no pierde nada.
  disable: {
    falta: 'Falta <provider>.',
    run: (root, provider) => {
      switchProvider(root, provider, false)
      console.log(`✓ ${provider}: desconectado del proyecto. "integration sync" deja de correrlo.`)
      if (fs.existsSync(path.join(root, 'integrations', provider))) {
        console.log(`  integrations/${provider}/ queda como está: ahí pueden vivir snapshots y borradores tuyos.`)
      }
    },
  },
  check: {
    run: (root, provider) => {
      const result = I.validate(root, provider || '')
      for (const warning of result.warnings) console.warn(`⚠ ${warning}`)
      for (const error of result.errors) console.error(`✗ ${error}`)
      if (result.errors.length) fail(`${result.errors.length} error(es) de integración`)
      console.log(`✓ integraciones válidas${provider ? `: ${provider}` : ''}`)
    },
  },
  sync: {
    falta: 'sync exige <provider>',
    run: async (root, provider, key, cli) => {
      const result = await I.sync(root, provider, { fixture: cli.value('--fixture') })
      console.log(
        `✓ ${provider}: ${result.total} items · ${result.created} nuevos · ` +
          `${result.refreshed} refrescados · ${result.preserved} curados preservados`,
      )
      // Lo que el remoto dejó de tener sí cambia el staging, y se contaba sin decirlo: un item que
      // desaparece se borra o queda marcado según tenga curación. Se nombra sólo cuando pasó, porque
      // en la corrida normal los dos son cero y anunciarlo cada vez es ruido.
      if (result.removed) console.log(`  − ${result.removed} sin curar se fueron del remoto y se borraron`)
      if (result.missing) {
        console.log(`  ⚠ ${result.missing} con curación ya no están en el remoto: quedan marcados`)
      }
    },
  },
  promote: {
    falta: 'promote exige <provider> <remote-key>',
    exigeKey: true,
    run: (root, provider, key) => {
      const result = I.promote(root, provider, key)
      console.log(`✓ ${provider}:${result.key} promovido como ${result.kind}`)
    },
  },
  'writeback-plan': {
    falta: 'writeback-plan exige <provider>',
    run: (root, provider) => console.log(JSON.stringify(I.writebackPlan(root, provider), null, 2)),
  },
}

// Las tres reconciliaciones son el mismo comando con otra operación: se declaran en el mismo lugar
// para que agregar una cuarta no pida tocar el despachador.
for (const operacion of ['reset', 'rebase', 'reconcile']) {
  INTEGRATION[operacion] = {
    falta: `${operacion} exige <provider> <remote-key>`,
    exigeKey: true,
    run: (root, provider, key) => {
      const changed = I.reconcile(root, provider, operacion, [key])
      console.log(`✓ ${provider}: ${operacion} aplicado a ${changed.join(', ')}`)
    },
  }
}

async function integration(action, rootArg, provider, key, cli) {
  const paso = INTEGRATION[action]
  if (!paso) fail(`Acción de integración desconocida: ${action || '(vacía)'}`, 2)
  if (paso.falta && (!provider || (paso.exigeKey && !key))) fail(paso.falta, 2)
  await paso.run(path.resolve(rootArg || '.'), provider, key, cli)
}

function automation(action, rootArg, runnerName, cli) {
  const root = opsRoot(rootArg)
  if (action === 'list-hooks') return A.listHooks()
  if (action === 'list') {
    for (const name of A.RUNNER_NAMES) {
      const runner = A.runnerManifest(root, name)
      const installed = fs.existsSync(path.join(root, runner.config.target))
      const capabilities = Object.entries(runner.capabilities)
        .filter(([, enabled]) => enabled)
        .map(([capability]) => capability)
        .join(', ')
      console.log(`${installed ? '●' : '○'} ${name}${installed ? ' [instalado]' : ''} · ${capabilities}`)
    }
    return
  }
  if (action === 'check') {
    const errors = A.check(root)
    for (const error of errors) console.error(`✗ ${error}`)
    if (errors.length) fail(`${errors.length} error(es) de automatización`)
    console.log(
      `✓ automatización válida: ${A.GUARD_NAMES.length} guards, ${A.RUNNER_NAMES.length} adaptadores`,
    )
    return
  }
  if (action === 'doctor') {
    let result
    try { result = A.doctor(root, runnerName) } catch (error) { fail(error.message, 2) }
    if (result.errors.length) {
      fail(`${runnerName}: ${result.errors.length} error(es), ${result.warnings.length} advertencia(s)`)
    }
    console.log(`✓ ${runnerName}: adaptador operativo (${result.warnings.length} advertencia(s))`)
    return
  }
  if (action === 'install') {
    let runner
    const force = cli.has('--force')
    try { runner = A.install(root, runnerName, console, { force }) } catch (error) { fail(error.message, 2) }
    if (runnerName === 'codex') {
      console.log('  Codex pedirá revisar y confiar en hooks nuevos al iniciar sesión.')
    }
    if (!runner.capabilities.nativeHooks) {
      console.log(`  ${runnerName} no expone hooks nativos; aplica guards como prechecks.`)
    }
    const result = A.doctor(root, runnerName)
    if (result.errors.length) fail(`${runnerName}: instalación incompleta`)
    console.log(`✓ ${runnerName}: adaptador operativo (${result.warnings.length} advertencia(s))`)
    return
  }
  fail(`Acción de automatización desconocida: ${action || '(vacía)'}`, 2)
}
function learn(agent, cli) {
  try {
    // Sellar es determinista y por eso vive acá y no en el recorrido: marcar una propuesta como
    // aplicada editando frontmatter a mano es justo el paso que un agente hace mal en silencio.
    if (cli.has('--applied')) {
      const result = L.seal(opsRoot(), agent, cli.value('--period'))
      const relative = path.relative(opsRoot(), result.file)
      return console.log(result.already
        ? `= ${relative} ya estaba aplicada`
        : `✓ ${relative} queda aplicada: no se vuelve a aplicar`)
    }
    const result = cli.has('--proposal')
      ? L.prepareProposal(opsRoot(), agent)
      : L.prepareReport(opsRoot(), agent)
    console.log(`${result.created ? '+' : '='} ${path.relative(opsRoot(), result.file)}`)
    if (typeof result.reports === 'number') console.log(`  ${result.reports} informe(s) semanal(es) incluidos`)
  } catch (error) { fail(error.message, 2) }
}

function evaluate(agent, caso, cli) {
  const root = opsRoot()
  // El banco sólo tiene sentido acá: en una empresa el cargo que se evalúa es suyo —propio o
  // adoptado— y su `planning/` ya es el lugar legítimo donde trabajar.
  if (cli.has('--bench')) {
    if (O.mode(root) !== 'toolkit') {
      fail('--bench es del toolkit. En una instancia, el cargo trabaja sobre tu planning/: si es del '
        + `catálogo, adoptalo primero con "ops agents fork ${agent}".`, 2)
    }
    // El caso es el posicional que sigue al cargo: `evaluate <cargo> --bench <caso>`. Sin él se arma
    // un banco suelto, para mirarlo a mano; una corrida real pide uno por caso.
    return console.log(evaluationBench(root, agent, caso, cli.has('--force')))
  }
  try {
    // Los casos, para que un recorrido los ejecute. Sin `--json` no tiene sentido: es entrada de
    // máquina, no de persona.
    if (cli.has('--cases')) {
      const cases = EV.list(root, agent)
      const prohibido = EV.behaviors(root, agent).forbidden
      // La salida legible no lleva la conducta prohibida: `agent-propose` cuenta sus líneas para saber
      // cuántos casos hay, y una línea de más se contaría como un caso.
      if (!cli.has('--json')) {
        for (const item of cases) console.log(`${item.id}  ${item.expected.length} comportamiento(s)`)
        return
      }
      // La conducta prohibida viaja junto a los casos y no dentro de cada uno: rige para los seis, y
      // repetirla por caso invitaría a que alguien la editara en uno solo.
      return console.log(JSON.stringify({ cases, forbidden: prohibido }))
    }
    // Dónde escribir el registro de esta corrida. Lo pregunta el recorrido en vez de componer el
    // nombre, que es lo que hacía que la segunda corrida de un día borrara a la primera.
    if (cli.has('--record')) {
      const dia = cli.value('--record') || new Date().toISOString().slice(0, 10)
      return console.log(path.relative(root, path.join(EV.resultsDir(root, agent), EV.nextResult(root, agent, dia))))
    }
    const result = L.evaluate(root, agent)
    const runs = EV.validate(root, agent)
    const errors = [...result.errors, ...runs.errors]
    for (const warning of runs.warnings) console.warn(`⚠ ${warning}`)
    for (const error of errors) console.error(`✗ ${error}`)
    if (errors.length) fail(`\n${errors.length} error(es)`, 1)
    const corrida = runs.last ? `${runs.last.passed}/${runs.last.total} pasan (${runs.last.date})` : 'sin correr'
    console.log(
      `✓ ${agent}: ${result.cases} caso(s) — ${corrida}, ${result.proposals} propuesta(s)` +
        `${result.pending ? ` (${result.pending} sin aplicar)` : ''}, ` +
        'controles estructurales válidos',
    )
  } catch (error) { fail(error.message, 2) }
}

function team(action, slug, cli) {
  if (action === 'list') {
    for (const name of T.list(opsRoot())) console.log(name)
    return
  }
  if (!['check', 'show'].includes(action)) fail(`Acción de team desconocida: ${action || '(vacía)'}`, 2)
  try {
    const result = T.validate(opsRoot(), slug)
    for (const error of result.errors) console.error(`✗ ${error}`)
    if (result.errors.length) fail(`${slug}: ${result.errors.length} error(es)`, 1)
    if (action === 'show') {
      // El manifiesto entero, para que un workflow ejecute las etapas sin que un modelo lo parsee.
      if (cli.has('--json')) return console.log(JSON.stringify(result.manifest))
      console.log(`${result.manifest.name} (${slug})`)
      console.log(result.manifest.purpose)
      for (const stage of result.manifest.stages) {
        console.log(`- ${stage.id}: ${stage.agent} → ${stage.produces.join(', ')}`)
      }
    } else {
      console.log(`✓ ${slug}: ${result.stages} etapa(s), ${result.agents} agente(s), contrato válido`)
    }
  } catch (error) { fail(error.message, 2) }
}

async function run(cli) {
  const [command] = cli.positional
  if (!command || ['help', '--help', '-h'].includes(command)) return usage()
  if (!FLAGS[command]) { usage(); fail(`Comando desconocido: ${command}`, 2) }
  // `--help` valía sólo como primer argumento: `check --help` corría `check` contra el directorio
  // actual en vez de explicarse.
  if (cli.has('--help') || cli.has('-h')) return usage()
  const sobran = cli.unknown(command)
  if (sobran.length) {
    const acepta = FLAGS[command].length ? `Acepta: ${FLAGS[command].join(', ')}.` : 'No acepta banderas.'
    fail(`${command}: bandera desconocida ${sobran.join(', ')}. ${acepta}`, 2)
  }
  const arg = cli.positional
  if (command === 'init') await init(arg[1], cli)
  else if (command === 'scan') scan(arg[1], cli)
  else if (command === 'onboard') onboard(arg[1], cli)
  else if (command === 'check') check(arg[1], cli)
  else if (command === 'tree') tree(arg[1], cli)
  else if (command === 'context') context(arg[1], cli)
  else if (command === 'upgrade') upgrade(arg[1], cli)
  else if (command === 'agents') agents(arg[1], arg[2], arg[3], cli)
  else if (command === 'archive') archive(arg[1], arg[2])
  else if (command === 'integration') {
    await integration(arg[1], arg[2], arg[3], arg[4], cli)
  }
  else if (command === 'automation') automation(arg[1], arg[2], arg[3], cli)
  else if (command === 'learn') learn(arg[1], cli)
  else if (command === 'evaluate') evaluate(arg[1], arg[2], cli)
  else if (command === 'team') team(arg[1], arg[2], cli)
}

run(parse(process.argv.slice(2))).catch((error) => fail(error.message))
