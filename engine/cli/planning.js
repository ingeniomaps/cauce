'use strict'

// Los comandos que leen y validan un planning: qué está mal, qué hay, qué toca ahora y qué se archiva.
// Los cuatro trabajan sobre el mismo estado, que `planning/state.js` compone una vez.

const fs = require('node:fs')
const path = require('node:path')
const P = require('../planning/parser')
const B = require('../planning/business-rules')
const PC = require('../planning/contracts')
const ST = require('../planning/state')
const I = require('../integrations/registry')
const O = require('../core/ownership')
const OB = require('../core/onboarding')
const C = require('../config/validate')
const AG = require('../agents/catalog')
const F = require('../core/files')
const { fail } = require('./io')

// Qué dimensiones enumera el molde de `organization/` y cuáles dejaron de estar. Un agente que reescribe
// esos archivos tiende a quedarse con el contenido y perder la estructura: el resultado se lee entero y
// completo, y nadie va a pedir después la dimensión que falta porque nada indica que faltaba.
//
// Va como advertencia y no como error: la empresa es dueña de esos archivos y puede reestructurarlos a
// propósito. Lo que no puede pasar es que una dimensión desaparezca sin que se vea.
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
  errors.push(...PC.validateBacklogStructure(root))
  errors.push(...PC.validateRules(root))
  errors.push(...PC.validateAdr(root))
  const backlog = milestones.flatMap((milestone) => milestone.tasks)
  const backlogSlugs = new Set(backlog.map((task) => task.slug))
  const epicNums = new Set()
  const storySlugs = new Set()

  const roles = new Set(AG.list(path.resolve(root, '..')).map((role) => role.slug))
  const wip = P.readWip(root)
  errors.push(...PC.validateState({
    epics, milestones, done, wip, roles, humanActions: P.readHumanActions(root),
  }))

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

  warnings.push(...OB.missingSections(path.resolve(root, '..')))
  warnings.push(...OB.orphanCredentials(path.resolve(root, '..')))

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
  const state = ST.snapshot(root)
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

// Contexto mínimo suficiente para ejecutar una tarea, en lugar de releer roadmap, BACKLOG y WIP enteros.
function context(dir, cli) {
  const root = path.resolve(dir || '.')
  const state = ST.snapshot(root)
  const gate = path.join(root, 'AWAITING_REVIEW.md')
  const humanActions = ST.pendingHumanActions(root)
  const { task, skipped } = ST.currentTask(state, humanActions)
  const epic = task ? state.epics.find((candidate) => candidate.num === task.epic) : null
  const criteria = epic ? epic.criteria.filter((criterion) => task.criteria.includes(criterion.id)) : []
  const report = {
    // Toda la cola trabada por una persona no es lo mismo que no tener cola, y decir lo segundo manda a
    // buscar trabajo que no existe en vez de a resolver la fila que lo destraba.
    blocked: fs.existsSync(gate) ? 'awaiting-review' : (!task && skipped.length ? 'blocked-on-human' : ''),
    task: task && {
      slug: task.slug, hito: task.hito, tier: task.tier, cast: task.cast, service: task.service,
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

  if (report.blocked === 'awaiting-review') {
    const first = P.read(gate).split('\n').find((line) => line.trim() && !line.startsWith('#')) || ''
    return console.log(`BLOCKED  awaiting-review — ${first.trim()}`)
  }
  if (report.blocked === 'blocked-on-human') {
    const row = humanActions.find((action) => skipped.includes(action.task)) || humanActions[0]
    return console.log(`BLOCKED  blocked-on-human — ${row.task}: ${row.action}`)
  }
  if (!report.task) return console.log('TASK   (sin tarea disponible)')
  console.log(`TASK   ${report.task.slug}${report.task.tier ? ` [${report.task.tier}]` : ''}` +
    `${report.task.service ? `  service: ${report.task.service}` : ''}` +
    `${report.task.hito ? `  hito: ${report.task.hito}` : ''}`)
  if (report.task.cast.build) {
    const review = report.task.cast.review
    console.log(`CAST   ${report.task.cast.build}${review.length ? ` → ${review.join(', ')}` : ''}`)
  }
  if (report.epic) console.log(`EPIC   ${report.epic.num} ${report.epic.title} [${report.epic.status}]`)
  if (report.task.acceptance) console.log(`ACEPT  ${report.task.acceptance}`)
  for (const criterion of criteria) console.log(`${criterion.id.padEnd(6)} ${criterion.text}`)
  const wip = report.wip ? `${report.wip.phase} · ${report.wip.complete}✓/${report.wip.pending}○` : 'idle'
  console.log(`WIP    ${wip}`)
  if (report.blockedTasks.length) console.log(`SKIP   ${report.blockedTasks.join(', ')} (acción humana abierta)`)
  for (const action of report.humanActions) console.log(`HUMAN  ${action.task}: ${action.action}`)
}

// El historial de acciones humanas se acumula en un solo archivo y no por épica: una fila no pertenece
// a ninguna, y esperar el cierre de una épica dejaría sin archivar las de un planning que todavía no
// cerró ninguna —que es justo cuando el archivo se vuelve ilegible—.
function archiveHumanActions(root) {
  const source = path.join(root, 'HUMAN_ACTIONS.md')
  const rows = P.readHumanActions(root).filter((row) => row.resolved)
  if (!rows.length) return console.log('= no hay filas resueltas')
  const target = path.join(root, 'done', 'human-actions.md')
  const header = '| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |\n|---|---|---|---|'
  const previous = P.read(target).trimEnd()
  const head = previous || `---\nstatus: archived\n---\n\n# Acciones humanas resueltas\n\n${header}`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  F.atomicWrite(target, `${head}\n${rows.map((row) => row.raw).join('\n')}\n`)
  const drop = new Set(rows.map((row) => row.raw))
  const kept = P.read(source).split('\n').filter((line) => !drop.has(line))
  F.atomicWrite(source, `${kept.join('\n').trimEnd()}\n`)
  return console.log(`✓ ${rows.length} fila(s) archivadas`)
}

function archive(dir, rawNum) {
  const root = path.resolve(dir || '.')
  if (String(rawNum || '') === 'human-actions') return archiveHumanActions(root)
  const num = String(rawNum || '').padStart(3, '0')
  if (!/^\d{3}$/.test(num)) fail('La épica debe ser NNN, o human-actions.', 2)
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

module.exports = { check, tree, context, archive }
