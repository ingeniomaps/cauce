'use strict'

// Lo que no es de Cauce dentro del runtime, medido en disco: qué registra `upgrade`, qué avisa y qué deja
// (casos 100 y 110). Vive aparte de `upgrade.test.js`, que cubre lo que el toolkit sí reemplaza.

const { tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const M = require('../../engine/core/manifest')

const key = (name) => `automatization/hooks/${name}`

function instance(prefix) {
  const target = path.join(tempRoot(prefix), 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)
  return { target, hooks: path.join(target, 'automatization', 'hooks') }
}

test('un guard propio no entra al registro ni se reporta como editado (caso 100)', () => {
  const { target, hooks } = instance('cauce-guard-propio-')
  const own = path.join(hooks, 'guard-acme.sh')
  fs.writeFileSync(own, '#!/usr/bin/env bash\necho propio\n')
  assert.equal(run(['upgrade', target]).status, 0)
  assert.equal(M.read(target)[key('guard-acme.sh')], undefined, 'un guard propio no es una entrega')

  fs.appendFileSync(own, '# ajuste\n')
  const check = run(['upgrade', target, '--check'])
  assert.equal(check.status, 0, check.stdout)
  assert.doesNotMatch(check.stdout, /guard-acme/)
  assert.doesNotMatch(run(['check', path.join(target, 'planning')]).stderr, /congelados/)

  // Lo que una versión anterior registró de más se suelta, sin conservarlo ni descartarlo.
  M.write(target, { ...M.read(target), [key('guard-acme.sh')]: 'deunaversionvieja' })
  const forced = run(['upgrade', target, '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.doesNotMatch(forced.stdout, /guard-acme/, 'ni conservado ni descartado: no es de Cauce')
  assert.match(fs.readFileSync(own, 'utf8'), /# ajuste/)
  assert.equal(M.read(target)[key('guard-acme.sh')], undefined)
})

test('upgrade no pisa un guard propio cuando el paquete empieza a traer su nombre (caso 110)', () => {
  const { target, hooks } = instance('cauce-guard-choque-')
  const chat = path.join(hooks, 'guard-chat.sh')
  const shipped = fs.readFileSync(chat, 'utf8')
  // Sin huella: así queda el guard de la empresa que ya existía antes de que el paquete trajera el nombre.
  const sinHuella = () => {
    const files = M.read(target)
    delete files[key('guard-chat.sh')]
    M.write(target, files)
  }
  sinHuella()
  fs.writeFileSync(chat, '#!/usr/bin/env bash\n# guard-chat de ACME\n')

  const conservado = run(['upgrade', target])
  assert.equal(conservado.status, 0, conservado.stderr)
  assert.match(conservado.stdout,
    /conservado automatization\/hooks\/guard-chat\.sh: ya existía y Cauce no lo entregó/)
  assert.match(fs.readFileSync(chat, 'utf8'), /guard-chat de ACME/)
  assert.match(run(['upgrade', target]).stdout, /conservado automatization\/hooks\/guard-chat\.sh/, 'y en la siguiente')
  assert.equal(run(['upgrade', target, '--check']).status, 1, '--check también lo ve')
  // Y `automation check` no manda a correr `upgrade`, que lo volvería a conservar: dice qué hacer.
  linkEngine(target)
  const auto = run(['automation', 'check', target])
  assert.match(auto.stderr, /guard-chat\.sh: es tuyo y se llama como uno que trae el paquete/)
  assert.doesNotMatch(auto.stderr, /guard-chat\.sh: quedó atrás/)

  const reemplazado = run(['upgrade', target, '--force'])
  assert.match(reemplazado.stdout, /reemplazado automatization\/hooks\/guard-chat\.sh/)
  assert.equal(fs.readFileSync(chat, 'utf8'), shipped, 'y lo que dice es lo que quedó en disco')

  // Sin huella pero idéntico al del paquete no es un choque: se registra en silencio.
  sinHuella()
  assert.doesNotMatch(run(['upgrade', target]).stdout, /guard-chat/)
  assert.ok(M.read(target)[key('guard-chat.sh')])

  // En una instancia anterior al registro, «sin huella» tampoco alcanza para pisar: sin con qué
  // distinguir lo propio de lo que entregó una versión vieja, se conserva y se avisa (caso 125). Acá
  // antes se actualizaba en silencio, que es el lado del que no se vuelve.
  const files = M.read(target)
  for (const name of Object.keys(files)) if (name.startsWith('automatization/hooks/')) delete files[name]
  M.write(target, files)
  fs.writeFileSync(chat, '#!/usr/bin/env bash\n# viejo\n')
  const sinRegistro = run(['upgrade', target])
  assert.match(sinRegistro.stdout, /conservado automatization\/hooks\/guard-chat\.sh: ya existía/)
  assert.match(fs.readFileSync(chat, 'utf8'), /# viejo/, 'lo propio sobrevive al primer upgrade')
})

// El acote del 110 dejaba afuera a la instancia sin manifiesto —creada antes de que el registro
// existiera—, que es la que más duele: `collisions()` se salteaba el directorio entero, así que el primer
// `upgrade` reemplazaba el guard propio sin nombrarlo, salía 0, y después registraba el archivo como
// entregado por Cauce. Los tres pasos juntos vuelven la pérdida silenciosa e irrecuperable (caso 125).
test('una instancia sin manifiesto conserva su guard propio en el primer upgrade (caso 125)', () => {
  const { target, hooks } = instance('cauce-guard-sin-manifiesto-')
  fs.rmSync(path.join(target, '.cauce', 'manifest.json'), { force: true })
  const own = path.join(hooks, 'guard-chat.sh')
  fs.writeFileSync(own, '#!/usr/bin/env bash\n# guard-chat de ACME\n')

  const check = run(['upgrade', target, '--check'])
  assert.equal(check.status, 1, 'avisa antes de tocar nada, en vez de decir que está al día')
  assert.match(check.stdout, /choca con uno tuyo: automatization\/hooks\/guard-chat\.sh/)

  const upgraded = run(['upgrade', target])
  assert.equal(upgraded.status, 0, upgraded.stderr)
  assert.match(upgraded.stdout, /conservado automatization\/hooks\/guard-chat\.sh: ya existía/)
  assert.match(fs.readFileSync(own, 'utf8'), /guard-chat de ACME/, 'el trabajo de la empresa sobrevive')
  assert.equal(M.read(target)[key('guard-chat.sh')], undefined,
    'y no queda registrado como entregado por Cauce, que es lo que volvía irrecuperable la pérdida')
})

test('adoptar con init --force no registra el guard propio que ya estaba (caso 100)', () => {
  const target = path.join(tempRoot('cauce-adopta-guard-'), 'acme')
  fs.mkdirSync(path.join(target, 'automatization', 'hooks'), { recursive: true })
  fs.writeFileSync(path.join(target, 'automatization', 'hooks', 'guard-load.sh'), '#!/usr/bin/env bash\necho carga\n')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar', '--force']).status, 0)
  assert.equal(M.read(target)[key('guard-load.sh')], undefined)
  assert.ok(M.read(target)[key('guard-verify.sh')], 'lo que trae el paquete sí se registra')
})

// La otra mitad del 110: el guard propio que una versión anterior sí registró sigue la regla de siempre —se
// conserva como editado—, y el arreglo del 100 no se lleva esa protección en el camino.
test('un guard propio registrado por una versión vieja y que el paquete ahora trae se conserva', () => {
  const { target, hooks } = instance('cauce-guard-registrado-')
  const chat = path.join(hooks, 'guard-chat.sh')
  fs.writeFileSync(chat, '#!/usr/bin/env bash\n# guard-chat de ACME\n')
  M.write(target, { ...M.read(target), [key('guard-chat.sh')]: 'deunaversionvieja' })
  const upgraded = run(['upgrade', target])
  assert.equal(upgraded.status, 0, upgraded.stderr)
  assert.match(upgraded.stdout, /conservado automatization\/hooks\/guard-chat\.sh \(editado localmente\)/)
  assert.match(fs.readFileSync(chat, 'utf8'), /guard-chat de ACME/)
  assert.match(run(['upgrade', target]).stdout, /conservado automatization\/hooks\/guard-chat\.sh/, 'y en la siguiente')
})
