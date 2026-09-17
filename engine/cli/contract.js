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
const { fail, opsRoot, USAGE } = require('./io')

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
// Y el camino declarado, que es el que no adivina: una viñeta bajo `### Límites`. El molde lo trae desde
// 0.92.0 para que quien escriba una excepción tenga dónde ponerla en vez de tener que imitar la gramática
// de arriba (caso 157).
//
// Los dos caminos conviven a propósito. Quitar `ENUNCIA` al agregar la marca dejaría de contar lo ya
// escrito en instancias vivas —que es la decisión que el caso pedía tomar sobre lo existente—, y así no
// hay nada que migrar: lo viejo sigue entrando, lo nuevo entra mejor, y lo que no entra por ninguno lo
// reporta `warnings`.
const MARKED = /^###\s+Límites\s*$/m

// Se recorren **todos** los bloques `### Límites`, no el primero. El molde ya trae uno con su ejemplo,
// así que quien agregue el suyo al final del archivo —que es lo que hace cualquiera— queda con dos, y
// leer sólo el primero devolvía cero viñetas: el límite del proyecto no llegaba y el aviso tampoco lo
// veía, porque para la comparación caía dentro de la sección del molde.
//
// No filtra comentarios y no hace falta: una viñeta comentada arranca con `<!--`, así que el filtro de
// viñetas ya la descarta. Sacar `withoutComments` de acá fue el resultado de una mutación que sobrevivió
// —apagarlo no ponía nada en rojo—, que es como se ve una defensa que no defiende de nada.
// Un solo recorrido de los bloques: las viñetas, que son los límites declarados, y la prosa que las
// presenta. Las dos salen de acá porque dónde empieza y dónde termina un bloque se decide una vez; con
// dos recorridos, el que delimita para `limits` y el que delimita para `warnings` se despegan y nada
// falla.
//
// El intro se corta en la primera viñeta y no al final del bloque, y eso es lo único que separa este
// arreglo de un silenciador. A un bloque no lo cierra nada más que el próximo encabezado, así que el del
// molde se extiende hasta donde alguien escriba el suyo: medido sobre un banco, el primer bloque se
// llevaba adentro los cuatro párrafos que la persona había agregado al final de la sección. Descontar el
// bloque entero —que es lo que parecía el arreglo— apagaba justo lo que el aviso existe para encontrar.
const BULLET = /^\s*[-*]\s+/
// Una viñeta es la viñeta entera, no su primera línea. Un límite de verdad no entra en el ancho del
// archivo, así que se escribe en dos, y recorriendo línea por línea lo que viajaba al preámbulo de cada
// subagente era la mitad — cortada justo donde suele estar lo que el límite decide (caso 168).
//
// `own` son las líneas **sin plegar**, y existe para `warnings`: descuenta por línea contra lo que el
// archivo tiene escrito (caso 159), y una viñeta ya plegada no coincide con ninguna de esas líneas, así
// que su continuación volvía a contarse como un párrafo perdido. Son dos preguntas distintas sobre el
// mismo bloque: qué dice cada límite, y qué líneas ya están cubiertas.
function marked(raw) {
  const bullets = []
  const intros = []
  const own = []
  let rest = raw
  for (let start = rest.search(MARKED); start >= 0; start = rest.search(MARKED)) {
    const after = rest.slice(start).split('\n').slice(1)
    const end = after.findIndex((line) => /^#{1,3}\s/.test(line))
    const block = end < 0 ? after : after.slice(0, end)
    const first = block.findIndex((line) => BULLET.test(line))
    if (first > 0) intros.push(...block.slice(0, first).map((line) => line.trim()).filter(Boolean))
    // Una línea en blanco cierra la viñeta abierta: lo que venga después es otra cosa y pegarlo ahí
    // uniría dos límites en uno.
    let open = -1
    for (const line of first < 0 ? [] : block.slice(first)) {
      const text = line.replace(BULLET, '').trim()
      if (!text) { open = -1; continue }
      // A `own` va lo que pertenece a una viñeta y nada más. Empujar toda línea no vacía haría que la
      // prosa suelta que quedó bajo el encabezado contara como declarada y `warnings` dejara de nombrarla:
      // el plegado apagaría el aviso en vez de arreglar el límite.
      if (BULLET.test(line)) { bullets.push(text); open = bullets.length - 1; own.push(text) }
      else if (open >= 0) { bullets[open] += ` ${text}`; own.push(text) }
    }
    rest = (end < 0 ? '' : after.slice(end).join('\n'))
  }
  return { bullets, intros, own }
}

const declared = (raw) => marked(raw).bullets

function limits(text) {
  const prose = text.split(/\n\s*\n/)
    .map((block) => block.split('\n')
      .map((line) => line.replace(/^[-*]\s+/, '').trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('|'))
      .join(' ')
      .trim())
    .filter((block) => ENUNCIA.test(block))
  return [...declared(text), ...prose]
}

// Lo que el proyecto escribió en su sección de excepciones y **no** llegó a `boundaries`. Existe porque
// perder un límite acá no se ve: la lista sale más corta y se lee igual de completa, y el preámbulo de
// cada subagente sigue afirmando «Límites del proyecto: …» con los que sí matcharon (caso 157).
//
// Lo que cuenta como «escrito por el proyecto» no se deduce de la gramática —sería el mismo defecto con
// otra cara—: se compara contra el molde, que viaja en el paquete. Un párrafo que el molde no trae lo
// puso alguien de este proyecto, y si además no enuncia, es exactamente lo que se está perdiendo.
//
// No avisa de la sección vacía, que es el caso fácil y el que menos importa: el caro es encontrar dos de
// tres, y ése sólo se ve comparando párrafo por párrafo.
const TEMPLATE_WORKSPACE = path.join(__dirname, '..', '..', 'template', 'organization', 'workspace.md')

const paragraphs = (text) => text.split(/\n\s*\n/)
  .map((block) => block.split('\n')
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('|'))
    .join(' ')
    .trim())
  .filter(Boolean)

function warnings(root) {
  const mine = P.section(readIfAny(path.join(root, 'organization', 'workspace.md')),
    /Excepciones de autonom/)
  if (!mine.trim()) return []
  // Sin comentarios de los dos lados: el ejemplo del molde viene comentado, y contarlo como párrafo lo
  // volvería un aviso permanente sobre algo que nadie escribió.
  const fromTemplate = new Set(paragraphs(
    P.withoutComments(P.section(readIfAny(TEMPLATE_WORKSPACE), /Excepciones de autonom/)),
  ))
  // Se descuenta por línea y no por párrafo, que es donde estaba el defecto: `paragraphs` saca el `- ` y
  // une las viñetas seguidas en un párrafo solo, así que una lista declarada no era igual a ninguna
  // entrada de `declared()` y se contaba entera como un límite perdido (caso 159).
  const { own, intros } = marked(mine)
  const suyo = new Set([...own, ...intros])
  const outside = P.withoutComments(mine).split('\n')
    .filter((line) => !suyo.has(line.replace(BULLET, '').trim()))
    .join('\n')
  const lost = paragraphs(outside)
    .filter((one) => !fromTemplate.has(one) && !ENUNCIA.test(one))
  if (!lost.length) return []
  // El aviso nombra el camino declarado y no la gramática, aunque los dos sigan valiendo: desde 0.92.0
  // hay una forma de arreglar esto que no pide imitar nada, y mandar a la otra es mandar al camino que
  // el 157 existe para no tener que usar. Quien ya escribió «El runner…» no necesita el aviso — no le
  // sale.
  return [`organization/workspace.md: ${lost.length} párrafo(s) de "## Excepciones de autonomía" no llegan `
    + 'a los agentes. El que sea un límite va como viñeta bajo `### Límites`: '
    + `${lost.map((one) => `"${one.slice(0, 60)}…"`).join(', ')}`]
}

function contract(dir, cli) {
  const root = opsRoot(dir)
  const missing = SOURCES.find((name) => !fs.existsSync(path.join(root, name)))
  // Sin los cuatro no hay contrato que derivar, y contestar uno a medias es peor que no contestar: lo que
  // se pierde no se ve en la salida, se ve tres fases después en lo que un subagente creyó que podía tocar.
  if (missing) {
    return fail(`${root} no tiene ${missing}, así que no hay contrato que derivar. Es la raíz que escribió `
      + '`automation install`: comprobá que exista y, si moviste el proyecto de carpeta, reinstalá el adaptador.',
    USAGE)
  }

  let config
  try {
    config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
  } catch (error) {
    return fail(`ops.config.json no se pudo leer como JSON: ${error.message}`, USAGE)
  }

  const sections = {}
  for (const { file, heading, name } of REQUIRED_SECTIONS) {
    const found = P.section(readIfAny(path.join(root, file)), heading)
    // Nombrar la sección y el archivo es lo que separa este error de «algo salió mal»: quien lo lee tiene
    // que poder abrir el archivo y ver qué encabezado falta, y el arreglo es restaurarlo con `upgrade`.
    if (!found.trim()) {
      return fail(`${file} no tiene la sección ${name}, y de ahí sale el contrato que reciben los agentes. `
        + 'Ese archivo lo reemplaza `ops upgrade` entero: corrélo para restaurarlo.', USAGE)
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

module.exports = { contract, warnings }
