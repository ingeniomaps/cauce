'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Los guards resuelven su raíz ops mirando el entorno antes que la entrada: `OPS_ROOT`, que exporta
// `run-hook.sh` para que un guard encuentre su motor desde cualquier carpeta, y `CLAUDE_PROJECT_DIR`,
// que pone el runner. Estas pruebas crean instancias temporales y esperan que el guard resuelva esa,
// así que heredar cualquiera de las dos las hace medir este repositorio en vez de lo que montaron.
//
// No es hipotético: el guard de verify corre la suite antes de cada commit de código y exporta la
// primera, y cinco pruebas de guards fallaban sólo por estar commiteando. Se limpia una vez, antes de
// que cualquier prueba se registre, y el resto del entorno llega intacto.
delete process.env.OPS_ROOT
delete process.env.CLAUDE_PROJECT_DIR

// Todo lo temporal de la suite cuelga de un solo directorio por corrida, por dos razones distintas.
//
// Nadie los borraba: cada prueba dejaba el suyo en el tmp del sistema, y después de unos meses eran
// cientos. Colgando de una sola raíz, se limpian con un borrado al salir.
//
// Y `os.tmpdir()` no es nuestro. `planning-drift` deja ahí el marcador de la sesión que ya bloqueó,
// `cauce-drift-<sesión>`, y una prueba que creaba `cauce-drift-XXXXXX` podía ocupar ese nombre: el
// guard lo encontraba, daba la sesión por avisada y dejaba de bloquear sin que nada fallara. Un nivel
// de anidamiento vuelve imposible el choque, que es mejor que acordarse de no repetir un prefijo.
const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), `cauce-test-${process.pid}-`))

process.on('exit', () => fs.rmSync(RAIZ, { recursive: true, force: true }))

function temporal(nombre) {
  return fs.mkdtempSync(path.join(RAIZ, nombre))
}

module.exports = { temporal }
