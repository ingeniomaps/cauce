'use strict'

// Comandos falsos para poner delante en el `PATH`. Es el único lugar donde una prueba escribe uno (R18):
// así se busca acá un falso parecido antes de escribir otro, y `doubles.test.js` puede exigir que cada uno
// diga por qué existe.

const fs = require('node:fs')
const path = require('node:path')

// Escribe `name` en `dir` como ejecutable, con el script entero —shebang incluido—, y devuelve su ruta.
function fakeCommand(dir, name, script) {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  fs.writeFileSync(file, script, { mode: 0o755 })
  return file
}

module.exports = { fakeCommand }
