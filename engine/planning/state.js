'use strict'

// El estado de un planning ya leído y cuál es la tarea que sigue. Es un nivel por encima de `parser`,
// que lee un archivo por vez: acá se compone lo que hace falta para decidir, y se aplica la precedencia
// que fija el protocolo. Vivía en el CLI, donde nadie podía ejercitarlo sin lanzar un proceso.

const P = require('./parser')
const C = require('./claims')

function snapshot(root) {
  const milestones = P.readBacklog(root)
  return {
    epics: P.readEpics(root),
    milestones,
    done: P.readDone(root),
    wip: P.readWip(root),
    inbox: P.readInbox(root),
    claims: C.read(root),
    queued: new Set(milestones.flatMap((m) => m.tasks.map((t) => t.slug))),
  }
}


// Acciones humanas que todavía bloquean: las pendientes y también las mal escritas, porque una fila
// cuyo estado no se entiende no se puede dar por resuelta. `check` es quien las nombra.
function pendingHumanActions(root) {
  return P.readHumanActions(root).filter((row) => !row.resolved)
    .map((row) => ({ task: row.task, state: row.state, action: row.action }))
}


// Selecciona la tarea que un runner debe ejecutar ahora, con la misma precedencia que el protocolo:
// WIP activo primero —es el mutex y manda incluso si tiene una acción humana abierta—, si no la
// primera tarea no terminada y no bloqueada recorriendo los hitos en su orden: agotado el primero,
// sigue por el que viene.
//
// Con equipo se agrega un escalón entre los dos: lo que ya reclamé va antes que lo libre, porque es lo
// que dije que iba a hacer. Y lo que reclamó otro no se ofrece — sin eso, dos runners preguntando a la
// vez reciben la misma tarea y ninguno se entera, que es la colisión que no se ve.
function currentTask({ milestones, done, wip, claims = [] }, blockers = [], owner = '') {
  const queue = milestones.flatMap((milestone) => milestone.tasks.map((task) => ({ ...task, hito: milestone.slug })))
  const mine = new Set(claims.filter((one) => owner && one.owner === owner).map((one) => one.slug))
  const others = new Map(claims.filter((one) => !mine.has(one.slug)).map((one) => [one.slug, one.owner]))
  if (wip) {
    const active = queue.find((task) => task.slug === wip.task)
      || {
        slug: wip.task, hito: '', tier: '', cast: { build: '', review: [] },
        service: wip.service, acceptance: '', epic: '', criteria: [],
      }
    return { task: active, claimed: mine.has(wip.task), skipped: [], taken: [] }
  }
  const blocked = new Set(blockers.map((action) => action.task))
  const pending = queue.filter((task) => !done.set.has(task.slug) && !blocked.has(task.slug))
  const claimed = pending.find((task) => mine.has(task.slug))
  return {
    task: claimed || pending.find((task) => !others.has(task.slug)) || null,
    // Que la tarea devuelta ya sea mía o esté libre cambia lo que corresponde hacer con ella, y desde
    // afuera las dos se ven igual.
    claimed: Boolean(claimed),
    skipped: queue.filter((task) => !done.set.has(task.slug) && blocked.has(task.slug))
      .map((task) => task.slug),
    taken: pending.filter((task) => others.has(task.slug))
      .map((task) => ({ slug: task.slug, owner: others.get(task.slug) })),
  }
}


// Si el planning declara trabajo, en cualquiera de sus dos estados. Lo preguntan dos: el guard
// `plan-first`, para no exigir un plan donde todavía no hay de dónde sacar una tarea, y
// `automation check`, para poder decir que ese guard está inerte. Vive acá y no en el guard porque con
// dos copias una se pudre y el reporte anuncia una condición distinta de la que el guard aplica.
function hasTasks(root) {
  return P.readBacklog(root).some((milestone) => milestone.tasks.length > 0)
    || P.readDone(root).entries.length > 0
}


module.exports = { snapshot, pendingHumanActions, currentTask, hasTasks }
