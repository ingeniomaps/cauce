#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
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
const C = require('../config/validate')
const T = require('../teams/registry')
const AG = require('../agents/catalog')
const EV = require('../agents/evaluations')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

function usage() {
  console.log(`Uso:
  ops init <destino> [--name <nombre>] [--mode embedded|sidecar] [--force]
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
  ops learn <agent> [--proposal]
  ops evaluate <agent> [--cases [--json]]
  ops agents list [ops-root] [--json]
  ops team list
  ops team check <team>
  ops team show <team>`)
}

// Banderas que consumen el argumento siguiente: su valor no es un posicional.
const VALUED_FLAGS = new Set(['--name', '--mode', '--fixture'])

// Los posicionales del comando, salteando banderas y sus valores. Leer `process.argv` crudo hacía
// que `agents list --json` tomara `--json` como la raíz: el catálogo salía vacío, sin error, y quien
// lo consumía —un agente, por ejemplo— no tenía cómo notar que le habían contestado con nada.
function positionals() {
  const found = []
  const argv = process.argv.slice(2)
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) { found.push(value); continue }
    if (VALUED_FLAGS.has(value)) index += 1
  }
  return found
}

function option(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

function copyTemplate(source, target, replacements, force, skip = []) {
  F.assertNoSymlinkPath(path.dirname(target), target)
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue
    const from = path.join(source, entry.name)
    // npm no incluye un `.gitignore` dentro de un tarball, así que viaja sin punto y se restituye
    // acá. Sin esto el archivo existe en el repo del toolkit y desaparece para todo consumidor real.
    const to = path.join(target, entry.name === 'gitignore' ? '.gitignore' : entry.name)
    if (entry.isDirectory()) copyTemplate(from, to, replacements, force, skip)
    else {
      if (fs.existsSync(to)) {
        if (!force) fail(`El destino contiene ${to}. Usa un directorio vacío o --force.`)
        console.log(`= conservado ${to}`)
        continue
      }
      let content = fs.readFileSync(from, 'utf8')
      for (const [key, value] of Object.entries(replacements)) content = content.replaceAll(key, value)
      F.atomicWrite(to, content)
      if (entry.name.endsWith('.js')) fs.chmodSync(to, 0o755)
      console.log(`+ ${to}`)
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

// Proveedores que el toolkit conoce. El andamiaje de cada uno —configuración, staging/, proposed/—
// no se materializa hasta que alguien lo habilite: hoy una instancia recibe 32 KB de un proveedor
// apagado que quizá no use nunca, y que nadie actualiza después.
function providerNames() {
  try {
    const file = path.join(PROJECT_ROOT, 'template', 'integrations', 'config.json')
    return Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).providers || {})
  } catch { return [] }
}

function init(target) {
  if (!target) fail('Falta <destino>.', 2)
  const mode = option('--mode', 'embedded')
  if (!['embedded', 'sidecar'].includes(mode)) fail('--mode debe ser embedded o sidecar.', 2)
  const name = option('--name', path.basename(path.resolve(target)).replace(/-ops$/, ''))
  const root = path.resolve(target)
  const existing = fs.existsSync(root) ? fs.readdirSync(root) : []
  if (existing.length && !process.argv.includes('--force')) {
    fail(`El destino no está vacío: ${root}. Usa --force para agregar solo archivos faltantes.`)
  }
  copyTemplate(path.join(PROJECT_ROOT, 'template'), root, {
    '{{PROJECT_NAME}}': name,
    '{{MODE}}': mode,
    '{{PLANNING_DIR}}': 'planning',
    '{{WORKSPACE_PATH}}': mode === 'embedded' ? '.' : '..',
  }, process.argv.includes('--force'), providerNames())
  // No se copia `.github/`: `ci.yml` valida el toolkit con `npm run ci` —que una instancia no tiene— y
  // el ciclo de aprendizaje dejó de distribuirse en 0.4.0. Copiar salteando los dos únicos archivos
  // que existen dejaba `.github/workflows/` vacío en cada instancia.
  const preserve = process.argv.includes('--force')
  copyRuntime(
    path.join(PROJECT_ROOT, 'automatization', 'hooks'),
    path.join(root, 'automatization', 'hooks'),
    preserve,
    root,
  )
  const version = require(path.join(PROJECT_ROOT, 'package.json')).version
  // El motor siempre llega como dependencia. La alternativa era vendorizarlo en `.ops/`, y no valía:
  // Node hace falta igual en los dos casos —el motor, los guards y los workflows son JavaScript—, así
  // que la copia sólo ahorraba este `package.json` de seis líneas a cambio de 5 MB en la historia de
  // la empresa y de no tener cómo enterarse de que salió una versión nueva.
  //
  // El repo ops es un sidecar: declarar npm acá no convierte en Node al servicio de Go de al lado.
  declareEngine(path.join(root, 'package.json'), version)
  let entregado = {}
  for (const relative of O.trackedPaths()) {
    const dir = path.join(root, relative)
    if (fs.existsSync(dir)) entregado = M.record(root, relative, O.treeFiles(dir), entregado)
  }
  M.write(root, entregado)
  // La instancia recuerda de qué versión salió: sin esto no hay actualización posible.
  const configFile = path.join(root, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  config.cauceVersion = version
  config.$schema = 'node_modules/@ingeniomaps/cauce/engine/schemas/ops-config.schema.json'
  F.atomicWriteJson(configFile, config)
  console.log(`\n✓ ${name}: sistema ops creado en ${root}`)
  console.log('  siguiente: npm install (el motor viene de la dependencia)')
  console.log(`  siguiente: node ${path.join(root, 'tools', 'ops.js')} check ${path.join(root, 'planning')}`)
}

function check(dir) {
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

  if (process.argv.includes('--json')) {
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

function tree(dir) {
  const root = path.resolve(dir || '.')
  const state = snapshot(root)
  if (process.argv.includes('--json')) return treeJson(state)
  const { epics, milestones, done, wip, inbox, queued } = state
  const color = process.stdout.isTTY && !process.argv.includes('--no-color')
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
      `${inbox.propuestas} propuestas · ${inbox.lecciones} lecciones`,
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
function context(dir) {
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
  if (process.argv.includes('--json')) return console.log(JSON.stringify(report))

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
  console.log(`WIP    ${report.wip ? `${report.wip.phase} · ${report.wip.complete}✓/${report.wip.pending}○` : 'idle'}`)
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

// Sobrescribe lo que trae el paquete y deja intacto lo demás: un guard propio de la empresa,
// o un adaptador de runner que el toolkit no conoce, sobreviven a la actualización.
function overlayTree(from, to, root, skip = []) {
  F.assertNoSymlinkPath(root, to)
  copyRuntime(from, to, false, root, skip)
}

// Actualiza sólo lo que el toolkit declara suyo. Todo lo demás —planning, organization, reglas
// propias, agentes editados— queda intacto por construcción, no por comparación.
function upgrade(dir) {
  const root = path.resolve(dir || '.')
  if (!fs.existsSync(path.join(root, 'ops.config.json'))) {
    fail(`${root} no es una instancia de Cauce: falta ops.config.json.`, 2)
  }
  const dry = process.argv.includes('--check')
  const force = process.argv.includes('--force')
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
    if (fs.statSync(origin).isDirectory()) overlayTree(origin, target, root)
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
  M.write(root, M.prune(root, registro))

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
}

// Lista los cargos visibles resolviendo la precedencia; evita que cada consumidor —CI incluido—
// reimplemente el recorrido del catálogo.
// La raíz ops de un comando que no la recibe. El shim `tools/ops.js` la exporta porque sabe dónde
// vive: sin eso, invocarlo desde otra carpeta —lo normal en sidecar— la resolvía contra el cwd.
function opsRoot(dir) {
  return path.resolve(dir || process.env.OPS_ROOT || '.')
}

function agents(action, dir) {
  if (action !== 'list') fail(`Acción de agents desconocida: ${action || '(vacía)'}`, 2)
  const root = opsRoot(dir)
  const roles = AG.list(root)
  if (process.argv.includes('--json')) {
    // `path` viene resuelto: quien consuma esto no debería reconstruir dónde ganó la precedencia.
    return console.log(JSON.stringify(roles.map((role) => ({
      slug: role.slug, type: role.type, system: role.system,
      path: path.relative(root, role.dir).split(path.sep).join('/'),
    }))))
  }
  for (const role of roles) console.log(`${role.slug}${role.system ? '' : '  (propio)'}`)
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

async function integration(action, rootArg, provider, key) {
  const root = path.resolve(rootArg || '.')
  if (action === 'list') {
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'integrations', 'config.json'), 'utf8'))
    // Hay dos interruptores y `sync` exige los dos: el del registro dice que el proveedor está
    // conectado al proyecto, el suyo propio que su configuración está terminada. Mostrar sólo el
    // primero daba encendido a un proveedor que se habría negado a sincronizar.
    for (const [name, entry] of Object.entries(registry.providers || {})) {
      let listo = false
      try {
        listo = JSON.parse(fs.readFileSync(path.join(root, 'integrations', name, 'config.json'), 'utf8')).enabled === true
      } catch { /* sin materializar */ }
      const estado = !entry.enabled ? '○' : (listo ? '●' : '◐')
      const nota = estado === '◐' ? `  — falta completar integrations/${name}/config.json y poner enabled: true` : ''
      console.log(`${estado} ${name} [${entry.adapter}]${nota}`)
    }
    return
  }
  if (action === 'enable') {
    if (!provider) fail('Falta <provider>.', 2)
    const source = path.join(PROJECT_ROOT, 'template', 'integrations', provider)
    if (!fs.existsSync(source)) fail(`Cauce no trae un adaptador para ${provider}.`, 2)
    const registry = path.join(root, 'integrations', 'config.json')
    let config
    try { config = JSON.parse(fs.readFileSync(registry, 'utf8')) } catch (error) {
      fail(`integrations/config.json ilegible: ${error.message}`)
    }
    if (!config.providers || !config.providers[provider]) fail(`${provider} no está en integrations/config.json.`)
    // Habilitar no es inicializar: repone lo que falte y conserva lo que ya esté. Una instancia que
    // trae el andamiaje de una versión anterior —o que ya tiene snapshots— sólo quiere el interruptor.
    copyTemplate(source, path.join(root, 'integrations', provider), {}, true)
    config.providers[provider].enabled = true
    F.atomicWriteJson(registry, config)
    console.log(`✓ ${provider}: conectado al proyecto y andamiaje en integrations/${provider}/.`)
    // Sólo se pide lo que falta: reencender un proveedor ya configurado no debería mandar a
    // completar un archivo que la empresa terminó hace meses.
    let listo = false
    try {
      const suyo = path.join(root, 'integrations', provider, 'config.json')
      listo = JSON.parse(fs.readFileSync(suyo, 'utf8')).enabled === true
    } catch { /* sin configurar */ }
    if (listo) console.log(`  Su configuración ya estaba completa: "integration sync" puede correr.`)
    else {
      console.log(`  Falta lo tuyo: completá integrations/${provider}/config.json y poné enabled: true ahí.`)
      console.log(`  Hasta entonces "integration sync" se niega, que es lo correcto: no hay a dónde apuntar.`)
    }
    return
  }
  // Apagar no desinstala: `integrations/<proveedor>/` puede tener snapshots y borradores de la
  // empresa, y borrarlos para desconectar una integración sería perder trabajo suyo. El andamiaje
  // queda, callado, y volver a encenderlo no pierde nada.
  if (action === 'disable') {
    if (!provider) fail('Falta <provider>.', 2)
    const registry = path.join(root, 'integrations', 'config.json')
    let config
    try { config = JSON.parse(fs.readFileSync(registry, 'utf8')) } catch (error) {
      fail(`integrations/config.json ilegible: ${error.message}`)
    }
    if (!config.providers || !config.providers[provider]) fail(`${provider} no está en integrations/config.json.`)
    config.providers[provider].enabled = false
    F.atomicWriteJson(registry, config)
    console.log(`✓ ${provider}: desconectado del proyecto. "integration sync" deja de correrlo.`)
    const dir = path.join(root, 'integrations', provider)
    if (fs.existsSync(dir)) {
      console.log(`  integrations/${provider}/ queda como está: ahí pueden vivir snapshots y borradores tuyos.`)
    }
    return
  }
  if (action === 'check') {
    const result = I.validate(root, provider || '')
    for (const warning of result.warnings) console.warn(`⚠ ${warning}`)
    for (const error of result.errors) console.error(`✗ ${error}`)
    if (result.errors.length) fail(`${result.errors.length} error(es) de integración`)
    console.log(`✓ integraciones válidas${provider ? `: ${provider}` : ''}`)
    return
  }
  if (action === 'sync') {
    if (!provider) fail('sync exige <provider>', 2)
    const result = await I.sync(root, provider, { fixture: option('--fixture') })
    console.log(
      `✓ ${provider}: ${result.total} items · ${result.created} nuevos · ` +
        `${result.refreshed} refrescados · ${result.preserved} curados preservados`,
    )
    return
  }
  if (action === 'promote') {
    if (!provider || !key) fail('promote exige <provider> <remote-key>', 2)
    const result = I.promote(root, provider, key)
    console.log(`✓ ${provider}:${result.key} promovido como ${result.kind}`)
    return
  }
  if (['reset', 'rebase', 'reconcile'].includes(action)) {
    if (!provider || !key) fail(`${action} exige <provider> <remote-key>`, 2)
    const changed = I.reconcile(root, provider, action, [key])
    console.log(`✓ ${provider}: ${action} aplicado a ${changed.join(', ')}`)
    return
  }
  if (action === 'writeback-plan') {
    if (!provider) fail('writeback-plan exige <provider>', 2)
    console.log(JSON.stringify(I.writebackPlan(root, provider), null, 2))
    return
  }
  fail(`Acción de integración desconocida: ${action || '(vacía)'}`, 2)
}

function automation(action, rootArg, runnerName) {
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
    console.log(`✓ automatización válida: 11 guards, ${A.RUNNER_NAMES.length} adaptadores`)
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
    const force = process.argv.includes('--force')
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
function learn(agent) {
  try {
    const result = process.argv.includes('--proposal')
      ? L.prepareProposal(opsRoot(), agent)
      : L.prepareReport(opsRoot(), agent)
    console.log(`${result.created ? '+' : '='} ${path.relative(opsRoot(), result.file)}`)
    if (typeof result.reports === 'number') console.log(`  ${result.reports} informe(s) semanal(es) incluidos`)
  } catch (error) { fail(error.message, 2) }
}

function evaluate(agent) {
  const root = opsRoot()
  try {
    // Los casos, para que un recorrido los ejecute. Sin `--json` no tiene sentido: es entrada de
    // máquina, no de persona.
    if (process.argv.includes('--cases')) {
      const cases = EV.list(root, agent)
      if (!process.argv.includes('--json')) {
        for (const item of cases) console.log(`${item.id}  ${item.expected.length} comportamiento(s)`)
        return
      }
      return console.log(JSON.stringify(cases))
    }
    const result = L.evaluate(root, agent)
    const runs = EV.validate(root, agent)
    for (const warning of runs.warnings) console.warn(`⚠ ${warning}`)
    for (const error of [...result.errors, ...runs.errors]) console.error(`✗ ${error}`)
    if (result.errors.length + runs.errors.length) {
      fail(`\n${result.errors.length + runs.errors.length} error(es)`, 1)
    }
    const corrida = runs.last ? `${runs.last.passed}/${runs.last.total} pasan (${runs.last.date})` : 'sin correr'
    console.log(
      `✓ ${agent}: ${result.cases} caso(s) — ${corrida}, ${result.proposals} propuesta(s), ` +
        'controles estructurales válidos',
    )
  } catch (error) { fail(error.message, 2) }
}

function team(action, slug) {
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
      if (process.argv.includes('--json')) return console.log(JSON.stringify(result.manifest))
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

async function main() {
  const command = process.argv[2]
  if (!command || ['help', '--help', '-h'].includes(command)) return usage()
  const arg = positionals()
  if (command === 'init') init(arg[1])
  else if (command === 'check') check(arg[1])
  else if (command === 'tree') tree(arg[1])
  else if (command === 'context') context(arg[1])
  else if (command === 'upgrade') upgrade(arg[1])
  else if (command === 'agents') agents(arg[1], arg[2])
  else if (command === 'archive') archive(arg[1], arg[2])
  else if (command === 'integration') {
    await integration(arg[1], arg[2], arg[3], arg[4])
  }
  else if (command === 'automation') automation(arg[1], arg[2], arg[3])
  else if (command === 'learn') learn(arg[1])
  else if (command === 'evaluate') evaluate(arg[1])
  else if (command === 'team') team(arg[1], arg[2])
  else { usage(); fail(`Comando desconocido: ${command}`, 2) }
}

main().catch((error) => fail(error.message))
