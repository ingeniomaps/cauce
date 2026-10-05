'use strict'

// Con qué se anota lo que un runner entregó (caso 275). El manifiesto viaja por git, así que lo que guarda
// no puede depender de la carpeta donde está la instancia; y una instancia instalada con el motor anterior
// trae el registro viejo, que tiene que seguir reconociéndose.

const { tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const M = require('../../engine/core/manifest')

function instance(name, folder = 'ops') {
  const base = tempRoot(name)
  const target = path.join(base, folder)
  assert.equal(run(['init', target, '--name', 'Entrega', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  return { base, target }
}
const WORKFLOW = 'claude/.claude/workflows/autobuild.js'

test('lo que se anota de una entrega no depende de la carpeta de la instancia', () => {
  const one = instance('cauce-entrega-uno-')
  const two = instance('cauce-entrega-dos-en-otra-ruta-', 'ops')
  const first = M.readRunners(one.target)
  const second = M.readRunners(two.target)
  assert.ok(first[WORKFLOW], `el recorrido quedó anotado: ${Object.keys(first).slice(0, 4)}`)
  assert.deepEqual(second, first, 'el mismo motor en dos carpetas anota lo mismo')
  // Y los archivos sí difieren, que es lo que hace que la igualdad de arriba diga algo: cada recorrido
  // lleva escrita su propia raíz.
  const file = (base) => fs.readFileSync(path.join(base, '.claude', 'workflows', 'autobuild.js'), 'utf8')
  assert.notEqual(file(one.base), file(two.base))
  assert.ok(file(one.base).includes(one.target))
})

// `uninstall` saca lo que el runner entregó y conserva lo que la empresa editó, y lo decide contra lo
// anotado. Las tres mitades: el registro de ahora, el de un motor anterior —el hash del archivo tal cual—
// y uno que no coincide con nada.
test('un registro escrito por el motor anterior sigue reconociendo lo entregado', () => {
  const stale = (kind) => {
    const { base, target } = instance(`cauce-entrega-${kind}-`)
    const file = path.join(base, '.claude', 'workflows', 'autobuild.js')
    // Una versión vieja del recorrido: no es la que el motor trae hoy, y lleva la raíz escrita.
    fs.writeFileSync(file, `// versión anterior\nconst ROOT = '${target}'\n`)
    const recorded = M.readRunners(target)
    recorded[WORKFLOW] = {
      nuevo: M.digestRelocatable({ target: file, opsRoot: target }, '{{OPS_ROOT}}'),
      viejo: M.digest(file),
      ajeno: '0000000000000000',
    }[kind]
    M.write(target, undefined, recorded)
    assert.equal(run(['automation', 'uninstall', target, 'claude']).status, 0)
    return fs.existsSync(file)
  }
  assert.equal(stale('nuevo'), false, 'lo anotado sin la ruta se reconoce y se saca')
  assert.equal(stale('viejo'), false, 'lo anotado con la ruta, también')
  assert.equal(stale('ajeno'), true, 'lo que no coincide con nada es de la empresa y se conserva')
})
