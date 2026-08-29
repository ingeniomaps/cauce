'use strict'

// El catálogo de recorridos leído como contrato: el DAG de etapas, qué fase le toca a cada una y
// qué deja cada recorrido al terminar. Su vecino se llama casi igual y hace otra cosa —`flow.test.js`,
// sin s, ejecuta el recorrido de verdad con los cargos simulados. Acá se valida la fuente.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const flows = require('../../engine/flows/registry')

const ROOT = path.resolve(__dirname, '..', '..')
const CLI = path.join(ROOT, 'engine', 'cli', 'ops.js')

test('product-development referencia agentes existentes y un DAG ordenado', () => {
  const result = flows.validate(ROOT, 'product-development')
  assert.deepEqual(result.errors, [])
  assert.equal(result.stages, 9)
  assert.ok(result.agents >= 15)
  assert.equal(result.manifest.stages[0].id, 'frame')
  assert.equal(result.manifest.stages.at(-1).id, 'learn')
})

test('flow check y show exponen un contrato utilizable', () => {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const checked = spawnSync(process.execPath, [CLI, 'flow', 'check', 'product-development'], {
    cwd: ROOT, encoding: 'utf8', env,
  })
  assert.equal(checked.status, 0, checked.stderr)
  const shown = spawnSync(process.execPath, [CLI, 'flow', 'show', 'product-development'], {
    cwd: ROOT, encoding: 'utf8', env,
  })
  assert.equal(shown.status, 0, shown.stderr)
})

// El cron arma su matriz leyendo `agents list --json`, y ahí no hay recorridos. Por eso ninguno
// aprendió nunca: el ciclo existía y funcionaba a mano, y nada lo disparaba. `flow list --json`
// devuelve la misma forma para que lo consuma el mismo paso.
//
// `cadence` es fija porque un recorrido no tiene profesión que cambie afuera; lo que decide si le toca
// es `pending`, las corridas que dejó sin consolidar. Sin eso el cron le pediría una propuesta todos
// los meses y cobraría una firma humana por un documento que dice «no hay qué corregir».
test('flow list --json trae lo que el cron necesita para incluir un recorrido', () => {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const out = spawnSync(process.execPath, [CLI, 'flow', 'list', '--json'], {
    cwd: ROOT, encoding: 'utf8', env,
  })
  assert.equal(out.status, 0, out.stderr)
  const flows = JSON.parse(out.stdout)
  assert.ok(flows.length >= 5, 'lista todos los recorridos')
  for (const one of flows) {
    assert.deepEqual(Object.keys(one).sort(), ['cadence', 'pending', 'purpose', 'slug', 'system'])
    assert.equal(one.cadence, 'mensual')
    assert.equal(typeof one.pending, 'number')
  }
  // En este repo los recorridos son nuestros, así que ninguno se reporta como del catálogo y el que
  // tiene corridas sin consolidar las cuenta. En una empresa pasa lo contrario, y `pending: 0` en un
  // recorrido del catálogo es lo correcto: no tiene dónde escribir la propuesta.
  assert.equal(flows.some((one) => one.system), false, 'en el toolkit todos son propios')
  assert.ok(flows.some((one) => one.pending > 0), 'y las corridas sin consolidar se cuentan')
})

test('validador rechaza dependencias posteriores y agentes inexistentes', () => {
  const root = tempRoot('ops-flow-invalid-')
  fs.mkdirSync(path.join(root, 'flows', 'broken'), { recursive: true })
  fs.writeFileSync(path.join(root, 'flows', 'broken', 'FLOW.md'), '# Broken\n')
  fs.writeFileSync(path.join(root, 'flows', 'broken', 'flow.json'), JSON.stringify({
    schemaVersion: 1,
    slug: 'broken',
    name: 'Broken',
    purpose: 'Test',
    entryAgent: 'missing-agent',
    facilitator: 'missing-agent',
    stages: [{
      id: 'first', agent: 'missing-agent', dependsOn: ['later'],
      produces: ['nothing'], exitGate: 'Never',
    }],
    guardrails: ['test'],
    completion: ['test'],
  }))
  const result = flows.validate(root, 'broken')
  assert.ok(result.errors.some((error) => error.includes('dependencia inexistente o posterior later')))
  assert.ok(result.errors.some((error) => error.includes('agente inexistente: missing-agent')))
})

test('un flow propio reemplaza al del sistema sin duplicarlo en la lista', () => {
  const T = require('../../engine/flows/registry')
  const root = tempRoot('cauce-flows-')
  const write = (dir, name) => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({ slug: 'demo', name }))
    fs.writeFileSync(path.join(dir, 'FLOW.md'), '# workflow\n')
  }
  write(path.join(root, 'flows', 'system', 'demo'), 'Del sistema')

  assert.deepEqual(T.list(root), ['demo'])
  assert.equal(T.read(root, 'demo').manifest.name, 'Del sistema')

  write(path.join(root, 'flows', 'demo'), 'Del proyecto')
  assert.deepEqual(T.list(root), ['demo'], 'el slug no aparece dos veces')
  assert.equal(T.read(root, 'demo').manifest.name, 'Del proyecto', 'el del proyecto manda')
})

test('un equipo debe separar descubrimiento de entrega', () => {
  const T = require('../../engine/flows/registry')
  const root = tempRoot('cauce-fases-')
  const dir = path.join(root, 'flows', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# demo\n')
  const skill = path.join(root, 'agents', 'roles', 'product-manager')
  fs.mkdirSync(skill, { recursive: true })
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: product-manager\ndescription: x\n---\n')

  const manifest = (stages) => {
    fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
      schemaVersion: 1, slug: 'demo', name: 'Demo', purpose: 'p', outcome: 'epic',
      entryAgent: 'product-manager', facilitator: 'product-manager',
      guardrails: ['g'], completion: ['c'], stages,
    }))
    return T.validate(root, 'demo').errors
  }
  const stage = (id, phase) => ({
    id, phase, agent: 'product-manager', dependsOn: [], produces: ['x'], exitGate: 'y',
  })

  // Sin phase no se puede saber qué corre /flow y qué corre autobuild.
  const withoutPhase = manifest([
    { id: 'frame', agent: 'product-manager', dependsOn: [], produces: ['x'], exitGate: 'y' },
  ])
  assert.ok(withoutPhase.some((error) => /phase debe ser/.test(error)))

  // Un equipo que sólo entrega no propone nada: no hay recorrido que correr.
  const soloEntrega = manifest([stage('build', 'delivery')])
  assert.ok(soloEntrega.some((error) => /al menos una etapa de discovery/.test(error)))

  assert.deepEqual(manifest([stage('frame', 'discovery'), stage('build', 'delivery')]), [])
})

test('los equipos del sistema declaran sus fases y no construyen en descubrimiento', () => {
  const T = require('../../engine/flows/registry')
  const repoRoot = path.resolve(__dirname, '..', '..')
  const flows = T.list(repoRoot)
  assert.ok(flows.length >= 2, 'se distribuye más de una forma de recorrido')

  for (const slug of flows) {
    const result = T.validate(repoRoot, slug)
    assert.deepEqual(result.errors, [], `${slug}: ${result.errors.join(', ')}`)
    const discovery = result.manifest.stages.filter((stage) => stage.phase === 'discovery')
    assert.ok(discovery.length, `${slug}: no propone nada`)
    // Construir es entrega: hacerlo en descubrimiento sería escribir código antes de la aprobación.
    for (const stage of discovery) {
      assert.equal(
        /working-increment|release-readiness/.test((stage.produces || []).join(' ')), false,
        `${slug}/${stage.id}: produce un artefacto de entrega en una etapa de descubrimiento`,
      )
    }
  }
})

test('un equipo declara qué deja, y el de incidentes no propone trabajo', () => {
  const T = require('../../engine/flows/registry')
  const repoRoot = path.resolve(__dirname, '..', '..')

  const outcomes = {}
  for (const slug of T.list(repoRoot)) {
    const { manifest } = T.read(repoRoot, slug)
    outcomes[slug] = manifest.outcome
  }
  assert.equal(outcomes['incident-review'], 'report', 'una revisión registra, no propone')
  assert.equal(outcomes['product-development'], 'epic')
  assert.equal(outcomes['feasibility-review'], 'epic')

  // Un outcome desconocido no valida: el workflow sólo sabe terminar de las formas declaradas.
  const root = tempRoot('cauce-outcome-')
  const dir = path.join(root, 'flows', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# demo\n')
  const skill = path.join(root, 'agents', 'roles', 'product-manager')
  fs.mkdirSync(skill, { recursive: true })
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: product-manager\ndescription: x\n---\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'demo', name: 'D', purpose: 'p', outcome: 'inventado',
    entryAgent: 'product-manager', facilitator: 'product-manager',
    guardrails: ['g'], completion: ['c'],
    stages: [
      { id: 'frame', phase: 'discovery', agent: 'product-manager', dependsOn: [], produces: ['x'], exitGate: 'y' },
    ],
  }))
  assert.ok(T.validate(root, 'demo').errors.some((error) => /outcome debe ser/.test(error)))
})

test('la revisión de incidentes no se presenta como respuesta en vivo', () => {
  const doc = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'flows', 'system', 'incident-review', 'FLOW.md'), 'utf8',
  )
  // Prometer respuesta a incidentes sería peligroso: no hay guardia, ni acceso, ni decisión bajo presión.
  const flat = doc.replace(/\s+/g, ' ')
  assert.match(flat, /No responde incidentes en vivo/)
  assert.match(flat, /ya contenido/)
  assert.match(flat, /no es un incident commander/)
  assert.match(flat, /atribuye responsabilidad a personas/)
})
