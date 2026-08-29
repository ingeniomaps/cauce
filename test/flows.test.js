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

// Cuántas corridas esperan entrar a una propuesta. Es el disparador del ciclo de un recorrido, y se
// mide contra el sello, no contra la fecha: una corrida vieja sin consolidar sigue pendiente.
test('pendingRuns cuenta lo que no se consolidó, y deja de contarlo cuando entra', () => {
  const root = tempRoot('cauce-flow-pending-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  assert.equal(L.pendingRuns(root, 'probe'), 0, 'sin corridas no hay nada que consolidar')

  for (const name of ['2099-01-07.md', '2099-01-07-2.md']) {
    fs.writeFileSync(path.join(dir, 'evaluations', 'results', name),
      '---\nflow: probe\ndate: 2099-01-07\npassed: 0\ntotal: 1\n---\n\n'
      + '### 01-uno\n\n- Veredicto: no pasa\n\nEl gate dejó pasar la etapa.\n')
  }
  assert.equal(L.pendingRuns(root, 'probe'), 2, 'la re-corrida cuenta como corrida')

  L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  assert.equal(L.pendingRuns(root, 'probe'), 0, 'consolidadas, ya no piden otra propuesta')
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

// El sujeto que no tiene `SKILL.md`. Mirando sólo ése —lo que hacía `contractChangedAt`— un recorrido
// no envejecía nunca, así que el caso endurece el `flow.json` y espera el aviso que faltaba.
test('cambiar el flow.json de un recorrido envejece sus veredictos', () => {
  const root = tempRoot('cauce-flow-contrato-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'cases'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'evaluations', 'cases', '01-uno.md'),
    '# Solicitud\n\nx\n\n# Comportamientos esperados\n\n- y\n')
  fs.writeFileSync(path.join(dir, 'evaluations', 'results', '2099-01-07.md'),
    '---\nflow: probe\n---\n\n### 01-uno\n\n- Veredicto: pasa\n\nx\n')
  const contrato = path.join(dir, 'flow.json')
  fs.writeFileSync(contrato, JSON.stringify({ schemaVersion: 1, slug: 'probe' }))

  // El repositorio es lo que fecha el contrato: sin commit no hay fecha, y sin fecha no hay aviso.
  // `%cs` lee la fecha del committer, no la del autor, así que `--date` no alcanza: se fija por entorno.
  const git = (fecha, ...args) => spawnSync('git', ['-C', root, ...args],
    { encoding: 'utf8', env: { ...process.env, GIT_COMMITTER_DATE: fecha, GIT_AUTHOR_DATE: fecha } })
  const inicial = '2099-01-01T00:00:00'
  git(inicial, 'init', '-q')
  git(inicial, 'config', 'user.email', 'probe@example.test')
  git(inicial, 'config', 'user.name', 'Probe')
  git(inicial, 'add', '-A')
  git(inicial, 'commit', '-qm', 'contrato inicial')

  assert.equal(EV.validate(root, 'probe', 'flow').warnings.some((one) => /contrato cambió/.test(one)),
    false, 'un contrato anterior a la corrida no envejece nada')

  // Se le agrega una dimensión al contrato, después de que el caso se midiera.
  fs.writeFileSync(contrato, JSON.stringify({ schemaVersion: 1, slug: 'probe', completion: ['algo más'] }))
  const despues = '2099-02-01T00:00:00'
  git(despues, 'add', '-A')
  git(despues, 'commit', '-qm', 'una dimensión más')

  assert.match(EV.validate(root, 'probe', 'flow').warnings.join('\n'),
    /el contrato cambió el 2099-02-01 y la última corrida es del 2099-01-07/,
    'el flow.json es el contrato de un recorrido, y cambiarlo envejece lo medido')
})

// `--cases` hace que una corrida cubra menos casos de los que el sujeto tiene, a propósito. Leyendo
// sólo la última, `evaluate` decía «cubre 1 de 4: el resultado no vale» de sujetos con los cuatro
// medidos, y anunciaba «1/1 pasan». Componer por caso —la última corrida gana— es lo que ya hace el
// ciclo de aprendizaje y lo que un humano venía haciendo a mano.
test('el veredicto se compone sobre todas las corridas, no sale de la última', () => {
  const root = tempRoot('cauce-eval-compuesto-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'cases'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({ schemaVersion: 1, slug: 'probe' }))
  for (const id of ['01-uno', '02-dos', '03-tres']) {
    fs.writeFileSync(path.join(dir, 'evaluations', 'cases', `${id}.md`),
      '# Solicitud\n\nx\n\n# Comportamientos esperados\n\n- y\n')
  }
  const corrida = (name, cuerpo) => fs.writeFileSync(
    path.join(dir, 'evaluations', 'results', name), `---\nflow: probe\n---\n${cuerpo}`)

  // La primera midió dos y uno falló; la segunda re-corrió sólo ése y ahora pasa.
  corrida('2099-01-07.md', '\n### 01-uno\n\n- Veredicto: pasa\n\nx\n\n### 02-dos\n\n- Veredicto: no pasa\n\ny\n')
  corrida('2099-01-09.md', '\n### 02-dos\n\n- Veredicto: pasa\n\nya no falla\n')

  const estado = EV.composed(root, 'probe', 'flow')
  assert.equal(estado.total, 2, 'dos casos tienen veredicto, aunque ninguna corrida midiera los dos')
  assert.equal(estado.passed, 2, 'y el re-corrido cuenta con su veredicto nuevo')
  assert.deepEqual(estado.failed, [])
  // Lo compuesto es tan viejo como su parte más rancia: `01-uno` no se volvió a medir desde el 7.
  assert.equal(estado.oldest, '2099-01-07')
  assert.equal(estado.newest, '2099-01-09')

  const runs = EV.validate(root, 'probe', 'flow')
  assert.match(runs.warnings.join('\n'), /2 de 3 caso\(s\) con veredicto: sin medir 03-tres/,
    'lo que falta se nombra por su id, no como un conteo de una corrida')
  assert.equal(/el resultado no vale/.test(runs.warnings.join('\n')), false,
    'y lo medido en dos tandas no se descarta por venir en dos archivos')
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
// Lo que hace una persona antes de aplicar: decir quién decide y qué cambia. Sin esto `seal` se niega,
// y por eso vive acá arriba: todos los tests del ciclo lo necesitan.
const firmar = (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
  .replace('- Responsable: por definir', '- Responsable: Quien Firma')
  .replace(/Por definir\. Lo que se corrige es el recorrido/, 'Se endurece el gate de la primera etapa'))

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
  firmar(propuesta.file)
  L.seal(root, 'probe', '2099-01', 'flow')
  // Sin corridas nuevas no hay qué corregir, y entonces no se abre documento. Antes se abría uno para
  // decir «el recorrido aguantó lo que se le midió»: nadie firma eso, y una firma humana es lo que
  // cuesta. Es la misma regla que gobierna a un cargo — un documento que no puede nombrar un cambio
  // no se escribe—, y acá se comprobaba lo contrario.
  const siguiente = L.prepareProposal(root, 'probe', new Date('2099-02-28T00:00:00Z'), '', 'flow')
  assert.equal(siguiente.created, false, 'sin veredictos en contra no se abre nada')
  assert.equal(siguiente.file, '', 'y no queda archivo que el job lea como propuesta y mande a PR')

  const estado = L.evaluateTeam(root, 'probe')
  assert.deepEqual(estado.errors, [])
  assert.equal(estado.proposals, 1, 'sólo la de enero, que es la única que tuvo algo que decir')
  assert.equal(estado.pending, 0, 'y quedó aplicada')
  assert.match(estado.warnings.join('\n'), /sin learning\/HISTORY\.md/)
})

// El ciclo entero, que ninguna prueba recorría: proponer, firmar, sellar y quedar registrado.
// Ejercitarlo a mano encontró tres defectos y los tres viven acá.
test('el ciclo de un recorrido se cierra: propone lo vivo, exige firma y deja historial', () => {
  const root = tempRoot('cauce-flow-ciclo-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'learning'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'learning', 'HISTORY.md'),
    '# Historial\n\n| Fecha | Propuesta | Decisión | Aprobó | Cambio aplicado |\n|---|---|---|---|---|\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  const corrida = (name, cuerpo) => fs.writeFileSync(
    path.join(dir, 'evaluations', 'results', name),
    `---\nflow: probe\ndate: 2099-01-07\npassed: 0\ntotal: 2\n---\n\n${cuerpo}`)

  // Dos corridas: un caso que falló y después se arregló, y otro que sigue rojo en las dos.
  corrida('2099-01-07.md', '### 01-arreglado\n\n- Veredicto: no pasa\n\nFallaba por A.\n\n'
    + '### 02-vivo\n\n- Veredicto: no pasa\n\nPrimera vez.\n')
  corrida('2099-01-08.md', '### 01-arreglado\n\n- Veredicto: pasa\n\nYa no falla.\n\n'
    + '### 02-vivo\n\n- Veredicto: no pasa\n\nSigue rojo con el arreglo puesto.\n')

  const propuesta = L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  const texto = fs.readFileSync(propuesta.file, 'utf8')

  // Uno, no tres. Volcar todo «no pasa» de toda corrida pedía corregir lo ya corregido y repetía el
  // mismo caso una vez por corrida: sobre las cuatro de incident-review daban seis para un solo rojo.
  assert.equal(propuesta.findings, 1, 'sólo entra el caso que sigue rojo')
  assert.equal(texto.includes('01-arreglado'), false, 'el que se arregló no manda a arreglarlo de nuevo')
  assert.match(texto, /Sigue rojo con el arreglo puesto/, 'y del que vive entra su contraste más nuevo')
  assert.equal(texto.includes('Primera vez'), false, 'no el viejo')
  assert.match(texto, /falló en 2 corridas de esta tanda/, 'con cuántas veces: separa varianza de medición')

  // Sin firma no se sella. Un cargo llega acá después de `agent-promote`, que ya la exige; un recorrido
  // no tiene ese workflow, así que `--applied` sellaba lo que nadie decidió y el documento quedaba
  // diciendo `applied` en el frontmatter y «Estado: pendiente» en el cuerpo.
  assert.throws(() => L.seal(root, 'probe', '2099-01', 'flow'), /no la decidió nadie/)

  firmar(propuesta.file)
  L.seal(root, 'probe', '2099-01', 'flow')
  const aplicada = fs.readFileSync(propuesta.file, 'utf8')
  assert.match(aplicada, /^status: applied$/m)
  assert.match(aplicada, /^- Estado: aplicada$/m, 'y el cuerpo deja de contradecir al frontmatter')
  assert.equal(aplicada.endsWith('\n'), true, 'sin comerse el salto final del archivo')

  // Y queda registrado, que es lo que la plantilla del historial promete y nadie escribía.
  assert.match(fs.readFileSync(path.join(dir, 'learning', 'HISTORY.md'), 'utf8'),
    /\| `2099-01\.md` \| aplicada \| Quien Firma \| Se endurece el gate/)
})

// Un recorrido sin HISTORY.md se sella igual: el historial es del contrato y `evaluate` ya avisa que
// falta. Frenar el sello ahí convertiría una advertencia en un bloqueo por un archivo que se crea solo.
test('sellar no exige que el historial exista', () => {
  const root = tempRoot('cauce-flow-sin-historial-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  fs.writeFileSync(path.join(dir, 'evaluations', 'results', '2099-01-07.md'),
    '---\nflow: probe\ndate: 2099-01-07\npassed: 0\ntotal: 1\n---\n\n'
    + '### 01-uno\n\n- Veredicto: no pasa\n\nEl gate dejó pasar la etapa.\n')

  const propuesta = L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  firmar(propuesta.file)
  assert.equal(L.seal(root, 'probe', '2099-01', 'flow').already, false)
  assert.equal(fs.existsSync(path.join(dir, 'learning', 'HISTORY.md')), false, 'y no lo inventa')
})

// La re-corrida del mismo día se llama `<fecha>-2.md`, y es la que trae el veredicto más nuevo — el
// que dice si el arreglo funcionó. El patrón de nombre exigía `<fecha>.md` exacto, así que ninguna
// entraba a ninguna propuesta y nada lo delataba: 51 de los 188 registros que existían al encontrarlo.
// Y el orden importa tanto como el patrón, porque `-` es menor que `.` y la segunda corrida se leería
// antes que la primera.
test('la re-corrida del mismo día entra al ciclo, y entra después de la primera', () => {
  const root = tempRoot('cauce-flow-rerun-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  const registro = (name, caso, detalle) => {
    const file = path.join(dir, 'evaluations', 'results', name)
    fs.writeFileSync(file, `---\nflow: probe\ndate: 2099-01-07\npassed: 0\ntotal: 1\n---\n\n`
      + `### ${caso}\n\n- Veredicto: no pasa\n\n${detalle}\n`)
    return file
  }
  const primera = registro('2099-01-07.md', '01-uno', 'La primera corrida.')
  const segunda = registro('2099-01-07-2.md', '02-dos', 'La re-corrida, con el arreglo puesto.')

  const propuesta = L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  assert.equal(propuesta.findings, 2, 'las dos corridas del día entran')
  const texto = fs.readFileSync(propuesta.file, 'utf8')
  assert.match(texto, /La re-corrida, con el arreglo puesto/, 'la segunda no se pierde')
  assert.ok(texto.indexOf('La primera corrida') < texto.indexOf('La re-corrida'),
    'y va después de la primera: `-` ordena antes que `.` si se compara el nombre crudo')
  for (const file of [primera, segunda]) {
    assert.match(fs.readFileSync(file, 'utf8'), /^status: consolidated$/m, 'las dos quedan selladas')
  }
})
