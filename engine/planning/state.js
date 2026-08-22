'use strict'

// El estado de un planning ya leído y cuál es la tarea que sigue. Es un nivel por encima de `parser`,
// que lee un archivo por vez: acá se compone lo que hace falta para decidir, y se aplica la precedencia
// que fija el protocolo. Vivía en el CLI, donde nadie podía ejercitarlo sin lanzar un proceso.

const P = require('./parser')

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


// Acciones humanas que todavía bloquean: las pendientes y también las mal escritas, porque una fila
// cuyo estado no se entiende no se puede dar por resuelta. `check` es quien las nombra.
function pendingHumanActions(root) {
  return P.readHumanActions(root).filter((row) => !row.resolved)
    .map((row) => ({ task: row.task, state: row.state, action: row.action }))
}


// Selecciona la tarea que un runner debe ejecutar ahora, con la misma precedencia que el protocolo:
// WIP activo primero —es el mutex y manda incluso si tiene una acción humana abierta—, si no la
// primera tarea no terminada y no bloqueada del primer hito.
function currentTask({ milestones, done, wip }, blockers = []) {
  const queue = milestones.flatMap((milestone) => milestone.tasks.map((task) => ({ ...task, hito: milestone.slug })))
  if (wip) {
    const active = queue.find((task) => task.slug === wip.task)
      || {
        slug: wip.task, hito: '', tier: '', cast: { build: '', review: [] },
        service: wip.service, acceptance: '', epic: '', criteria: [],
      }
    return { task: active, skipped: [] }
  }
  const blocked = new Set(blockers.map((action) => action.task))
  const pending = queue.filter((task) => !done.set.has(task.slug))
  return {
    task: pending.find((task) => !blocked.has(task.slug)) || null,
    skipped: pending.filter((task) => blocked.has(task.slug)).map((task) => task.slug),
  }
}


module.exports = { snapshot, pendingHumanActions, currentTask }
