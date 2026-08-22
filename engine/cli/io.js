'use strict'

// Terminar la corrida con un mensaje y un código. Vive aparte porque lo usa cada familia de comandos, y
// dejarlo en el despacho obligaría a que cada módulo dependa del que lo invoca.

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

module.exports = { fail }
