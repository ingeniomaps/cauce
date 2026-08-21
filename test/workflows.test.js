'use strict'

const { temporal } = require('./entorno')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

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

// El manifiesto vive en dos piezas que se pueden separar sin querer: el schema que lo exige y el contraste
// que lo mira. Un schema sin contraste deja pasar la lista vacía, y un contraste sin schema no recibe nada.
test('autobuild no acepta un veredicto que no declare qué se inspeccionó', () => {
  assert.match(workflow, /required: \['verdict', 'concerns', 'consulted'\]/, 'el schema exige el manifiesto')
  for (const gate of ['critique', 'review']) {
    assert.match(
      workflow, new RegExp(`!${gate}\\.consulted\\.length.+stop\\('${gate}-unbacked'`),
      `${gate} contrasta el manifiesto antes de seguir`,
    )
  }
})

// Un exit code no separa el test que prueba la aceptación del que no asercia nada, y el guard de verify
// tampoco: mira exit codes. Por eso la cobertura se declara aparte, y sin el stop el campo sería adorno.
// Dos formas de cerrar en verde sin haber probado nada: no haber visto nunca el rojo, y correr gates que
// no incluyen la prueba recién escrita. Van juntas porque juntas son el mismo agujero.
test('autobuild exige el rojo previo y que algún gate lo corra', () => {
  assert.match(workflow, /required: \['completed', 'summary', 'redFirst'/, 'Build declara el rojo previo')
  assert.match(workflow, /sinFallo[\s\S]{0,160}stop\('build-unproven'/, 'un rojo declarado sin su fallo no vale')
  const verify = workflow.slice(workflow.indexOf("phase('Verify')"), workflow.indexOf("phase('QA')"))
  assert.match(
    verify, /ranTests \|\| RUNS_TESTS[\s\S]{0,200}stop\('verify-untested'/,
    'y los gates tienen que haber corrido la prueba, la reconozca el patrón o lo diga quien la corrió',
  )
})

test('autobuild no da por verificada una aceptación sin test que la codifique', () => {
  assert.match(
    workflow, /required: \['passed', 'commands', 'details', 'uncovered'\]/,
    'verify declara qué criterio quedó sin codificar',
  )
  const verify = workflow.slice(workflow.indexOf("phase('Verify')"), workflow.indexOf("phase('QA')"))
  assert.match(verify, /task\.acceptance/, 'la aceptación viaja al que audita el fuente de los tests')
  assert.match(verify, /verified\.uncovered\.length[\s\S]+stop\('verify-hollow'/, 'un criterio sin test frena')
})

// Lo que aparece y el plan no previó tiene dos destinos, y lo que los separa es quién puede resolverlo:
// una prueba que falta la escribe el propio recorrido, un pedazo de diseño que falta no. Si los dos
// terminan en el mismo stop, una persona paga la interrupción de lo que se arreglaba solo.
test('autobuild encamina lo descubierto según quién puede resolverlo', () => {
  assert.match(workflow, /kind: \{ type: 'string', enum: \['edge', 'open'\] \}/, 'Build declara qué encontró')
  assert.match(
    workflow, /abiertos[\s\S]{0,320}HUMAN[\s\S]{0,200}quién puede tomarla/,
    'una decisión abierta queda registrada con su dueño, y no frena lo que sí se entregó',
  )
  assert.match(workflow, /suelto[\s\S]{0,200}stop\('edge-unproven'/, 'y un caso fijado acá entra con su prueba')
  const verify = workflow.slice(workflow.indexOf("phase('Verify')"), workflow.indexOf("phase('QA')"))
  assert.match(workflow, /enum: \['missing-test', 'ambiguous'\]/, 'el criterio sin cubrir declara su causa')
  assert.match(verify, /ambiguo[\s\S]{0,320}stop\('acceptance-ambiguous'/, 'lo que pide una decisión escala')
  // Y lo que no la pide vuelve a quien construye, en vez de terminar la corrida.
  assert.match(verify, /uncovered\.length[\s\S]{0,400}verified = await run\(VERIFY_ASK/, 'lo demás rebota')
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

const teamWorkflow = fs.readFileSync(
  path.resolve(__dirname, '..', 'automatization', 'workflows', 'team.js'), 'utf8',
)

test('team recorre las etapas del manifiesto y exige cada exit gate', () => {
  // El recorrido sale del CLI, no de un modelo leyendo el JSON a ojo.
  assert.match(teamWorkflow, /team show \$\{CANDIDATE\} --json/)
  // El contrato sale de un solo agente: dos llamadas para transcribir salida determinista de CLI
  // costaban un cuarto del recorrido.
  assert.equal(teamWorkflow.split("label: 'team-").length - 1, 1, 'un solo agente de contrato')
  assert.match(teamWorkflow, /agents list --json/, 'y resuelve dónde vive cada cargo')
  assert.match(teamWorkflow, /exitGate/, 'cada etapa tiene su gate')
  assert.match(teamWorkflow, /gatePassed/, 'y el resultado lo declara explícitamente')
  // Un gate no cumplido corta el recorrido en vez de seguir con evidencia floja.
  assert.match(teamWorkflow, /if \(!result\.gatePassed\)/)
  assert.match(teamWorkflow, /break/)
  for (const phase of ['Contract', 'Stages', 'Draft', 'Closing']) {
    assert.match(teamWorkflow, new RegExp(`phase\\('${phase}'\\)`))
  }
})

// Separar el resumen del análisis sólo sirve si cada uno va a donde corresponde: si la etapa siguiente
// recibe findings, el tope no ahorra nada, y si la síntesis recibe el resumen, escribe la épica desde él.
test('team manda el resumen entre etapas y el análisis entero a la síntesis', () => {
  assert.match(teamWorkflow, /required: \['gatePassed', 'findings', 'summary'\]/, 'la etapa declara los dos')
  assert.match(teamWorkflow, /Handoffs previos[\s\S]{0,120}entry\.summary/, 'entre etapas viaja el resumen')
  assert.equal(
    /Handoffs previos[\s\S]{0,120}entry\.findings/.test(teamWorkflow), false,
    'y no el análisis entero, que se reenviaría en cada etapa posterior',
  )
  assert.match(
    teamWorkflow, /Handoffs completos[\s\S]{0,40}JSON\.stringify\(complete\)/,
    'quien sintetiza lee el análisis entero',
  )
})

test('team nunca promueve: escribe la épica y para', () => {
  assert.match(teamWorkflow, /ROADMAP/, 'la épica candidata va al roadmap')
  assert.match(teamWorkflow, /No toques BACKLOG\.md/, 'y el BACKLOG queda fuera de su alcance')
  assert.match(teamWorkflow, /promoted: false/)
  assert.equal(/\$\{BACKLOG\}/.test(teamWorkflow), false, 'ni siquiera conoce la ruta del backlog')

  // Un bloqueo termina en una acción humana concreta, no en un intento de resolverlo solo.
  assert.match(teamWorkflow, /HUMAN/)
  assert.match(teamWorkflow, /gate-no-cumplido/)
  // Y una intención no viable deja la lección registrada en vez de perderse.
  assert.match(teamWorkflow, /INBOX/)
  assert.match(teamWorkflow, /no-viable/)
})

test('team no deja pasar una opinión del modelo como evidencia', () => {
  assert.match(teamWorkflow, /No confundas una opinión/)
  assert.match(teamWorkflow, /sin evidencia observable/)
  assert.match(teamWorkflow, /Dueños de decisión/, 'la autoridad por dominio viaja en cada prompt')
})

test('team acepta la intención suelta, con prefijo de equipo o estructurada', () => {
  const block = teamWorkflow.match(/const input = [\s\S]*?const INTENT = [^\n]*\n/)[0].replace(/\bconst /g, 'var ')
  const resolve = new Function('args', `${block} return { CANDIDATE, INTENT, raw }`)

  // Sin prefijo, todo el texto es la intención.
  assert.deepEqual(resolve('quiero cobrar con tarjeta'), {
    CANDIDATE: 'product-development', INTENT: 'quiero cobrar con tarjeta', raw: 'quiero cobrar con tarjeta',
  })
  // Con prefijo, el candidato se separa; se confirma después contra los equipos que existen.
  const conPrefijo = resolve('incident-review: se cayó el checkout')
  assert.equal(conPrefijo.CANDIDATE, 'incident-review')
  assert.equal(conPrefijo.INTENT, 'se cayó el checkout')
  // El texto crudo se conserva para poder recomponerlo si el prefijo no era un equipo.
  assert.equal(conPrefijo.raw, 'incident-review: se cayó el checkout')
  // Estructurado, el prefijo no se interpreta: el equipo vino explícito.
  const estructurado = resolve({ intent: 'algo: con dos puntos', team: 'acme-soporte' })
  assert.equal(estructurado.CANDIDATE, 'acme-soporte')
  assert.equal(estructurado.INTENT, 'algo: con dos puntos')
  assert.equal(resolve(undefined).INTENT, '', 'sin intención no arranca')
})

test('team declara qué deja cada recorrido y ramifica según eso', () => {
  assert.match(teamWorkflow, /outcome === 'report'/, 'un informe no propone trabajo')
  assert.match(teamWorkflow, /REPORTS/)
  assert.match(teamWorkflow, /sin promoverlo/, 'los seguimientos no se promueven solos')
  assert.match(teamWorkflow, /team list/, 'el equipo se confirma contra los que existen')
  // Leer `organization/` para "etapas siguientes" no llegaba a ninguna parte: cada etapa es un
  // agente nuevo con su propio contexto.
  assert.equal(/report nothing from it/.test(teamWorkflow), false, 'nada se lee para descartarlo')
  assert.match(teamWorkflow, /equipo-inexistente/)
})

test('autobuild ejecuta cada fase bajo el contrato del cargo que la posee', () => {
  // Los dueños por defecto son deterministas: no se le pregunta a un modelo quién revisa arquitectura.
  for (const owner of ['product-manager', 'software-architect', 'qa-engineer', 'release-manager']) {
    assert.ok(workflow.includes(owner), `falta el dueño por defecto ${owner}`)
  }
  assert.match(workflow, /asRole\(/, 'las fases adoptan un contrato en vez de improvisar criterio')
  assert.match(workflow, /agents list \$\{ROOT\} --json/, 'los slugs salen del CLI, no de la memoria')
  assert.match(workflow, /No inventes slugs/)

  // Un cargo se suma por riesgo, plataforma o alcance; nunca por rutina.
  assert.match(workflow, /nunca por rutina/)
  assert.match(workflow, /phase\('Cast'\)/)
  assert.ok(workflow.includes("'Cast'"), 'la fase está declarada en meta')

  // El lane baja ceremonia: directo no elige reparto, lite se queda con los dueños por defecto.
  assert.match(workflow, /if \(!direct\) \{\s*\n\s*phase\('Cast'\)/)
  assert.match(workflow, /lite \? \[\] :/, 'lite no incorpora condicionales')

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
  const DE_UNA_MAQUINA = [/\/home\//, /\/Users\//, /\b[A-Za-z]:\\/]
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
  const team = fs.readFileSync(path.join(WF, 'team.js'), 'utf8')
  assert.match(team, /handoffs\.filter\(\(entry\) => entry\.gatePassed\)/, 'lo cerrado se recupera')
  assert.match(team, /ya quedó establecido/, 'y llega al prompt que escribe la acción humana')
  assert.match(team, /es el trabajo que ya se pagó/)
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
  assert.match(evalWf, /contexto\.forbidden/, 'y llegan a quien juzga')
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
  assert.match(evalWf, /Trabajás en \$\{porCaso/, 'y el cargo trabaja ahí, no en la raíz')
  // Uno por caso: con un banco compartido los casos se leían entre sí y dejaban de medir lo suyo.
  assert.match(evalWf, /--bench \$\{item\.id\}/, 'un banco por caso, nombrado por el caso')
  assert.match(evalWf, /porCaso = \(item\)/, 'y cada caso resuelve el suyo')

  // El veredicto pertenece al contrato que lo rindió, y el banco se borra en la próxima corrida.
  assert.match(evalWf, /evaluate \$\{AGENT\} --record/, 'el registro va donde el motor dice')
  assert.match(evalWf, /no en el banco/, 'dicho explícitamente, que es donde se equivocaría')
  // La ruta la resuelve el motor y no el prompt. Componerla acá desde la fecha hacía que una segunda
  // corrida del mismo día —la que sigue a aplicar una propuesta— escribiera encima de la línea base.
  assert.doesNotMatch(evalWf, /results\/<fecha>/, 'sin componer el nombre desde la fecha')

  // En una empresa el banco no existe: su instancia ya es el lugar, y el cargo tiene que ser suyo.
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
  // Doce minutos en una carpeta vacía: eso costó pedirle a un agente que «inventariara el repositorio».
  // El inventario es determinista y el modelo entra después, con la lista ya hecha.
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
  // Una pregunta y sus dimensiones, no un cuestionario: «qué vende» le pide a un proyecto libre una
  // respuesta que nadie dio.
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
    const texto = A.render(path.resolve(dir, arranque.source), '', automation)
    for (const marca of [/Por definir/, /\(supuesto\)/, /epic-NNN-<slug>\.md/, /HUMAN_ACTIONS\.md/,
      /formulario/, /molde/]) {
      assert.match(texto, marca, `${name}: ${marca} falta en ${arranque.source}`)
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
