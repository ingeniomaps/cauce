'use strict'

// Qué le falta a una instancia para poder arrancar, y qué preguntarle a quien la creó. Vive en el motor
// —y no en el recorrido del runner— porque es determinista y tiene que costar cero: la versión anterior
// gastaba un subagente de un minuto para terminar diciendo «volvé a correrlo con contexto», que a quien
// no conoce la herramienta no le dice nada. Una pregunta escrita es la diferencia entre guiar y mandar
// a averiguar.

const fs = require('node:fs')
const path = require('node:path')
const { inventory } = require('./scan')

// La raíz del paquete: el molde contra el que se compara lo que una instancia escribió.
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..')

// El molde llega con estos marcadores, y quien redacta los deja donde todavía no hay decisión. Que
// sigan ahí es la señal de que nadie escribió: vale para una instancia sin arrancar y para una épica
// que no se puede activar. Sin distinguir mayúsculas, porque `por definir` en medio de una frase dice
// exactamente lo mismo que al principio de una.
const PLACEHOLDERS = /Por completar|Por definir/i

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

function missingSections(root) {
  const warnings = []
  const template = path.join(PACKAGE_ROOT, 'template', 'organization')
  for (const name of ['company.md', 'product.md', 'domains.md']) {
    const written = path.join(root, 'organization', name)
    if (!fs.existsSync(written) || !fs.existsSync(path.join(template, name))) continue
    const headings = (text) => new Set((text.match(/^##\s+(.+)$/gm) || []).map((line) => line.trim()))
    const expected = headings(fs.readFileSync(path.join(template, name), 'utf8'))
    const present = headings(fs.readFileSync(written, 'utf8'))
    const missing = [...expected].filter((heading) => !present.has(heading))
    if (!missing.length) continue
    // Reescrito entero, faltan todas: enumerarlas hace una línea ilegible y el número dice más.
    const summary = missing.length > 3
      ? `${missing.slice(0, 3).join(', ')} y ${missing.length - 3} más`
      : missing.join(', ')
    warnings.push(`organization/${name}: sin ${summary} — el molde las trae y acá no están`)
  }
  return warnings
}

// Credenciales que el proyecto declara y que no aparecen en ningún contrato. El arranque tiene que
// dejar una fila por cada una —quién la carga y dónde— y en la práctica cubre las que se hablaron en la
// conversación: las que sólo estaban en el inventario se pierden, y con ellas el servicio externo que
// hay detrás. Una variable sin dueño no rompe nada hoy; rompe el día que alguien tiene que desplegar.
//
// Sólo cuando la instancia ya tiene contexto escrito: antes del arranque no hay dónde estuvieran.
function orphanCredentials(root) {
  if (guide(root).fresh) return []
  const contracts = ['AGENTS.md', path.join('planning', 'HUMAN_ACTIONS.md')]
    .map((file) => { try { return fs.readFileSync(path.join(root, file), 'utf8') } catch { return '' } })
    .join('\n')
  if (!contracts) return []
  const orphans = []
  for (const service of inventory(root)) {
    for (const name of (service.env || {}).names || []) {
      if (!contracts.includes(name)) orphans.push(`${name} (${service.path})`)
    }
  }
  if (!orphans.length) return []
  const summary = orphans.length > 4
    ? `${orphans.slice(0, 4).join(', ')} y ${orphans.length - 4} más`
    : orphans.join(', ')
  return [`el proyecto declara ${summary} y no aparecen en el mapa ni en HUMAN_ACTIONS: nadie las carga`]
}

module.exports = {
  missingSections,
  orphanCredentials,
  guide,
  OPENING,
  DIMENSIONS,
  FOLLOW_UPS,
  PLACEHOLDERS,
}
