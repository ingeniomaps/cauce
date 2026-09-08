'use strict'

// Los comandos que leen y validan un planning: qué está mal, qué hay, qué toca ahora y qué se archiva.
// Los cuatro trabajan sobre el mismo estado, que `planning/state.js` compone una vez.

const fs = require('node:fs')
const path = require('node:path')
const P = require('../planning/parser')
const B = require('../planning/business-rules')
const PC = require('../planning/contracts')
const SR = require('../planning/structure')
const SZ = require('../planning/sizing')
const RC = require('../planning/recurring')
const CL = require('../planning/claims')
const R = require('../core/repos')
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
  // Sin `--task`, la más reciente, y la decide `fecha:` — por qué ese campo existe lo dice el contrato.
  const reciente = [...entries].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).pop()
  const entry = slug ? entries.find((one) => one.slug === slug) : reciente
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

// La fecha de hoy, en un solo lugar: los comandos que la usan tienen que estar mirando el mismo día, y
// el módulo que calcula vencimientos la recibe en vez de preguntarla.
const TODAY = () => new Date().toISOString().slice(0, 10)

function check(dir, cli) {
  const root = path.resolve(dir || '.')
  const errors = []
  const warnings = []
  // El plan no está: `wip/` es local y gitignoreado, así que un clon nuevo no lo trae y eso no es un
  // error. Ausente se lee como IDLE, que es lo que significa.
  const required = ['BACKLOG.md', 'INBOX.md', 'HUMAN_ACTIONS.md', 'PROTOCOL.md']
  // `DONE.md` se retiró: la evidencia vive en un archivo por tarea. Un `DONE.md` que quede en disco
  // ya no lo lee nadie, y eso no se nota — las épicas dejan de poder cerrar y sus historias figuran
  // sin evidencia, que es lo mismo que se vería si nunca se hubieran hecho.
  // `WIP.md` se retiró por lo mismo que `DONE.md`: era uno solo y lo escribían todos los que corren sobre
  // una instancia sidecar. Uno que quede en disco ya no lo lee nadie, y su plan a medias se pierde sin
  // que nada lo diga.
  if (fs.existsSync(path.join(root, 'WIP.md'))) {
    errors.push('WIP.md ya no se lee: el plan de cada runner vive en `wip/<runner>.md`; movelo y borralo')
  }
  if (fs.existsSync(path.join(root, 'DONE.md'))) {
    errors.push('DONE.md ya no se lee: pasá cada entrada a su propio `done/<slug>.md` y borralo')
  }
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
  errors.push(...SR.validateRoadmapStructure(root))
  errors.push(...SR.validateBacklogStructure(root))
  errors.push(...SR.validateRules(root))
  errors.push(...SR.validateAdr(root))
  const backlog = milestones.flatMap((milestone) => milestone.tasks)
  const backlogSlugs = new Set(backlog.map((task) => task.slug))
  const epicNums = new Set()
  const storySlugs = new Set()

  const roles = new Set(AG.list(path.resolve(root, '..')).map((role) => role.slug))
  const wips = P.readWips(root)
  const adopted = AD.read(root)
  errors.push(...SZ.oversizedUnits({ epics, milestones }))
  errors.push(...PC.validateState({
    epics, milestones, done, wips, roles, humanActions: P.readHumanActions(root), adopted: new Set(adopted),
  }))
  warnings.push(...AD.report({ done, epics, adopted }))
  // Sin `RECURRING.md` no dice una palabra: una instancia que actualiza y no declara trabajo recurrente
  // no tiene por qué enterarse de que el contrato existe. Vencida avisa y no frena — lo que frena vive
  // en `HUMAN_ACTIONS.md`, y un aviso que salta siempre se termina apagando.
  // Un reclamo que nombra una tarea que no existe bloquea la cola sin que nada lo explique, y uno viejo
  // la bloquea para siempre. Lo primero es error; lo segundo avisa, porque abandonar no es un defecto.
  const claims = CL.read(root)
  errors.push(...CL.validate({ claims, milestones, done }))
  // Si la rama de cada tarea tomada se movió, que es lo único barato que distingue una tarea larga de
  // una abandonada. Sin repositorio resoluble el mapa queda vacío y el aviso vuelve a mirar sólo la
  // fecha, que es lo que había antes: degrada, no rompe.
  const activity = new Map()
  for (const claim of claims.filter((one) => !done.set.has(one.slug))) {
    const at = R.lastCommit(R.repoOf(path.join(root, '..'), claim.service), CL.branchOf(claim.slug))
    if (at) activity.set(claim.slug, at)
  }
  warnings.push(...CL.warnings({ claims, done, today: TODAY(), activity }))
  const recurring = RC.read(root)
  errors.push(...RC.validate(recurring))
  warnings.push(...RC.warnings(RC.status({ ...recurring, done, today: TODAY() })))
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

  // Y lo que `upgrade` no retiró porque no pudo demostrar que fuera suyo: queda ahí, sin colgar de
  // ningún mecanismo, hasta que alguien lo mueva o lo borre. Se cuenta por lo mismo que los congelados
  // — un resto que no se ve se vuelve permanente.
  const restos = O.RETIRED_COMPARTIDO.filter((relative) => fs.existsSync(path.join(root, '..', relative)))
  if (restos.length) {
    warnings.push(`${restos.length} ruta(s) retiradas siguen en disco con contenido tuyo `
      + `(${restos.join(', ')}); Cauce ya no las distribuye ni las toca`)
  }

  const integration = I.validate(path.resolve(root, '..'))
  errors.push(...integration.errors)
  warnings.push(...integration.warnings)

  warnings.push(...SR.competingSections(root))
  // Sobrescribir una entrada de system/ es legítimo y esperado; lo que no puede pasar es que
  // ocurra en silencio, porque esa entrada deja de recibir las mejoras del toolkit.
  for (const override of O.overrides(path.resolve(root, '..'))) {
    // Y con qué se queda el proyecto: un override sano redefine lo que reemplaza, y el que deja IDs
    // afuera los retira sin decirlo. Nombrarlos es lo único que separa una decisión de un descuido.
    const retired = override.collection === 'planning/rules'
      ? SR.retiredByOverride(root, override.project)
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
      wips: wips.map((one) => one.task),
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
  const root = path.resolve(dir || '.')
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
  const root = path.resolve(dir || '.')
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
  const propio = state.claims.find((one) => one.runner === from && !state.done.set.has(one.slug))
  let hitoOmitido = ''
  if (hito) {
    const existe = state.milestones.some((one) => one.slug === hito)
    // Un hito mal escrito devolvería «sin tarea disponible», que es indistinguible de un hito terminado.
    if (!existe) {
      const hay = state.milestones.map((one) => one.slug).join(', ') || '(ninguno)'
      return fail(`el hito ${hito} no existe. Hay: ${hay}`, 2)
    }
    if (propio) hitoOmitido = `${hito} no se aplica: ya tenés ${propio.slug} tomada`
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
  // Tu propio nombre en una tarea «ajena» es la señal de que sos vos desde otro runner, y sin decirlo se
  // lee como que alguien te ganó la tarea.
  const dueño = (one) => (one.owner === report.owner ? `${one.owner} — vos, desde otro runner` : one.owner)
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
    // Mismo motivo que `blocked` arriba, con otra causa: acá la cola no la traba una persona, la tiene
    // el equipo, y lo que corresponde es hablar con quien la tiene.
    for (const one of report.taken) console.log(`TAKEN  ${one.slug} (${dueño(one)})`)
    espera()
    for (const action of report.humanActions) console.log(`HUMAN  ${action.task}: ${action.action}`)
    due()
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
  if (hitoOmitido) console.log(`HITO   ${hitoOmitido}`)
  console.log(report.claimed
    ? `CLAIM  tuya desde el reclamo (${report.owner})`
    : `CLAIM  libre — tomala con \`ops claim <planning> ${report.task.slug}\``)
  for (const one of report.taken) console.log(`TAKEN  ${one.slug} (${dueño(one)})`)
  espera()
  if (report.blockedTasks.length) console.log(`SKIP   ${report.blockedTasks.join(', ')} (acción humana abierta)`)
  for (const action of report.humanActions) console.log(`HUMAN  ${action.task}: ${action.action}`)
  due()
}

// Qué trabajo recurrente vence, y la línea con la que se promueve. Emite esa línea y no la escribe:
// `BACKLOG.md` es la cola de lo aprobado y la escribe una persona — ningún comando del motor la toca,
// ni siquiera `integration promote`, que aterriza en el roadmap. Pegarla es el acto de promoción.
function recurring(dir, cli) {
  const root = path.resolve(dir || '.')
  const file = RC.read(root)
  if (!file.exists) return console.log(`= este planning no declara trabajo recurrente (${RC.FILE})`)
  const state = RC.status({ ...file, done: P.readDone(root), today: TODAY() })
  const promote = cli.value('--promote')
  if (promote) {
    const one = state.find((candidate) => candidate.id === promote)
    if (!one) return fail(`${RC.FILE} no declara ${promote}`, 2)
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

module.exports = { check, evidence, tree, context, recurring }
