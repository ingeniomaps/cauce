'use strict'

// Qué le falta a una instancia para poder arrancar, y qué preguntarle a quien la creó. Vive en el motor
// —y no en el recorrido del runner— porque es determinista y tiene que costar cero: la versión anterior
// gastaba un subagente de un minuto para terminar diciendo «volvé a correrlo con contexto», que a quien
// no conoce la herramienta no le dice nada. Una pregunta escrita es la diferencia entre guiar y mandar
// a averiguar.

const fs = require('node:fs')
const path = require('node:path')

// El molde llega con estos marcadores. Que sigan ahí es la señal de que nadie escribió todavía.
const PLACEHOLDERS = /Por completar|Por definir/

// La única pregunta que no depende de ninguna respuesta, y por eso la única que se puede escribir de
// antemano. Las cuatro fijas que había antes daban por sentado que el proyecto vende algo: a uno libre,
// interno o sin fines de lucro le preguntaban quién paga antes de saber de qué se trataba.
const OPENING = '¿De qué trata este proyecto? Una línea alcanza.'

// Lo que hay que cubrir para poder escribir `organization/`, no cómo preguntarlo: la pregunta concreta
// la formula quien conduce la conversación, con las palabras de este proyecto, y en un proyecto libre
// «cómo se sostiene» se pregunta de una manera que en una empresa no tendría sentido. Son dimensiones,
// no un formulario, y quien pregunta puede cubrir dos con una sola pregunta si vienen juntas.
const DIMENSIONS = [
  { key: 'quien', need: 'a quién sirve y quién lo usa' },
  { key: 'sostiene',
    need: 'cómo se sostiene: venta, suscripción, donación, presupuesto interno o trabajo voluntario' },
  { key: 'exito', need: 'qué querés que pase en este período y cómo se va a notar' },
  { key: 'alcance', need: 'qué servicios o carpetas están muertos o fuera de alcance' },
  { key: 'externos', need: 'qué sistema externo o MCP hace falta conectar, y contra qué entorno' },
  { key: 'codigo', need: 'dónde está el código, que todavía no aparece en el workspace' },
]

// Tres seguidas ya son una conversación; más, un formulario. La apertura no cuenta: es la que decide
// cuáles de las demás valen la pena.
const FOLLOW_UPS = 3

function organizationWritten(root) {
  const file = path.join(root, 'organization', 'company.md')
  try { return !PLACEHOLDERS.test(fs.readFileSync(file, 'utf8')) } catch { return false }
}

function roadmapWritten(root) {
  const dir = path.join(root, 'planning', 'roadmap')
  try {
    return fs.readdirSync(dir).some((name) => /^epic-\d+/.test(name) && !/^epic-000/.test(name))
  } catch { return false }
}

// El estado de una instancia, la pregunta con la que se empieza y lo que queda por cubrir. `services`
// viene del escaneo: sin código, preguntar por el alcance no tiene sobre qué caer, y preguntar dónde
// está el código sí.
function guide(root, services = []) {
  const written = { organization: organizationWritten(root), roadmap: roadmapWritten(root) }
  const fresh = !written.organization && !written.roadmap
  const irrelevant = services.length ? 'codigo' : 'alcance'
  return {
    fresh,
    written,
    services: services.length,
    opening: fresh ? OPENING : '',
    followUps: fresh ? FOLLOW_UPS : 0,
    dimensions: fresh ? DIMENSIONS.filter((dimension) => dimension.key !== irrelevant) : [],
  }
}

module.exports = { guide, OPENING, DIMENSIONS, FOLLOW_UPS, PLACEHOLDERS }
