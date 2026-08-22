'use strict'

const path = require('node:path')

// Terminar la corrida con un mensaje y un código. Vive aparte porque lo usa cada familia de comandos, y
// dejarlo en el despacho obligaría a que cada módulo dependa del que lo invoca.

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

// vive: sin eso, invocarlo desde otra carpeta —lo normal en sidecar— la resolvía contra el cwd.
function opsRoot(dir) {
  return path.resolve(dir || process.env.OPS_ROOT || '.')
}

module.exports = { fail, opsRoot }
