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
const C = require('../config/validate')
const T = require('../teams/registry')
const AG = require('../agents/catalog')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

function usage() {
  console.log(`Uso:
  ops init <destino> [--name <nombre>] [--mode embedded|sidecar] [--engine copy|dependency] [--force]
  ops check <planning-dir> [--json]
  ops tree <planning-dir> [--no-color] [--json]
  ops context <planning-dir> [--json]
  ops upgrade <ops-root> [--check] [--force]
  ops archive <planning-dir> <NNN>
  ops integration list <ops-root>
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
  ops evaluate <agent>
  ops agents list [ops-root] [--json]
  ops team list
  ops team check <team>
  ops team show <team>`)
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
    const to = path.join(target, entry.name)
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
  }, process.argv.includes('--force'))
  copyTemplate(path.join(PROJECT_ROOT, 'agents'), path.join(root, 'agents'), {
    '{{PROJECT_NAME}}': name,
    '{{MODE}}': mode,
    '{{PLANNING_DIR}}': 'planning',
    '{{WORKSPACE_PATH}}': mode === 'embedded' ? '.' : '..',
  }, process.argv.includes('--force'))
  copyTemplate(path.join(PROJECT_ROOT, 'teams'), path.join(root, 'teams'), {
    '{{PROJECT_NAME}}': name,
    '{{MODE}}': mode,
    '{{PLANNING_DIR}}': 'planning',
    '{{WORKSPACE_PATH}}': mode === 'embedded' ? '.' : '..',
  }, process.argv.includes('--force'))
  // `ci.yml` valida el toolkit con `npm run ci`; una instancia no tiene ese script ni sus pruebas.
  copyTemplate(path.join(PROJECT_ROOT, '.github', 'workflows'), path.join(root, '.github', 'workflows'), {
    '{{PROJECT_NAME}}': name,
    '{{MODE}}': mode,
    '{{PLANNING_DIR}}': 'planning',
    '{{WORKSPACE_PATH}}': mode === 'embedded' ? '.' : '..',
  }, process.argv.includes('--force'), ['ci.yml'])
  const preserve = process.argv.includes('--force')
  copyRuntime(
    path.join(PROJECT_ROOT, 'automatization', 'hooks'),
    path.join(root, 'automatization', 'hooks'),
    preserve,
    root,
  )
  copyRuntime(
    path.join(PROJECT_ROOT, 'automatization', 'runners'),
    path.join(root, 'automatization', 'runners'),
    preserve,
    root,
    // El README de runners lo provee el template: le habla al proyecto, no a quien desarrolla Cauce.
    O.TEMPLATE_OWNED.filter((owned) => owned.startsWith('automatization/runners/')).map((owned) => path.basename(owned)),
  )
  copyRuntime(
    path.join(PROJECT_ROOT, 'automatization', 'workflows'),
    path.join(root, 'automatization', 'workflows'),
    preserve,
    root,
  )
  const version = require(path.join(PROJECT_ROOT, 'package.json')).version
  // Un repo con npm recibe el motor como dependencia versionada; uno de Go, Python o Rust recibe
  // la copia, porque exigirle un package.json para correr su planning sería imponerle un stack.
  const manifest = path.join(root, 'package.json')
  const engineMode = option('--engine', fs.existsSync(manifest) ? 'dependency' : 'copy')
  if (!['copy', 'dependency'].includes(engineMode)) fail('--engine debe ser copy o dependency.', 2)
  if (engineMode === 'dependency') declareEngine(manifest, version)
  else {
    const engine = path.join(root, '.ops', 'engine')
    copyRuntime(path.join(PROJECT_ROOT, 'engine'), engine, preserve, root)
    fs.chmodSync(path.join(engine, 'cli', 'ops.js'), 0o755)
  }
  // La instancia recuerda de qué versión salió: sin esto no hay actualización posible.
  const configFile = path.join(root, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  config.cauceVersion = version
  F.atomicWriteJson(configFile, config)
  console.log(`\n✓ ${name}: sistema ops creado en ${root}`)
  if (engineMode === 'dependency') console.log('  siguiente: npm install (el motor viene de la dependencia)')
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
  const changed = O.localChanges(root, PROJECT_ROOT)
  const overrides = O.overrides(root)

  if (dry) {
    if (from === to) return console.log(`= ${to}: la instancia está al día`)
    console.log(`⚠ hay una versión más nueva: ${to} (la instancia tiene ${from || 'una previa'})`)
    for (const file of changed) console.log(`  editado localmente: ${file}`)
    process.exit(1)
  }

  if (changed.length && !force) {
    for (const file of changed) console.error(`✗ ${file}`)
    fail(
      `\n${changed.length} archivo(s) del runtime fueron editados y se perderían.\n` +
      'Movelos junto a system/ como regla propia, o repetí con --force para descartarlos.',
    )
  }

  for (const relative of [...system, ...O.RUNTIME_PATHS]) {
    const origin = path.join(PROJECT_ROOT, O.sourceOf(relative))
    if (!fs.existsSync(origin)) continue
    const target = path.join(root, relative)
    // Una instancia que toma el motor de npm no debe recuperar la copia: la actualiza el lockfile.
    if (relative === '.ops/engine' && !fs.existsSync(target)) continue
    const skip = O.TEMPLATE_OWNED
      .filter((owned) => owned.startsWith(`${relative}/`))
      .map((owned) => path.basename(owned))
    if (fs.statSync(origin).isDirectory()) overlayTree(origin, target, root, skip)
    else {
      F.assertNoSymlinkPath(root, target)
      F.atomicWrite(target, fs.readFileSync(origin, 'utf8'))
    }
  }

  const config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
  config.cauceVersion = to
  F.atomicWriteJson(path.join(root, 'ops.config.json'), config)

  console.log(`✓ Cauce ${from || '(previa)'} → ${to}`)
  console.log(`  ${system.length} ruta(s) del sistema y ${O.RUNTIME_PATHS.length} del runtime actualizadas`)
  for (const override of overrides) {
    console.log(`= conservado ${override.collection}/${override.project}: sobrescribe ${override.system}`)
  }
  console.log('  planning, organization y todo lo propio quedaron intactos')
}

// Lista los cargos visibles resolviendo la precedencia; evita que cada consumidor —CI incluido—
// reimplemente el recorrido del catálogo.
function agents(action, dir) {
  if (action !== 'list') fail(`Acción de agents desconocida: ${action || '(vacía)'}`, 2)
  const root = path.resolve(dir || '.')
  const roles = AG.list(root)
  if (process.argv.includes('--json')) {
    return console.log(JSON.stringify(roles.map((role) => ({
      slug: role.slug, type: role.type, system: role.system,
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
    for (const [name, entry] of Object.entries(registry.providers || {})) {
      console.log(`${entry.enabled ? '●' : '○'} ${name} [${entry.adapter}]`)
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
  const root = path.resolve(rootArg || '.')
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
    try { runner = A.install(root, runnerName) } catch (error) { fail(error.message, 2) }
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
      ? L.prepareProposal(process.cwd(), agent)
      : L.prepareReport(process.cwd(), agent)
    console.log(`${result.created ? '+' : '='} ${path.relative(process.cwd(), result.file)}`)
    if (typeof result.reports === 'number') console.log(`  ${result.reports} informe(s) semanal(es) incluidos`)
  } catch (error) { fail(error.message, 2) }
}

function evaluate(agent) {
  try {
    const result = L.evaluate(process.cwd(), agent)
    for (const error of result.errors) console.error(`✗ ${error}`)
    if (result.errors.length) fail(`\n${result.errors.length} error(es)`, 1)
    console.log(
      `✓ ${agent}: ${result.cases} caso(s), ${result.proposals} propuesta(s), ` +
        'controles estructurales válidos',
    )
  } catch (error) { fail(error.message, 2) }
}

function team(action, slug) {
  if (action === 'list') {
    for (const name of T.list(process.cwd())) console.log(name)
    return
  }
  if (!['check', 'show'].includes(action)) fail(`Acción de team desconocida: ${action || '(vacía)'}`, 2)
  try {
    const result = T.validate(process.cwd(), slug)
    for (const error of result.errors) console.error(`✗ ${error}`)
    if (result.errors.length) fail(`${slug}: ${result.errors.length} error(es)`, 1)
    if (action === 'show') {
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
  if (command === 'init') init(process.argv[3])
  else if (command === 'check') check(process.argv[3])
  else if (command === 'tree') tree(process.argv[3])
  else if (command === 'context') context(process.argv[3])
  else if (command === 'upgrade') upgrade(process.argv[3])
  else if (command === 'agents') agents(process.argv[3], process.argv[4])
  else if (command === 'archive') archive(process.argv[3], process.argv[4])
  else if (command === 'integration') {
    await integration(process.argv[3], process.argv[4], process.argv[5], process.argv[6])
  }
  else if (command === 'automation') automation(process.argv[3], process.argv[4], process.argv[5])
  else if (command === 'learn') learn(process.argv[3])
  else if (command === 'evaluate') evaluate(process.argv[3])
  else if (command === 'team') team(process.argv[3], process.argv[4])
  else { usage(); fail(`Comando desconocido: ${command}`, 2) }
}

main().catch((error) => fail(error.message))
