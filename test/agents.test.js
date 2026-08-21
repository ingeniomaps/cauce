'use strict'

const { tempRoot, run, linkEngine } = require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const automation = require('../engine/automation')
const catalog = require('../engine/agents/catalog')
const evaluations = require('../engine/agents/evaluations')
const learning = require('../engine/agents/learning')

// Este repositorio es a la vez el toolkit y el catálogo que se mide, así que casi todo cuelga de acá.
const REPO = path.resolve(__dirname, '..')
const AGENTS_ROOT = path.join(REPO, 'agents')
const AGENTS = catalog.list(REPO).map((role) => ({ type: role.type, slug: role.slug }))

// Una instancia recién creada con el motor enganchado: el montaje de casi todo lo que se prueba acá.
function installedProject(name) {
  const root = tempRoot('cauce-agents-')
  const target = path.join(root, 'demo-ops')
  const result = run(['init', target, '--name', name, '--mode', 'sidecar'])
  assert.equal(result.status, 0, result.stderr)
  linkEngine(target)
  return target
}

// Un cargo propio de la empresa, que es el único que puede recibir su propio aprendizaje. El cuerpo es
// el mínimo que los controles de `evaluate` exigen: sin esas tres frases, fallan.
function writeSkill(dir, name, description) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n`
    + 'No inventar. Requiere autorización. Exige evidencia observable.\n')
  return dir
}

// Los documentos de un cargo, sin las transcripciones: `evaluations/results/` registra lo que el cargo
// respondió un día —comandos propuestos incluidos—, y exigirle las reglas de un documento que alguien
// sigue es un error de categoría. Corregirlo falsearía la evidencia.
function agentDocs() {
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'results') walk(file) } else if (entry.name.endsWith('.md')) {
        found.push(file)
      }
    }
  }
  walk(AGENTS_ROOT)
  return found
}

test('el aprendizaje de la profesión se hace en el toolkit, no en cada empresa', () => {
  // Acá, en el repositorio del toolkit, el cargo es escribible y el ciclo corre.
  const contract = path.join(REPO, 'agents', 'roles', 'system', 'product-manager', 'SKILL.md')
  const before = fs.readFileSync(contract, 'utf8')
  // El directorio puede no existir: sólo se versiona cuando tiene un informe real, y al retirar los
  // moldes muertos dejó de existir en cuarenta y cinco de los cuarenta y siete cargos. `learn` lo crea
  // cuando hace falta, así que darlo por presente medía el disco de quien corre la prueba.
  const reports = path.join(REPO, 'agents', 'roles', 'system', 'product-manager', 'learning', 'reports')
  const stamps = () => {
    try { return fs.readdirSync(reports).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)) } catch { return [] }
  }
  const known = stamps()
  const existed = fs.existsSync(reports)
  try {
    assert.equal(run(['learn', 'product-manager'], REPO).status, 0)
    assert.equal(fs.readFileSync(contract, 'utf8'), before, 'investigar no reescribe el cargo')
  } finally {
    for (const name of stamps()) {
      if (!known.includes(name)) fs.rmSync(path.join(reports, name))
    }
    // El informe se borraba pero el directorio quedaba, y `learn` lo crea. Una prueba no deja andamiaje
    // en el catálogo que el repositorio versiona. `rmdirSync` sólo saca el vacío: si quedó algo que esta
    // corrida no puso, se conserva en vez de taparlo con un error dentro del `finally`.
    if (!existed) { try { fs.rmdirSync(reports) } catch { /* no quedó vacío */ } }
  }
})

test('una empresa no puede investigar la profesión dentro del paquete', () => {
  const target = installedProject('Learning')

  const blocked = run(['learn', 'product-manager'], target)
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /se hace en el toolkit/)
  assert.match(blocked.stderr, /organization\/roles\/product-manager\.md/, 'y dice dónde sí va lo suyo')
  // Pero leerlo sí puede: evaluate es de sólo lectura.
  assert.equal(run(['evaluate', 'product-manager'], target).status, 0)

  // Un cargo propio de la empresa sí acumula su aprendizaje, porque es suyo.
  const own = writeSkill(path.join(target, 'agents', 'roles', 'qa-acme'), 'qa-acme', 'QA de Acme. No usar afuera.')
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

// Una empresa que tiene una tarea y no sabe a quién asignarla no puede tener que abrir 47 carpetas. El
// `description` no sirve para eso: ronda los 500 caracteres porque lo lee el runner al seleccionar.
test('el catálogo se puede recorrer con una línea por cargo', () => {
  const target = installedProject('Index')
  const listing = run(['agents', 'list'], target)
  assert.equal(listing.status, 0, listing.stderr)
  const lines = listing.stdout.trim().split('\n').filter((line) => /^[a-z0-9-]+ {2,}\S/.test(line))
  assert.equal(lines.length, AGENTS.length, 'una línea por cargo, ninguna sin resumen')
  for (const line of lines) assert.ok(line.length <= 150, `línea demasiado larga: ${line}`)

  assert.match(listing.stdout, /Si ninguno encaja/, 'dice qué hacer cuando no hay cargo que sirva')
  assert.match(listing.stdout, /agents\/roles\//, 'y nombra dónde va el propio')

  // Y sirve para una máquina, que es quien elige cuando el que asigna es un agente.
  const json = JSON.parse(run(['agents', 'list', '--json'], target).stdout)
  assert.equal(json.length, AGENTS.length)
  for (const role of json) assert.ok(role.summary, `${role.slug} sin summary en --json`)
})

// Cuatro agentes distintos convergieron en etiquetar `H1`, `H2`, … sin que nada se lo pidiera, y la
// etiqueta terminó siendo carga: dentro del informe une Hallazgos con Evidencia y Recomendación, y la
// propuesta mensual la cita para decir de qué hallazgo sale un cambio. Que funcione porque un modelo
// adivina la convención es exactamente lo que deja de funcionar en silencio.
test('el informe trae escritas las convenciones de las que depende el ciclo', () => {
  const target = installedProject('Convenciones')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
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
  // Un informe de aprendizaje es evidencia como una transcripción: registra qué se investigó un día, y
  // cuando el cargo investiga sobre Cauce cita las rutas de Cauce con razón. El molde sí se revisa
  // —ése sí es un documento que alguien sigue—, así que la exención es del contenido, no del directorio.
  const docs = agentDocs().filter((file) => {
    const dir = path.dirname(file).replace(/\\/g, '/')
    return !(dir.endsWith('learning/reports') && path.basename(file) !== '_template.md')
  })
  assert.ok(docs.length >= AGENTS.length, 'se esperaba al menos un documento por agente')

  for (const file of docs) {
    const text = fs.readFileSync(file, 'utf8')
    const at = path.relative(REPO, file)
    // `engine/cli/ops.js` sólo existe en el toolkit; estos documentos viajan a cada instancia.
    assert.equal(text.includes('engine/cli/ops.js'), false, `${at} cita el CLI del toolkit`)
    // La extensión es parte de la ruta: sin ella el patrón cortaba en el punto y comprobaba la
    // existencia de un archivo sin `.md`, que nunca existe.
    for (const match of text.matchAll(/agents\/[a-z0-9/-]+(?:\.(?:md|ya?ml|json|js))?/g)) {
      assert.equal(fs.existsSync(path.join(REPO, match[0])), true, `${at} cita ${match[0]}, que no existe`)
    }
  }
})

test('los comandos make citados por los agentes existen en ambos Makefiles', () => {
  const targets = new Set()
  for (const file of agentDocs()) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/`make ([a-z-]+)/g)) targets.add(match[1])
  }
  assert.ok(targets.size, 'los agentes deberían citar algún comando make')
  for (const makefile of ['Makefile', path.join('template', 'Makefile')]) {
    const source = fs.readFileSync(path.join(REPO, makefile), 'utf8')
    for (const target of targets) {
      assert.match(source, new RegExp(`^${target}:`, 'm'), `${makefile} no define ${target}`)
    }
  }
})

test('un cargo propio reemplaza al del sistema y el runner apunta al que gana', () => {
  const root = tempRoot('cauce-precedencia-')
  const system = path.join(root, 'agents', 'roles', 'system', 'demo')
  const own = path.join(root, 'agents', 'roles', 'demo')

  writeSkill(system, 'demo', 'La versión que trae Cauce.')
  assert.equal(catalog.resolve(root, 'demo'), system)
  assert.deepEqual(catalog.list(root).map((role) => role.system), [true])

  writeSkill(own, 'demo', 'La versión del proyecto.')
  assert.equal(catalog.resolve(root, 'demo'), own, 'el del proyecto manda')
  const listed = catalog.list(root)
  assert.equal(listed.length, 1, 'el slug no aparece dos veces')
  assert.equal(listed[0].system, false)

  // El puntero que lee el runner debe describir al que ganó, no al que quedó debajo.
  const generated = automation.roleSkill(automation.roleCatalog(root)[0])
  assert.ok(generated.includes('La versión del proyecto.'))
  assert.match(generated, /agents\/roles\/demo\/SKILL\.md/)

  fs.rmSync(own, { recursive: true, force: true })
  assert.equal(catalog.resolve(root, 'demo'), system, 'al quitarlo vuelve el del sistema')
})

test('un slug repetido entre tipos distintos sigue siendo ambiguo', () => {
  const root = tempRoot('cauce-ambiguo-')
  for (const type of ['roles', 'specialists']) writeSkill(path.join(root, 'agents', type, 'demo'), 'demo', 'x')
  assert.throws(() => catalog.resolve(root, 'demo'), /agente ambiguo demo/)
})

// Una recomendación de diez líneas llegaba como una y el ciclo corría verde entregando casi nada: la
// consolidación no falla cuando se rompe, entrega menos. Por eso el caso afirma sobre las tres líneas.
test('la propuesta mensual consolida la recomendación entera, no su primera línea', () => {
  const reports = path.join(REPO, 'agents', 'roles', 'system', 'qa-engineer', 'learning', 'reports')
  const stamp = '2099-01-07'
  const report = path.join(reports, `${stamp}.md`)
  const proposal = path.join(REPO, 'agents', 'roles', 'system', 'qa-engineer', 'learning', 'proposals', '2099-01.md')
  fs.writeFileSync(report, `---\nagent: qa-engineer\ndate: ${stamp}\nstatus: draft\n---\n\n`
    + '## Recomendación\n\nPrimera línea.\nSegunda línea.\nTercera línea.\n\n## Preguntas abiertas\n\nNinguna.\n')
  try {
    const result = learning.prepareProposal(REPO, 'qa-engineer', new Date('2099-01-31T00:00:00Z'))
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
  const cases = evaluations.list(REPO, 'qa-engineer')
  assert.ok(cases.length >= 6)
  for (const item of cases) {
    assert.ok(item.request.length > 20, `${item.id}: la solicitud tiene que ser un pedido real`)
    assert.equal(item.expected.length, 4, `${item.id}: cuatro comportamientos esperados`)
    // Lo que ve quien responde y lo que ve quien juzga están separados en el archivo: sin eso, el
    // recorrido no podría dejar ciego al cargo.
    assert.equal(item.request.includes(item.expected[0]), false, `${item.id}: no se filtra lo esperado`)
  }
})

test('un caso adversarial entrega el artefacto, no lo describe', () => {
  for (const agent of AGENTS) {
    for (const item of evaluations.list(REPO, agent.slug)) {
      if (!item.id.includes('adversarial')) continue
      assert.ok(item.fixtures.length, `${agent.slug}/${item.id}: sin artefacto`)
    }
  }
  // El control gatea: si el artefacto falta, es error y no advertencia. Como advertencia es como
  // estuvo faltando en los 47 sin que nada lo dijera. Se comprueba escondiendo el artefacto de un caso
  // real y devolviéndolo: afirmar sobre un objeto armado a mano probaría el objeto, no el control.
  assert.equal(evaluations.validate(REPO, 'qa-engineer').errors.length, 0, 'el catálogo está completo')
  const one = evaluations.list(REPO, 'qa-engineer').find((one) => one.id.includes('adversarial'))
  const dir = evaluations.fixtures(REPO, 'qa-engineer', one.id).dir
  const hidden = `${dir}.oculto`
  fs.renameSync(dir, hidden)
  try {
    const errors = evaluations.validate(REPO, 'qa-engineer').errors
    assert.equal(errors.length, 1, 'falta el artefacto y se dice')
    assert.match(errors[0], /sin artefacto/)
  } finally {
    fs.renameSync(hidden, dir)
  }
})

// Recorre los 47 cargos y no uno: una lista vacía no rompe nada al evaluar, así que un cargo sin
// conductas prohibidas se descubre acá o no se descubre.
test('la conducta prohibida de un cargo llega a quien juzga', () => {
  for (const agent of AGENTS) {
    const behaviors = evaluations.behaviors(REPO, agent.slug)
    assert.ok(behaviors.required.length, `${agent.slug}: sin comportamientos requeridos`)
    assert.ok(behaviors.forbidden.length, `${agent.slug}: sin conductas prohibidas`)
    // Un `forbidden` que se cuela dentro de `required` invierte el criterio y nadie lo vería.
    for (const one of behaviors.forbidden) {
      assert.equal(behaviors.required.includes(one), false, `${agent.slug}: ${one} está en las dos listas`)
    }
  }
  // El parser distingue las dos listas y corta en la clave siguiente, que es lo único que separa una
  // conducta exigida de una prohibida.
  const parsed = evaluations.behaviors(REPO, 'qa-engineer')
  assert.ok(parsed.forbidden.includes('automatic_skill_rewrite'))
  assert.equal(parsed.required.includes('automatic_skill_rewrite'), false)
})

// Al ciclo le faltaba el final. Había firma, aplicación e historial, y `status:` nacía en `proposed` y
// no lo movía nadie: volver a promover encontraba la misma propuesta firmada —«aprobada y aplicada»
// también lee como aprobada— y la aplicaba de nuevo, duplicando cada viñeta y cada fuente sin fallar.
test('una propuesta aplicada no se puede volver a aplicar', () => {
  const file = path.join(REPO, 'agents/roles/system/qa-engineer/learning/proposals/2026-08.md')
  const original = fs.readFileSync(file, 'utf8')
  try {
    fs.writeFileSync(file, original.replace(/^status:.*$/m, 'status: proposed'))
    assert.equal(learning.proposalState(fs.readFileSync(file, 'utf8')), 'proposed')
    assert.equal(learning.evaluate(REPO, 'qa-engineer').pending, 1, 'cuenta como pendiente')

    const sealed = learning.seal(REPO, 'qa-engineer', '2026-08')
    assert.equal(sealed.already, false)
    assert.equal(learning.proposalState(fs.readFileSync(file, 'utf8')), 'applied')
    // Idempotente: sellar de nuevo no falla ni reescribe, avisa que ya estaba.
    assert.equal(learning.seal(REPO, 'qa-engineer', '2026-08').already, true)
    assert.equal(learning.evaluate(REPO, 'qa-engineer').pending, 0, 'y deja de pedir trabajo')
  } finally {
    fs.writeFileSync(file, original)
  }
})

// El caso recorre el período entero —base, sello, revisión, sello— porque cada paso sólo se ve mal
// desde el siguiente: una revisión que abre de más no molesta hasta que hay dos firmas en juego.
test('una propuesta aplicada se puede corregir sin reabrirla', () => {
  const dir = path.join(REPO, 'agents/roles/system/qa-engineer/learning/proposals')
  const now = new Date('2099-06-15T00:00:00Z')
  const created = []
  try {
    const base = learning.prepareProposal(REPO, 'qa-engineer', now)
    created.push(base.file)
    assert.equal(path.basename(base.file), '2099-06.md')

    assert.equal(learning.prepareProposal(REPO, 'qa-engineer', now).created, false, 'no abre otra si hay pendiente')

    learning.seal(REPO, 'qa-engineer', '2099-06')
    const revision = learning.prepareProposal(REPO, 'qa-engineer', now)
    created.push(revision.file)
    assert.equal(revision.created, true, 'aplicada la anterior, sí abre la revisión')
    assert.equal(path.basename(revision.file), '2099-06-r2.md')
    assert.equal(revision.corrects, '2099-06.md', 'y dice cuál corrige')

    const text = fs.readFileSync(revision.file, 'utf8')
    assert.match(text, /^corrects: 2099-06\.md$/m, 'el frontmatter lo deja legible sin abrir la otra')
    assert.match(text, /^automatic_apply: false$/m)
    assert.equal(revision.reports, 0, 'no reconsolida lo que ya entró por la propuesta que corrige')

    assert.equal(learning.proposalState(fs.readFileSync(path.join(dir, '2099-06.md'), 'utf8')), 'applied',
      'la corregida queda sellada donde está, no se reabre')
    assert.equal(learning.prepareProposal(REPO, 'qa-engineer', now).created, false, 'y r3 espera a que r2 se aplique')

    const sealed = learning.seal(REPO, 'qa-engineer', '2099-06')
    assert.equal(path.basename(sealed.file), '2099-06-r2.md', 'el período sella la vigente, no la base')
    assert.equal(sealed.already, false, 'y la revisión no queda sin sellar, que es como se reaplica')
  } finally {
    for (const file of created) fs.rmSync(file, { force: true })
  }
})

test('un resultado que no cubre todos los casos vigentes no vale', () => {
  const dir = evaluations.resultsDir(REPO, 'qa-engineer')
  const file = path.join(dir, '2099-02-01.md')
  fs.mkdirSync(dir, { recursive: true })
  try {
    // Dos veredictos para seis casos: da una confianza que no tiene, y es peor que no tener ninguno.
    fs.writeFileSync(file, '---\nagent: qa-engineer\ndate: 2099-02-01\n---\n\n'
      + '### 01-x\n\n- Veredicto: pasa\n\n### 02-y\n\n- Veredicto: no pasa\n')
    const partial = evaluations.validate(REPO, 'qa-engineer')
    assert.equal(partial.last.total, 2)
    assert.ok(partial.warnings.some((one) => /cubre 2 de/.test(one)), 'se reporta la cobertura')
    assert.ok(partial.warnings.some((one) => /no pasaron/.test(one)), 'y el caso que falló')
    // Se afirma sobre el contenido y no sobre una lista vacía: `errors` también lleva los controles
    // estáticos del caso, que sí gatean y no tienen nada que ver con qué tan fresca es la corrida.
    assert.equal(partial.errors.some((one) => /cubre \d+ de|no pasaron/.test(one)), false)
  } finally {
    fs.rmSync(file, { force: true })
  }
})

test('dos corridas el mismo día conviven y la segunda es la vigente', () => {
  const dir = evaluations.resultsDir(REPO, 'qa-engineer')
  const first = path.join(dir, '2099-03-01.md')
  const second = path.join(dir, '2099-03-01-2.md')
  fs.mkdirSync(dir, { recursive: true })
  const nextFor = (day) => evaluations.nextResult(REPO, 'qa-engineer', day)
  try {
    assert.equal(nextFor('2099-03-01'), '2099-03-01.md', 'la primera no lleva sufijo')
    fs.writeFileSync(first, '---\nagent: qa-engineer\n---\n\n### 01-x\n\n- Veredicto: no pasa\n')
    assert.equal(nextFor('2099-03-01'), '2099-03-01-2.md', 'la segunda no la pisa')

    fs.writeFileSync(second, '---\nagent: qa-engineer\n---\n\n### 01-x\n\n- Veredicto: pasa\n')
    assert.equal(nextFor('2099-03-01'), '2099-03-01-3.md')

    // Un `latest` que ordena por nombre pasa las demás afirmaciones de este caso y devuelve el
    // veredicto de la corrida vieja, así que hay que mirar los veredictos y no sólo el archivo.
    const current = evaluations.latest(REPO, 'qa-engineer')
    assert.equal(current.file, second, 'la vigente es la última corrida, no la primera del día')
    assert.equal(current.passed, 1, 'y con sus veredictos, no los de la anterior')
    // La fecha sigue siendo el día: quien lee «no pasaron en 2099-03-01» busca una fecha, no un archivo.
    assert.equal(current.date, '2099-03-01')
    assert.equal(current.run, 2)

    assert.throws(() => nextFor('ayer'), /fecha inválida/)
  } finally {
    fs.rmSync(first, { force: true })
    fs.rmSync(second, { force: true })
  }
})

test('una empresa puede acotar el catálogo a lo que sí mantiene', () => {
  const target = installedProject('Propios')
  writeSkill(path.join(target, 'agents', 'roles', 'curador'), 'curador', 'Cargo propio.')

  const own = JSON.parse(run(['agents', 'list', target, '--own', '--json']).stdout)
  assert.deepEqual(own.map((role) => role.slug), ['curador'])
  const system = JSON.parse(run(['agents', 'list', target, '--system', '--json']).stdout)
  assert.equal(system.length, AGENTS.length, 'el catálogo entero, sin el propio')
  assert.equal(system.some((role) => role.slug === 'curador'), false)
  // El ciclo corre sobre el suyo, mientras uno del catálogo sigue rechazado con explicación.
  assert.equal(run(['learn', 'curador'], target).status, 0)
  assert.match(run(['learn', 'qa-engineer'], target).stderr, /se hace en el toolkit/)
})

// El catálogo del sistema no lo habría encontrado nunca: sus viñetas entran todas en una línea. El
// caso las parte a propósito, que es como llegó el primer cargo escrito por una empresa.
test('un comportamiento esperado partido en varias líneas sigue siendo uno', () => {
  const parsed = evaluations.parseCase('# Solicitud\n\nHacé algo.\n\n# Comportamientos esperados\n\n'
    + '- Primero, que ocupa\n  dos líneas enteras.\n- Segundo, corto.\n')
  assert.equal(parsed.expected.length, 2)
  assert.equal(parsed.expected[0], 'Primero, que ocupa dos líneas enteras.')
  assert.equal(parsed.expected[1], 'Segundo, corto.')
})
