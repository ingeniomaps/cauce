'use strict'

// Un encabezado que numera una regla sin la forma que `check` lee (caso 224). Lo que se mide: que cada forma
// suelta se avise con la que sí se lee, que las bien escritas y las secciones comunes no, y que `check` lo
// muestre sin fallar.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const SR = require('../../engine/planning/structure')

function planning(name, rules) {
  const dir = path.join(tempRoot(name), 'planning')
  fs.mkdirSync(path.join(dir, 'rules'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'rules', 'propias.md'), rules)
  return dir
}

test('cada forma suelta se avisa con la que se lee, y lo bien escrito no', () => {
  const dir = planning('cauce-reglas-sueltas-', [
    '## Regla 8 — Commits en español', '## Regla 9: puertos', '## Rule 10 - Ports', '## R-11 — guiones',
    '## P12 sin raya', '## P1 — Bien escrita', '## R8 — Override bien escrito', '## Cómo se aplica', '',
  ].join('\n\ntexto\n\n'))
  const found = SR.looseRuleHeadings(dir)
  assert.deepEqual(found.map((one) => one.match(/«## ([^»]+)»/)[1]), [
    'Regla 8 — Commits en español', 'Regla 9: puertos', 'Rule 10 - Ports', 'R-11 — guiones', 'P12 sin raya'])
  assert.match(found[1], /se escribe «## P9 — título»/)
})

test('check lo muestra como aviso y sigue en verde', () => {
  const target = path.join(tempRoot('cauce-reglas-check-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planningDir = path.join(target, 'planning')
  assert.ok(!JSON.parse(run(['check', planningDir, '--json']).stdout).warnings.some((one) => /parece una regla/
    .test(one)), 'el molde no avisa')
  fs.writeFileSync(path.join(planningDir, 'rules', 'propias.md'), '# Propias\n\n## Regla 8 — Commits en español\n')
  const result = JSON.parse(run(['check', planningDir, '--json']).stdout)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.ok(result.warnings.some((one) => /rules\/propias\.md: «## Regla 8 — Commits en español» parece una regla/
    .test(one)), JSON.stringify(result.warnings))
})
