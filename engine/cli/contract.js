'use strict'

// El contrato del proyecto, derivado del disco. Es lo que un recorrido necesita saber antes de la primera
// fase —cómo se llama el proyecto, dónde puede escribir, con qué se verifica, qué límites rigen y qué
// formatos exige planning— y hasta 0.91.0 lo producía un agente que leía cuatro archivos y los transcribía.
//
// Transcribir no es decidir: los diez campos salen de parsear. Seis son valores de `ops.config.json`, uno
// es copiar una sección de `PROTOCOL.md` y dos son secciones de `AGENTS.md` y `organization/workspace.md`.
// Pagarle a un modelo por eso cuesta una llamada por corrida y, sobre todo, hace que lo que viaja al
// preámbulo de cada subagente sea **lo que alguien transcribió** en vez de lo que el archivo dice (caso 154).
//
// El porqué de resolverlo con un comando y no con un agente ya está escrito donde se decidió la primera
// vez: el comentario de `readContext`, en el recorrido. Acá sólo se repite la elección, no su razón.

const fs = require('node:fs')
const path = require('node:path')
const P = require('../planning/parser')
const { fail, opsRoot } = require('./io')

// Los cuatro que componen el contrato, con la ruta relativa a la raíz de la instancia. El orden es el que
// usa el mensaje de error: se nombra el primero que falte y no los cuatro, porque arreglar uno suele
// arreglar la causa de los demás —una raíz mal apuntada los pierde todos a la vez—.
const SOURCES = ['AGENTS.md', path.join('organization', 'workspace.md'), 'ops.config.json',
  path.join('planning', 'PROTOCOL.md')]

// Qué sección sostiene cada campo de texto, y de quién es el archivo que la trae. La diferencia decide qué
// pasa cuando falta, y no es una preferencia: `AGENTS.md` y `PROTOCOL.md` están en `TEMPLATE_FILES`, así que
// `upgrade` los reemplaza enteros y su sección no puede faltar en una instancia viva —si falta, algo se
// rompió y seguir entregaría límites vacíos a cada subagente—. `organization/workspace.md` es del proyecto:
// que no declare excepciones es un estado legítimo y el molde lo dice.
const REQUIRED_SECTIONS = [
  { file: 'AGENTS.md', heading: /Autonom/, name: '## Autonomía' },
  { file: path.join('planning', 'PROTOCOL.md'), heading: /Contratos/, name: '## Contratos' },
]

const readIfAny = (file) => {
  try { return fs.readFileSync(file, 'utf8') } catch { return '' }
}

// Con qué arranca un párrafo que **enuncia** un límite, frente a uno que lo explica. Es vocabulario
// cerrado, igual que `lane` o `blocked`, y por la misma razón: lo que sigue es una lista de la que un
// agente tiene que poder obedecer cada entrada, y una heurística abierta admite cualquier cosa.
const ENUNCIA = /^(?:El runner\b|Debe\b|Nunca\b)/
// Un límite por entrada y no la sección cruda. `SCOPE()` las une con `; ` en una sola frase del preámbulo
// que se reenvía a **cada** subagente, así que el tamaño no se paga una vez: volcar ahí los dos mil bytes
// de la sección entera metía encabezados, conectores —«Eso rige sin que nadie escriba nada.»— y los
// párrafos que razonan sobre `BR-OPS-002` y `runner.allowPush`, que son prosa para una persona.
//
// Se corta por párrafo y por su sujeto, no por posición ni por oración. Partir por oración fue el primer
// intento y devolvía diecisiete entradas de las que cuatro eran límites; por posición habría funcionado
// sobre el molde de hoy y se habría roto con el primero que agregue un párrafo.
//
// Lo que esto no resuelve, y por eso existe el caso 157: que sea una deducción gramatical y no una marca.
// Un límite que el proyecto escriba con otra forma no entra, y eso no se ve — la lista sale más corta y se
// lee igual de completa. Sobre `AGENTS.md` casi no puede pasar porque `upgrade` lo reemplaza entero; sobre
// `organization/workspace.md`, que lo escribe una persona, pasa siempre que no imite esta gramática.
function limits(text) {
  return text.split(/\n\s*\n/)
    .map((block) => block.split('\n')
      .map((line) => line.replace(/^[-*]\s+/, '').trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('|'))
      .join(' ')
      .trim())
    .filter((block) => ENUNCIA.test(block))
}

function contract(dir, cli) {
  const root = opsRoot(dir)
  const missing = SOURCES.find((name) => !fs.existsSync(path.join(root, name)))
  // Sin los cuatro no hay contrato que derivar, y contestar uno a medias es peor que no contestar: lo que
  // se pierde no se ve en la salida, se ve tres fases después en lo que un subagente creyó que podía tocar.
  if (missing) {
    return fail(`${root} no tiene ${missing}, así que no hay contrato que derivar. Es la raíz que escribió `
      + '`automation install`: comprobá que exista y, si moviste el proyecto de carpeta, reinstalá el adaptador.', 2)
  }

  let config
  try {
    config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
  } catch (error) {
    return fail(`ops.config.json no se pudo leer como JSON: ${error.message}`, 2)
  }

  const sections = {}
  for (const { file, heading, name } of REQUIRED_SECTIONS) {
    const found = P.section(readIfAny(path.join(root, file)), heading)
    // Nombrar la sección y el archivo es lo que separa este error de «algo salió mal»: quien lo lee tiene
    // que poder abrir el archivo y ver qué encabezado falta, y el arreglo es restaurarlo con `upgrade`.
    if (!found.trim()) {
      return fail(`${file} no tiene la sección ${name}, y de ahí sale el contrato que reciben los agentes. `
        + 'Ese archivo lo reemplaza `ops upgrade` entero: corrélo para restaurarlo.', 2)
    }
    sections[file] = found
  }

  const roots = Array.isArray(config.workspaceRoots) ? config.workspaceRoots : []
  const runner = config.runner || {}
  const excepciones = P.section(readIfAny(path.join(root, 'organization', 'workspace.md')),
    /Excepciones de autonom/)
  const report = {
    rootOk: true,
    project: String(config.project || ''),
    // «nombre → ruta», que es la forma con la que el preámbulo las enumera como límite de escritura.
    workspaceRoots: roots.filter((one) => one && one.name && one.path).map((one) => `${one.name} → ${one.path}`),
    // Una entrada por raíz que declare `verify`, y ninguna por las que no: la lista vacía significa que el
    // proyecto no dice con qué se verifica, que es distinto de no haberlo mirado.
    gates: roots.filter((one) => one && one.path && one.verify).map((one) => `${one.path} → ${one.verify}`),
    maxTaskHours: Number(runner.maxTaskHours || 0),
    commitPerTask: Boolean(runner.commitPerTask),
    humanCheckpoint: Boolean(runner.humanCheckpointBetweenMilestones),
    // Textual y sin reformular: es el formato contra el que se escribe roadmap, BACKLOG, WIP y DONE, y un
    // resumen de un formato no sirve para cumplirlo.
    contracts: sections[path.join('planning', 'PROTOCOL.md')].trim(),
    // Los del toolkit primero y los del proyecto después, que es el orden en que se leen: lo segundo amplía
    // o restringe lo primero, y al revés se leería como si el proyecto fijara la base.
    boundaries: [...limits(sections['AGENTS.md']), ...limits(excepciones)],
  }
  if (cli.has('--json')) return console.log(JSON.stringify(report))
  console.log(`${report.project}  (${report.workspaceRoots.join('; ') || 'sin raíces declaradas'})`)
  console.log(`gates      ${report.gates.join('; ') || 'ninguno declarado'}`)
  console.log(`runner     ${report.maxTaskHours} h por tarea · `
    + `commit ${report.commitPerTask ? 'por tarea' : 'libre'} · `
    + `checkpoint ${report.humanCheckpoint ? 'entre hitos' : 'no'}`)
  console.log(`límites    ${report.boundaries.length} · contratos ${report.contracts.length} caracteres`)
}

module.exports = { contract }
