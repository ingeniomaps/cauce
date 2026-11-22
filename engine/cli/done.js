'use strict'

// Cerrar una tarea en una llamada: el paso 13 del PROTOCOL, que fuera de `/autobuild` era una lista en prosa
// (caso 537). Valida antes de escribir nada y escribe en el orden de Done. No commitea: eso sigue siendo de quien
// cierra, con sus reglas.

const fs = require('node:fs')
const path = require('node:path')
const P = require('../planning/parser')
const BK = require('../planning/backlog')
const CL = require('../planning/claims')
const CS = require('../planning/close')
const DE = require('../planning/done-entry')
const LN = require('../planning/lines')
const ST = require('../planning/state')
const VA = require('./validate')
const R = require('../core/repos')
const { fail, planningRoot, TODAY, USAGE, REFUSED } = require('./io')

// La aceptación como la recibe el runner: la propia o, si la tarea la hereda, el texto de los criterios que cita
// (`context`, caso 537). Sin esto la entrada salía con `acept:` vacío y `check` la rechazaba con todo ya escrito.
function acceptanceOf(task, epics) {
  const epic = epics.find((one) => one.num === task.epic)
  const inherited = epic ? epic.criteria.filter((one) => task.criteria.includes(one.id)).map((one) => one.text) : []
  return (task.acceptance || inherited.join(' ')).trim()
}

// El carril con que corrió: el del WIP propio, el del WIP de otra sesión que la llevó —quien cierra suele ser quien
// revisa, y el carril lo anotó quien construyó (paso 12)—, y si no hay WIP, el de la cola. El WIP va antes que la
// cola porque una corrida puede subirlo: `/autobuild` pasa a `directo` una `express` que toca una superficie crítica, y
// eso no se escribe en la cola (caso 538). Un `sin clasificar` del WIP no dice nada y no le gana a la cola.
function laneOf(task, wips, own) {
  const told = wips.filter((one) => one && one.task === task.slug && one.lane && one.lane !== 'sin clasificar')
  const held = told.find((one) => one.runner === own) || told[0]
  return (held && held.lane) || task.tier || 'sin clasificar'
}

// Qué se juzga de la entrada antes de escribirla: la entrada entera, lo mismo que `check` le va a pedir después,
// incluido un `tests: n/a` sobre un commit que toca código. Si no, `check` lo rechazaba con todo ya escrito y el
// segundo intento no podía arreglarlo: la entrada ya estaba (caso 538).
function entryErrors(entry, epics, { fields, stray }, filesOf) {
  const unknown = CS.unknownFields(fields)
  const missing = CS.missingFields(fields)
  return [
    ...(stray.length ? [`renglones que no son \`campo: valor\` ni siguen a uno: ${stray.join(' | ')}`] : []),
    ...(unknown.length ? [`campos que no se pasan: ${unknown.join(', ')}. acept, fecha y lane salen del disco`] : []),
    ...(missing.length ? [`faltan campos: ${missing.join(', ')}. Van en el archivo de --fields, uno por línea`] : []),
    ...(unknown.length || missing.length || stray.length ? []
      : [...DE.doneEntryErrors(entry, epics), ...DE.surfaceWithoutTests([entry], filesOf)]),
  ]
}

// Escribe sólo si cambió algo, y lo dice: un frontmatter que no se pudo leer no puede salir como hecho.
function rewrite(file, edit) {
  const before = fs.readFileSync(file, 'utf8')
  const after = edit(before)
  if (after !== before) fs.writeFileSync(file, after)
  return after !== before
}

function done(dir, slug, cli) {
  const root = planningRoot(dir)
  if (!slug) return fail('Falta la tarea. `ops done <planning-dir> <tarea> --fields <archivo>`', USAGE)
  const asked = LN.sessionLine(root, cli.value('--line'))
  if (asked.error) return fail(asked.error, USAGE)
  const state = ST.snapshot(root)
  const milestone = state.milestones.find((one) => one.tasks.some((task) => task.slug === slug))
  const task = milestone && milestone.tasks.find((one) => one.slug === slug)
  const from = CL.runner(asked.id, path.join(root, '..'))
  const already = state.done.set.has(slug)
  if (!task && !already) return fail(`${slug} no está en la cola ni en done/: no hay qué cerrar.`, USAGE)
  // Lo mismo que `claim` (caso 239): la tarea de otra línea se cierra desde su sesión.
  if (task && LN.scope([milestone], asked.line).hidden.length) {
    return fail(`${slug} ${LN.whereToTake(milestone)}.`, REFUSED)
  }
  const touched = []

  if (already) console.log(`${slug} ya tiene su entrada en done/; no se reescribe`)
  else {
    const file = cli.value('--fields')
    if (!file) return fail('Falta --fields <archivo>: lo que juzgaste del cierre, una línea `campo: valor`.', USAGE)
    let parsed
    try { parsed = CS.parseFields(fs.readFileSync(path.resolve(file), 'utf8')) } catch (error) {
      return fail(`No se pudo leer ${file}: ${error.message}`, USAGE)
    }
    const epics = P.readEpics(root)
    const resolved = { ...task, acceptance: acceptanceOf(task, epics) }
    const lane = laneOf(task, P.readWips(root), P.wipName(from))
    const entry = { ...parsed.fields, source: `done/${slug}.md`, slug, epic: task.epic,
      acceptance: resolved.acceptance, fecha: TODAY(), lane }
    const errors = entryErrors(entry, epics, parsed, R.commitFiles(path.join(root, '..')))
    if (errors.length) return fail(`No se escribió nada:\n${errors.map((one) => `  ✗ ${one}`).join('\n')}`, REFUSED)
    const target = path.join(root, 'done', `${slug}.md`)
    // Un archivo con ese nombre y sin esa viñeta es la entrada de otra tarea: pisarla borraría evidencia ajena.
    if (fs.existsSync(target)) {
      return fail(`${path.relative(process.cwd(), target)} existe y no cierra ${slug}.`, REFUSED)
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, CS.entryText({ task: resolved, fecha: entry.fecha, lane, fields: parsed.fields }))
    touched.push(`done/${slug}.md`)
  }

  if (task) {
    const file = path.join(root, task.file)
    fs.writeFileSync(file, CS.withoutTask(fs.readFileSync(file, 'utf8'), slug))
    const left = BK.readBacklog(root).filter((one) => one.file === task.file).flatMap((one) => one.tasks)
    if (task.file !== 'BACKLOG.md' && !left.length && !CS.hasTaskLines(fs.readFileSync(file, 'utf8'))) {
      fs.rmSync(file)
      touched.push(`${task.file} (borrado: su hito quedó sin tareas)`)
    } else {
      touched.push(task.file)
      if (task.file !== 'BACKLOG.md' && !left.length) {
        console.warn(`⚠ ${task.file} quedó sin tareas en cola y guarda borradores comentados: no se borra`)
      }
    }
  }

  const closed = P.readDone(root).set
  const epic = P.readEpics(root).find((one) => one.stories.some((story) => story.slug === slug)
    || (task && task.epic && one.num === task.epic))
  if (epic && ['open', 'active'].includes(epic.status) && epic.stories.length
    && epic.stories.every((story) => closed.has(story.slug))) {
    if (rewrite(epic.path, CS.closedEpic)) touched.push(`roadmap/${epic.file} (cerrada)`)
    else console.warn(`⚠ roadmap/${epic.file} tiene todo hecho y su frontmatter no se pudo editar: cerrala a mano`)
  }

  const wipFile = path.join(root, 'wip', `${P.wipName(from)}.md`)
  const own = P.readWip(root, from)
  if (own && own.task === slug) {
    if (rewrite(wipFile, CS.idleWip)) touched.push(`wip/${P.wipName(from)}.md (status: IDLE)`)
    else console.warn(`⚠ wip/${P.wipName(from)}.md: su frontmatter no se pudo editar; escribí status: IDLE a mano`)
  }
  for (const other of P.readWips(root).filter((one) => one && one.task === slug && one.runner !== P.wipName(from))) {
    console.warn(`⚠ wip/${other.runner}.md también apunta a ${slug}: es de otra sesión y no se toca desde acá. Si es `
      + 'la tuya, quién sos sale de la carpeta: corré ops done desde la de esa sesión')
  }

  if (fs.existsSync(CL.file(root, slug))) {
    fs.rmSync(CL.file(root, slug))
    touched.push(`${CL.DIR}/${slug}.md (reclamo soltado)`)
  }

  for (const one of touched) console.log(`✓ ${one}`)
  if (touched.length) console.log('Commitealo con el estado de planning, en su rama de trabajo.')
  VA.check(dir, { has: (flag) => flag === '--skip-roots' && cli.has('--skip-roots'),
    value: (flag) => (flag === '--closed' ? slug : '') })
}

module.exports = { done }
