'use strict'

// Con qué hashes puede estar anotado un archivo entregado que viajó a otra carpeta (caso 363). Se mide la
// función sola, con plantillas armadas a mano, para los bordes que una instalación real no ejerce.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const M = require('../../engine/core/manifest')

const MARK = '{{OPS_ROOT}}'
const write = (name, text) => {
  const file = path.join(tempRoot('cauce-reubicado-'), name)
  fs.writeFileSync(file, text)
  return file
}
// Lo que se anota al instalar: el archivo con la raíz de su carpeta vuelta marcador.
const recorded = (template) => M.digestText(template)

test('reconoce el archivo que trae la raíz de otra carpeta, y sólo ése', () => {
  const template = `// recorrido de ejemplo\nconst ROOT = '${MARK}'.replace(/x/, '')\nrun('${MARK}/planning')\n`
  const there = template.split(MARK).join('/srv/ana/prod')
  const target = write('flujo.js', there)
  const known = M.relocatedDigests({ target, opsRoot: '/srv/ana/prod-linea' }, template, MARK)
  assert.ok(known.includes(recorded(template)), 'la raíz de allá, vuelta marcador, da lo anotado')

  // Editado a mano no da lo anotado, venga de donde venga.
  fs.writeFileSync(target, `${there}\n// un cambio\n`)
  assert.ok(!M.relocatedDigests({ target, opsRoot: '/srv/ana/prod-linea' }, template, MARK)
    .includes(recorded(template)))
})

// Lo que sigue al marcador en la plantilla puede aparecer adentro de la raíz: cortar en la primera
// aparición se quedaba con media ruta.
test('la raíz se reconoce aunque contenga lo que la plantilla trae después del marcador', () => {
  const template = `{"command": "sh ${MARK}/automatization/hooks/guard.sh"}\n`
  const target = write('hooks.json', template.split(MARK).join('/srv/alicia/app'))
  const known = M.relocatedDigests({ target, opsRoot: '/srv/otra' }, template, MARK)
  assert.ok(known.includes(recorded(template)))
})

test('sin marcador, sin archivo o con la raíz de esta carpeta no agrega nada', () => {
  const plain = 'sin marcador\n'
  const target = write('plano.md', plain)
  assert.equal(M.relocatedDigests({ target, opsRoot: '/x' }, plain, MARK).length, 1)
  assert.equal(M.relocatedDigests({ target: `${target}.no`, opsRoot: '/x' }, plain, MARK).length, 1)
  const template = `const ROOT = '${MARK}'\n`
  const same = write('igual.js', template.split(MARK).join('/srv/ana/prod'))
  assert.deepEqual(M.relocatedDigests({ target: same, opsRoot: '/srv/ana/prod' }, template, MARK),
    [recorded(template)])
  // Con el marcador al final de la plantilla no hay con qué saber dónde termina la raíz.
  const tail = write('cola.js', `const ROOT = /srv/ana/prod`)
  assert.equal(M.relocatedDigests({ target: tail, opsRoot: '/x' }, `const ROOT = ${MARK}`, MARK).length, 1)
})
