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
  // El directorio puede no existir: sólo se versiona cuando tiene un informe real, y al retirar los
  // moldes muertos dejó de existir en cuarenta y cinco de los cuarenta y siete cargos. `learn` lo crea
  // cuando hace falta, así que darlo por presente medía el disco de quien corre la prueba.
  const reports = path.join(repoRoot, 'agents', 'roles', 'system', 'product-manager', 'learning', 'reports')
  const nuevos = () => {
    try { return fs.readdirSync(reports).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)) } catch { return [] }
  }
  const previos = nuevos()
  const habia = fs.existsSync(reports)
  try {
    assert.equal(run(['learn', 'product-manager'], repoRoot).status, 0)
    assert.equal(fs.readFileSync(skill, 'utf8'), before, 'investigar no reescribe el cargo')
  } finally {
    for (const name of nuevos()) {
      if (!previos.includes(name)) fs.rmSync(path.join(reports, name))
    }
    // El informe se borraba pero el directorio quedaba, y `learn` lo crea. Una prueba no deja
    // andamiaje en el catálogo que el repo versiona. `rmdirSync` sólo saca el vacío: si quedó algo
    // que esta corrida no puso, se conserva en vez de taparlo con un error dentro del `finally`.
    if (!habia) { try { fs.rmdirSync(reports) } catch { /* no quedó vacío */ } }
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

// Cuatro agentes distintos convergieron en etiquetar `H1`, `H2`, … sin que nada se lo pidiera, y la
// etiqueta terminó siendo carga: dentro del informe une Hallazgos con Evidencia y Recomendación, y la
// propuesta mensual la cita para decir de qué hallazgo sale un cambio. Que funcione porque un modelo
// adivina la convención es exactamente lo que deja de funcionar en silencio.
test('el informe trae escritas las convenciones de las que depende el ciclo', () => {
  const target = installedProject('Convenciones')
  const own = path.join(target, 'agents', 'roles', 'probe')
  fs.mkdirSync(own, { recursive: true })
  fs.writeFileSync(path.join(own, 'SKILL.md'), '---\nname: probe\ndescription: x\n---\n\nNo inventar. Requiere autorización. Exige evidencia observable.\n')
  assert.equal(run(['learn', 'probe'], target).status, 0)
  const reports = path.join(own, 'learning', 'reports')
  const report = path.join(reports, fs.readdirSync(reports)[0])
  const scaffold = fs.readFileSync(report, 'utf8')
  assert.match(scaffold, /H1, H2/, 'la etiqueta de hallazgo')
  assert.match(scaffold, /No renombres los títulos/, 'y que los títulos se leen con un patrón')

  // El comentario va fuera de toda sección a propósito: dentro de «Recomendación» lo capturaría el
  // patrón de consolidación y viajaría como texto a cada propuesta del catálogo.
  fs.writeFileSync(report, scaffold.replace(
    '## Recomendación\n', '## Recomendación\n\n1. Rotar el token (cierra H1).\n',
  ))
  assert.equal(run(['learn', 'probe', '--proposal'], target).status, 0)
  const proposals = path.join(own, 'learning', 'proposals')
  const consolidated = fs.readFileSync(path.join(proposals, fs.readdirSync(proposals)[0]), 'utf8')
  assert.match(consolidated, /Rotar el token \(cierra H1\)/, 'la recomendación llega entera')
  assert.equal(consolidated.includes('No renombres'), false, 'y el comentario no viaja con ella')
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
      // Un informe de aprendizaje es la misma categoría: registra qué se investigó un día, y cuando el
      // cargo investiga sobre Cauce cita las rutas de Cauce con razón. El molde sí se revisa —ése sí
      // es un documento que alguien sigue—, así que la exención es del contenido, no del directorio.
      const evidencia = dir.replace(/\\/g, '/').endsWith('learning/reports') && entry.name !== '_template.md'
      if (entry.isDirectory()) { if (entry.name !== 'results') walk(file) } else if (entry.name.endsWith('.md') && !evidencia) docs.push(file)
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

// Un caso adversarial que describe el artefacto sin entregarlo pregunta si el cargo obedecería un
// documento del que se le está hablando, y eso no es inyección: un texto que nunca leyó no puede
// inyectarlo. Los 47 casos del catálogo nacieron así y uno produjo un fallo falso — el cargo escribió
// que había leído una guía inexistente porque el arnés se la había afirmado.
test('un caso adversarial entrega el artefacto, no lo describe', () => {
  const EV = require('../engine/agents/evaluations')
  const repo = path.resolve(__dirname, '..')
  for (const agent of AGENTS) {
    for (const item of EV.list(repo, agent.slug)) {
      if (!item.id.includes('adversarial')) continue
      assert.ok(item.fixtures.length, `${agent.slug}/${item.id}: sin artefacto`)
    }
  }
  // Y el control gatea: si el artefacto falta, es error y no advertencia. Como advertencia es como
  // estuvo faltando en los 47 sin que nada lo dijera. Se comprueba escondiendo el artefacto de un caso
  // real y devolviéndolo: afirmar sobre un objeto armado a mano probaría el objeto, no el control.
  assert.equal(EV.validate(repo, 'qa-engineer').errors.length, 0, 'el catálogo está completo')
  const caso = EV.list(repo, 'qa-engineer').find((one) => one.id.includes('adversarial'))
  const dir = EV.fixtures(repo, 'qa-engineer', caso.id).dir
  const guardado = `${dir}.oculto`
  fs.renameSync(dir, guardado)
  try {
    const errores = EV.validate(repo, 'qa-engineer').errors
    assert.equal(errores.length, 1, 'falta el artefacto y se dice')
    assert.match(errores[0], /sin artefacto/)
  } finally {
    fs.renameSync(guardado, dir)
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
    // con un resultado viejo obligaría a pagar una corrida para poder integrar. Se afirma sobre el
    // contenido y no sobre la lista vacía: `errors` también lleva los controles estáticos del caso, que
    // sí gatean y no tienen nada que ver con qué tan fresca es la corrida.
    assert.equal(parcial.errors.some((one) => /cubre \d+ de|no pasaron/.test(one)), false)
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

// Una viñeta puede ocupar varias líneas. Contar líneas en vez de viñetas inflaba el número de
// comportamientos esperados, y ese número es el denominador de toda la evaluación: un caso con cuatro
// declaraba siete y ninguno podía pasar. No se veía en el catálogo del sistema, donde todas entran en
// una línea; apareció en el primer cargo escrito por una empresa.
test('un comportamiento esperado partido en varias líneas sigue siendo uno', () => {
  const EV = require('../engine/agents/evaluations')
  const parsed = EV.parseCase('# Solicitud\n\nHacé algo.\n\n# Comportamientos esperados\n\n'
    + '- Primero, que ocupa\n  dos líneas enteras.\n- Segundo, corto.\n')
  assert.equal(parsed.expected.length, 2)
  assert.equal(parsed.expected[0], 'Primero, que ocupa dos líneas enteras.')
  assert.equal(parsed.expected[1], 'Segundo, corto.')
})

// Un paquete de mentira, con un solo cargo y control total sobre su contenido. El helper que enlaza
// el repositorio no sirve acá: para probar la deriva hay que mover el catálogo río arriba, y con un
// symlink eso significaría escribir en el repositorio real.
function fakePackage(root, slug, extra = {}) {
  const pkg = path.join(root, 'node_modules', '@ingeniomaps', 'cauce')
  const dir = path.join(pkg, 'agents', 'roles', 'system', slug)
  fs.mkdirSync(path.join(dir, 'evaluations', 'cases'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'learning', 'reports'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'learning', 'proposals'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ version: '9.9.9' }))
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Contrato\n')
  fs.writeFileSync(path.join(dir, 'evaluations', 'cases', '01-caso.md'), '# Solicitud\n')
  fs.writeFileSync(path.join(dir, 'learning', 'HISTORY.md'), '| Fecha |\n|---|\n')
  fs.writeFileSync(path.join(dir, 'learning', 'reports', '2026-01-01.md'), 'investigación nuestra\n')
  fs.writeFileSync(path.join(dir, 'learning', 'proposals', '2026-01.md'), 'decisión nuestra\n')
  fs.writeFileSync(path.join(dir, 'evaluations', 'results', '2026-01-01.md'), 'veredicto nuestro\n')
  for (const [relative, content] of Object.entries(extra)) {
    fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true })
    fs.writeFileSync(path.join(dir, relative), content)
  }
  return dir
}

// Copiar a mano sale mal de una forma que no se nota: se agarra el SKILL.md, que es lo que se ve, y
// el cargo queda sin casos. Responde igual y ya no se puede evaluar, sin ningún aviso.
test('el fork trae el cargo entero y deja atrás lo que ganó nuestra versión', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-fork-'))
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  fakePackage(root, 'demo-role')

  const result = require('../engine/agents/fork').fork(root, 'demo-role', '2026-08-16')
  const copied = new Set(result.files)
  assert.ok(copied.has('SKILL.md'), 'el contrato')
  assert.ok(copied.has('evaluations/cases/01-caso.md'), 'y lo que lo hace verificable')

  // Un veredicto pertenece al contrato que lo ganó, y el fork nace para dejar de ser ese contrato.
  assert.ok(!copied.has('learning/reports/2026-01-01.md'), 'nuestra investigación no viaja')
  assert.ok(!copied.has('learning/proposals/2026-01.md'), 'ni una decisión que era nuestra')
  assert.ok(!copied.has('evaluations/results/2026-01-01.md'), 'ni una garantía que no rindió')
  assert.equal(result.skipped.length, 3)

  // La fila marca el límite: arriba lo que decidimos nosotros, abajo lo que decida la empresa.
  const history = fs.readFileSync(path.join(result.dir, 'learning', 'HISTORY.md'), 'utf8')
  assert.match(history, /2026-08-16 .*Copiado del catálogo de Cauce 9\.9\.9/)
})

// En el toolkit el fork creaba un duplicado en `agents/roles/` que tapaba al original: el trabajo
// siguiente se hacía sobre la copia mientras la versión que se publica quedaba quieta.
// Lo encontró la corrida de validación, no un test: el `AUTOMATION.md` del catálogo dice «mantené
// agents/<tipo>/system/<slug>», y en una empresa ese directorio es el paquete. Copiado tal cual, el
// aprendizaje del cargo adoptado apuntaba a un lugar que el guard bloquea y que npm borra.
test('el fork reescribe las rutas del catálogo por las de la empresa', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-fork-paths-'))
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  fakePackage(root, 'demo-role', {
    'learning/AUTOMATION.md': 'Mantené agents/roles/system/demo-role leyendo su SKILL.md.\n',
  })
  const result = require('../engine/agents/fork').fork(root, 'demo-role', '2026-08-16')
  const automation = fs.readFileSync(path.join(result.dir, 'learning', 'AUTOMATION.md'), 'utf8')
  assert.match(automation, /agents\/roles\/demo-role/, 'apunta a la copia de la empresa')
  assert.equal(/agents\/roles\/system\/demo-role/.test(automation), false, 'y ya no al paquete')
})

// Devolver un cargo al catálogo es tan legítimo como adoptarlo, y el registro sobrevive a esa vuelta.
// Sin este corte, `check` avisaba «tu copia no recibe mejoras del catálogo» sobre una copia borrada y
// mandaba a mirar un directorio que no está.
test('un cargo devuelto al catálogo no deja avisos sobre una copia que no existe', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-unfork-'))
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  const source = fakePackage(root, 'demo-role')
  const F = require('../engine/agents/fork')
  const forked = F.fork(root, 'demo-role', '2026-08-16')

  // Con la copia puesta y el catálogo movido, avisa: eso es lo que tiene que seguir pasando.
  fs.appendFileSync(path.join(source, 'SKILL.md'), '\nMejora del catálogo.\n')
  assert.equal(F.drift(root).length, 1)

  // Devuelta al catálogo, el registro queda pero ya no describe nada.
  fs.rmSync(forked.dir, { recursive: true })
  assert.deepEqual(F.drift(root), [], 'sin copia no hay deriva')
})

test('en el toolkit no se forkea: el catálogo se edita acá', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-fork-toolkit-'))
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'toolkit' }))
  fakePackage(root, 'demo-role')
  const F = require('../engine/agents/fork')
  assert.throws(() => F.fork(root, 'demo-role', '2026-08-16'), /en el toolkit se edita el catálogo/)
  assert.equal(fs.existsSync(path.join(root, 'agents', 'roles', 'demo-role')), false, 'sin rastro')
  assert.equal(fs.existsSync(path.join(root, '.cauce')), false, 'ni un manifiesto que ahí no va')
})

test('no se forkea dos veces ni se forkea lo propio', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-fork-twice-'))
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  fakePackage(root, 'demo-role')
  const F = require('../engine/agents/fork')
  F.fork(root, 'demo-role', '2026-08-16')
  assert.throws(() => F.fork(root, 'demo-role', '2026-08-16'), /ya lo mantiene esta empresa/)
})

// El fork es legítimo, pero deja de recibir mejoras, y eso no puede pasar en silencio: nadie compara
// catorce archivos a mano en cada actualización. Lo delicado es la otra mitad —callar cuando la
// empresa edita lo suyo—, porque un aviso que salta con cada ajuste propio se vuelve ruido y se ignora.
test('la deriva avisa cuando mejora el catálogo, no cuando la empresa edita su copia', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-drift-'))
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  const source = fakePackage(root, 'demo-role')
  const F = require('../engine/agents/fork')
  const forked = F.fork(root, 'demo-role', '2026-08-16')
  assert.deepEqual(F.drift(root), [], 'recién copiado no hay nada que mirar')

  fs.appendFileSync(path.join(forked.dir, 'SKILL.md'), '\nAjuste de la empresa.\n')
  assert.deepEqual(F.drift(root), [], 'editar la propia copia es exactamente para lo que se forkeó')

  fs.appendFileSync(path.join(source, 'SKILL.md'), '\nMejora del catálogo.\n')
  fs.writeFileSync(path.join(source, 'references.md'), 'guía nueva\n')
  fs.rmSync(path.join(source, 'evaluations', 'cases', '01-caso.md'))
  const [entry] = F.drift(root)
  assert.equal(entry.slug, 'demo-role')
  assert.deepEqual(entry.changed, ['SKILL.md'])
  assert.deepEqual(entry.added, ['references.md'])
  assert.deepEqual(entry.removed, ['evaluations/cases/01-caso.md'])
  assert.match(F.driftLine(entry), /no recibe mejoras del catálogo/)
  assert.match(F.driftLine(entry), /desde 9\.9\.9/)
})
