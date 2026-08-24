'use strict'

// El catálogo de equipos leído como contrato: el DAG de etapas, qué deja cada recorrido y los casos con
// los que se lo mide. Es a los equipos lo que `agents.test.js` es a los cargos.
//
// Su vecino se llama casi igual y hace otra cosa: `flow.test.js` —sin s— ejecuta el recorrido de verdad
// con los cargos simulados. Acá se valida la fuente; allá se corre.

const { tempRoot } = require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const flows = require('../engine/flows/registry')
const EV = require('../engine/agents/evaluations')
const L = require('../engine/agents/learning')

const ROOT = path.resolve(__dirname, '..')
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
  const T = require('../engine/flows/registry')
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
  const T = require('../engine/flows/registry')
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
  const T = require('../engine/flows/registry')
  const repoRoot = path.resolve(__dirname, '..')
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
  const T = require('../engine/flows/registry')
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
    path.resolve(__dirname, '..', 'flows', 'system', 'incident-review', 'FLOW.md'), 'utf8',
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
  const casos = EV.list(ROOT, 'technical-design', 'flow')
  assert.ok(casos.length >= 4, 'el recorrido declara sus casos')
  for (const caso of casos) {
    assert.ok(caso.request.trim(), `${caso.id}: sin solicitud`)
    assert.equal(caso.expected.length, 4, `${caso.id}: cuatro comportamientos, como en todo el catálogo`)
  }

  const prohibido = EV.behaviors(ROOT, 'technical-design', 'flow').forbidden
  assert.ok(prohibido.includes('security_turned_into_an_approval'), 'la conducta prohibida llega a quien juzga')

  // El registro vive junto al recorrido, no junto a un cargo.
  assert.match(EV.resultsDir(ROOT, 'technical-design', 'flow').replace(ROOT, ''),
    /^\/flows\/system\/technical-design\/evaluations\/results$/)

  // Y sin nombrar el tipo se busca un cargo, que es lo que protege de la colisión.
  assert.throws(() => EV.list(ROOT, 'technical-design'), /no existe agents/)
})

// Declarar la columna y dejarla vacía es peor que no tenerla: el recorrido se lee entero y su
// medición no existe. La advertencia distingue no tener casos de tenerlos y no haber corrido.
test('un recorrido sin casos lo dice', () => {
  // Sobre un recorrido montado acá y no sobre uno del catálogo: el ejemplo era `incident-review`
  // mientras no tenía casos, y en cuanto los ganó la prueba pasó a medir el catálogo en vez de la
  // advertencia. Hoy los cinco tienen casos, así que ninguno serviría de ejemplo.
  const root = tempRoot('cauce-flow-empty-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({ schemaVersion: 1, slug: 'probe' }))
  assert.deepEqual(EV.validate(root, 'probe', 'flow').warnings,
    ['no declara casos: nada mide si su contrato aguanta'])

  // El otro lado de la advertencia, y también montado acá. Tomarlo del catálogo ya rompió dos veces
  // esta prueba: primero cuando `incident-review` ganó casos, y hoy cuando `defect-triage` ganó su
  // primer registro. El ejemplo tiene que ser del tamaño de lo que la prueba mide, no del catálogo,
  // que avanza por su cuenta.
  const conCasos = path.join(root, 'flows', 'con-casos')
  fs.mkdirSync(path.join(conCasos, 'evaluations', 'cases'), { recursive: true })
  fs.writeFileSync(path.join(conCasos, 'FLOW.md'), '# Con casos\n')
  fs.writeFileSync(path.join(conCasos, 'flow.json'), JSON.stringify({ schemaVersion: 1, slug: 'con-casos' }))
  fs.writeFileSync(path.join(conCasos, 'evaluations', 'cases', '01-uno.md'),
    '# Solicitud\n\nx\n\n# Comportamientos esperados\n\n- y\n')
  const medido = EV.validate(root, 'con-casos', 'flow')
  assert.match(medido.warnings.join('\n'), /sin resultados de casos: corré el recorrido/)
  assert.equal(medido.cases, 1)
})

// Un recorrido no aprende de una profesión: no tiene. Lo único que puede enseñarle algo es cómo le
// fue, así que su ciclo consume los veredictos en contra de sus propias corridas. Copiarle al cargo
// la investigación semanal le habría pedido leer una literatura inexistente, y habría devuelto
// informes vacíos que igual hay que firmar.
test('el ciclo de un recorrido aprende de sus corridas, no de una literatura', () => {
  const root = tempRoot('cauce-flow-learn-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  const registro = path.join(dir, 'evaluations', 'results', '2099-01-07.md')
  fs.writeFileSync(registro, '---\nteam: probe\ndate: 2099-01-07\npassed: 1\ntotal: 2\n---\n\n'
    + '### 01-uno\n\n- Veredicto: pasa\n\nSin novedad.\n\n'
    + '### 02-dos\n\n- Veredicto: no pasa\n\nEl gate dejó pasar la etapa sin su evidencia.\n')

  const propuesta = L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  assert.equal(propuesta.findings, 1, 'entra el veredicto en contra, no el que pasó')
  const texto = fs.readFileSync(propuesta.file, 'utf8')
  assert.match(texto, /### 02-dos — 2099-01-07/, 'el hallazgo cita el caso y la corrida')
  assert.match(texto, /El gate dejó pasar la etapa sin su evidencia/, 'y trae su contraste')
  assert.equal(texto.includes('01-uno'), false, 'el caso que pasó no pide cambio')
  assert.match(texto, /^automatic_apply: false$/m)

  // La corrida consumida queda sellada, así que no vuelve a entrar por una segunda propuesta.
  assert.match(fs.readFileSync(registro, 'utf8'), /^status: consolidated$/m)
  L.seal(root, 'probe', '2099-01', 'flow')
  const siguiente = L.prepareProposal(root, 'probe', new Date('2099-02-28T00:00:00Z'), '', 'flow')
  assert.equal(siguiente.findings, 0, 'sin corridas nuevas no hay qué corregir')
  assert.match(fs.readFileSync(siguiente.file, 'utf8'), /aguantó lo que se le midió/)

  const estado = L.evaluateTeam(root, 'probe')
  assert.deepEqual(estado.errors, [])
  assert.equal(estado.proposals, 2)
  assert.equal(estado.pending, 1, 'la de enero quedó aplicada; la de febrero espera firma')
  assert.match(estado.warnings.join('\n'), /sin learning\/HISTORY\.md/)
})
