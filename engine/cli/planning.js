'use strict'

// Los comandos que leen un planning y contestan sobre él: qué hay, qué toca ahora, qué vence y con qué
// se cerró una tarea. Todos trabajan sobre el mismo estado, que `planning/state.js` compone una vez.
//
// La puerta no está acá: vive en `validate.js` porque decide en vez de informar, y con ella se fueron
// quince de los veintiún módulos que este archivo importaba.

const fs = require('node:fs')
const path = require('node:path')
const P = require('../planning/parser')
const RC = require('../planning/recurring')
const CL = require('../planning/claims')
const ST = require('../planning/state')
const O = require('../core/ownership')
const EV = require('../core/evidence')
const { fail, planningRoot, TODAY, USAGE } = require('./io')

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
  const root = planningRoot(dir)
  const opsDir = path.join(root, '..')
  const entries = P.readDone(root).entries
  const slug = cli.value('--task')
  // Sin `--task`, la más reciente, y la decide `fecha:` — por qué ese campo existe lo dice el contrato.
  const reciente = [...entries].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).pop()
  const entry = slug ? entries.find((one) => one.slug === slug) : reciente
  if (!entry) return fail(slug ? `DONE no tiene la entrada ${slug}` : 'DONE no tiene ninguna entrada', USAGE)

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

// Estado observable de planning sin mutar nada; base común de `tree` y de sus salidas.
function treeJson({ epics, milestones, done, wips, inbox, queued, claims }) {
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
    wip: wips.map((one) => ({
      task: one.task, runner: one.runner, phase: one.phase, complete: one.complete, pending: one.pending,
    })),
    inbox: { deuda: inbox.deuda, ideas: inbox.ideas, propuestas: inbox.propuestas, lecciones: inbox.lecciones },
    claims: claims.map((one) => ({ slug: one.slug, owner: one.owner, started: one.started })),
    done: done.entries.length,
  }))
}

function tree(dir, cli) {
  const root = planningRoot(dir)
  // Mismo motivo que en `context`, y por eso comparten la comprobación: sin ella un planning ausente
  // dibujaba un árbol vacío, que se lee como un roadmap sin épicas en vez de como una ruta equivocada.
  const state = ST.snapshot(root)
  if (cli.has('--json')) return treeJson(state)
  const { epics, milestones, done, wips, inbox, queued, claims } = state
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
  const wipText = wips.length
    ? wips.map((one) => `▶ ${one.task} · ${one.phase} · ${one.complete}✓/${one.pending}○ (${one.runner})`).join('  ')
    : 'idle'
  console.log(`\n${paint('1', 'WIP')}  ${wipText}`)
  console.log(
    `${paint('1', 'INBOX')}  ${inbox.deuda} deuda · ${inbox.ideas} ideas · ` +
      `${inbox.propuestas} propuestas · ${inbox.lecciones} lecciones` +
      // Sin esto, doce viñetas sin nombre se veían como un inbox vacío y nadie se enteraba.
      (inbox.skipped ? `  (${inbox.skipped} sin contar: falta el nombre en **negrita**)` : ''),
  )
  if (claims.length) {
    console.log(`${paint('1', 'CLAIM')}  ${claims.map((one) => `${one.slug} · ${one.owner}`).join('  ')}`)
  }
  console.log(`${paint('1', 'DONE')}   ${done.entries.length} tareas\n`)
}

// Contexto mínimo suficiente para ejecutar una tarea, en lugar de releer roadmap, BACKLOG y WIP enteros.
function context(dir, cli) {
  const root = planningRoot(dir)
  const state = ST.snapshot(root)
  // Acotar la cola a un hito es como un equipo se reparte trabajo sin coordinarse: dos personas en hitos
  // distintos casi nunca dependen entre sí ni tocan los mismos archivos. Lo que se acota es qué se
  // ofrece, no qué se sabe: `done` sigue siendo global, así que una dependencia que vive en otro hito se
  // juzga igual de bien.
  const from = CL.runner()
  const mio = state.wips.find((one) => one.runner === P.wipName(from)) || null
  const hito = cli.value('--hito')
  // Un filtro elige dónde buscar trabajo **nuevo**; no puede esconder el que ya tenés. Sin esto, pedir
  // otro hito mientras sostenías una tarea ofrecía una segunda que `claim` después se niega a dar: el
  // comando que dice qué hacer y el que lo autoriza contestaban distinto, y sólo se veía al reclamar.
  const own = state.claims.find((one) => one.runner === from && !state.done.set.has(one.slug))
  let hitoOmitido = ''
  if (hito) {
    const existe = state.milestones.some((one) => one.slug === hito)
    // Un hito mal escrito devolvería «sin tarea disponible», que es indistinguible de un hito terminado.
    if (!existe) {
      const hay = state.milestones.map((one) => one.slug).join(', ') || '(ninguno)'
      return fail(`el hito ${hito} no existe. Hay: ${hay}`, USAGE)
    }
    if (own) hitoOmitido = `${hito} no se aplica: ya tenés ${own.slug} tomada`
    else state.milestones = state.milestones.filter((one) => one.slug === hito)
  }
  const gate = path.join(root, 'AWAITING_REVIEW.md')
  const humanActions = ST.pendingHumanActions(root)
  const me = CL.owner(root)
  const { task, skipped, claimed, taken, waiting } = ST.currentTask(state, humanActions, from)
  const epic = task ? state.epics.find((candidate) => candidate.num === task.epic) : null
  const criteria = epic ? epic.criteria.filter((criterion) => task.criteria.includes(criterion.id)) : []
  const report = {
    // Toda la cola trabada por una persona no es lo mismo que no tener cola, y decir lo segundo manda a
    // buscar trabajo que no existe en vez de a resolver la fila que lo destraba.
    blocked: P.checkpointHolds(root) ? 'awaiting-review' : (!task && skipped.length ? 'blocked-on-human' : ''),
    task: task && {
      slug: task.slug, hito: task.hito, tier: task.tier, cast: task.cast, service: task.service,
      // Una tarea puede heredar su aceptación del criterio citado; el runner necesita el texto, no la cita.
      acceptance: task.acceptance || criteria.map((criterion) => criterion.text).join(' '),
      // Las decisiones que la línea ya tomó. Viaja con la tarea y no aparte porque es de ella: quien la
      // reciba tiene que poder leerla al lado de su aceptación, que es contra lo que se contrasta.
      description: task.description || '',
      epic: task.epic,
    },
    criteria,
    // El título nombra el tema; el contexto dice contra qué se construye, que es lo que separa cumplir
    // un criterio de cumplir su letra. Viaja acá porque el ejecutor tiene prohibido ir a buscarlo:
    // `autobuild` le dice que lea cuatro archivos una sola vez y nada más, y el roadmap no es ninguno.
    epic: epic ? { num: epic.num, title: epic.title, status: epic.status, context: epic.context } : null,
    // El WIP que este runner tiene, no el de la instancia: es lo único que le corresponde continuar.
    wip: mio ? { phase: mio.phase, complete: mio.complete, pending: mio.pending } : null,
    // Dónde va su plan. Lo dice el motor porque el nombre sale del id del runner, y quien escribe el
    // plan —un workflow— no tiene por qué saber cómo se deriva.
    wipFile: `wip/${P.wipName(from)}.md`,
    queued: state.milestones.reduce((total, milestone) => total + milestone.tasks.length, 0),
    blockedTasks: skipped,
    humanActions,
    owner: me,
    // El día de hoy, para quien no tiene reloj. Un workflow no puede llamar a `new Date` —una puerta se
    // lo impide, porque su salida dejaría de ser reproducible— y necesita la fecha para cerrar una tarea.
    // Sale de acá y no del modelo: es un dato mecánico, y pedírselo a un agente es invitarlo a inventarlo.
    today: TODAY(),
    claimed,
    taken,
    waiting,
    // Sólo las vencidas: la fila que todavía no vence no tiene nada que decirle a quien va a tomar una
    // tarea, y una recurrencia que hablara siempre sería ruido en el único comando que se corre en cada
    // vuelta. Que aparezca es la señal.
    recurring: RC.status({ ...RC.read(root), done: state.done, today: TODAY() })
      .filter((one) => one.overdue),
    // La próxima sin promover: se nombra, no se encola, igual que la recurrencia de arriba y por su
    // mismo criterio. Por qué no la encola una máquina está en la fase Pick de `autobuild`.
    nextEpic: (!task && [...state.epics].filter((one) => one.status === 'open')
      .sort((a, b) => String(a.num).localeCompare(String(b.num)))[0]) || null,
    // Sólo en el JSON: lo leen los recorridos que escriben en el INBOX, para no repetir un nombre.
    inbox: P.inboxHeads(root),
    // Las reglas que rigen, con los overrides resueltos. Van acá porque `autobuild` ya lee este comando y
    // tiene prohibido abrir otros archivos para completar su contrato (caso 105).
    rules: O.effectiveRules(path.resolve(root, '..')),
  }
  if (cli.has('--json')) return console.log(JSON.stringify(report))
  const reglas = () => console.log(`RULES  ${report.rules.join(', ') || '(ninguna)'}`)

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
  // Tu propio nombre en una tarea «ajena» es la señal de que sos vos desde otro runner, y sin decirlo se
  // lee como que alguien te ganó la tarea.
  const ownerLabel = (one) => (one.owner === report.owner ? `${one.owner} — vos, desde otro runner` : one.owner)
  // Que el reclamo sea tuyo desde otro id ya se decía; que además haya un **plan escrito** bajo ese id, no.
  // Esa es la mitad que cuesta la sesión: los pasos ya hechos están en un archivo que nadie nombra, y el id
  // que lo recupera es justo el que esta sesión no supo deducir. Los dos datos están en el reclamo.
  const tomadas = () => {
    for (const one of report.taken) {
      console.log(`TAKEN  ${one.slug} (${ownerLabel(one)})`)
      if (one.owner === report.owner && one.wip) {
        console.log(`PLAN   ${one.slug}: su plan está en wip/${one.wip} — retomalo con `
          + `\`export CAUCE_RUNNER=${one.runner}\``)
      }
    }
  }
  const espera = () => {
    for (const one of report.waiting) {
      console.log(`WAIT   ${one.slug}: espera a ${one.dep}${one.owner ? ` (${one.owner})` : ''}`)
    }
  }
  const due = () => {
    for (const one of report.recurring) {
      const when = one.overdueDays === 0 ? 'vence hoy' : `vencida hace ${one.overdueDays} día(s)`
      console.log(`DUE    ${one.id}: ${when}`)
    }
  }
  if (!report.task) {
    console.log('TASK   (sin tarea disponible)')
    const { nextEpic: next } = report
    if (next) console.log(`EPIC   ${next.num}: ${next.title} — sin promover`)
    // Mismo motivo que `blocked` arriba, con otra causa: acá la cola no la traba una persona, la tiene
    // el equipo, y lo que corresponde es hablar con quien la tiene.
    tomadas()
    espera()
    for (const action of report.humanActions) console.log(`HUMAN  ${action.task}: ${action.action}`)
    due()
    return reglas()
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
  if (hitoOmitido) console.log(`HITO   ${hitoOmitido}`)
  console.log(report.claimed
    ? `CLAIM  tuya desde el reclamo (${report.owner})`
    : `CLAIM  libre — tomala con \`ops claim <planning> ${report.task.slug}\``)
  tomadas()
  espera()
  if (report.blockedTasks.length) console.log(`SKIP   ${report.blockedTasks.join(', ')} (acción humana abierta)`)
  for (const action of report.humanActions) console.log(`HUMAN  ${action.task}: ${action.action}`)
  due()
  reglas()
}

// Qué trabajo recurrente vence, y la línea con la que se promueve. Emite esa línea y no la escribe:
// `BACKLOG.md` es la cola de lo aprobado y la escribe una persona — ningún comando del motor la toca,
// ni siquiera `integration promote`, que aterriza en el roadmap. Pegarla es el acto de promoción.
function recurring(dir, cli) {
  const root = planningRoot(dir)
  const file = RC.read(root)
  if (!file.exists) return console.log(`= este planning no declara trabajo recurrente (${RC.FILE})`)
  const state = RC.status({ ...file, done: P.readDone(root), today: TODAY() })
  const promote = cli.value('--promote')
  if (promote) {
    const one = state.find((candidate) => candidate.id === promote)
    if (!one) return fail(`${RC.FILE} no declara ${promote}`, USAGE)
    // La línea sale sola por stdout para que se pueda pegar o redirigir sin recortar nada; el destino,
    // que es lo único que falta decidir, va por stderr.
    console.error(`Pegala en el hito que corresponda de BACKLOG.md:`)
    return console.log(RC.taskLine(one, TODAY().slice(0, 7)))
  }
  if (cli.has('--json')) return console.log(JSON.stringify(state))
  if (!state.length) return console.log(`= ${RC.FILE} no declara ninguna fila legible`)
  for (const one of state) {
    const when = one.overdue
      ? (one.overdueDays === 0 ? 'vence hoy' : `vencida hace ${one.overdueDays} día(s)`)
      : `vence ${one.due}`
    const last = one.last ? `última ${one.last}` : 'nunca corrió'
    const held = one.postponed ? `, postergada ${one.postponed}` : ''
    console.log(`${one.overdue ? 'DUE' : 'OK '}  ${one.id.padEnd(16)} ${when}  (${last}${held})`)
  }
}

module.exports = { evidence, tree, context, recurring }
