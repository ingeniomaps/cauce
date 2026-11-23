'use strict'

// Caso 545: un archivo que sobrescribe uno de reglas del sistema conserva las que nombra en `adopts:`. `install` copia
// su texto a `planning/rules/adopted/`, el bloque de reglas las carga, y `check` deja de darlas por perdidas, falla
// si la declaración está mal y avisa cuando lo generado quedó viejo.

const { installedProject } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const O = require('../../engine/core/ownership')
const AD = require('../../engine/planning/adopted')

const OWN = '# Proceso (propio)\n\n## R1 — Pensar antes de codear\n\nPlan antes.\n\n## R2 — Objetivos\n\nVerificable.\n'
const withAdopts = (ids) => `---\nadopts: ${ids}\n---\n\n${OWN}`

function project(prefix, runner) {
  const made = installedProject(prefix, runner)
  const rules = path.join(made.target, 'planning', 'rules')
  return { ...made, rules, adopted: path.join(rules, 'adopted', 'process.md') }
}
const check = (runCli, target) => runCli(['check', path.join(target, 'planning')])
const said = (out) => out.stdout + out.stderr
const overrideLine = (out) => said(out).split('\n').find((one) => /sobrescribe process\.md/.test(one))

test('sin adopts:, sobrescribir retira las del archivo y no se genera nada', () => {
  const { target, rules, adopted, runCli } = project('cauce-adopts-sin-')
  fs.writeFileSync(path.join(rules, 'process.md'), OWN)
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.equal(fs.existsSync(adopted), false)
  assert.ok(!O.effectiveRules(target).some((one) => one.includes('/adopted/')))
  assert.match(overrideLine(check(runCli, target)), /deja de regir R3, R4, R17, R25, R28/)
})

test('lo adoptado se genera, se carga y deja de figurar como perdido', () => {
  const { target, rules, adopted, runCli } = project('cauce-adopts-')
  fs.writeFileSync(path.join(rules, 'process.md'), withAdopts('R3, R17, R28'))
  assert.match(said(check(runCli, target)), /rules\/adopted\/process\.md no coincide .* corré automation install/)
  const install = runCli(['automation', 'install', target, 'claude'])
  assert.equal(install.status, 0, install.stderr)
  const text = fs.readFileSync(adopted, 'utf8')
  assert.match(text, /^<!-- generado por Cauce \(caso 545\)/)
  assert.deepEqual([...text.matchAll(/^## (R\d+)/gm)].map((one) => one[1]), ['R3', 'R17', 'R28'])
  const system = fs.readFileSync(path.join(rules, 'system', 'process.md'), 'utf8')
  assert.ok(text.includes(AD.sectionsOf(system).get('R28')), 'el texto es el del sistema, entero')
  assert.ok(O.effectiveRules(target).includes('planning/rules/adopted/process.md'))
  const claude = fs.readFileSync(path.join(path.dirname(target), 'CLAUDE.md'), 'utf8')
  assert.match(claude, /^@ops\/planning\/rules\/adopted\/process\.md$/m, 'el bloque lo importa')
  const after = check(runCli, target)
  assert.match(overrideLine(after), /deja de regir R4, R25$/)
  assert.doesNotMatch(said(after), /no coincide/, 'recién instalado, no está viejo')
})

test('el bloque de un runner que lista rutas también lo nombra', () => {
  const { target, rules, runCli } = project('cauce-adopts-codex-', 'codex')
  fs.writeFileSync(path.join(rules, 'process.md'), withAdopts('R28'))
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  const agents = fs.readFileSync(path.join(path.dirname(target), 'AGENTS.md'), 'utf8')
  assert.match(agents, /`ops\/planning\/rules\/adopted\/process\.md`/)
})

test('cambiar lo adoptado deja lo generado viejo hasta reinstalar, y dejar de adoptar lo borra', () => {
  const { target, rules, adopted, runCli } = project('cauce-adopts-cambio-')
  fs.writeFileSync(path.join(rules, 'process.md'), withAdopts('R28'))
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  fs.writeFileSync(path.join(rules, 'process.md'), withAdopts('R4, R28'))
  assert.match(said(check(runCli, target)), /rules\/adopted\/process\.md no coincide/)
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.match(fs.readFileSync(adopted, 'utf8'), /^## R4 /m)
  // Lo que escribió una persona en la misma carpeta no lleva la marca, y no se toca.
  const own = path.join(rules, 'adopted', 'notas.md')
  fs.writeFileSync(own, 'notas propias\n')
  fs.writeFileSync(path.join(rules, 'process.md'), OWN)
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.equal(fs.existsSync(adopted), false, 'sin adopts:, el generado se va')
  assert.equal(fs.readFileSync(own, 'utf8'), 'notas propias\n')
})

test('check falla con un adopts: mal declarado', () => {
  const cases = [
    ['process.md', withAdopts('R99'), /rules\/process\.md: adopta R99, que system\/process\.md no define/],
    ['process.md', withAdopts('R1, R28'), /rules\/process\.md: adopta R1 y también lo define; queda una de las dos/],
    ['propias.md', '---\nadopts: R28\n---\n\n# Propias\n\n## P1 — Una\n\nTexto.\n',
      /rules\/propias\.md: adopta R28, pero no sobrescribe ningún archivo del sistema/],
  ]
  for (const [file, text, reason] of cases) {
    const { target, rules, runCli } = project('cauce-adopts-error-')
    fs.writeFileSync(path.join(rules, file), text)
    const out = check(runCli, target)
    assert.equal(out.status, 1, `${file}: ${out.stdout}`)
    assert.match(said(out), reason)
  }
})

test('adopts: se lee sólo en el frontmatter, y una sección termina en la siguiente de su nivel', () => {
  assert.deepEqual(AD.adoptsOf('---\nadopts: R3,R17  R28\n---\n'), ['R3', 'R17', 'R28'])
  assert.deepEqual(AD.adoptsOf('# Título\n\nadopts: R3\n'), [])
  // La clave fue `adopta:` hasta antes de publicarse; se nombra en inglés como todo lo que lee el código.
  assert.deepEqual(AD.adoptsOf('---\nadopta: R3\n---\n'), [])
  const sections = AD.sectionsOf('# X\n\n## R1 — Uno\n\nTexto.\n\n### Detalle\n\nMás.\n\n## Otra cosa\n\nNo.\n')
  assert.equal(sections.get('R1'), '## R1 — Uno\n\nTexto.\n\n### Detalle\n\nMás.')
})

// Lo que encontró la revisión del caso 545.
test('lo que el propio redefine no se copia, y lo adoptado hereda la superficie y no cuenta como propio', () => {
  const { target, rules, adopted, runCli } = project('cauce-adopts-revision-')
  fs.writeFileSync(path.join(rules, 'process.md'), withAdopts('R1, R28'))
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  assert.deepEqual([...fs.readFileSync(adopted, 'utf8').matchAll(/^## (R\d+)/gm)].map((one) => one[1]), ['R28'],
    'R1 es del propio: copiarlo daba dos textos bajo el mismo número')
  const R = require('../../engine/automation/rules')
  const line = R.weightLine(target)
  const own = Number((line.match(/\(([\d.]+) KB propias\)/) || [])[1])
  assert.ok(own < 0.5, `lo adoptado no suma a lo propio: ${line}`)
  // R29 se carga sólo por superficie; adoptada, sigue igual.
  fs.writeFileSync(path.join(rules, 'proof.md'),
    '---\nadopts: R29\n---\n\n# Pruebas (propio)\n\n## P1 — Una\n\nTexto.\n')
  assert.equal(runCli(['automation', 'install', target, 'claude']).status, 0)
  const proof = fs.readFileSync(path.join(rules, 'adopted', 'proof.md'), 'utf8')
  assert.match(proof, /^---\naplica: .+\n---\n/)
  const { named } = R.split(target)
  assert.ok(named.some((one) => one.file === 'planning/rules/adopted/proof.md'), 'se nombra y no se carga')
})

test('install no pisa ni sigue lo que no generó en el lugar de lo adoptado', () => {
  const kinds = [
    ['a mano', (file) => fs.writeFileSync(file, 'mío\n')],
    ['enlace', (file, base) => { fs.writeFileSync(path.join(base, 'afuera.md'), 'afuera\n')
      fs.symlinkSync(path.join(base, 'afuera.md'), file) }],
    ['carpeta', (file) => fs.mkdirSync(file)],
  ]
  for (const [kind, make] of kinds) {
    const { target, rules, adopted, runCli } = project('cauce-adopts-ajeno-')
    fs.writeFileSync(path.join(rules, 'process.md'), withAdopts('R28'))
    fs.mkdirSync(path.dirname(adopted), { recursive: true })
    make(adopted, path.dirname(target))
    const out = runCli(['automation', 'install', target, 'claude'])
    assert.notEqual(out.status, 0, kind)
    assert.match(said(out), /adopted\/process\.md existe y no lo generó Cauce/, kind)
    if (kind === 'enlace') {
      assert.equal(fs.readFileSync(path.join(path.dirname(target), 'afuera.md'), 'utf8'), 'afuera\n')
    }
  }
})
