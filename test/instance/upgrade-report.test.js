'use strict'

// Lo que `upgrade` le dice a quien lo corrió. Las dos primeras se prueban sin tocar el disco —el
// consejo y el preview de `--check` son funciones puras, que es la razón por la que viven fuera del
// comando—; las que siguen montan una instancia porque miden la salida de una corrida real, y ahí
// pesan las aserciones de **ausencia**: la regresión del caso 048 entró por una prueba que comprobó
// que apareciera la línea nueva y nunca que desapareciera la vieja.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempRoot, run } = require('../support/environment')

// Cada clase de archivo tiene una salida distinta, y decirle a alguien la ajena lo manda a buscar una
// configuración que no existe: quien editó el protocolo recibía cómo desactivar un guard. Se prueba
// sin tocar el disco porque la clasificación es lo que puede equivocarse, no el upgrade que la imprime.
test('el consejo de upgrade corresponde a quién posee cada archivo', () => {
  const { adviceFor } = require('../../engine/cli/upgrade-report')

  const regla = adviceFor(['planning/rules/system/process.md'])
  assert.match(regla, /escribí la tuya al/, 'una regla del sistema se sobrescribe al lado')
  assert.doesNotMatch(regla, /configuración de tu runner/, 'y no recibe el consejo del runtime')

  const guard = adviceFor(['automatization/hooks/guard-verify.sh'])
  assert.match(guard, /configuración de tu runner/)
  assert.doesNotMatch(guard, /override explícito/)

  const doc = adviceFor(['planning/PROTOCOL.md'])
  assert.match(doc, /delivery\/project\.md/, 'un doc del toolkit manda a donde sí es del proyecto')
  assert.doesNotMatch(doc, /configuración de tu runner/)
  assert.doesNotMatch(doc, /organization\/workspace\.md/, 'y no le habla de un archivo que no editó')

  // A quien completó AGENTS.md porque el README se lo mandaba, el consejo genérico le miente: le dice
  // que ese archivo no lleva una línea de la empresa. Lleva la suya, y hay que decirle a dónde va.
  const agents = adviceFor(['AGENTS.md'])
  assert.match(agents, /organization\/workspace\.md/)
  assert.match(agents, /antes de repetir con --force/, 'y cuándo moverlo, que es antes de perderlo')

  // Y las tres juntas llegan las tres: es el caso que dejaba a alguien sin su salida.
  const todas = adviceFor([
    'planning/rules/system/process.md',
    'automatization/hooks/guard-verify.sh',
    'planning/PROTOCOL.md',
  ])
  for (const parte of [/override explícito/, /configuración de tu runner/, /delivery\/project\.md/]) {
    assert.match(todas, parte)
  }
  assert.equal(adviceFor([]), '')
})

// `--check` mira y cuenta, y devuelve el código en vez de cortar el proceso, así que sus tres caminos
// se prueban sin montar nada. Antes vivían dentro del comando que sí muta y sólo se veían corriéndolo.
test('el preview de upgrade distingue sus tres respuestas', () => {
  const { previewUpgrade } = require('../../engine/cli/upgrade-report')
  const dicho = []
  const log = console.log
  console.log = (line) => dicho.push(String(line))
  try {
    // Al día y sin nada editado: no hay nada que resolver.
    assert.equal(previewUpgrade({ from: '1.0.0', to: '1.0.0', changed: [] }), 0)
    assert.ok(dicho.some((line) => /al día con el motor instalado/.test(line)))

    // Al día con algo editado: sale 1, porque hay algo que resolver antes de la próxima.
    dicho.length = 0
    assert.equal(previewUpgrade({ from: '1.0.0', to: '1.0.0', changed: ['AGENTS.md'] }), 1)
    assert.ok(dicho.some((line) => /editado localmente: AGENTS\.md/.test(line)))

    // Hacia adelante y hacia atrás dicen cosas distintas: volver no es «hay algo más nuevo».
    dicho.length = 0
    assert.equal(previewUpgrade({ from: '1.0.0', to: '2.0.0', changed: [] }), 1)
    assert.ok(dicho.some((line) => /hay una versión más nueva/.test(line)))

    dicho.length = 0
    assert.equal(previewUpgrade({ from: '2.0.0', to: '1.0.0', changed: [] }), 1)
    assert.ok(dicho.some((line) => /volvés a 1\.0\.0/.test(line)), 'y dice lo que se deja, no lo que se gana')
    assert.equal(dicho.some((line) => /hay una versión más nueva/.test(line)), false)
  } finally { console.log = log }
})

// El 048: la salida afirmaba un descarte que 0.67.0 dejó de hacer. Las aserciones que importan son las
// de **ausencia** —que la línea vieja ya no esté—, porque la regresión entró justo por ahí: la prueba
// del 044 comprobó que apareciera `= conservado` y nunca que desapareciera `− descartado`.
test('sin --force el informe no dice descartado, y dice que lo propio quedó intacto', () => {
  const base = tempRoot('cauce-informe-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)
  const guard = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  fs.writeFileSync(guard, '#!/usr/bin/env bash\n# mío\n')

  const conservado = run(['upgrade', target])
  assert.equal(conservado.status, 0, conservado.stderr)
  assert.equal(/descartado tu cambio/.test(conservado.stdout), false,
    'no se descartó nada: afirmarlo es falso')
  assert.match(conservado.stdout, /todo lo propio quedaron intactos/,
    'y es justo cuando hay que decirlo')

  const forzado = run(['upgrade', target, '--force'])
  assert.equal(forzado.status, 0, forzado.stderr)
  assert.match(forzado.stdout, /descartado tu cambio en automatization\/hooks\/guard-verify\.sh/,
    'con --force sí se descartó, y el rastro queda')
  assert.equal(/todo lo propio quedaron intactos/.test(forzado.stdout), false)
})

// El 047: `upgrade` conservaba archivo por archivo lo editado y en la misma corrida borraba directorios
// retirados enteros, con lo que el proyecto hubiera puesto adentro.
test('una ruta retirada cuyo nombre el proyecto también usa no se borra sin --force', () => {
  const base = tempRoot('cauce-retirado-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)
  const propio = path.join(target, 'automatization', 'workflows')
  fs.mkdirSync(propio, { recursive: true })
  fs.writeFileSync(path.join(propio, 'autobuild.js'), '// el loop propio del proyecto\n')

  const upgraded = run(['upgrade', target])
  assert.equal(upgraded.status, 0, upgraded.stderr)
  assert.equal(fs.existsSync(path.join(propio, 'autobuild.js')), true, 'no se borra lo que no entregó')
  assert.match(upgraded.stdout, /automatization\/workflows: 1 archivo\(s\)/)
  assert.equal(/− retirado automatization\/workflows/.test(upgraded.stdout), false,
    'y no se afirma un retiro que no ocurrió')

  // Lo que sí es del toolkit sin ambigüedad se retira igual: el mecanismo no se apaga entero.
  const catalogo = path.join(target, 'flows', 'system')
  fs.mkdirSync(catalogo, { recursive: true })
  fs.writeFileSync(path.join(catalogo, 'viejo.md'), '# copia vieja del catálogo\n')
  const otra = run(['upgrade', target])
  assert.equal(fs.existsSync(catalogo), false, 'flows/system no lleva contenido del proyecto')
  assert.match(otra.stdout, /retirado flows\/system/)

  // Y con --force se limpia, que es la salida que la línea ofrece.
  const forzado = run(['upgrade', target, '--force'])
  assert.equal(forzado.status, 0, forzado.stderr)
  assert.equal(fs.existsSync(propio), false, '--force sí lo retira')
  assert.match(forzado.stdout, /retirado automatization\/workflows/)
})

test('check cuenta las rutas retiradas que quedaron sin limpiar', () => {
  const base = tempRoot('cauce-restos-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)
  assert.equal(/ruta\(s\) retiradas/.test(run(['check', path.join(target, 'planning')]).stderr), false)

  fs.mkdirSync(path.join(target, 'automatization', 'workflows'), { recursive: true })
  fs.writeFileSync(path.join(target, 'automatization', 'workflows', 'propio.js'), '// mío\n')
  assert.equal(run(['upgrade', target]).status, 0)
  assert.match(run(['check', path.join(target, 'planning')]).stderr, /1 ruta\(s\) retiradas/)
})
