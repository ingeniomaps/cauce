'use strict'

// Los recorridos leídos como fuente: que su `meta` sea el literal puro que el runtime acepta, que no
// llamen a nada inexistente y que ninguna ruta sea la de una máquina.
//
// Leer no es correr, y por eso están aparte `autobuild.test.js` y `flow.test.js`, que los ejecutan con
// los subagentes simulados. `ci.test.js` comparte la palabra «workflow» y nada más: ahí son los de
// GitHub Actions.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Acá los workflows se leen como fuente, y lo que se afirma es lo que sólo se ve leyendo: los schemas
// y el texto que viaja dentro de un prompt. Que un freno frene se comprueba ejecutándolo —en las suites
// que corren el recorrido—, así que un `stop(...)` no se afirma en los dos lados.

const workflow = fs.readFileSync(path.resolve(__dirname, '..', 'automatization', 'workflows', 'autobuild.js'), 'utf8')

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

// El runtime exige que `meta` sea un literal puro y rechaza el archivo entero antes de la primera fase
// si no lo es. Nada lo comprobaba: `autobuild` derivaba sus catorce fases con un `.map` y no arrancaba,
// cosa que ningún test veía porque todos leen el cuerpo y el arnés lo evalúa sin pasar por esa validación.
test('el meta de cada workflow es un literal puro, que es lo que el runtime acepta', () => {
  for (const file of workflowFiles()) {
    const bloque = (fs.readFileSync(file, 'utf8').match(/export const meta = \{[\s\S]*?\n\}/) || [])[0]
    assert.ok(bloque, `${path.relative(WF, file)}: sin bloque meta`)
    // Sin comentarios ni literales de texto: adentro hay prosa con paréntesis y flechas.
    const desnudo = bloque
      .replace(/\/\/[^\n]*/g, '')
      .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
      .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""')
      .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    for (const [patron, queEs] of [[/\w\s*\(/, 'una llamada'], [/\.\.\./, 'un spread'], [/\$\{/, 'interpolación']]) {
      assert.equal(patron.test(desnudo), false, `${path.relative(WF, file)}: el meta tiene ${queEs}`)
    }
  }
})

test('workflows de integración usan el registro general y no escriben remoto', () => {
  for (const name of ['sync.js', 'promote.js']) {
    const file = path.resolve(__dirname, '..', 'automatization', 'workflows', 'integrations', name)
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /provider/)
    assert.match(source, /integration check/)
    assert.match(source, /Nunca|never|Never/)
  }
})

const flowWorkflow = fs.readFileSync(
  path.resolve(__dirname, '..', 'automatization', 'workflows', 'flow.js'), 'utf8',
)

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
    path.resolve(__dirname, '..', 'flows', 'system', 'feasibility-review', 'FLOW.md'), 'utf8',
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

// El runtime de workflows es un sandbox: no expone `process`, ni `require`, ni el reloj. Un workflow
// que los use no falla en una rama rara — revienta en su primera línea y no llega a ejecutar nada.
// Los demás tests leen estos archivos como texto, así que esto se sostuvo sin que nadie lo notara.
const WF = path.resolve(__dirname, '..', 'automatization', 'workflows')

function workflowFiles() {
  const found = []
  for (const entry of fs.readdirSync(WF, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) found.push(path.join(entry.parentPath, entry.name))
  }
  return found
}

// La misma comprobación estaba repartida en cuatro tests, con dos listas distintas: dos miraban rutas
// de Windows y dos no, así que un `C:\\Users\\...` pasaba por la mitad de ellas. Y entre las cuatro
// dejaban afuera los tres `agent-*.js`, que nadie miraba. Una sola, con una lista, sobre todos.
//
// Se lee renderizado: lo que incluye `{{INCLUDE:}}` también viaja a la instancia.
test('ningún workflow lleva la ruta de una máquina', () => {
  const A = require('../engine/automation')
  const automation = path.resolve(__dirname, '..', 'automatization')
  // La unidad de Windows no se ancla con \b: en prosa española `ó` no es carácter de palabra, así
  // que `intención:\n` ofrecía un límite entre la `ó` y la `n`, y `n:\` pasaba por `C:\`. El
  // lookbehind pide que antes de la letra no haya otra, que es lo que distingue una unidad de la
  // última letra de una palabra.
  const DE_UNA_MAQUINA = [/\/home\//, /\/Users\//, /(?<![A-Za-zÀ-ÿ])[A-Za-z]:\\/]
  const filtradas = []
  for (const file of workflowFiles()) {
    const source = A.render(file, '{{OPS_DIR}}', automation, '{{OPS_ROOT}}')
    for (const patron of DE_UNA_MAQUINA) {
      if (patron.test(source)) filtradas.push(`${path.relative(WF, file)} → ${patron}`)
    }
  }
  assert.ok(workflowFiles().length >= 8, 'el recorrido encontró los workflows')
  assert.deepEqual(filtradas, [])
})

test('un workflow sólo usa lo que el runtime le da', () => {
  const prohibidas = /\b(process\.|require\(|Date\.now|new Date\(|Math\.random|__dirname|__filename)/g
  const encontradas = []
  for (const file of workflowFiles()) {
    const source = fs.readFileSync(file, 'utf8')
    for (const hit of source.matchAll(prohibidas)) {
      encontradas.push(`${path.relative(WF, file)} → ${hit[1]}`)
    }
  }
  assert.deepEqual(encontradas, [])
})

// Un identificador que el runtime no da y el archivo no define revienta el workflow, y lo hace en el
// momento en que se lo llama: `finish` estaba en la línea de cierre, así que el recorrido gastaba
// cada etapa y moría al final. Leer estos archivos como texto no alcanza para verlo.
test('un workflow no llama a nada que no exista', () => {
  // Lo que el runtime inyecta, más los built-ins del lenguaje.
  const runtime = new Set(['agent', 'parallel', 'pipeline', 'log', 'phase', 'workflow'])
  const builtins = new Set([
    'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Promise', 'Set', 'Map',
    'RegExp', 'Error', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent',
  ])
  const keywords = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'new', 'do',
  ])
  const faltantes = []
  const A = require('../engine/automation')
  const automation = path.resolve(__dirname, '..', 'automatization')
  for (const file of workflowFiles()) {
    // Renderizado: `finish`, `stop` y `ROOT` llegan por `{{INCLUDE:}}`, así que el archivo crudo no
    // los declara y cada uno parecería una llamada a algo inexistente.
    // Sin comentarios ni literales: adentro hay prosa en castellano que parece una llamada.
    const source = A.render(file, '{{OPS_DIR}}', automation)
      .replace(/\/\/[^\n]*/g, '')
      .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
      .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
      .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""')
    const declared = new Set(
      [...source.matchAll(/(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((hit) => hit[1]),
    )
    for (const hit of source.matchAll(/(?:^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/gm)) {
      const name = hit[1]
      if (runtime.has(name) || builtins.has(name) || keywords.has(name) || declared.has(name)) continue
      faltantes.push(`${path.relative(WF, file)} → ${name}`)
    }
  }
  assert.deepEqual([...new Set(faltantes)], [])
})

// El único recorrido que modifica un cargo. Sus dos candados no son estilo: sin el primero un agente
// se autorizaría a sí mismo, y sin el segundo quedaría un contrato cambiado sin que nadie sepa si
// todavía se sostiene.
test('promover un cargo exige firma humana y verificación posterior', () => {
  const promote = fs.readFileSync(path.join(WF, 'agent-promote.js'), 'utf8')
  assert.match(promote, /sin-firma/, 'se detiene si no está aprobada')
  assert.match(promote, /nadie se autoriza a sí mismo/)
  assert.match(promote, /propuesta-vacia/, 'y si el cambio todavía es "por definir"')
  assert.match(promote, /agent-eval/, 'y manda a correr los casos contra el contrato nuevo')
  // Nunca aplica lo que no está firmado: la lectura de la firma ocurre antes que cualquier escritura.
  assert.ok(promote.indexOf("label: 'firma'") < promote.indexOf('aplica:'), 'la firma se lee primero')

  // Y no la aplica dos veces. La firma no sirve de candado —sigue firmada después—, así que el estado
  // terminal lo lleva el frontmatter, y sellarlo es lo último que ocurre: antes de eso sigue pendiente.
  assert.match(promote, /ya-aplicada/, 'una propuesta aplicada se rechaza')
  // Rechazar sin decir a dónde ir dejaba al cargo con un contrato que la evaluación mostró mal
  // calibrado y sin camino hasta el mes siguiente. La salida es la revisión, y va nombrada.
  assert.match(promote, /abrí una revisión/, 'y nombra la salida en vez de mandar a esperar')
  assert.match(promote, /-r\\d\+\)\?/, 'la revisión es un nombre que el recorrido sabe leer')
  assert.match(promote, /--applied --period/, 'y al terminar se sella')
  assert.ok(promote.indexOf("label: 'historial'") < promote.indexOf("label: 'sella'"), 'sella al final')

  // El que propone jamás toca el cargo: si lo hiciera, la firma llegaría tarde.
  const propose = fs.readFileSync(path.join(WF, 'agent-propose.js'), 'utf8')
  assert.match(propose, /No toques «Aprobación humana»/)
  assert.match(propose, /no su aplicación/, 'propone, no aplica')
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

// Un cargo nunca corre sólo con su SKILL.md: `AGENTS.md` lleva las reglas que todos obedecen, y el
// puntero que instala cada runner se lo dice. Medirlo sin ellas lo evaluaba en una situación que no
// ocurre — y ahí se perdía la regla general que corrige el patrón «se niega bien y no entrega».
test('la evaluación mide al cargo como corre, no aislado', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')
  assert.match(evalWf, /AGENTS\.md/, 'la respuesta se da con las reglas generales a la vista')
  assert.match(evalWf, /nunca ocurre/, 'y queda dicho por qué')
})

// El criterio del juez tiene que salir de un archivo versionado y no del prompt de quien lanza la
// corrida. Mientras dependió del prompt, el listón se movió entre rondas: un mismo caso se midió tres
// veces con tres criterios y su serie dejó de ser comparable consigo misma.
test('quien juzga recibe la conducta prohibida del contrato', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')
  assert.match(evalWf, /forbidden: \{ type: 'array'/, 'los prohibidos viajan con los casos')
  assert.match(evalWf, /context\.forbidden/, 'y llegan a quien juzga')
  assert.match(evalWf, /no ocurre ninguna conducta \`?\s*\+?\s*\`?prohibida/, 'y deciden el veredicto')
  // Un rótulo no es una verificación: el modo de fallo que aparece apenas la regla existe es escribir
  // «verificado» encima de algo que nadie comprobó.
  assert.match(evalWf, /no prueba que el contenido sea/, 'y el juez no acepta el rótulo como prueba')
})

// El arnés medía a los cargos dentro del toolkit, donde `planning/` es `template/planning` y se
// distribuye a cada instalación. Un cargo que se niega a escribir ahí acierta, y el caso lo contaba
// como fallo: `product-manager` fallaba exactamente los dos casos que piden escribir, y ninguno más.
//
// Primero se documentó en un comentario, y no alcanzó. Después se cortó la corrida, y tampoco: negarse
// dejaba el catálogo sin forma de medirse. Lo que se fija acá es la salida — un banco donde trabajar.
test('la evaluación le arma al cargo un lugar donde trabajar', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')
  assert.match(evalWf, /ops\.config\.json.*mode/s, 'lee el modo del proyecto')
  assert.match(evalWf, /mode === 'toolkit'/, 'y distingue el toolkit de una instancia')
  assert.match(evalWf, /--bench/, 'en el toolkit le arma un banco desechable')
  assert.match(evalWf, /Trabajás en \$\{benchPath/, 'y el cargo trabaja ahí, no en la raíz')
  // Uno por caso: con un banco compartido los casos se leían entre sí y dejaban de medir lo suyo.
  assert.match(evalWf, /--bench \$\{item\.id\}/, 'un banco por caso, nombrado por el caso')
  assert.match(evalWf, /benchPath = \(item\)/, 'y cada caso resuelve el suyo')

  // El veredicto pertenece al contrato que lo rindió, y el banco se borra en la próxima corrida.
  assert.match(evalWf, /evaluate \$\{AGENT\} --record/, 'el registro va donde el motor dice')
  assert.match(evalWf, /no en el banco/, 'dicho explícitamente, que es donde se equivocaría')
  // La ruta la resuelve el motor y no el prompt. Componerla acá desde la fecha hacía que una segunda
  // corrida del mismo día —la que sigue a aplicar una propuesta— escribiera encima de la línea base.
  assert.doesNotMatch(evalWf, /results\/<fecha>/, 'sin componer el nombre desde la fecha')

  // La otra mitad del par: acá se lee el fuente del recorrido, y `bench.test.js` corre el comando.
  assert.match(evalWf, /cargo-del-catalogo/, 'y un cargo del catálogo se rechaza ahí')
  assert.match(evalWf, /agents fork/, 'nombrando la salida, no sólo el rechazo')

  // El artefacto de un caso adversarial se le nombra a quien responde y a quien juzga, y por motivos
  // distintos: uno tiene que leerlo, el otro tiene que saber que no lo escribió el cargo.
  assert.match(evalWf, /item\.fixtures/, 'el recorrido conoce el artefacto del caso')
  assert.match(evalWf, /Leelos antes de contestar/, 'y le dice al cargo que lo lea')
  assert.match(evalWf, /no es obra suya/, 'y al juez, que vino con el banco')

  // Comprobar las afirmaciones de mecanismo lo hacía a mano quien lanzaba la corrida, así que el hallazgo
  // dependía de que a alguien se le ocurriera la comprobación correcta y la vara se movía entre corridas.
  // Va con redacción fija y fuera del bloque de conducta prohibida: un cargo puede afirmar de más aunque
  // su contrato no declare ninguna.
  assert.match(evalWf, /Enumeralas con el registro que cada una lleva/, 'el juez busca las afirmaciones')
  assert.match(evalWf, /comprobá las que se puedan comprobar barato/, 'y comprueba las baratas')
  assert.match(evalWf, /nunca conectarte a un sistema real/, 'sin salirse de lo que R12 permite')
  // Las tres que fallaron tenían casi todo bien rotulado y floja justo la que sostenía su recomendación.
  assert.match(evalWf, /Empezá por la afirmación de la que depende la recomendación/, 'por dónde empezar')
  assert.match(evalWf, /en las dos direcciones/, 'afirmar de más y desinflar de más cuentan igual')
  assert.ok(
    evalWf.indexOf('Enumeralas con el registro') < evalWf.indexOf('conductas prohibidas, que rigen'),
    'el bloque no cuelga de la lista de conducta prohibida, que puede venir vacía',
  )
  assert.match(evalWf, /precisión de procedencia/, 'exigiéndole que verifique lo que se le atribuye')

  // El banco enlaza al repositorio vivo, así que una edición concurrente del toolkit se ve desde
  // adentro. Tres jueces la descartaron bien por su cuenta; decirlo de entrada les ahorra el trabajo.
  assert.match(evalWf, /symlink al repositorio/, 'el juez sabe que el banco no está aislado')
  assert.match(evalWf, /trabajo concurrente ajeno/, 'y qué significa encontrar algo modificado ahí')
})

const onboardWorkflow = fs.readFileSync(
  path.resolve(__dirname, '..', 'automatization', 'workflows', 'onboard.js'), 'utf8',
)

// Medido: la fase que escribe gastó veinte vueltas —seis lecturas y tres ediciones— para producir cuatro
// archivos, y cada vuelta arrastra el contexto entero del subagente. El techo de agentes no alcanza si
// adentro de cada uno el trabajo se hace en veinte pasos.
test('onboard acota las vueltas dentro de cada fase, no sólo la cantidad de fases', () => {
  assert.match(onboardWorkflow, /las vueltas que das/)
  assert.match(onboardWorkflow, /Leé un archivo una sola vez/)
  assert.match(onboardWorkflow, /sin ` \+\n  `editarlo después/)
  assert.match(onboardWorkflow, /Una sola corrida de check/)
  assert.match(onboardWorkflow, /leé esa sección y no el archivo ` \+\n  `entero/)
})

test('onboard tiene techo de llamadas y no sale a explorar', () => {
  // Tres agentes como máximo, y ninguno recorre nada: un arranque que hace esperar diez minutos deja de
  // serlo. Escribir el contexto y registrar lo que le toca a una persona salen de la misma evidencia.
  assert.equal(onboardWorkflow.split('await agent(').length - 1, 3)
  assert.match(onboardWorkflow, /No ` \+\n  `recorras directorios/)
  assert.match(onboardWorkflow, /no leas código fuente/)
  assert.match(onboardWorkflow, /no una auditoría/)
})

test('onboard no gasta un modelo en recorrer un árbol de directorios', () => {
  // Se afirma sobre el fuente porque lo que se fija es el orden: que el comando determinista aparezca
  // antes que cualquier llamada a un agente. En una corrida sólo se vería el tiempo que costó.
  assert.match(onboardWorkflow, /tools\/ops\.js onboard --json/, 'una llamada, a un comando determinista')
  assert.match(onboardWorkflow, /Explore nothing/, 'y tiene prohibido salir a explorar')
  assert.equal(/phase\('Verify'\)/.test(onboardWorkflow), false, 'ya no corre las suites del proyecto')
  assert.match(onboardWorkflow, /No corras comandos del proyecto/, 'este recorrido lee, no ejecuta')
  // El mapa dice lo que el proyecto declara y de dónde salió; verificarlo corriendo es una historia.
  assert.match(onboardWorkflow, /tal como los declara/)
  assert.match(onboardWorkflow, /No afirmes que/, 'nadie los corrió, así que no se declara que corran')
  assert.match(onboardWorkflow, /Verificar los comandos es una historia/)
})

test('onboard devuelve preguntas en vez de mandar a averiguar', () => {
  // Un mensaje que dice «volvé a correrlo con contexto» no guía a quien no sabe qué hace la herramienta.
  // Las preguntas salen del motor —una sola lista— y el recorrido las devuelve para que el runner las haga.
  assert.match(onboardWorkflow, /tools\/ops\.js onboard --json/)
  assert.match(onboardWorkflow, /needsContext: true/)
  assert.match(onboardWorkflow, /state\.opening/)
  assert.match(onboardWorkflow, /no como formulario/)
  assert.match(onboardWorkflow, /No des ` \+\n  `por sentado que el proyecto vende algo/)
  assert.equal(/const QUESTIONS/.test(onboardWorkflow), false, 'sin una segunda lista que envejezca sola')
  assert.match(onboardWorkflow, /ya-arrancado/, 'y no pisa una instancia ya completada')
  assert.match(onboardWorkflow, /force/, 'reescribir es explícito')
  // Con contexto y sin código sí hay algo que escribir: traer los repos es la primera historia.
  assert.match(onboardWorkflow, /La primera historia es traer los repos/)
})

test('onboard escribe borradores y deja a una persona lo que es suyo', () => {
  assert.match(onboardWorkflow, /\(supuesto\)/, 'lo deducido queda marcado')
  assert.match(onboardWorkflow, /No leas archivos de/, 'y las credenciales no se leen')
  assert.match(onboardWorkflow, /\.env\.example sí/, 'salvo el ejemplo, que es público')
  // Credenciales, MCP y permiso de push: tres filas, no tres decisiones del runner.
  assert.match(onboardWorkflow, /HUMAN/)
  assert.match(onboardWorkflow, /allowPush=false/)
  assert.match(onboardWorkflow, /ningún ` \+\n  `valor se propone acá/, 'la fila dice qué falta, no un valor')
  // Y no le pide a nadie declarar lo que el repositorio ya declara: eso es negar la evidencia que se
  // le entregó, y fue lo que produjo filas pidiendo un .env.example que ya existía.
  assert.match(onboardWorkflow, /no pidas declararlo de nuevo/)
  assert.match(onboardWorkflow, /is a claim the repository contradicts/)
  assert.match(onboardWorkflow, /No toques ` \+\n  `BACKLOG\.md/, 'y la épica no se promueve')
  assert.match(onboardWorkflow, /promoted: false/)
})

// Un runner que sólo lee instrucciones cumple el contrato a medias, y falla siempre del mismo lado: se
// salta lo que no deja un archivo visible. La lista de salida existe para lo que se comprueba mirando el
// disco, y por eso viaja con cada arranque que no es un workflow ejecutable.
//
// Se lee del archivo que cada uno instala de verdad, resuelto desde su manifest: gemini la llevaba en
// `GEMINI.md` de cuando el arranque le llegaba sólo como prosa, quedó copiada palabra por palabra de la
// de codex, y las dos se pudrieron igual. Preguntarle al manifest evita elegir el archivo a mano.
test('los runners sin workflow llevan la lista de lo que se comprueba al final', () => {
  const A = require('../engine/automation')
  const REPO = path.resolve(__dirname, '..')
  const automation = path.join(REPO, 'automatization')
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    // La distinción real no es tener recorrido sino de qué está hecho: un workflow JS es un programa
    // con fases y esquemas, y el resto es prosa enmarcada, que es la que tiene que llevar la lista.
    const arranque = (runner.artifacts || []).find((item) => /onboard/.test(item.source))
    if (!arranque || arranque.source.endsWith('.js')) continue
    const dir = path.join(automation, 'runners', name)
    const text = A.render(path.resolve(dir, arranque.source), '', automation)
    for (const marca of [/Por definir/, /\(supuesto\)/, /epic-NNN-<slug>\.md/, /HUMAN_ACTIONS\.md/,
      /formulario/, /molde/]) {
      assert.match(text, marca, `${name}: ${marca} falta en ${arranque.source}`)
    }
  }
})

test('cada runner ofrece el arranque en el formato que entiende', () => {
  const A = require('../engine/automation')
  const REPO = path.resolve(__dirname, '..')
  const nativos = []
  for (const name of A.RUNNER_NAMES) {
    const runner = A.runnerManifest(REPO, name)
    const artefactos = (runner.artifacts || []).map((item) => item.source)
    if (artefactos.some((source) => /onboard/.test(source))) { nativos.push(name); continue }
    // Sin artefacto nativo, el recorrido tiene que estar escrito en las instrucciones del runner:
    // Codex y Gemini operan el protocolo a mano y no tienen dónde ejecutarlo.
    const instrucciones = (runner.instructions || []).map(
      (item) => fs.readFileSync(path.resolve(REPO, 'automatization', 'runners', name, item.source), 'utf8'),
    ).join('\n')
    assert.match(instrucciones, /## El arranque/, `${name} no dice cómo arranca una instancia vacía`)
  }
  // Los cuatro instalan su arranque. Codex fue el último: su adaptador lo daba por incapaz de skills
  // desde 0.39.0, así que le llegaba sólo como prosa dentro de AGENTS.md mientras el CLI ya las leía.
  assert.deepEqual(nativos.sort(), [...A.RUNNER_NAMES].sort())
})

// El comando que prepara los bancos falla y el recorrido tiene que detenerse: seguía igual, y un
// falso negativo es peor que una corrida que no arranca, porque se archiva como medición.
test('un banco que no se pudo rehacer detiene la corrida', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')
  assert.match(evalWf, /required: \['path', 'failed'\]/, 'qué bancos fallaron viaja en el schema')
  assert.match(evalWf, /stop\('banco-sin-rehacer'/, 'y frenan la corrida en vez de medir con uno viejo')
  assert.match(evalWf, /do not add --force/, 'el agente no decide por su cuenta pisar lo que hay')
  assert.match(evalWf, /leftover directory from an earlier run/, 'ni da por bueno lo que sobró')
})

// Frenar bien y aconsejar de más es un modo de fallo propio: quien siga la instrucción al pie pierde
// bancos que no estaba re-midiendo. Re-corriendo un solo caso de `change-review`, el mensaje proponía
// borrar `.cauce-eval/change-review` entero, y ahí vivía también el banco del caso vecino. Los ids de
// los que fallaron ya están en la mano cuando se arma el mensaje.
test('el banco que se manda a borrar es el del caso, no el del recorrido', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'flow-eval.js'), 'utf8')
  const aviso = evalWf.slice(evalWf.indexOf("stop('banco-sin-rehacer'"))
  const mensaje = aviso.slice(0, aviso.indexOf('\n}'))
  assert.match(mensaje, /benches\.failed\.map\(\(id\) => `\$\{BENCH_ROOT\}\/\$\{id\}`\)/,
    'la ruta a borrar se arma por caso')
  assert.equal(/o borrá \$\{BENCH_ROOT\}\./.test(mensaje), false,
    'y ya no propone el directorio del recorrido, que se lleva los casos ajenos')
})

// Que el fuente invoque el recorrido y no describa uno: la diferencia entre ejecutar e imitar se ve
// leyéndolo, y en la corrida las dos formas producen un veredicto que se lee igual.
test('la evaluación de un recorrido lo ejecuta en vez de imitarlo', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'flow-eval.js'), 'utf8')
  assert.match(evalWf, /workflow\('flow', \{ flow: FLOW, intent: item\.request/, 'corre el recorrido real')
  assert.match(evalWf, /root: `\$\{BENCH_ROOT\}\/\$\{item\.id\}`/, 'y lo corre sobre el banco del caso')
  assert.match(evalWf, /mediría la imitación/, 'y queda dicho por qué')

  // Un recorrido entrega escribiendo —épica, INBOX, acciones humanas—, así que juzgarlo sólo por lo
  // que devolvió lo daría por ausente. Es el mismo hallazgo que ya tenía `agent-eval`.
  assert.match(evalWf, /git -C \$\{BENCH_ROOT\}\/\$\{item\.id\} status --porcelain/, 'el juez lee el banco')
  assert.match(evalWf, /lo daría por ausente/)

  // Frenar es un resultado legítimo en varios de estos casos, y confundirlo con un fallo mediría al
  // revés: el recorrido que se detiene donde debe estaría reprobando por hacer lo correcto.
  assert.match(evalWf, /no es de por sí un fallo/, 'un stop no se cuenta como fallo automático')
  assert.match(evalWf, /stop\('banco-sin-rehacer'/, 'y no mide contra un banco viejo')
})

// El recorrido no puede escribir en el planning del toolkit —no hay— ni ensuciar el de una empresa
// para medirse. Necesita trabajar sobre el banco, y eso exige que sepa correr en otra raíz.
test('un recorrido puede correr sobre la raíz que se le nombra', () => {
  const flow = fs.readFileSync(path.join(WF, 'flow.js'), 'utf8')
  assert.match(flow, /const WORKDIR = String\(\(typeof args === 'string' \? '' : \(args \|\| \{\}\)\.root\)/)
  assert.match(flow, /const P = `\$\{WORKDIR\}\/planning`/, 'y escribe ahí, no en la raíz de invocación')
  assert.equal(/\$\{ROOT\}/.test(flow), false, 'ninguna ruta quedó atada a la raíz de invocación')
})

// Se exige a los dos evaluadores sobre el fuente ya expandido, y por eso el `for`: el filtro entró
// primero en `agent-eval` y `flow-eval` quedó sin él meses después de que los dos lo necesitaran
// igual. Es la quinta vez que un arreglo entra en un gemelo y no en el otro —`contexto`, la ruta del
// CLI, el esquema de dos niveles, el freno de banco—, y las cuatro anteriores costaron corridas.
for (const name of ['agent-eval', 'flow-eval']) {
  test(`${name} puede correr sólo los casos que se le nombran`, () => {
    const src = require('../engine/automation').render(path.join(WF, `${name}.js`), '', path.dirname(WF))
    assert.match(src, /const ONLY = onlyCases\(input\)/, 'acepta uno, varios o ninguno')
    assert.match(src, /context\.items = pick\.items/, 'y corre sólo ésos')

    // Un id que no existe frena en vez de correr una batería vacía y registrar cero de seis.
    assert.match(src, /stop\('caso-inexistente'/, 'un caso mal escrito no se convierte en corrida vacía')
    assert.match(src, /Tiene: \$\{pick\.existen\.join\(', '\)\}/, 'y dice cuáles hay')

    // Y queda dicho que el registro parcial no vale por sí solo, que es lo que evita el próximo error:
    // dar por medido un sujeto con un registro que cubre uno de seis.
    assert.match(src, /el registro va a cubrir \$\{ONLY\.length\} de \$\{pick\.existen\.length\}/)
  })
}

test('y evaluate dice que un registro parcial no alcanza', () => {
  const src = require('../engine/automation').render(path.join(WF, 'agent-eval.js'), '', path.dirname(WF))
  assert.match(src, /el resultado no vale/, 'por qué evaluate lo va a rechazar')
})

// Un nombre que no existe no rompe al leer el archivo: rompe en la fase que lo usa, después de que la
// corrida ya gastó sus agentes. Un rename a medias dejó `contexto` junto a `context` y así se descubrió
// —tres corridas frenadas y ~370k tokens—, con el agravante de que el encabezado de esta suite ya
// prometía «que no llamen a nada inexistente» sin que nada lo comprobara.
//
// Se mira el código y no la prosa: dentro de un template literal el texto se descarta y lo de `${}` se
// conserva, porque es ahí donde vivía el nombre roto.
function codeOnly(src) {
  let out = ''
  let i = 0
  let mode = 'code'
  // Pila explícita: `tpl` es un template abierto, `expr` una interpolación adentro de uno. Sin
  // distinguirlas, cerrar un template anidado dentro de un `${}` devolvía a modo texto cuando todavía
  // se estaba en código, y la prosa de ese tramo entraba al análisis como si fueran identificadores.
  const stack = []
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (mode === 'code') {
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
      if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2) + 2; continue }
      if (c === "'" || c === '"') {
        const quote = c
        i++
        while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1
        i++
        out += ' '
        continue
      }
      if (c === '`') { stack.push({ type: 'tpl' }); mode = 'template'; i++; out += ' '; continue }
      const top = stack[stack.length - 1]
      if (c === '}' && top && top.type === 'expr') {
        if (top.braces === 0) { stack.pop(); mode = 'template'; i++; continue }
        top.braces--
      }
      if (c === '{' && top && top.type === 'expr') top.braces++
      out += c
      i++
      continue
    }
    if (c === '\\') { i += 2; continue }
    if (c === '`') {
      stack.pop()
      const top = stack[stack.length - 1]
      mode = top && top.type === 'tpl' ? 'template' : 'code'
      i++
      continue
    }
    if (c === '$' && d === '{') { stack.push({ type: 'expr', braces: 0 }); mode = 'code'; i += 2; out += ' '; continue }
    i++
  }
  return out
}

test('ningún workflow usa un nombre que no declaró', () => {
  // Lo que el arnés le pone a un workflow, más lo que trae el runtime. `{{INCLUDE:}}` se resuelve como
  // al instalar: lo que declara el fragmento compartido está declarado.
  const HARNESS = new Set(['agent', 'parallel', 'pipeline', 'log', 'phase', 'args', 'budget', 'workflow',
    'JSON', 'Math', 'Array', 'String', 'Object', 'Number', 'RegExp', 'Boolean', 'Promise', 'Date', 'Set',
    'Map', 'console', 'Error', 'process', 'require', 'module', 'exports', 'Symbol', 'globalThis'])
  const AUTOMATION = path.resolve(__dirname, '..', 'automatization')
  for (const file of workflowFiles()) {
    const source = fs.readFileSync(file, 'utf8')
      .replace(/\{\{INCLUDE:([^}]+)\}\}/g, (_, rel) =>
        fs.readFileSync(path.resolve(AUTOMATION, rel.trim()), 'utf8'))
    const code = codeOnly(source)
    const declared = new Set()
    for (const m of code.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1])
    for (const m of code.matchAll(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().match(/^\.{0,3}([A-Za-z_$][\w$]*)/)
        if (name) declared.add(name[1])
      }
    }
    for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1])
    for (const m of code.matchAll(/(?:\(|,|^|\s)\s*([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1])
    for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().match(/^\.{0,3}([A-Za-z_$][\w$]*)/)
        if (name) declared.add(name[1])
      }
    }
    for (const m of code.matchAll(/(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().match(/([A-Za-z_$][\w$]*)\s*$/)
        if (name) declared.add(name[1])
      }
    }
    // Sólo la cabeza de cada cadena: en `context.items.length` el que tiene que existir es `context`.
    const free = new Set()
    for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\./g)) {
      if (!declared.has(m[1]) && !HARNESS.has(m[1])) free.add(m[1])
    }
    assert.deepEqual([...free], [], `${path.relative(WF, file)}: usa un nombre que no declaró`)
  }
})

// Que el CLI salga de una respuesta con schema y no de una ruta escrita a mano. Se comprueba sobre el
// fuente porque es ahí donde una ruta fija se ve, y en la corrida sólo se ve el destrozo que causó.
test('agent-eval averigua qué CLI existe en vez de suponerlo', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')

  assert.match(evalWf, /cli: \{ type: 'string' \}/, 'la ruta del CLI viaja en el schema, no en la prosa')
  assert.match(evalWf, /"tools\/ops\.js" if that file exists and "engine\/cli\/ops\.js" otherwise/,
    'y el primer agente la averigua nombrando las dos')

  // Los dos agentes que corren comandos la usan. Que uno solo la use deja el otro roto sin que se vea.
  assert.match(evalWf, /node \$\{context\.cli\} evaluate \$\{AGENT\} --bench/, 'los bancos')
  assert.match(evalWf, /node \$\{context\.cli\} evaluate \$\{AGENT\} --record/, 'el registro')
})

// El manifiesto que `flow` transcribe sale de un `flow.json` real, y su schema es
// `additionalProperties: false`. Cuando el schema no acepta un campo que el contrato sí tiene, el
// agente lo copia —le pedimos que reporte lo que el comando imprimió—, el runtime lo rechaza y el
// reintento vuelve a copiarlo: se acaba el retry cap y la corrida muere sin haber hecho nada. Pasó con
// `dependsOn`, que está en las etapas de los seis contratos, en dos de cuatro corridas — dos, porque
// depende de que el agente adivine que tiene que tirar un campo que está en la fuente.
test('el schema del manifiesto acepta los campos que los contratos de recorrido tienen', () => {
  const flowWf = fs.readFileSync(path.join(WF, 'flow.js'), 'utf8')
  const stageBlock = flowWf.match(/stages: \{ type: 'array', items: \{[\s\S]*?\n {4}\} \} \},/)
  assert.ok(stageBlock, 'no se encontró el bloque de etapas del schema')
  const accepted = new Set([...stageBlock[0].matchAll(/([a-zA-Z]+): \{ type:/g)].map((m) => m[1]))

  // A las dos alturas. La primera versión de esta prueba miraba sólo las claves de las etapas, así que
  // `completion` y `conditionalAgents` —dos campos reales de todo contrato— siguieron reventando el
  // retry cap después de haberla escrito. Un caso de `feasibility-review` quedó sin medir por eso.
  const manifest = flowWf.slice(flowWf.indexOf('const MANIFEST'), flowWf.indexOf('const STAGE'))
  const topLevel = new Set([...manifest.matchAll(/([a-zA-Z]+): \{ type:/g)].map((hit) => hit[1]))
  const flowsDir = path.resolve(__dirname, '..', 'flows', 'system')
  const real = new Set()
  for (const slug of fs.readdirSync(flowsDir)) {
    const file = path.join(flowsDir, slug, 'flow.json')
    if (!fs.existsSync(file)) continue
    for (const stage of JSON.parse(fs.readFileSync(file, 'utf8')).stages || []) {
      for (const key of Object.keys(stage)) real.add(key)
    }
  }
  assert.ok(real.size, 'no se leyó ningún contrato de equipo')

  const missing = [...real].filter((key) => !accepted.has(key))
  assert.deepEqual(missing, [], 'el schema rechaza un campo de etapa que el contrato trae')

  const arriba = new Set()
  for (const slug of fs.readdirSync(flowsDir)) {
    const file = path.join(flowsDir, slug, 'flow.json')
    if (!fs.existsSync(file)) continue
    for (const key of Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')))) arriba.add(key)
  }
  // `schemaVersion` y `slug` no viajan: el recorrido ya sabe cuál es. `decisionOwners` viaja aplanado
  // en `owners`, que es lo que el prompt pide.
  const fuera = [...arriba].filter((key) => !topLevel.has(key)
    && !['schemaVersion', 'slug', 'decisionOwners'].includes(key))
  assert.deepEqual(fuera, [], 'el schema rechaza un campo de contrato que el manifiesto trae')
})

// El caso son los dos evaluadores a la vez, no uno cada uno: el arreglo entró en `agent-eval` y
// `flow-eval` quedó sin él. Un caso por gemelo deja pasar exactamente eso.
test('los dos evaluadores preguntan qué CLI existe, no lo suponen', () => {
  for (const name of ['agent-eval.js', 'flow-eval.js']) {
    const source = fs.readFileSync(path.join(WF, name), 'utf8')
    assert.match(source, /cli: \{ type: 'string' \}/, `${name}: la ruta viaja en el schema`)
    assert.match(source, /"tools\/ops\.js" if that file exists and "engine\/cli\/ops\.js" otherwise/,
      `${name}: el primer agente la averigua nombrando las dos`)
    // Los que el evaluador corre. Queda afuera la sugerencia de `fork`, que no se ejecuta acá: se le
    // muestra a una empresa, y ahí `tools/ops.js` es la ruta correcta.
    const corridos = [...source.matchAll(/node tools\/ops\.js (evaluate|agents list|learn)/g)]
    assert.deepEqual(corridos.map((hit) => hit[0]), [], `${name}: queda un comando con el CLI supuesto`)
  }
})
