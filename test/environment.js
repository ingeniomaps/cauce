'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

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
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), `cauce-test-${process.pid}-`))

process.on('exit', () => fs.rmSync(ROOT, { recursive: true, force: true }))

function tempRoot(name) {
  return fs.mkdtempSync(path.join(ROOT, name))
}

const CLI = path.resolve(__dirname, '..', 'engine', 'cli', 'ops.js')

// El CLI se corre en un proceso aparte, que es como lo corre quien lo usa. `NODE_TEST_CONTEXT` no
// viaja: un hijo que carga `node:test` con esa variable puesta emite el reporte binario del runner en
// vez de su salida, y `verify` llega a correr el `npm run test` de la instancia que montó la prueba
// —`engine/hooks/run.js`, la rama de `package.json`—.
function run(args, cwd = path.dirname(CLI)) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env })
}

// Este repositorio puesto donde una instancia busca el paquete, que es de donde le llegan el motor y
// el catálogo. Lo que el enlace no prueba —que el tarball lleve todo— lo cubre `lifecycle.test.js`.
function linkEngine(target) {
  const scope = path.join(target, 'node_modules', '@ingeniomaps')
  fs.mkdirSync(scope, { recursive: true })
  fs.symlinkSync(path.resolve(__dirname, '..'), path.join(scope, 'cauce'), 'dir')
}

module.exports = { tempRoot, CLI, run, linkEngine }
