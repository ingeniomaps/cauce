'use strict'

const { tempRoot } = require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const teams = require('../engine/teams/registry')
const EV = require('../engine/agents/evaluations')

const ROOT = path.resolve(__dirname, '..')
const CLI = path.join(ROOT, 'engine', 'cli', 'ops.js')

test('product-development referencia agentes existentes y un DAG ordenado', () => {
  const result = teams.validate(ROOT, 'product-development')
  assert.deepEqual(result.errors, [])
  assert.equal(result.stages, 9)
  assert.ok(result.agents >= 15)
  assert.equal(result.manifest.stages[0].id, 'frame')
  assert.equal(result.manifest.stages.at(-1).id, 'learn')
})

test('team check y show exponen un contrato utilizable', () => {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const checked = spawnSync(process.execPath, [CLI, 'team', 'check', 'product-development'], {
    cwd: ROOT, encoding: 'utf8', env,
  })
  assert.equal(checked.status, 0, checked.stderr)
  const shown = spawnSync(process.execPath, [CLI, 'team', 'show', 'product-development'], {
    cwd: ROOT, encoding: 'utf8', env,
  })
  assert.equal(shown.status, 0, shown.stderr)
})

test('validador rechaza dependencias posteriores y agentes inexistentes', () => {
  const root = tempRoot('ops-team-invalid-')
  fs.mkdirSync(path.join(root, 'teams', 'broken'), { recursive: true })
  fs.writeFileSync(path.join(root, 'teams', 'broken', 'WORKFLOW.md'), '# Broken\n')
  fs.writeFileSync(path.join(root, 'teams', 'broken', 'team.json'), JSON.stringify({
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
  const result = teams.validate(root, 'broken')
  assert.ok(result.errors.some((error) => error.includes('dependencia inexistente o posterior later')))
  assert.ok(result.errors.some((error) => error.includes('agente inexistente: missing-agent')))
})

test('un team propio reemplaza al del sistema sin duplicarlo en la lista', () => {
  const T = require('../engine/teams/registry')
  const root = tempRoot('cauce-teams-')
  const write = (dir, name) => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({ slug: 'demo', name }))
    fs.writeFileSync(path.join(dir, 'WORKFLOW.md'), '# workflow\n')
  }
  write(path.join(root, 'teams', 'system', 'demo'), 'Del sistema')

  assert.deepEqual(T.list(root), ['demo'])
  assert.equal(T.read(root, 'demo').manifest.name, 'Del sistema')

  write(path.join(root, 'teams', 'demo'), 'Del proyecto')
  assert.deepEqual(T.list(root), ['demo'], 'el slug no aparece dos veces')
  assert.equal(T.read(root, 'demo').manifest.name, 'Del proyecto', 'el del proyecto manda')
})

test('un equipo debe separar descubrimiento de entrega', () => {
  const T = require('../engine/teams/registry')
  const root = tempRoot('cauce-fases-')
  const dir = path.join(root, 'teams', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'WORKFLOW.md'), '# demo\n')
  const skill = path.join(root, 'agents', 'roles', 'product-manager')
  fs.mkdirSync(skill, { recursive: true })
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: product-manager\ndescription: x\n---\n')

  const manifest = (stages) => {
    fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({
      schemaVersion: 1, slug: 'demo', name: 'Demo', purpose: 'p', outcome: 'epic',
      entryAgent: 'product-manager', facilitator: 'product-manager',
      guardrails: ['g'], completion: ['c'], stages,
    }))
    return T.validate(root, 'demo').errors
  }
  const stage = (id, phase) => ({
    id, phase, agent: 'product-manager', dependsOn: [], produces: ['x'], exitGate: 'y',
  })

  // Sin phase no se puede saber qué corre /team y qué corre autobuild.
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
  const T = require('../engine/teams/registry')
  const repoRoot = path.resolve(__dirname, '..')
  const teams = T.list(repoRoot)
  assert.ok(teams.length >= 2, 'se distribuye más de una forma de recorrido')

  for (const slug of teams) {
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
  const T = require('../engine/teams/registry')
  const repoRoot = path.resolve(__dirname, '..')

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
  const dir = path.join(root, 'teams', 'demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'WORKFLOW.md'), '# demo\n')
  const skill = path.join(root, 'agents', 'roles', 'product-manager')
  fs.mkdirSync(skill, { recursive: true })
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: product-manager\ndescription: x\n---\n')
  fs.writeFileSync(path.join(dir, 'team.json'), JSON.stringify({
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
    path.resolve(__dirname, '..', 'teams', 'system', 'incident-review', 'WORKFLOW.md'), 'utf8',
  )
  // Prometer respuesta a incidentes sería peligroso: no hay guardia, ni acceso, ni decisión bajo presión.
  const flat = doc.replace(/\s+/g, ' ')
  assert.match(flat, /No responde incidentes en vivo/)
  assert.match(flat, /ya contenido/)
  assert.match(flat, /no es un incident commander/)
  assert.match(flat, /atribuye responsabilidad a personas/)
})

// Un recorrido se mide como un cargo: una tentación escrita, los comportamientos que debería
// exhibir y un veredicto registrado. Hasta acá sólo se validaba su estructura —que las etapas
// existan, que los agentes existan, que los gates estén escritos—, así que nadie comprobaba nunca
// que un `exitGate` frenara lo que dice frenar.
//
// El tipo se nombra en la llamada y no se deduce del slug: un cargo y un recorrido pueden llamarse
// igual sin colisionar porque viven en árboles separados, y deducirlo los volvería ambiguos.
test('los casos de un recorrido se leen como los de un cargo', () => {
  const casos = EV.list(ROOT, 'technical-design', 'team')
  assert.ok(casos.length >= 4, 'el recorrido declara sus casos')
  for (const caso of casos) {
    assert.ok(caso.request.trim(), `${caso.id}: sin solicitud`)
    assert.equal(caso.expected.length, 4, `${caso.id}: cuatro comportamientos, como en todo el catálogo`)
  }

  const prohibido = EV.behaviors(ROOT, 'technical-design', 'team').forbidden
  assert.ok(prohibido.includes('security_turned_into_an_approval'), 'la conducta prohibida llega a quien juzga')

  // El registro vive junto al recorrido, no junto a un cargo.
  assert.match(EV.resultsDir(ROOT, 'technical-design', 'team').replace(ROOT, ''),
    /^\/teams\/system\/technical-design\/evaluations\/results$/)

  // Y sin nombrar el tipo se busca un cargo, que es lo que protege de la colisión.
  assert.throws(() => EV.list(ROOT, 'technical-design'), /no existe agents/)
})

// Declarar la columna y dejarla vacía es peor que no tenerla: el recorrido se lee entero y su
// medición no existe. La advertencia distingue no tener casos de tenerlos y no haber corrido.
test('un recorrido sin casos lo dice', () => {
  const sinCasos = EV.validate(ROOT, 'incident-review', 'team')
  assert.deepEqual(sinCasos.warnings, ['no declara casos: nada mide si su contrato aguanta'])

  const conCasos = EV.validate(ROOT, 'defect-triage', 'team')
  assert.match(conCasos.warnings.join('\n'), /sin resultados de casos: corré el recorrido/)
  assert.equal(conCasos.cases, 4)
})
