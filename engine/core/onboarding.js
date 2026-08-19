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

// Lo que ningún escaneo puede deducir: por qué existe el negocio y qué está muerto. Lo demás —qué
// servicios hay, qué comandos declaran— sale del repositorio y no se pregunta.
const QUESTIONS = [
  { key: 'negocio', text: '¿Qué vende la empresa y a quién? Una línea alcanza.' },
  { key: 'objetivo', text: '¿Cuál es el objetivo del trimestre y cómo se mide?' },
  { key: 'alcance', text: '¿Qué servicios o carpetas están muertos o fuera de alcance?' },
  { key: 'externos', text: '¿Qué sistema externo o MCP hace falta conectar, y contra qué entorno?' },
  { key: 'codigo', text: '¿Dónde está el código? Todavía no hay ningún proyecto en el workspace.' },
]

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

// El estado de una instancia y las preguntas que le corresponden. `services` viene del escaneo: sin
// código, la pregunta por el alcance no tiene sobre qué caer y la del código sí.
function guide(root, services = []) {
  const written = { organization: organizationWritten(root), roadmap: roadmapWritten(root) }
  const fresh = !written.organization && !written.roadmap
  const irrelevant = services.length ? 'codigo' : 'alcance'
  return {
    fresh,
    written,
    services: services.length,
    questions: fresh ? QUESTIONS.filter((question) => question.key !== irrelevant) : [],
  }
}

module.exports = { guide, QUESTIONS, PLACEHOLDERS }
