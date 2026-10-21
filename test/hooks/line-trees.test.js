'use strict'

// Lo que los guards saben de una línea declarada (caso 394): que su árbol es del proyecto aunque la raíz sea un
// repositorio y no la carpeta de sesión que lo contiene, y que el plan de la sesión que la lleva está bajo el id
// de la instancia con su línea. Los dos se deciden por la ruta de lo que se escribe, que es lo único que el
// guard ve: el `--line` lo recibe `ops`, no la sesión.

const { tempRoot, run } = require('../support/environment')
const { blocked, BACKLOG_WITH_TASK } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execute } = require('../../engine/hooks/run')
const { wipName } = require('../../engine/planning/parser')

const ok = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

// La carpeta de sesión con la instancia y un repositorio declarado como raíz propia —la forma en que la carpeta
// de sesión no es una raíz—, una tarea en la cola y la línea `pagos` armada sobre ese repositorio.
function session(name) {
  const base = fs.realpathSync(tempRoot(name))
  const ops = path.join(base, 'ops')
  assert.equal(run(['init', ops, '--name', 'Lineas', '--mode', 'sidecar', '--no-install']).status, 0)
  ok(ops, 'init', '-q', '-b', 'main')
  const repo = path.join(base, 'pagos')
  fs.mkdirSync(repo)
  ok(repo, 'init', '-q', '-b', 'main')
  fs.writeFileSync(path.join(repo, 'a.js'), '\n')
  ok(repo, 'add', 'a.js'); ok(repo, 'commit', '-qm', 'init')
  const file = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  fs.writeFileSync(file, JSON.stringify({ ...config, workspaceRoots: [{ name: 'pagos', path: '../pagos' }] }))
  fs.writeFileSync(path.join(ops, 'planning', 'BACKLOG.md'), BACKLOG_WITH_TASK)
  const made = run(['line', ops, 'pagos', 'pagos'])
  assert.equal(made.status, 0, made.stderr)
  return { base, ops, repo, tree: path.join(base, 'lines', 'pagos', 'pagos') }
}

const writing = (cwd, file) => ({ cwd, tool_input: { file_path: file } })

test('el árbol de una línea declarada se puede escribir aunque la raíz sea el repositorio', () => {
  const { base, ops, tree } = session('cauce-hook-linea-')
  assert.doesNotThrow(() => execute('workspace-boundary', writing(ops, path.join(tree, 'a.js'))))
  // Lo que se abre es el árbol, no la carpeta de la línea.
  blocked('workspace-boundary', writing(ops, path.join(base, 'lines', 'pagos', 'nota.md')), /fuera de las raíces/)
  // Y sin la declaración el árbol no es de nadie, aunque siga en disco y registrado en git.
  const file = path.join(ops, 'ops.config.json')
  const config = JSON.parse(fs.readFileSync(file, 'utf8'))
  delete config.lines
  fs.writeFileSync(file, JSON.stringify(config))
  blocked('workspace-boundary', writing(ops, path.join(tree, 'a.js')), /fuera de las raíces/)
})

test('plan-first encuentra el plan de la sesión que lleva la línea por la ruta de lo que escribe', () => {
  const { ops, repo, tree } = session('cauce-hook-linea-plan-')
  const previous = process.env.CAUCE_RUNNER
  delete process.env.CAUCE_RUNNER
  try {
    blocked('plan-first', writing(ops, path.join(tree, 'a.js')), /sin plan/)
    fs.writeFileSync(path.join(ops, 'planning', 'wip', `${wipName(`${fs.realpathSync(ops)}#line/pagos`)}.md`),
      '---\ntask: alta-de-cliente\nphase: Build\n---\n\n## Plan aprobado\n1. [ ] Montar el alta\n')
    assert.doesNotThrow(() => execute('plan-first', writing(ops, path.join(tree, 'a.js'))),
      'la línea tiene su plan escrito')
    // El plan de la línea no le sirve al checkout principal, que es de la sesión principal.
    blocked('plan-first', writing(ops, path.join(repo, 'a.js')), /sin plan/)
    // Con un id declarado se respeta el declarado, como en todo lo demás.
    process.env.CAUCE_RUNNER = '/w/otro-agente'
    blocked('plan-first', writing(ops, path.join(tree, 'a.js')), /sin plan/)
  } finally {
    if (previous === undefined) delete process.env.CAUCE_RUNNER
    else process.env.CAUCE_RUNNER = previous
  }
})

// Caso 414: los guards de commit juzgan el árbol de una línea declarada, y no un repositorio ajeno. El porqué, en
// `owns`.
test('los guards de commit juzgan el árbol de una línea declarada', () => {
  const { base, ops, tree } = session('cauce-hook-linea-commit-')
  const root = process.env.OPS_ROOT
  process.env.OPS_ROOT = ops
  const all = `-${'A'}`
  try {
    for (const [cwd, command] of [[base, `git -C ${tree} add ${all}`], [tree, `git add ${all}`],
      [tree, 'git add --all']]) {
      blocked('git-add', { cwd, tool_input: { command } }, /está prohibido/)
    }
    // Lo que no es de ninguna línea ni raíz sigue afuera, como pide R26.
    const ajeno = fs.realpathSync(tempRoot('cauce-hook-linea-ajeno-'))
    assert.doesNotThrow(() => execute('git-add', { cwd: ajeno, tool_input: { command: `git add ${all}` } }))
  } finally {
    if (root === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = root
  }
})
