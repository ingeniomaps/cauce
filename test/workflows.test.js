'use strict'

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
  // El workflow viaja a cualquier instancia: toda ruta sale de ROOT y P, nunca de una máquina
  // ni de un proyecto concreto. La comprobación es genérica a propósito, para que también
  // atrape la próxima filtración y no sólo las que ya conocemos.
  for (const absolute of [/\/home\//, /\/Users\//, /\b[A-Za-z]:\\/]) {
    assert.equal(absolute.test(workflow), false, `ruta absoluta filtrada: ${absolute}`)
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

test('autobuild lee el contrato una sola vez y no obliga a releerlo', () => {
  const reads = workflow.match(/Read \$\{ROOT\}\/AGENTS\.md/g) || []
  assert.equal(reads.length, 1, 'AGENTS.md se lee una vez por corrida, en el digest')
  assert.match(workflow, /do not re-read/, 'el preámbulo prohíbe releer el contrato')
  for (const value of ['maxTaskHours', 'commitPerTask', 'humanCheckpoint']) {
    assert.match(workflow, new RegExp(`contract\\.${value}`), `${value} viaja en el digest, no se relee`)
  }
})

test('workflows de integración usan el registro general y no escriben remoto', () => {
  for (const name of ['sync.js', 'promote.js']) {
    const file = path.resolve(__dirname, '..', 'automatization', 'workflows', 'integrations', name)
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /provider/)
    assert.match(source, /integration check/)
    assert.match(source, /Nunca|never|Never/)
    for (const absolute of [/\/home\//, /\/Users\//, /\b[A-Za-z]:\\/]) {
      assert.equal(absolute.test(source), false, `${name}: ruta absoluta filtrada`)
    }
  }
})

// Buscaba el CLI entre varios candidatos porque el workflow se materializaba en cada instancia. Dejó
// de distribuirse en 0.4.0 —`init` no copia `.github/` y `upgrade` lo retira—, así que la única ruta
// posible es la del toolkit, y seguir buscando mantenía vivos dos candidatos muertos.
test('el workflow de aprendizaje corre en el toolkit y nombra un solo CLI', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /^ {2}OPS: engine\/cli\/ops\.js$/m, 'el CLI se declara una vez para todo el workflow')
  assert.equal(/tools\/ops\.js/.test(source), false, 'no queda el CLI de una instancia')
  assert.equal(/\.ops\//.test(source), false, 'no queda el motor vendorizado que Cauce ya no distribuye')
  assert.match(source, /fromJSON\(needs\.discover\.outputs\.agents\)/, 'la matriz sale del árbol de agentes')
  assert.match(source, /slugs\.filter\(\(slug\) => slug === only\)/, 'el input se valida contra slugs reales')
})

// Tres formas de trabajar de más o de menos que tuvo este workflow: la credencial comprobada dentro
// de la matriz encendía cuarenta y siete jobs para saltearse; exigir que la matriz entera saliera
// bien hacía que un cargo roto se llevara los PR de los otros, con sus informes expirando en el
// artifact; y sin `concurrency` dos corridas empujan la misma rama y la segunda no puede publicar.
test('el aprendizaje no enciende de más, aísla el fallo de un cargo y no se pisa', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')

  assert.match(source, /needs\.discover\.outputs\.model == 'true'/, 'la credencial se comprueba una vez')

  assert.equal(/needs\.research\.result == 'success'/.test(source), false, 'un cargo no bloquea a los demás')

  assert.match(source, /^concurrency:$/m, 'una sola corrida a la vez')
  assert.match(source, /cancel-in-progress: false/, 'y no se corta una que ya está abriendo PR')

  for (const block of source.split(/\n  (?=[a-z][a-z-]*:\n)/)) {
    if (!/\n    runs-on:/.test(block)) continue
    assert.match(block, /timeout-minutes:/, `${block.trimStart().split(':')[0]}: sin timeout hereda seis horas`)
  }
})

// El agente de investigación ingiere contenido web que nadie controla. Mientras corría en el mismo
// job que la credencial de escritura, cualquier instrucción que viniera en una página tenía un
// repositorio a mano. Ahora el informe sale por artifact y el commit lo hace otro job sin modelo.
test('quien corre el agente no puede escribir, y quien escribe no tiene la credencial', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')
  const jobs = source.split(/\n  (?=[a-z][a-z-]*:\n)/)
  const find = (name) => jobs.find((block) => block.trimStart().startsWith(`${name}:`)) || ''

  const research = find('research')
  assert.ok(research.includes('ANTHROPIC_API_KEY'), 'research es quien usa el modelo')
  assert.equal(/contents:\s*write/.test(research), false, 'y no puede escribir el repositorio')
  assert.ok(research.includes('upload-artifact'), 'entrega el informe por artifact')

  const pr = find('research-pr')
  assert.match(pr, /contents:\s*write/, 'research-pr es quien commitea')
  assert.equal(pr.includes('ANTHROPIC_API_KEY'), false, 'y no toca ningún modelo')
  assert.ok(pr.includes('agents list --json'), 'el destino se resuelve acá, no viene en el artifact')

  // El default del workflow tiene que ser el mínimo: si fuera `write`, un job nuevo nacería pudiendo
  // escribir sin que nadie lo decidiera.
  assert.match(source.slice(0, source.indexOf('jobs:')), /permissions:\n  contents: read/)
})

// Un tag de acción es mutable: quien controle el repositorio de la acción puede moverlo a otro commit,
// y el workflow que lo usa ejecuta código nuevo sin que cambie una línea acá.
test('las acciones están fijadas por SHA, no por tag', () => {
  const dir = path.resolve(__dirname, '..', '.github', 'workflows')
  for (const name of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const match of source.matchAll(/uses:\s*([^\s]+)/g)) {
      assert.match(match[1], /@[0-9a-f]{40}$/, `${name}: ${match[1]} no está fijada por SHA`)
    }
  }
})

test('un solo workflow cubre a todos los agentes', () => {
  const dir = path.resolve(__dirname, '..', '.github', 'workflows')
  const files = fs.readdirSync(dir).sort()
  assert.deepEqual(files, ['agent-learning.yml', 'ci.yml'], 'no vuelve a haber un workflow por agente')
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
  for (const leak of [/\/home\//, /\/Users\//]) {
    assert.equal(leak.test(teamWorkflow), false, 'sin rutas absolutas')
  }
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
  for (const file of workflowFiles()) {
    // Sin comentarios ni literales: adentro hay prosa en castellano que parece una llamada.
    const source = fs.readFileSync(file, 'utf8')
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
  assert.match(evalWf, /precisión de procedencia/, 'exigiéndole que verifique lo que se le atribuye')

  // El banco enlaza al repositorio vivo, así que una edición concurrente del toolkit se ve desde
  // adentro. Tres jueces la descartaron bien por su cuenta; decirlo de entrada les ahorra el trabajo.
  assert.match(evalWf, /symlink al repositorio/, 'el juez sabe que el banco no está aislado')
  assert.match(evalWf, /trabajo concurrente ajeno/, 'y qué significa encontrar algo modificado ahí')
})
