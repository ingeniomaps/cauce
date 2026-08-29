'use strict'

// Adoptar un cargo del catálogo y la deriva que se abre después.

const { tempRoot } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { drift, driftLine, fork } = require('../../engine/agents/fork')

const DATE = '2026-08-16'

// Lo único que el fork mira de una empresa: el modo, que sale de `ops.config.json`, y el cargo con la
// versión del catálogo del que se copia, que llegan por el paquete.
function company(name, { mode = 'sidecar', extra } = {}) {
  const root = tempRoot(name)
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode }))
  return { root, source: fakePackage(root, 'demo-role', extra) }
}

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

test('el fork trae el cargo entero y deja atrás lo que ganó nuestra versión', () => {
  const { root } = company('cauce-fork-')

  const result = fork(root, 'demo-role', DATE)
  const copied = new Set(result.files)
  assert.ok(copied.has('SKILL.md'), 'el contrato')
  assert.ok(copied.has('evaluations/cases/01-caso.md'), 'y lo que lo hace verificable')

  assert.ok(!copied.has('learning/reports/2026-01-01.md'), 'nuestra investigación no viaja')
  assert.ok(!copied.has('learning/proposals/2026-01.md'), 'ni una decisión que era nuestra')
  assert.ok(!copied.has('evaluations/results/2026-01-01.md'), 'ni una garantía que no rindió')
  assert.equal(result.skipped.length, 3)

  const history = fs.readFileSync(path.join(result.dir, 'learning', 'HISTORY.md'), 'utf8')
  assert.match(history, /2026-08-16 .*Copiado del catálogo de Cauce 9\.9\.9/, 'la fila que marca el límite')
})

// Lo encontró la corrida de validación y no un test: nadie lee el `AUTOMATION.md` de una copia recién
// hecha, y ahí es donde el catálogo manda a mantener `agents/<tipo>/system/<slug>`.
test('el fork reescribe las rutas del catálogo por las de la empresa', () => {
  const { root } = company('cauce-fork-paths-', {
    extra: { 'learning/AUTOMATION.md': 'Mantené agents/roles/system/demo-role leyendo su SKILL.md.\n' },
  })
  const result = fork(root, 'demo-role', DATE)
  const automation = fs.readFileSync(path.join(result.dir, 'learning', 'AUTOMATION.md'), 'utf8')
  assert.match(automation, /agents\/roles\/demo-role/, 'apunta a la copia de la empresa')
  assert.equal(/agents\/roles\/system\/demo-role/.test(automation), false, 'y ya no al paquete')
})

test('un cargo devuelto al catálogo no deja avisos sobre una copia que no existe', () => {
  const { root, source } = company('cauce-unfork-')
  const forked = fork(root, 'demo-role', DATE)

  // Con la copia puesta y el catálogo movido avisa, que es lo que tiene que seguir pasando.
  fs.appendFileSync(path.join(source, 'SKILL.md'), '\nMejora del catálogo.\n')
  assert.equal(drift(root).length, 1)

  // Devuelta al catálogo, el registro queda pero ya no describe nada.
  fs.rmSync(forked.dir, { recursive: true })
  assert.deepEqual(drift(root), [], 'sin copia no hay deriva')
})

test('en el toolkit no se forkea: el catálogo se edita acá', () => {
  const { root } = company('cauce-fork-toolkit-', { mode: 'toolkit' })
  assert.throws(() => fork(root, 'demo-role', DATE), /en el toolkit se edita el catálogo/)
  assert.equal(fs.existsSync(path.join(root, 'agents', 'roles', 'demo-role')), false, 'sin rastro')
  assert.equal(fs.existsSync(path.join(root, '.cauce')), false, 'ni un manifiesto que ahí no va')
})

test('no se forkea dos veces ni se forkea lo propio', () => {
  const { root } = company('cauce-fork-twice-')
  fork(root, 'demo-role', DATE)
  assert.throws(() => fork(root, 'demo-role', DATE), /ya lo mantiene esta empresa/)
})

test('la deriva avisa cuando mejora el catálogo, no cuando la empresa edita su copia', () => {
  const { root, source } = company('cauce-drift-')
  const forked = fork(root, 'demo-role', DATE)
  assert.deepEqual(drift(root), [], 'recién copiado no hay nada que mirar')

  fs.appendFileSync(path.join(forked.dir, 'SKILL.md'), '\nAjuste de la empresa.\n')
  assert.deepEqual(drift(root), [], 'editar la propia copia es exactamente para lo que se forkeó')

  fs.appendFileSync(path.join(source, 'SKILL.md'), '\nMejora del catálogo.\n')
  fs.writeFileSync(path.join(source, 'references.md'), 'guía nueva\n')
  fs.rmSync(path.join(source, 'evaluations', 'cases', '01-caso.md'))
  const [entry] = drift(root)
  assert.equal(entry.slug, 'demo-role')
  assert.deepEqual(entry.changed, ['SKILL.md'])
  assert.deepEqual(entry.added, ['references.md'])
  assert.deepEqual(entry.removed, ['evaluations/cases/01-caso.md'])
  assert.match(driftLine(entry), /no recibe mejoras del catálogo/)
  assert.match(driftLine(entry), /desde 9\.9\.9/)
})
