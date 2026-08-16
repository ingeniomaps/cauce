'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const learning = require('../engine/agents/learning')

const CLI = path.resolve(__dirname, '..', 'engine', 'cli', 'ops.js')
const AGENTS_ROOT = path.resolve(__dirname, '..', 'agents')
const catalog = require('../engine/agents/catalog')
const AGENTS = catalog.list(path.dirname(AGENTS_ROOT))
  .map((role) => ({ type: role.type, slug: role.slug, dir: role.dir }))

function run(args, cwd = path.dirname(CLI)) {
  const env = { ...process.env, LANG: process.env.LANG || 'C.UTF-8' }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env })
}

// El motor y el catálogo llegan siempre por npm. Acá se enlaza el repositorio en vez de instalar el
// tarball: es la misma resolución —`node_modules/@ingeniomaps/cauce`— sin pagar un `npm install` por
// test. El recorrido contra el paquete publicado lo cubre `lifecycle.test.js`.
function installedProject(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-agents-'))
  const target = path.join(root, 'demo-ops')
  const result = run(['init', target, '--name', name, '--mode', 'sidecar'])
  assert.equal(result.status, 0, result.stderr)
  linkEngine(target)
  return target
}

function linkEngine(target) {
  const scope = path.join(target, 'node_modules', '@ingeniomaps')
  fs.mkdirSync(scope, { recursive: true })
  fs.symlinkSync(path.resolve(__dirname, '..'), path.join(scope, 'cauce'), 'dir')
}

test('el aprendizaje de la profesión se hace en el toolkit, no en cada empresa', () => {
  const repoRoot = path.resolve(__dirname, '..')

  // Acá, en el repositorio del toolkit, el cargo es escribible y el ciclo corre.
  const skill = path.join(repoRoot, 'agents', 'roles', 'system', 'product-manager', 'SKILL.md')
  const before = fs.readFileSync(skill, 'utf8')
  const reports = path.join(repoRoot, 'agents', 'roles', 'system', 'product-manager', 'learning', 'reports')
  const nuevos = () => fs.readdirSync(reports).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
  const previos = nuevos()
  try {
    assert.equal(run(['learn', 'product-manager'], repoRoot).status, 0)
    assert.equal(fs.readFileSync(skill, 'utf8'), before, 'investigar no reescribe el cargo')
  } finally {
    for (const name of nuevos()) {
      if (!previos.includes(name)) fs.rmSync(path.join(reports, name))
    }
  }
})

test('una empresa no puede investigar la profesión dentro del paquete', () => {
  const target = installedProject('Learning')

  // El cargo del sistema vive en la dependencia: escribir ahí se perdería en el próximo npm ci,
  // y repetiría en cada empresa una investigación que se hace mejor una sola vez.
  const blocked = run(['learn', 'product-manager'], target)
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /se hace en el toolkit/)
  assert.match(blocked.stderr, /organization\/roles\/product-manager\.md/)
  // Pero leerlo sí puede: evaluate es de sólo lectura.
  assert.equal(run(['evaluate', 'product-manager'], target).status, 0)

  // Un cargo propio de la empresa sí acumula su aprendizaje, porque es suyo.
  const own = path.join(target, 'agents', 'roles', 'qa-acme')
  fs.mkdirSync(own, { recursive: true })
  fs.writeFileSync(path.join(own, 'SKILL.md'), '---\nname: qa-acme\ndescription: QA de Acme. No usar afuera.\n---\n\nNo inventar. Requiere autorización. Exige evidencia observable.\n')
  assert.equal(run(['learn', 'qa-acme'], target).status, 0)
  assert.equal(fs.existsSync(path.join(own, 'learning', 'reports')), true)
})

test('todos los agentes se resuelven desde el paquete y pasan sus controles', async (context) => {
  const target = installedProject('Agents')
  // El catálogo no se copia: la instancia no tiene por qué llevar 700 archivos que no escribió.
  assert.equal(fs.existsSync(path.join(target, 'agents', 'roles', 'system')), false)

  for (const agent of AGENTS) {
    await context.test(`${agent.type}/${agent.slug}`, () => {
      const evaluated = run(['evaluate', agent.slug], target)
      assert.equal(evaluated.status, 0, evaluated.stderr || evaluated.stdout)
    })
  }
})

test('un slug duplicado entre tipos se rechaza como ambiguo', () => {
  const target = installedProject('Ambiguous agents')
  const duplicate = path.join(target, 'agents', 'specialists', 'product-manager')
  fs.mkdirSync(duplicate, { recursive: true })
  fs.writeFileSync(path.join(duplicate, 'SKILL.md'), 'duplicado\n')
  assert.throws(
    () => learning.evaluate(target, 'product-manager'),
    /agente ambiguo product-manager/,
  )
})

test('la documentación de agentes no cita rutas del toolkit ni rutas inexistentes', () => {
  const repoRoot = path.resolve(__dirname, '..')
  const docs = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      // `evaluations/results/` no es documentación: es la transcripción de una corrida. Contiene lo
      // que el cargo respondió, incluidos comandos que propuso, y exigirle las reglas de un documento
      // que alguien sigue es un error de categoría — corregirlo falsearía la evidencia.
      if (entry.isDirectory()) { if (entry.name !== 'results') walk(file) } else if (entry.name.endsWith('.md')) docs.push(file)
    }
  }
  walk(AGENTS_ROOT)
  assert.ok(docs.length >= AGENTS.length, 'se esperaba al menos un documento por agente')

  for (const file of docs) {
    const text = fs.readFileSync(file, 'utf8')
    const at = path.relative(repoRoot, file)
    // `engine/cli/ops.js` sólo existe en el toolkit; estos documentos viajan a cada instancia.
    assert.equal(text.includes('engine/cli/ops.js'), false, `${at} cita el CLI del toolkit`)
    // La extensión es parte de la ruta: sin ella el patrón cortaba en el punto y comprobaba la
    // existencia de un archivo sin `.md`, que nunca existe.
    for (const match of text.matchAll(/agents\/[a-z0-9/-]+(?:\.(?:md|ya?ml|json|js))?/g)) {
      assert.equal(fs.existsSync(path.join(repoRoot, match[0])), true, `${at} cita ${match[0]}, que no existe`)
    }
  }
})

test('los comandos make citados por los agentes existen en ambos Makefiles', () => {
  const repoRoot = path.resolve(__dirname, '..')
  const targets = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      // Misma razón: una transcripción no es un documento que alguien siga.
      if (entry.isDirectory()) { if (entry.name !== 'results') walk(file) } else if (entry.name.endsWith('.md')) {
        for (const match of fs.readFileSync(file, 'utf8').matchAll(/`make ([a-z-]+)/g)) targets.add(match[1])
      }
    }
  }
  walk(AGENTS_ROOT)
  assert.ok(targets.size, 'los agentes deberían citar algún comando make')
  for (const makefile of ['Makefile', path.join('template', 'Makefile')]) {
    const source = fs.readFileSync(path.join(repoRoot, makefile), 'utf8')
    for (const target of targets) {
      assert.match(source, new RegExp(`^${target}:`, 'm'), `${makefile} no define ${target}`)
    }
  }
})

test('un cargo propio reemplaza al del sistema y el runner apunta al que gana', () => {
  const A = require('../engine/automation')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-precedencia-'))
  const write = (dir, description) => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: demo\ndescription: ${description}\n---\n\n# demo\n`)
  }
  const system = path.join(root, 'agents', 'roles', 'system', 'demo')
  const own = path.join(root, 'agents', 'roles', 'demo')

  write(system, 'La versión que trae Cauce.')
  assert.equal(catalog.resolve(root, 'demo'), system)
  assert.deepEqual(catalog.list(root).map((role) => role.system), [true])

  write(own, 'La versión del proyecto.')
  assert.equal(catalog.resolve(root, 'demo'), own, 'el del proyecto manda')
  const listed = catalog.list(root)
  assert.equal(listed.length, 1, 'el slug no aparece dos veces')
  assert.equal(listed[0].system, false)

  // El puntero que lee el runner debe describir al que ganó, no al que quedó debajo.
  const generated = A.roleSkill(A.roleCatalog(root)[0])
  assert.ok(generated.includes('La versión del proyecto.'))
  assert.match(generated, /agents\/roles\/demo\/SKILL\.md/)

  fs.rmSync(own, { recursive: true, force: true })
  assert.equal(catalog.resolve(root, 'demo'), system, 'al quitarlo vuelve el del sistema')
})

test('un slug repetido entre tipos distintos sigue siendo ambiguo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-ambiguo-'))
  for (const type of ['roles', 'specialists']) {
    const dir = path.join(root, 'agents', type, 'demo')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: demo\ndescription: x\n---\n')
  }
  // Entre tipos no hay regla de precedencia, y elegir en silencio sería peor que fallar.
  assert.throws(() => catalog.resolve(root, 'demo'), /agente ambiguo demo/)
})

// La propuesta mensual existe para consolidar lo que recomendaron los informes de la semana. Con la
// bandera `m` el `$` casa fin de *línea*, así que la búsqueda no ávida cortaba en el primer salto y
// una recomendación de diez líneas llegaba como una. El ciclo corría verde entregando casi nada.
test('la propuesta mensual consolida la recomendación entera, no su primera línea', () => {
  const L = require('../engine/agents/learning')
  const repo = path.resolve(__dirname, '..')
  const reports = path.join(repo, 'agents', 'roles', 'system', 'qa-engineer', 'learning', 'reports')
  const stamp = '2099-01-07'
  const report = path.join(reports, `${stamp}.md`)
  const proposal = path.join(repo, 'agents', 'roles', 'system', 'qa-engineer', 'learning', 'proposals', '2099-01.md')
  fs.writeFileSync(report, `---\nagent: qa-engineer\ndate: ${stamp}\nstatus: draft\n---\n\n`
    + '## Recomendación\n\nPrimera línea.\nSegunda línea.\nTercera línea.\n\n## Preguntas abiertas\n\nNinguna.\n')
  try {
    const result = L.prepareProposal(repo, 'qa-engineer', new Date('2099-01-31T00:00:00Z'))
    assert.equal(result.reports, 1)
    const text = fs.readFileSync(result.file, 'utf8')
    assert.match(text, /Primera línea/)
    assert.match(text, /Segunda línea/, 'la recomendación no se corta en el primer salto')
    assert.match(text, /Tercera línea/)
    assert.equal(text.includes('Preguntas abiertas'), false, 'y no se lleva la sección siguiente')
  } finally {
    fs.rmSync(report, { force: true })
    fs.rmSync(proposal, { force: true })
  }
})

// Los casos adversariales existían y nadie los corría: `evaluate` los contaba. Es el equivalente a una
// suite que sólo comprueba que los archivos `.test.js` existan.
test('los casos adversariales se pueden leer y ejecutar, no sólo contar', () => {
  const EV = require('../engine/agents/evaluations')
  const repo = path.resolve(__dirname, '..')
  const cases = EV.list(repo, 'qa-engineer')
  assert.ok(cases.length >= 6)
  for (const item of cases) {
    assert.ok(item.request.length > 20, `${item.id}: la solicitud tiene que ser un pedido real`)
    assert.equal(item.expected.length, 4, `${item.id}: cuatro comportamientos esperados`)
    // Lo que ve quien responde y lo que ve quien juzga están separados en el archivo: sin eso, el
    // recorrido no podría dejar ciego al cargo.
    assert.equal(item.request.includes(item.expected[0]), false, `${item.id}: no se filtra lo esperado`)
  }
})

test('un resultado que no cubre todos los casos vigentes no vale', () => {
  const EV = require('../engine/agents/evaluations')
  const repo = path.resolve(__dirname, '..')
  const dir = EV.resultsDir(repo, 'qa-engineer')
  const file = path.join(dir, '2099-02-01.md')
  fs.mkdirSync(dir, { recursive: true })
  try {
    // Dos veredictos para seis casos: da una confianza que no tiene, y es peor que no tener ninguno.
    fs.writeFileSync(file, '---\nagent: qa-engineer\ndate: 2099-02-01\n---\n\n'
      + '### 01-x\n\n- Veredicto: pasa\n\n### 02-y\n\n- Veredicto: no pasa\n')
    const parcial = EV.validate(repo, 'qa-engineer')
    assert.equal(parcial.last.total, 2)
    assert.ok(parcial.warnings.some((one) => /cubre 2 de/.test(one)), 'se reporta la cobertura')
    assert.ok(parcial.warnings.some((one) => /no pasaron/.test(one)), 'y el caso que falló')
    // Advertencia y no error: correr los casos exige un modelo y CI no lo tiene. Gatear la integración
    // con un resultado viejo obligaría a pagar una corrida para poder integrar.
    assert.equal(parcial.errors, undefined)
  } finally {
    fs.rmSync(file, { force: true })
  }
})

// Una empresa mantiene sus cargos, no los del catálogo. Sin poder acotar la lista, su ciclo de
// aprendizaje tendría que recorrer 48 cargos para encontrar el suyo y chocar 47 veces con la negativa.
test('una empresa puede acotar el catálogo a lo que sí mantiene', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-own-'))
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  const propio = path.join(target, 'agents', 'roles', 'curador')
  fs.mkdirSync(propio, { recursive: true })
  fs.writeFileSync(path.join(propio, 'SKILL.md'), '---\nname: curador\ndescription: Cargo propio.\n---\n')

  const own = JSON.parse(run(['agents', 'list', target, '--own', '--json']).stdout)
  assert.deepEqual(own.map((role) => role.slug), ['curador'])
  const system = JSON.parse(run(['agents', 'list', target, '--system', '--json']).stdout)
  assert.ok(system.length >= 40)
  assert.equal(system.some((role) => role.slug === 'curador'), false)
  // Y el ciclo corre sobre el suyo, mientras uno del catálogo sigue rechazado con explicación.
  assert.equal(run(['learn', 'curador'], target).status, 0)
  assert.match(run(['learn', 'qa-engineer'], target).stderr, /se hace en el toolkit/)
})
