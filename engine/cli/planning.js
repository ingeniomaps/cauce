'use strict'

// Los comandos que leen y validan un planning: qué está mal, qué hay, qué toca ahora y qué se archiva.
// Los cuatro trabajan sobre el mismo estado, que `planning/state.js` compone una vez.

const fs = require('node:fs')
const path = require('node:path')
const P = require('../planning/parser')
const B = require('../planning/business-rules')
const PC = require('../planning/contracts')
const SZ = require('../planning/sizing')
const ST = require('../planning/state')
const AD = require('../planning/adoption')
const AP = require('../hooks/approval')
const I = require('../integrations/registry')
const O = require('../core/ownership')
const EV = require('../core/evidence')
const OB = require('../core/onboarding')
const C = require('../config/validate')
const CP = require('../config/paths')
const AG = require('../agents/catalog')
const F = require('../core/files')
const { fail } = require('./io')

// Qué dimensiones enumera el molde de `organization/` y cuáles dejaron de estar. Un agente que reescribe
// esos archivos tiende a quedarse con el contenido y perder la estructura: el resultado se lee entero y
// completo, y nadie va a pedir después la dimensión que falta porque nada indica que faltaba.
//
// Va como advertencia y no como error: la empresa es dueña de esos archivos y puede reestructurarlos a
// propósito. Lo que no puede pasar es que una dimensión desaparezca sin que se vea.
// El contraste de la evidencia de una entrada de DONE contra lo que no lo escribió su autor. No es una
// puerta y por eso no vive en `check`: `check` juzga todo DONE, y el registro de gates es rodante —una
// entrada de hace tres meses no tiene con qué cruzarse—. Acá se pregunta por una entrada, que es como
// se cierra una tarea: se escribe la evidencia y se la mira contra el árbol y contra lo que corrió.
function evidence(dir, cli) {
  const root = path.resolve(dir || '.')
  const opsDir = path.join(root, '..')
  const entries = P.readDone(root).entries
  const slug = cli.value('--task')
  const entry = slug ? entries.find((one) => one.slug === slug) : entries[entries.length - 1]
  if (!entry) return fail(slug ? `DONE no tiene la entrada ${slug}` : 'DONE no tiene ninguna entrada', 2)

  let config = {}
  try { config = JSON.parse(fs.readFileSync(path.join(opsDir, 'ops.config.json'), 'utf8')) } catch { /* sin raíces */ }
  const roots = (Array.isArray(config.workspaceRoots) ? config.workspaceRoots : [])
    .filter((workspace) => workspace && workspace.path)
    .map((workspace) => path.resolve(opsDir, workspace.path))
    .filter((one) => fs.existsSync(one))
  const traces = EV.contrast(entry.tests, roots)
  const runs = EV.runs(opsDir)
  const report = { task: entry.slug, epic: entry.epic, traces, runs }
  if (cli.has('--json')) return console.log(JSON.stringify(report))

  console.log(`TAREA  ${entry.slug}${entry.epic ? ` (epic: ${entry.epic})` : ''}`)
  if (!traces.length) console.log('TESTS  (la entrada no rastrea ningún criterio)')
  for (const trace of traces) {
    const nota = trace.verdict === 'inbuscable'
      ? (roots.length ? 'describe la prueba en vez de nombrarla' : 'el proyecto no declara raíces de código')
      : ''
    console.log(`  ${trace.criterion} → ${trace.artifact}  [${trace.verdict}]${nota ? ` — ${nota}` : ''}`)
  }
  if (!runs.length) console.log('GATES  (sin corridas registradas; `verify` todavía no corrió acá)')
  for (const run of runs) console.log(`GATES  ${run.at}  ${run.gate} (exit ${run.status})`)
  // Un contraste que no dice qué no puede ver se lee como si lo hubiera visto todo.
  console.log('Este contraste dice si el artefacto existe y qué gates corrieron al commitear. No dice '
    + 'que la prueba nombrada haya corrido: eso depende del runner, y varios no la nombran al pasar.')
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
        // Es la única parte de la configuración que le levanta el límite a un guard, y quien la escribió
        // no es quien la lee dentro de seis meses: va como advertencia permanente, igual que un override.
        // Y se muestra resuelta porque resuelta es como la compara el guard — un `~` escrito solo exenta
        // la casa entera, y escrito no se nota.
        for (const exempt of CP.writableOutsideRoots(path.dirname(configPath), config)) {
          warnings.push(`ops.config.json: ${exempt.declared} está exenta del límite `
            + `de raíces (${exempt.path})`)
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
  const adopted = AD.read(root)
  errors.push(...SZ.oversizedUnits({ epics, milestones }))
  errors.push(...PC.validateState({
    epics, milestones, done, wip, roles, humanActions: P.readHumanActions(root), adopted: new Set(adopted),
  }))
  warnings.push(...AD.report({ done, epics, adopted }))
  warnings.push(...AD.sealWarnings(root))
  // Una aprobación vale para el conjunto que nombra, así que olvidada sigue autorizando
  // esas mismas rutas la próxima vez que alguien las stagee. No caduca sola: lo que la cierra es que se
  // vea en cada corrida y alguien la borre.
  const aprobadas = AP.read(path.resolve(root, '..'))
  if (aprobadas.length) {
    warnings.push(`planning/${AP.APPROVAL}: ${aprobadas.length} ruta(s) aprobadas y sin borrar; `
      + 'el archivo sigue autorizándolas')
  }

  // Lo que `upgrade` conserva por estar editado deja de recibir mejoras, y eso es una deuda que no
  // avisa sola: la instancia queda con medio molde viejo y todo se ve normal. Sale acá para que se vea
  // en cada corrida y no sólo el día que alguien actualiza.
  const congelados = O.localChanges(path.resolve(root, '..'))
  if (congelados.length) {
    warnings.push(`${congelados.length} archivo(s) del molde congelados por edición local; `
      + '`upgrade` los conserva y no les trae mejoras')
  }

  const integration = I.validate(path.resolve(root, '..'))
  errors.push(...integration.errors)
  warnings.push(...integration.warnings)

  warnings.push(...PC.competingSections(root))
  // Sobrescribir una entrada de system/ es legítimo y esperado; lo que no puede pasar es que
  // ocurra en silencio, porque esa entrada deja de recibir las mejoras del toolkit.
  for (const override of O.overrides(path.resolve(root, '..'))) {
    // Y con qué se queda el proyecto: un override sano redefine lo que reemplaza, y el que deja IDs
    // afuera los retira sin decirlo. Nombrarlos es lo único que separa una decisión de un descuido.
    const retired = override.collection === 'planning/rules'
      ? PC.retiredByOverride(root, override.project)
      : []
    warnings.push(`${override.collection}/${override.project} sobrescribe ${override.system} `
      + `(override explícito)${retired.length ? `; deja de regir ${retired.join(', ')}` : ''}`)
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
    // El título nombra el tema; el contexto dice contra qué se construye, que es lo que separa cumplir
    // un criterio de cumplir su letra. Viaja acá porque el ejecutor tiene prohibido ir a buscarlo:
    // `autobuild` le dice que lea cuatro archivos una sola vez y nada más, y el roadmap no es ninguno.
    epic: epic ? { num: epic.num, title: epic.title, status: epic.status, context: epic.context } : null,
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
  // Sin tarea no se corta la salida: las acciones humanas van igual. Estaban después del `return`, así
  // que una instancia recién arrancada —`onboard` deja filas pendientes y ninguna tarea todavía—
  // respondía «sin tarea disponible» y se tragaba las siete cosas que una persona tenía que desbloquear.
  // Es el comando que existe para decir qué toca ahora, contestando «nada» cuando lo que toca es eso.
  if (!report.task) {
    console.log('TASK   (sin tarea disponible)')
    for (const action of report.humanActions) console.log(`HUMAN  ${action.task}: ${action.action}`)
    return
  }
  console.log(`TASK   ${report.task.slug}${report.task.tier ? ` [${report.task.tier}]` : ''}` +
    `${report.task.service ? `  service: ${report.task.service}` : ''}` +
    `${report.task.hito ? `  hito: ${report.task.hito}` : ''}`)
  if (report.task.cast.build) {
    const review = report.task.cast.review
    console.log(`CAST   ${report.task.cast.build}${review.length ? ` → ${review.join(', ')}` : ''}`)
  }
  if (report.epic) console.log(`EPIC   ${report.epic.num} ${report.epic.title} [${report.epic.status}]`)
  // Entera y sin recortar, que es lo que hace el resto de esta salida con la aceptación y los criterios.
  // Recortar sería la conducta nueva, y no hay dónde cortar: la sección es una lista de viñetas y la
  // primera no resume a las otras. Si crece de más, el que tiene que ponerle techo es el molde.
  for (const line of (report.epic?.context || '').split('\n')) {
    if (line.trim()) console.log(`CTX    ${line.trim()}`)
  }
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
// Adoptar es declarar de una vez qué historia llegó con el proyecto. Se genera con lo que hoy no cumple
// y no se vuelve a correr: un baseline que se regenera perdona de nuevo lo que alguien ya se tomó el
// trabajo de arreglar, y uno que crece a mano deja de ser una lista de perdones para ser una amnistía.
// Achicarlo sí es a mano, borrando el renglón que `check` señala.
function adopt(dir) {
  const root = path.resolve(dir || '.')
  const target = path.join(root, AD.BASELINE)
  if (fs.existsSync(target)) {
    // Un baseline que ya trae huella no se toca: regenerarlo es exactamente lo que la huella impide.
    // Uno sin huella lo generó una versión anterior, y sellarlo no es regenerar nada — se calcula sobre
    // lo que ya está—, así que es la única salida de un aviso que si no no tendría ninguna.
    const existing = fs.readFileSync(target, 'utf8')
    if (!AD.sealWarnings(root).some((one) => /sin huella/.test(one))) {
      fail(`${AD.BASELINE} ya existe: se genera una vez. Para retirar un renglón, ponele \`#~\` `
        + 'delante; `check` marca los que ya cumplen.')
    }
    const slugs = AD.declared(existing)
    F.atomicWrite(target, existing.replace(/\n?$/, `\n# huella: ${slugs.length} entradas · `
      + `sha256:${AD.digest(slugs)}\n`))
    return console.log(`✓ ${AD.BASELINE} sellado con ${slugs.length} entrada(s); la lista no cambió`)
  }
  const epics = P.readEpics(root)
  const pending = P.readDone(root).entries.filter((entry) => PC.doneEntryErrors(entry, epics).length)
  if (!pending.length) {
    return console.log('= no hay nada que exentar: todas las entradas de DONE cumplen el contrato')
  }
  const today = new Date().toISOString().slice(0, 10)
  const slugs = pending.map((entry) => entry.slug)
  F.atomicWrite(target, `# Entradas anteriores a la adopción de Cauce (${today}). No se agregan nuevas:\n`
    + '# desde esa fecha rige el contrato completo, y `check` avisa cuando una de éstas pasa a\n'
    + '# cumplirlo para que le pongas `#~` delante y quede retirada.\n'
    + `# huella: ${slugs.length} entradas · sha256:${AD.digest(slugs)}\n`
    + `${slugs.join('\n')}\n`)
  console.log(`✓ ${pending.length} entrada(s) exentas en ${AD.BASELINE}`)
  return console.log('  revisá la lista: lo que sí cumple el contrato no tiene por qué estar ahí')
}

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

module.exports = { check, evidence, tree, context, archive, adopt }
