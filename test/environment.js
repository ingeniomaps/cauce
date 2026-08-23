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

// Los workflows de GitHub Actions, leídos para poder **ejecutar** lo que declaran. Un paso que se
// afirma citando su texto vuelve a pasar con otra redacción igual de rota: lo que hay que fijar es
// qué hace el comando contra un repositorio de verdad.
const WORKFLOWS = path.resolve(__dirname, '..', '.github', 'workflows')

function workflow(name) {
  return fs.readFileSync(path.join(WORKFLOWS, `${name}.yml`), 'utf8')
}

// El cuerpo de un paso `run: |`. El ancla es la línea que lo identifica —`id: changes`,
// `name: Open research pull request`—; con un `id` repetido entre jobs gana el primero, y son el
// mismo texto, así que probar uno prueba a los dos.
function workflowStep(source, anchor) {
  const start = source.indexOf(anchor)
  if (start < 0) return ''
  const lines = source.slice(source.indexOf('run: |', start)).split('\n').slice(1)
  const body = []
  for (const line of lines) {
    if (line.trim() && !line.startsWith(' '.repeat(10))) break
    body.push(line.slice(10))
  }
  return body.join('\n')
}

// Una línea suelta de un paso: la que resuelve una ruta o arma una variable, con su asignación.
function workflowCommand(source, name) {
  const found = source.match(new RegExp('^\\s*' + name + '="[$][(].*[)]"$', 'm'))
  if (!found) throw new Error(`el workflow no tiene el comando que resuelve ${name}`)
  return found[0]
}

// Recorrer un árbol entero es lo que hace falta para preguntarle a una instancia qué quedó escrito, y
// lo preguntan dos suites distintas. Vive acá porque copiado se pudre una de las dos copias y nada falla.
function filesBelow(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const current = path.join(root, entry.name)
    return entry.isDirectory() ? filesBelow(current) : [current]
  })
}

// Un `ops.config.json` que pasa el validador, para que cada caso escriba encima sólo el campo que mide.
// Es una fábrica y no una constante: dos suites lo usan y una lo muta, así que compartir el objeto haría
// que el orden de las pruebas cambiara lo que la otra ve.
function opsConfig() {
  return {
    $schema: '.ops/engine/schemas/ops-config.schema.json',
    project: 'Demo',
    mode: 'embedded',
    workspaceRoots: [{ name: 'main', path: '.' }],
    runner: {
      maxTaskHours: 4,
      humanCheckpointBetweenMilestones: true,
      commitPerTask: true,
      allowPush: false,
    },
  }
}

module.exports = { opsConfig, filesBelow, tempRoot, CLI, run, linkEngine, workflow, workflowStep, workflowCommand }
