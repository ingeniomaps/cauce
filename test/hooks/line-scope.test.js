'use strict'

// Lo que la sesión de una línea puede escribir dentro de la carpeta de sesión (caso 422): sus árboles y la instancia,
// y nada más de esa carpeta. Cómo se sabe qué línea lleva, y por qué así, en `engine/hooks/line-scope.js`.

const { outsideTempRoot, run } = require('../support/environment')
const { blocked } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execute, executeAll } = require('../../engine/hooks/run')
const LS = require('../../engine/hooks/line-scope')
const CHAT = require('../../engine/hooks/chat')

const ok = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

// La forma de casi toda instancia sidecar: la raíz es la carpeta de sesión, así que para las raíces la línea y la
// principal están las dos adentro. Dos repositorios, y una línea en cada uno. Fuera del temporal, que
// `shell-boundary` exime.
function session(name) {
  const base = fs.realpathSync(outsideTempRoot(name))
  const ops = path.join(base, 'ops')
  assert.equal(run(['init', ops, '--name', 'Lineas', '--mode', 'sidecar', '--no-install']).status, 0)
  ok(ops, 'init', '-q', '-b', 'main')
  for (const repo of ['app', 'shared-lib']) {
    const dir = path.join(base, repo)
    fs.mkdirSync(dir)
    ok(dir, 'init', '-q', '-b', 'main')
    fs.writeFileSync(path.join(dir, 'a.js'), '\n')
    ok(dir, 'add', 'a.js'); ok(dir, 'commit', '-qm', 'init')
  }
  const file = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.writeFileSync(file, JSON.stringify({ ...config, workspaceRoots: [{ name: 'main', path: '..' }] }))
  for (const [line, repo] of [['piloto', 'app'], ['otra', 'shared-lib']]) {
    const made = run(['line', ops, line, repo])
    assert.equal(made.status, 0, made.stderr)
  }
  return { base, ops, tree: path.join(base, 'lines', 'piloto', 'app') }
}

// La raíz, por `OPS_ROOT`, como el shim instalado (el porqué, en `run-hook.sh`).
// Y sin `CI`, que apaga el chat (`present`, chat.js) y deja sin persona a las pruebas que confirman.
function withRoot(ops, body) {
  const saved = { root: process.env.OPS_ROOT, runner: process.env.CAUCE_RUNNER, ci: process.env.CI }
  process.env.OPS_ROOT = ops
  delete process.env.CAUCE_RUNNER
  delete process.env.CI
  try { body() } finally {
    for (const [name, value] of [['OPS_ROOT', saved.root], ['CAUCE_RUNNER', saved.runner], ['CI', saved.ci]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

// Las sesiones de esta prueba se anotan donde el motor anota las reales —la línea y el chat—, así que se borran al
// terminar: si no, cada corrida dejaba sus registros en el temporal del sistema.
const sessions = []
const sessionId = () => {
  sessions.push(`linea-${process.pid}-${Date.now()}-${sessions.length}`)
  return sessions[sessions.length - 1]
}
test.after(() => {
  for (const id of sessions) {
    for (const dir of [LS.DIR, CHAT.DIR]) fs.rmSync(path.join(dir, `${id}.json`), { force: true })
  }
})
const prompt = (id, text, cwd) => executeAll(['prompt'], { session_id: id, cwd, prompt: text })
const write = (id, cwd, file, extra = {}) => ({ session_id: id, cwd, tool_input: { file_path: file }, ...extra })
const shell = (id, cwd, command, extra = {}) => ({ session_id: id, cwd, tool_input: { command }, ...extra })
const STRAYED = /esta sesión lleva la línea piloto/

test('la sesión de una línea escribe en su árbol y en la instancia, y no en el resto de la carpeta de sesión', () => {
  const { base, ops, tree } = session('cauce-line-scope-')
  withRoot(ops, () => {
    const id = sessionId()
    prompt(id, '/autobuild piloto', base)
    const agent = { agent_id: 'build' }
    assert.doesNotThrow(() => execute('workspace-boundary', write(id, base, path.join(tree, 'x.js'), agent)))
    assert.doesNotThrow(() => execute('workspace-boundary',
      write(id, base, path.join(ops, 'planning', 'backlog', 'h.md'), agent)), 'la instancia, donde está el planning')
    // El checkout de la principal del mismo repositorio: el bloqueo nombra dónde va.
    blocked('workspace-boundary', write(id, base, path.join(base, 'app', 'x.js'), agent),
      new RegExp(`app/x\\.js va en el árbol de la línea: ${tree}/x\\.js`))
    // Un repositorio que la línea no trabaja, lo que hay suelto en la carpeta y el árbol de otra línea.
    for (const file of [path.join(base, 'shared-lib', 'a.js'), path.join(base, 'notas.md'),
      path.join(base, 'lines', 'otra', 'shared-lib', 'a.js')]) {
      blocked('workspace-boundary', write(id, base, file, agent), /no es de la línea/)
    }
    // Lo mismo por shell, también lo que se crea o se borra, y desde el árbol como desde la carpeta de sesión.
    assert.doesNotThrow(() => execute('shell-boundary', shell(id, tree, 'echo y > x.js', agent)))
    blocked('shell-boundary', shell(id, tree, 'echo y > ../../../shared-lib/a.js', agent), STRAYED)
    blocked('shell-boundary', shell(id, base, 'rm app/a.js', agent), /app\/a\.js va en el árbol/)
    blocked('shell-boundary', shell(id, base, 'mkdir app/nueva', agent), STRAYED)
    // La sesión principal, que no lleva línea, escribe donde siempre.
    const main = sessionId()
    prompt(main, '/autobuild', base)
    assert.doesNotThrow(() => execute('workspace-boundary', write(main, base, path.join(base, 'app', 'x.js'), agent)))
    assert.doesNotThrow(() => execute('shell-boundary', shell(main, base, 'echo y > shared-lib/a.js', agent)))
  })
})

test('la línea de una sesión sale de lo que ella dice o de CAUCE_RUNNER, y un comando no se la cambia', () => {
  const { base, ops, tree } = session('cauce-line-scope-dicho-')
  withRoot(ops, () => {
    const main = path.join(base, 'app', 'x.js')
    const agent = { agent_id: 'build' }
    // Un `ops claim --line` la anota, y un comando sin línea no la saca: eso lo dice la persona, con `/autobuild` solo.
    const id = sessionId()
    assert.doesNotThrow(() => execute('workspace-boundary', write(id, base, main, agent)), 'sin nada dicho')
    executeAll(['pre-shell'], shell(id, ops, 'node tools/ops.js claim planning t-piloto --line piloto; echo "exit=$?"'))
    blocked('workspace-boundary', write(id, base, main, agent), STRAYED)
    for (const command of ['node tools/ops.js claim planning t-otra', 'node tools/ops.js worktree planning t-otra']) {
      executeAll(['pre-shell'], shell(id, ops, command))
      blocked('workspace-boundary', write(id, base, main, agent), STRAYED, command)
    }
    prompt(id, '/autobuild piloto --max 1', base)
    blocked('workspace-boundary', write(id, base, main, agent), STRAYED)
    prompt(id, '/autobuild', base)
    assert.doesNotThrow(() => execute('workspace-boundary', write(id, base, main, agent)))
    // Un comando no la cambia por otra, y un texto que cita `ops` no es `ops`.
    const other = path.join(base, 'lines', 'otra', 'shared-lib', 'a.js')
    prompt(id, '/autobuild piloto', base)
    executeAll(['pre-shell'], shell(id, ops, 'node tools/ops.js worktree planning t-otra --line otra'))
    blocked('workspace-boundary', write(id, base, other, agent), STRAYED, 'sigue siendo piloto')
    prompt(id, '/autobuild', base)
    executeAll(['pre-shell'], shell(id, ops, "grep -n 'node tools/ops.js claim planning x --line piloto' notas.md"))
    assert.doesNotThrow(() => execute('workspace-boundary', write(id, base, main, agent)), 'citar no es correr')
    // Con lo que `autobuild` no lee como línea, la corrida es la principal, y el guard la lee igual.
    prompt(id, '/autobuild piloto --foo bar', base)
    assert.doesNotThrow(() => execute('workspace-boundary', write(id, base, main, agent)), 'pedido en palabras')
    // Mirar una línea no es llevarla.
    executeAll(['pre-shell'], shell(id, ops, 'node tools/ops.js context planning --line piloto'))
    assert.doesNotThrow(() => execute('workspace-boundary', write(id, base, main, agent)), 'context no la lleva')
    // Y un `--line` que no está declarado no cambia la línea que lleva la sesión: `ops` lo rechaza.
    prompt(id, '/autobuild piloto', base)
    executeAll(['pre-shell'], shell(id, ops, 'node tools/ops.js claim planning t-piloto --line nadie'))
    blocked('workspace-boundary', write(id, base, main, agent), STRAYED)
    // Las otras formas de correr `ops` la anotan igual: el script directo, el `bin` del paquete y `npm run ops --`.
    for (const command of ['./tools/ops.js worktree planning t-piloto --line piloto',
      'npx cauce claim planning t-piloto --line piloto', 'npm run ops -- claim planning t-piloto --line=piloto']) {
      const fresh = sessionId()
      executeAll(['pre-shell'], shell(fresh, ops, command))
      blocked('workspace-boundary', write(fresh, base, main, agent), STRAYED, command)
    }
    // Antigravity manda el id de la sesión con otro nombre, y la línea se anota igual.
    const agy = { sessionId: sessionId(), cwd: ops }
    const claim = 'node tools/ops.js claim planning t-piloto --line piloto'
    executeAll(['pre-shell'], { ...agy, tool_input: { command: claim } })
    blocked('workspace-boundary', { ...agy, cwd: base, tool_input: { file_path: main } }, STRAYED)
    // Sin nada dicho, el id declarado con la línea, también con un espacio de más. Y la carpeta donde está parada no
    // cuenta: la principal que entra a mirar el árbol de una línea no pasa a llevarla.
    process.env.CAUCE_RUNNER = `${ops}#line/piloto \n`
    blocked('workspace-boundary', write(sessionId(), base, main, agent), STRAYED)
    delete process.env.CAUCE_RUNNER
    assert.doesNotThrow(() => execute('workspace-boundary', write(sessionId(), tree, main, agent)), 'en el árbol')
  })
})

test('pasa lo que la persona nombra o confirma en el chat, y un mensaje cualquiera no abre el límite', () => {
  const { base, ops } = session('cauce-line-scope-chat-')
  withRoot(ops, () => {
    const id = sessionId()
    prompt(id, '/autobuild piloto', base)
    const main = path.join(base, 'app', 'a.js')
    prompt(id, 'dale, seguí', base)
    blocked('workspace-boundary', write(id, base, main), /vale para este turno: en el mensaje siguiente vuelve/)
    blocked('workspace-boundary', write(id, base, main, { agent_id: 'build' }), /devolvele/)
    // Confirmar el bloqueo lo deja pasar, también al subagente que lo reintenta.
    prompt(id, 'sí, escribilo ahí', base)
    assert.doesNotThrow(() => execute('workspace-boundary', write(id, base, main, { agent_id: 'build' })))
    // Vale para ese turno, como dice el bloqueo: lo que cambia el checkout de otra sesión se vuelve a preguntar.
    prompt(id, 'ahora seguí con lo tuyo', base)
    blocked('workspace-boundary', write(id, base, main), STRAYED)
    // Y lo que nombra con su ruta pasa sin bloqueo previo.
    const other = path.join(base, 'app', 'b.js')
    prompt(id, `creá ${other} en el checkout de siempre`, base)
    assert.doesNotThrow(() => execute('workspace-boundary', write(id, base, other)))
  })
})

// Caso 423. El porqué, en `gitTargets` y `READS` (`engine/hooks/line-scope.js`).
test('la sesión de una línea no cambia con git el checkout de la principal, y leerlo pasa', () => {
  const { base, ops, tree } = session('cauce-line-scope-git-')
  withRoot(ops, () => {
    const id = sessionId()
    prompt(id, '/autobuild piloto', base)
    const run = (command) => () => execute('shell-boundary', shell(id, tree, command, { agent_id: 'build' }))
    const app = `git -C ${base}/app`
    for (const command of [`${app} switch -c tmp`, `${app} stash`, 'git -C ../../../app restore a.js',
      `cd ${base}/app && git checkout -b otra`, `git --work-tree=${base}/app checkout .`,
      `git -c x=y -C ${base}/app pull`,
      `git -C ${base}/shared-lib stash`, `${app} branch nueva`, `${app} branch --list -D x`, `${app} worktree add ../x`,
      `${app} remote add o u`, `${app} config user.name x`, `${app} tag v1`, `${app} symbolic-ref HEAD refs/heads/x`,
      // La instancia es un solo checkout para las dos sesiones: lo que le cambia la rama o el stash, también.
      `git -C ${ops} switch -c x`, `git -C ${ops} stash`, `cd ${ops} && git reset --hard`]) {
      assert.throws(run(command), (error) => error.blocked && STRAYED.test(error.message), command)
    }
    assert.throws(run(`${app} switch -c tmp`), new RegExp(`${base}/app va en el árbol de la línea: ${tree}`))
    for (const command of [`${app} status`, `${app} log --oneline`, `${app} diff`, `${app} stash list`, `${app} branch`,
      `${app} fetch`, `${app} branch --list tmp`, `${app} branch --show-current`, `${app} branch -vv`,
      `${app} worktree list`, `${app} remote -v`, `${app} config --get user.name`, `${app} tag`, `${app} tag -l 'v*'`,
      `${app} reflog`, `${app} ls-remote`, `${app} symbolic-ref HEAD`, `${app} config user.email`,
      `${app} config --local --get x`, `${app} remote --verbose`, `${app} branch --sort=-committerdate`,
      `${app} branch --format=%(refname)`, 'git switch -c x', 'git stash', `git -C ${ops} add planning/x.md`,
      `git -C ${ops} commit -m x`, `git -C ${ops} stash list`]) {
      assert.doesNotThrow(run(command), command)
    }
    // La sesión principal hace lo de siempre.
    const main = sessionId()
    assert.doesNotThrow(() => execute('shell-boundary', shell(main, base, 'git -C app switch -c tmp')))
  })
})
