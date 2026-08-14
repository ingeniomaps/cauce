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
