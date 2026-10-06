'use strict'

// Borrar una prueba por shell (caso 294): lo que `test-evidence` frena con una herramienta de archivo se
// frena también con `rm`, y sólo eso —ni una copia desechable, ni la prueba que todavía no se commiteó—.

const { tempRoot } = require('../support/environment')
const { blocked, git, initRepo, chatSession, messageOf, pasteApproval } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute, executeAll } = require('../../engine/hooks/run')

const BORRA = /borra .*que es una prueba/

// Una instancia con su producto en una raíz declarada: dos pruebas commiteadas y un fuente.
function project(prefix) {
  const root = tempRoot(prefix)
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'app', path: 'app' }] }))
  const app = path.join(root, 'app')
  for (const file of ['src/suma.js', 'test/suma.test.js', 'test/legado.test.js', 'src/resta_test.go']) {
    fs.mkdirSync(path.dirname(path.join(app, file)), { recursive: true })
    fs.writeFileSync(path.join(app, file), 'x\n')
  }
  initRepo(app)
  git(['add', 'src/suma.js', 'test/suma.test.js', 'test/legado.test.js', 'src/resta_test.go'], app)
  git(['commit', '-qm', 'base'], app)
  return { root, app, run: (command, cwd = root) => ({ cwd, tool_input: { command } }) }
}

test('borrar por shell una prueba commiteada se frena, como sea que se la borre', () => {
  const { root, app, run } = project('cauce-borra-prueba-')
  for (const command of [
    'rm app/test/legado.test.js', 'rm -f app/test/legado.test.js', 'git -C app rm test/legado.test.js',
    'cd app && git rm -q test/legado.test.js', `rm ${app}/test/legado.test.js`, 'unlink app/test/legado.test.js',
    'rm app/src/suma.js app/test/legado.test.js', 'npm test; rm app/src/resta_test.go', 'sudo rm app/test/suma.test.js',
    // La carpeta entera, que es la forma más corta de quedarse sin pruebas.
    // Detrás de un commit en el mismo renglón también: el mensaje es dato, el `rm` que sigue no.
    'git -C app commit -m "chore: x" && rm app/test/legado.test.js',
    // Con comodín: una sola palabra que borra todas.
    'rm app/test/*.test.js', 'rm app/test/leg?do.test.js', 'git -C app rm test/*.js',
    'rm -rf app/test', 'git -C app rm -r test', `D=${app}; cd "$D" && rm test/legado.test.js`,
    // El comando real que la borró con la primera versión del guard: la ruta en una variable asignada ahí.
    `W=${root}; cd $W; F="$W/app/test/legado.test.js"; echo "borrando"; rm -- "$F"; echo "rm exit $?"`,
    `T=app/test; rm $T/legado.test.js`, 'F=app/test/legado.test.js && git rm -q "${F}"',
  ]) blocked('test-evidence-shell', run(command), BORRA)
  blocked('test-evidence-shell', run('rm test/legado.test.js', app), BORRA)
  assert.throws(() => executeAll(['pre-shell'], run('rm app/test/legado.test.js')), BORRA)
  assert.ok(fs.existsSync(path.join(root, 'app', 'test', 'legado.test.js')), 'el guard no ejecuta nada')
})

test('lo que no es borrar una prueba del proyecto pasa', () => {
  const { root, app, run } = project('cauce-borra-pasa-')
  const copy = tempRoot('cauce-borra-copia-')
  fs.mkdirSync(path.join(copy, 'test'))
  fs.writeFileSync(path.join(copy, 'test', 'legado.test.js'), 'x\n')
  fs.writeFileSync(path.join(app, 'test', 'nueva.test.js'), 'x\n')
  fs.writeFileSync(path.join(app, 'test', 'salida.tmp'), 'x\n')
  git(['add', 'test/nueva.test.js'], app)
  for (const command of [
    'rm app/src/suma.js', 'ls app/test', 'cat app/test/legado.test.js', 'git -C app status',
    'git -C app mv test/legado.test.js test/viejo.test.js', 'grep -rn "rm test/legado.test.js" app',
    'git -C app commit -m "test: rm test/legado.test.js ya no hace falta"',
    // Una copia desechable es donde se corre una mutación.
    `rm ${copy}/test/legado.test.js`, `rm -rf ${copy}/test`, `cd ${copy} && rm test/legado.test.js`,
    // La que se escribió en esta tarea y todavía no se commiteó.
    'rm app/test/nueva.test.js', 'git -C app rm --cached test/nueva.test.js',
    // Lo que el guard no puede resolver no lo adivina.
    'rm "$ALGO/test/legado.test.js"', 'rm app/test/$(echo legado).test.js',
    // Entre comillas simples el shell tampoco la expande: ese archivo no existe.
    "F=app/test/legado.test.js; rm '$F'",
    // Un comodín que no alcanza a ninguna prueba commiteada.
    'rm app/test/*.tmp', 'rm app/test/nuev*.js', 'rm app/no-existe/*.test.js',
  ]) assert.doesNotThrow(() => execute('test-evidence-shell', run(command)), command)
  assert.doesNotThrow(() => execute('test-evidence-shell', { cwd: copy, tool_input: { command: 'rm test/x.test.js' } }),
    'fuera de una instancia no opina')

  // Con el proyecto bajo una carpeta que se llama `tests`, un fuente suyo sigue sin ser una prueba.
  const nested = project(path.join('cauce-borra-anidado-', 'tests').replace(path.sep, ''))
  const under = path.join(tempRoot('cauce-borra-bajo-'), 'tests', 'proyecto')
  fs.mkdirSync(path.dirname(under), { recursive: true })
  fs.renameSync(nested.root, under)
  const at = (command) => ({ cwd: under, tool_input: { command } })
  assert.doesNotThrow(() => execute('test-evidence-shell', at('rm app/src/suma.js')), 'un fuente')
  blocked('test-evidence-shell', at('rm app/test/legado.test.js'), BORRA)
  assert.ok(root)
})

test('se aprueba como el resto: la línea en .ops-approval, lo que la persona nombra y la variable', () => {
  const { root, run } = project('cauce-borra-salida-')
  const call = run('rm app/test/legado.test.js')
  const chat = chatSession()
  try {
    blocked('test-evidence-shell', chat.says('dejá la suite en verde')(call), BORRA)
    assert.doesNotThrow(() => execute('test-evidence-shell', chat.says('borrá app/test/legado.test.js')(call)))
  } finally { chat.close() }
  assert.match(messageOf('test-evidence-shell', call), /OPS_TEST_EVIDENCE_OVERRIDE/)
  pasteApproval(root, messageOf('test-evidence-shell', call))
  assert.doesNotThrow(() => execute('test-evidence-shell', call))

  const other = run('rm app/test/suma.test.js')
  blocked('test-evidence-shell', other, BORRA)
  process.env.OPS_TEST_EVIDENCE_OVERRIDE = '1'
  try { assert.doesNotThrow(() => execute('test-evidence-shell', other)) } finally {
    delete process.env.OPS_TEST_EVIDENCE_OVERRIDE
  }
})
