'use strict'

// La suite como artefacto: no qué prueba cada caso sino que sigan estando. Vive aparte de `repo.test.js`
// —que juzga los archivos del repositorio— porque el sujeto es otro y porque aquél ya está en su límite
// de tamaño.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Cuántas pruebas declara la suite. No es una métrica de calidad —agregar una no mejora nada por sí
// sola— sino un detector de la forma silenciosa de perderlas: un archivo sobreescrito, una suite pisada
// al mover pruebas de lugar. Pasó dos veces en la misma sesión y las dos se descubrieron mirando este
// número bajar, no leyendo el diff.
//
// Lo que este piso **no** es: un límite. Bajarlo es cambiar una línea, y esa es la idea — retirar una
// prueba es legítimo y lo que no puede es ocurrir sin que nadie lo vea. Lo que la puerta compra es que
// aparezca en el diff con su razón al lado, igual que un piso de cobertura.
//
// Se cuenta contra `git ls-files`, así que un archivo de pruebas recién creado no suma hasta stagearlo.
// Es a propósito: el piso habla de la suite que el repositorio tiene, no de la que hay en el disco de
// alguien. Y de paso la primera corrida de un archivo nuevo recuerda stagearlo.
//
// Se cuenta lo declarado y no lo ejecutado: cuatro casos se declaran dentro de un bucle y corren varias
// veces, así que el total ejecutado es mayor y se mueve por razones que no son perder una prueba.
const SUITE_FLOOR = 505

test('la suite no encoge sin que se vea', () => {
  const root = path.resolve(__dirname, '..', '..')
  const files = spawnSync('git', ['ls-files', 'test/**/*.test.js'], { cwd: root, encoding: 'utf8' })
    .stdout.trim().split('\n').filter(Boolean)
  const declared = files.reduce(
    (total, file) => total + (fs.readFileSync(path.join(root, file), 'utf8').match(/^\s*test\(/gm) || []).length,
    0,
  )
  assert.ok(declared >= SUITE_FLOOR,
    `la suite declara ${declared} pruebas y el piso es ${SUITE_FLOOR}: se perdieron ${SUITE_FLOOR - declared}. `
    + 'Si es a propósito, bajá SUITE_FLOOR en el mismo commit y decí por qué; si no, algo pisó un archivo.')
})
