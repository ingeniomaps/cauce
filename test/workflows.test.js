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
    assert.match(source, /OPS_INTEGRATION_PROVIDER/)
    assert.match(source, /integration check/)
    assert.match(source, /Nunca|never|Never/)
    for (const absolute of [/\/home\//, /\/Users\//, /\b[A-Za-z]:\\/]) {
      assert.equal(absolute.test(source), false, `${name}: ruta absoluta filtrada`)
    }
  }
})

test('el workflow de aprendizaje resuelve el CLI en toolkit e instancia', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')
  // El bug original: `node engine/cli/ops.js` no existe dentro de un proyecto generado.
  assert.equal(
    /node engine\/cli\/ops\.js/.test(source), false,
    'no puede invocar una ruta que sólo existe en el repositorio del toolkit',
  )
  for (const candidate of ['tools/ops.js', 'engine/cli/ops.js']) {
    assert.ok(source.includes(candidate), `falta ${candidate} entre los candidatos`)
  }
  assert.match(source, /fromJSON\(needs\.discover\.outputs\.agents\)/, 'la matriz sale del árbol de agentes')
  assert.match(source, /slugs\.filter\(\(slug\) => slug === only\)/, 'el input se valida contra slugs reales')
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
  assert.match(teamWorkflow, /team show \$\{TEAM\} --json/)
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
