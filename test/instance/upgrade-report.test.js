'use strict'

// Lo que `upgrade` le dice a quien lo corrió: el consejo cuando algo se perdería y el preview de
// `--check`. Se prueban sin tocar el disco —que es la razón por la que viven fuera del comando— y por
// eso están acá y no junto a las pruebas que montan una instancia.

const test = require('node:test')
const assert = require('node:assert/strict')

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
