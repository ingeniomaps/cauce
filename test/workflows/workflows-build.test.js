'use strict'

// `autobuild` y `flow` leídos como fuente: qué fases declaran, qué exige cada exit gate y qué viaja
// entre etapas. Leer no es correr — `autobuild.test.js` y `flow.test.js` los ejecutan con los
// subagentes simulados, y ahí se comprueba que un freno frene.

const { CLI } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const WF = path.resolve(__dirname, '..', '..', 'automatization', 'workflows')

const workflow = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'automatization', 'workflows', 'autobuild.js'), 'utf8',
)

const flowWorkflow = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'automatization', 'workflows', 'flow.js'), 'utf8',
)

test('autobuild implementa el protocolo completo sin rutas de proyectos fuente', () => {
  const phases = [
    'Triage', 'Pick', 'Ready', 'Decompose', 'Plan', 'Critique', 'Build',
    'Review', 'Verify', 'QA', 'Commit', 'Done', 'Closing',
  ]
  for (const phase of phases) {
    assert.match(workflow, new RegExp(`phase\\('${phase}'\\)`))
  }
  assert.equal(/['"`][^'"`\n]*-ops\//.test(workflow), false, 'directorio de proyecto hardcodeado')
  assert.match(workflow, /workspaceRoots/)
  assert.match(workflow, /AWAITING_REVIEW/)
  assert.match(workflow, /HUMAN_ACTIONS/)
  assert.match(workflow, /exitCode/)
})

test('autobuild deriva gate, mutex y selección de tarea del CLI, no de un modelo', () => {
  assert.match(workflow, /ops\.js context \$\{P\} --json/, 'el estado sale del comando determinista')
  const selection = workflow.slice(workflow.indexOf("phase('Pick')"), workflow.indexOf("phase('Ready')"))
  for (const file of ['BACKLOG', 'HUMAN', 'WIP', 'GATE']) {
    assert.equal(
      new RegExp(`Read \\$\\{${file}\\}`).test(selection), false,
      `Pick no debe pedirle a un subagente que lea ${file}`,
    )
  }
})

// Se apoya en la redacción de los prompts, y es a propósito: lo que se defiende es que el contrato entre
// una sola vez y que el preámbulo lo diga. Si alguien reescribe esas frases, tiene que volver a acá y
// confirmar que la garantía sigue en pie, en vez de que se pierda con un cambio de estilo.
test('autobuild lee el contrato una sola vez y no obliga a releerlo', () => {
  const reads = workflow.match(/Leé \$\{ROOT\}\/AGENTS\.md/g) || []
  assert.equal(reads.length, 1, 'AGENTS.md se lee una vez por corrida, en el digest')
  assert.match(workflow, /no vuelvas a leer/, 'el preámbulo prohíbe releer el contrato')
  for (const value of ['maxTaskHours', 'commitPerTask', 'humanCheckpoint']) {
    assert.match(workflow, new RegExp(`contract\\.${value}`), `${value} viaja en el digest, no se relee`)
  }
})

// Un contraste sin schema no recibe nada que contrastar: el campo llega ausente y la lista vacía pasa.
test('el veredicto declara en su schema qué se inspeccionó', () => {
  assert.match(workflow, /required: \['verdict', 'concerns', 'consulted'\]/, 'el schema exige el manifiesto')
})

// Un exit code no separa el test que prueba la aceptación del que no asercia nada, y el guard de verify
// tampoco: mira exit codes. Por eso el rojo previo se declara como campo, y un campo que el schema no
// pide no llega.
test('Build declara el rojo previo en su schema', () => {
  assert.match(workflow, /required: \['completed', 'summary', 'redFirst'/, 'Build declara el rojo previo')
})

test('la aceptación viaja a Verify, que declara qué criterio no cubre', () => {
  assert.match(
    workflow, /required: \['passed', 'commands', 'details', 'uncovered'\]/,
    'verify declara qué criterio quedó sin codificar',
  )
  const verify = workflow.slice(workflow.indexOf("phase('Verify')"), workflow.indexOf("phase('QA')"))
  assert.match(verify, /task\.acceptance/, 'la aceptación viaja al que audita el fuente de los tests')
})

// Lo que aparece y el plan no previó se encamina según quién puede resolverlo, y esa distinción entra
// al recorrido declarada: sin el enum, las dos cosas llegan como el mismo valor y no hay qué encaminar.
// Que después se encamine bien lo ejecuta `autobuild.test.js`.
test('lo descubierto declara de qué tipo es y con qué se cierra', () => {
  assert.match(workflow, /kind: \{ type: 'string', enum: \['edge', 'open'\] \}/, 'Build declara qué encontró')
  assert.match(workflow, /enum: \['missing-test', 'ambiguous'\]/, 'el criterio sin cubrir declara su causa')
  assert.match(
    workflow, /dejó abierta[\s\S]{0,200}quién puede tomarla/,
    'y una decisión abierta se registra pidiendo quién puede tomarla',
  )
})

test('autobuild ejecuta cada fase bajo el contrato del cargo que la posee', () => {
  // Los dueños por defecto son deterministas: no se le pregunta a un modelo quién revisa arquitectura.
  for (const owner of ['product-manager', 'software-architect', 'qa-engineer', 'release-manager']) {
    assert.ok(workflow.includes(owner), `falta el dueño por defecto ${owner}`)
  }
  assert.match(workflow, /asRole\(/, 'las fases adoptan un contrato en vez de improvisar criterio')
  assert.match(workflow, /agents list \$\{ROOT\} --json/, 'los slugs salen del CLI, no de la memoria')
  assert.match(workflow, /No inventes slugs/)

  // Un cargo se suma por riesgo, plataforma o alcance; nunca por rutina, y el criterio va escrito:
  // sin él la clasificación es intuición, y la intuición manda todo al carril que no hay que justificar.
  assert.match(workflow, /Sumar un cargo que no aporta es ruido/)
  assert.match(workflow, /Lane: `express` si la aceptación nombra un valor literal/)
  assert.match(workflow, /phase\('Classify'\)/)
  assert.ok(workflow.includes("'Classify'"), 'la fase está declarada en meta')

  // Clasificar es lo primero y ocurre una vez: la tarea que ya declara carril y reparto no vuelve a
  // pasar por ahí, y la que sí pasa deja la decisión escrita en su línea en vez de en la corrida.
  assert.match(workflow, /const unclassified = !planning\.lane \|\| !planning\.cast\.build/)
  assert.match(workflow, /const cast = \{ \.\.\.OWNERS, build: planning\.cast\.build \}/,
    'quien implementa sale de la línea, no de una llamada')

  // El reparto queda como evidencia auditable, no sólo en la cabeza del runner.
  assert.match(workflow, /auditar quién revisó qué/)
})

test('flow recorre las etapas del manifiesto y exige cada exit gate', () => {
  // El recorrido sale del CLI, no de un modelo leyendo el JSON a ojo.
  assert.match(flowWorkflow, /flow show \$\{CANDIDATE\} --json/)
  // El contrato sale de un solo agente: dos llamadas para transcribir salida determinista de CLI
  // costaban un cuarto del recorrido.
  assert.equal(flowWorkflow.split("label: 'flow-").length - 1, 1, 'un solo agente de contrato')
  assert.match(flowWorkflow, /agents list --json/, 'y resuelve dónde vive cada cargo')
  assert.match(flowWorkflow, /exitGate/, 'cada etapa tiene su gate')
  assert.match(flowWorkflow, /enum: \['cumplido', 'con-condiciones', 'no-cumplido'\]/, 'con sus tres salidas')
  // Se lee el fuente y no la corrida: lo que se fija es que el corte mire el gate de la etapa, que es
  // de dónde sale la diferencia entre cortar por nivel y cortar por etapa.
  assert.match(flowWorkflow, /one\.result\.gate !== 'no-cumplido'/)
  assert.match(flowWorkflow, /if \(blocked\.length\) break/)
  for (const phase of ['Contract', 'Stages', 'Draft', 'Closing']) {
    assert.match(flowWorkflow, new RegExp(`phase\\('${phase}'\\)`))
  }
})

// Separar el resumen del análisis sólo sirve si cada uno va a donde corresponde: si la etapa siguiente
// recibe la ruta también, el tope no ahorra nada, y si la síntesis recibe sólo el resumen, escribe la
// épica desde él. Y lo que vuelve por el esquema es la ruta, no el texto: mientras el campo pudo
// contener el análisis entero lo contuvo, y la respuesta con schema dejaba de llegar.
test('flow manda el resumen entre etapas y la ruta del análisis a la síntesis', () => {
  assert.match(flowWorkflow, /required: \['gate', 'analysis', 'summary'\]/, 'la etapa declara los dos')
  assert.match(flowWorkflow, /Handoffs previos[\s\S]{0,120}entry\.summary/, 'entre etapas viaja el resumen')
  assert.equal(
    /Handoffs previos[\s\S]{0,120}entry\.analysis/.test(flowWorkflow), false,
    'y no la ruta, que la etapa siguiente no necesita para decidir',
  )
  assert.match(
    flowWorkflow, /Handoffs completos[\s\S]{0,40}JSON\.stringify\(complete\)/,
    'quien sintetiza recibe los handoffs enteros',
  )
  assert.match(flowWorkflow, /leé esos archivos antes de escribir/, 'y la orden de leer el análisis')
})

// El arnés ejecuta el recorrido pero no valida los schemas —eso lo hace el runtime—, así que un enum
// recortado pasa desapercibido ahí. Y el contrato del equipo enumera sus salidas: «hacer, no hacer o
// investigar». Con dos, la del medio se convierte en la primera, que es presupuestar lo que nadie sabe.
test('el recorrido de equipo tiene las tres salidas que el contrato enumera', () => {
  const contract = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'flows', 'system', 'feasibility-review', 'FLOW.md'), 'utf8',
  )
  assert.match(contract, /hacer, no hacer o investigar/, 'el contrato del equipo enumera tres salidas')
  assert.match(flowWorkflow, /enum: \['hacer', 'investigar', 'no-hacer'\]/, 'y el recorrido las tiene')
  // Cada una con su destino, que el mismo contrato nombra.
  assert.match(flowWorkflow, /outcome === 'investigar'[\s\S]{0,400}label: 'investigar'/, 'investigar')
  assert.match(flowWorkflow, /outcome === 'no-hacer'[\s\S]{0,400}label: 'inbox-lesson'/, 'no hacer')
  assert.match(flowWorkflow, /label: 'epic-write'/, 'hacer')
})

test('flow nunca promueve: escribe la épica y para', () => {
  assert.match(flowWorkflow, /ROADMAP/, 'la épica candidata va al roadmap')
  assert.match(flowWorkflow, /No toques BACKLOG\.md/, 'y el BACKLOG queda fuera de su alcance')
  assert.match(flowWorkflow, /promoted: false/)
  assert.equal(/\$\{BACKLOG\}/.test(flowWorkflow), false, 'ni siquiera conoce la ruta del backlog')

  // Un bloqueo termina en una acción humana concreta, no en un intento de resolverlo solo.
  assert.match(flowWorkflow, /HUMAN/)
  assert.match(flowWorkflow, /gate-no-cumplido/)
  // Y una intención no viable deja la lección registrada en vez de perderse.
  assert.match(flowWorkflow, /INBOX/)
  assert.match(flowWorkflow, /no-viable/)
})

test('flow no deja pasar una opinión del modelo como evidencia', () => {
  assert.match(flowWorkflow, /No confundas una opinión/)
  assert.match(flowWorkflow, /sin evidencia observable/)
  assert.match(flowWorkflow, /Dueños de decisión/, 'la autoridad por dominio viaja en cada prompt')
})

test('flow acepta la intención suelta, con prefijo de equipo o estructurada', () => {
  const block = flowWorkflow.match(/const input = [\s\S]*?const INTENT = [^\n]*\n/)[0].replace(/\bconst /g, 'var ')
  const resolve = new Function('args', `${block} return { CANDIDATE, INTENT, raw }`)

  // Sin prefijo, todo el texto es la intención.
  assert.deepEqual(resolve('quiero cobrar con tarjeta'), {
    CANDIDATE: 'product-development', INTENT: 'quiero cobrar con tarjeta', raw: 'quiero cobrar con tarjeta',
  })
  // Con prefijo, el candidato se separa; se confirma después contra los equipos que existen.
  const withPrefix = resolve('incident-review: se cayó el checkout')
  assert.equal(withPrefix.CANDIDATE, 'incident-review')
  assert.equal(withPrefix.INTENT, 'se cayó el checkout')
  // El texto crudo se conserva para poder recomponerlo si el prefijo no era un equipo.
  assert.equal(withPrefix.raw, 'incident-review: se cayó el checkout')
  // Estructurado, el prefijo no se interpreta: el equipo vino explícito.
  const estructurado = resolve({ intent: 'algo: con dos puntos', flow: 'acme-soporte' })
  assert.equal(estructurado.CANDIDATE, 'acme-soporte')
  assert.equal(estructurado.INTENT, 'algo: con dos puntos')
  assert.equal(resolve(undefined).INTENT, '', 'sin intención no arranca')
})

test('flow declara qué deja cada recorrido y ramifica según eso', () => {
  assert.match(flowWorkflow, /outcome === 'report'/, 'un informe no propone trabajo')
  assert.match(flowWorkflow, /REPORTS/)
  assert.match(flowWorkflow, /sin promoverlo/, 'los seguimientos no se promueven solos')
  assert.match(flowWorkflow, /flow list/, 'el equipo se confirma contra los que existen')
  // Se afirma por la negativa —que la instrucción no esté— porque lo que se retiró fue una lectura, y
  // una lectura que no ocurre no deja nada que aserciar del lado positivo.
  assert.equal(/report nothing from it/.test(flowWorkflow), false, 'nada se lee para descartarlo')
  assert.match(flowWorkflow, /equipo-inexistente/)
})

// Un recorrido que frena en la etapa 3 tiraba el trabajo de las dos primeras: los handoffs vivían sólo
// en memoria. Lo notó el ciclo de aprendizaje de un cargo, que no encontraba sus propios veredictos.
test('un bloqueo conserva lo que las etapas anteriores ya resolvieron', () => {
  const flow = fs.readFileSync(path.join(WF, 'flow.js'), 'utf8')
  assert.match(
    flow, /handoffs\.filter\(\(entry\) => entry\.gate !== 'no-cumplido'\)/,
    'lo que cerró se recupera, con condiciones o sin ellas',
  )
  assert.match(flow, /ya quedó establecido/, 'y llega al prompt que escribe la acción humana')
  assert.match(flow, /es el trabajo que ya se pagó/)
})
