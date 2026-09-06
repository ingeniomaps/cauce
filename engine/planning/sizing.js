'use strict'

// Las dos barras de R17 sobre lo que ya está escrito: cuántas condiciones acumula una unidad y cuántas
// unidades acumula la de arriba. Vive aparte de `contracts` porque no juzga si algo está bien escrito
// sino si es demasiado, y su reloj es el de la regla: los números y qué se cuenta cambian cuando cambia
// R17, no cuando cambia un contrato de planning.
//
// La otra barra de R17 —las cuatro horas de esfuerzo— no está acá ni puede estar: no vive en el
// artefacto. La mira el review, y es la que la regla dice que encuentra lo que ésta deja pasar.

const R17 = { taskCriteria: 5, epicCriteria: 7, milestoneTasks: 9 }

// Se cuenta lo que está estructurado —criterios de la épica, criterios heredados, tareas del hito— y
// también la aceptación propia de una tarea, que se cuenta como el autor la marcó y no leyéndola;
// `acceptanceConditions` explica hasta dónde llega esa cuenta.
//
// Estuvo afuera con una razón escrita: un número inventado sobre una frase es peor que ninguno, y lo que
// esta barra no vea lo ve el review de R3 más la segunda barra de R17. Lo que no previó fue el
// comportamiento. En un proyecto real seis de cuarenta y ocho tareas cruzaban el umbral en prosa y
// ninguna se vio, incluida la primera de la cola; y para la forma que el molde muestra primero, la
// escapatoria que R17 describe no se pedía nunca, porque el umbral no se cruzaba. La regla nombra esa
// acumulación —condiciones que se suman de a tandas en cada rechazo de plan— y ocurre justamente ahí.
function oversizedUnits({ epics = [], milestones = [] }) {
  const errors = []
  const undecided = (what, count, limit) =>
    `${what}: ${count} (umbral ${limit} de R17). Revisá si son dos resultados con vidas distintas y `
    + 'partilo; si es uno solo, partirlo lo empeora — dejalo entero agregando "(sin partir: <razón>)"'
  const judge = (unit, what, count, limit) => {
    if (count > limit && !unit.noSplit) errors.push(undecided(what, count, limit))
  }
  for (const epic of epics) {
    judge(epic, `roadmap/${epic.file}: criterios`, epic.criteria.length, R17.epicCriteria)
  }
  for (const milestone of milestones) {
    judge(milestone, `hito ${milestone.slug}: tareas`, milestone.tasks.length, R17.milestoneTasks)
    for (const task of milestone.tasks) {
      // Se juzga la mayor de las dos y se nombra cuál: una tarea escribe su aceptación heredada o
      // propia, casi nunca las dos, y sumarlas contaría dos veces a la que repite en prosa lo que ya
      // citó. Nombrarla importa porque el mensaje llega solo: «criterios: 8» sobre una tarea sin un
      // `(→ CN)` a la vista manda a buscar ocho referencias que no existen.
      const propias = task.conditions || 0
      const heredados = task.criteria.length
      const que = heredados >= propias ? 'criterios' : 'condiciones de aceptación'
      judge(task, `BACKLOG ${task.slug}: ${que}`, Math.max(heredados, propias), R17.taskCriteria)
    }
  }
  return errors
}

module.exports = { oversizedUnits }
