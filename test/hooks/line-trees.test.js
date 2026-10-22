'use strict'

// Lo que los guards saben de una línea declarada (caso 394): que su árbol es del proyecto aunque la raíz sea un
// repositorio y no la carpeta de sesión que lo contiene, y que el plan de la sesión que la lleva está bajo el id
// de la instancia con su línea. Los dos se deciden por la ruta de lo que se escribe; el porqué, en `lineAt`
// (`engine/hooks/files.js`).

const { tempRoot, run } = require('../support/environment')
const { blocked, BACKLOG_WITH_TASK } = require('../support/hooks-harness')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execute, executeAll } = require('../../engine/hooks/run')
const { wipName } = require('../../engine/planning/parser')
const CHAT = require('../../engine/hooks/chat')
const LS = require('../../engine/hooks/line-scope')

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

// Caso 411: el id de la línea es el mismo desde cualquier carpeta, y es el que `plan-first` busca. El porqué, en el
// comentario de `runner` en `engine/planning/claims.js`.
test('el id de una línea no depende de la carpeta desde donde se corre ops', () => {
  const { base, ops, tree } = session('cauce-hook-linea-id-')
  const previous = process.env.CAUCE_RUNNER
  delete process.env.CAUCE_RUNNER
  try {
    const planning = path.join(ops, 'planning')
    fs.writeFileSync(path.join(planning, 'backlog', 'hp.md'), '---\norder: 10\nline: pagos\n---\n\n'
      + '## Hito hp — Pagos\n\n- [ ] **t-pagos** — Cobrar. _Aceptación: se cobra._ (service: pagos)\n')
    // El reclamo pide un dueño, y en CI no hay `git config user.email` del que sacarlo.
    const unset = { CAUCE_RUNNER: '', CAUCE_OWNER: 'prueba@ejemplo' }
    const claimed = run(['claim', planning, 't-pagos', '--line', 'pagos'], base, unset)
    assert.equal(claimed.status, 0, claimed.stderr)
    const expected = wipName(`${fs.realpathSync(ops)}#line/pagos`)
    for (const cwd of [base, tree, ops]) {
      const seen = run(['context', planning, '--line', 'pagos', '--json'], cwd, unset)
      assert.equal(seen.status, 0, seen.stderr)
      assert.equal(JSON.parse(seen.stdout).wipFile, `wip/${expected}.md`, cwd)
    }
    fs.writeFileSync(path.join(planning, 'wip', `${expected}.md`),
      '---\ntask: t-pagos\nphase: Build\n---\n\n## Plan aprobado\n1. [ ] Cobrar\n')
    // El guard, desde la carpeta de sesión —donde se abre la sesión— y desde el árbol, ve el plan de la línea. La raíz
    // se la da `OPS_ROOT`, como el shim instalado (el porqué, en `run-hook.sh`).
    const root = process.env.OPS_ROOT
    process.env.OPS_ROOT = ops
    try {
      for (const cwd of [base, tree]) {
        assert.doesNotThrow(() => execute('plan-first', { ...writing(ops, path.join(tree, 'a.js')), cwd }), cwd)
      }
      blocked('plan-first', { ...writing(ops, path.join(tree, 'a.js')), cwd: base, tool_input: {
        file_path: path.join(base, 'pagos', 'a.js') } }, /sin plan/)
    } finally {
      if (root === undefined) delete process.env.OPS_ROOT
      else process.env.OPS_ROOT = root
    }
    const released = run(['release', planning, 't-pagos', '--line', 'pagos'], tree, unset)
    assert.equal(released.status, 0, released.stderr)
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
    const foreign = fs.realpathSync(tempRoot('cauce-hook-linea-ajeno-'))
    assert.doesNotThrow(() => execute('git-add', { cwd: foreign, tool_input: { command: `git add ${all}` } }))
  } finally {
    if (root === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = root
  }
})

// Caso 429: un proyecto que fija `CAUCE_RUNNER` para todas sus sesiones no le quita a la de una línea su id. El
// porqué, en el comentario de `runner` en `engine/planning/claims.js`.
test('con CAUCE_RUNNER fijado para el proyecto, la sesión de una línea tiene su WIP, sus reclamos y su plan', () => {
  const { base, ops, repo, tree } = session('cauce-hook-linea-fijada-')
  const planning = path.join(ops, 'planning')
  fs.writeFileSync(path.join(planning, 'backlog', 'hp.md'), '---\norder: 10\nline: pagos\n---\n\n'
    + '## Hito hp — Pagos\n\n- [ ] **t-pagos** — Cobrar. _Aceptación: se cobra._ (service: pagos)\n')
  const fixed = { CAUCE_RUNNER: 'acme', CAUCE_OWNER: 'prueba@ejemplo' }
  const own = wipName('acme#line/pagos')
  const env = { CAUCE_RUNNER: process.env.CAUCE_RUNNER, OPS_ROOT: process.env.OPS_ROOT, CI: process.env.CI }
  const id = `linea-fijada-${process.pid}`
  Object.assign(process.env, { CAUCE_RUNNER: 'acme', OPS_ROOT: ops })
  delete process.env.CI
  try {
    // La principal toma lo suyo con el id del proyecto, y la línea no lo recibe como propio.
    assert.equal(run(['claim', planning, 'alta-de-cliente'], base, fixed).status, 0)
    const seen = JSON.parse(run(['context', planning, '--line', 'pagos', '--json'], base, fixed).stdout)
    assert.equal(seen.wipFile, `wip/${own}.md`)
    assert.equal(seen.task && seen.task.slug, 't-pagos', 'la tarea de la principal no es de la línea')
    assert.equal(seen.claimed, false)
    // Un id que ya trae la línea, como el que se exporta desde la sesión de la línea, no se marca dos veces.
    const marked = run(['context', planning, '--line', 'pagos', '--json'], base,
      { ...fixed, CAUCE_RUNNER: 'acme#line/pagos' })
    assert.equal(JSON.parse(marked.stdout).wipFile, `wip/${own}.md`)
    // Y uno que trae otra línea no se usa para ésta: se dice.
    const other = run(['context', planning, '--line', 'pagos', '--json'], base,
      { ...fixed, CAUCE_RUNNER: 'acme#line/admin' })
    assert.equal(other.status, 2)
    assert.match(other.stderr, /CAUCE_RUNNER=acme#line\/admin es el id de la línea admin, y pediste --line pagos/)
    assert.match(other.stderr, /export CAUCE_RUNNER=acme#line\/pagos$/m, 'con el id de la línea pedida ya hecho')
    // Sin --line, un id marcado es la sesión de esa línea, como lo lee line-scope: no la principal con el id de otra.
    const bare = JSON.parse(run(['context', planning, '--json'], base, { ...fixed, CAUCE_RUNNER: 'acme#line/pagos' })
      .stdout)
    assert.deepEqual([bare.line, bare.wipFile], ['pagos', `wip/${own}.md`])
    const claimed = run(['claim', planning, 't-pagos', '--line', 'pagos'], base, fixed)
    assert.equal(claimed.status, 0, claimed.stderr)
    assert.match(fs.readFileSync(path.join(planning, 'claims', 't-pagos.md'), 'utf8'), /^runner: acme#line\/pagos$/m)

    // La sesión dice su línea con el `claim` que corre, como en una sesión real. El plan de la principal no le sirve,
    // y el suyo sí.
    executeAll(['pre-shell'], { session_id: id, cwd: ops,
      tool_input: { command: 'node tools/ops.js claim planning t-pagos --line pagos' } })
    fs.writeFileSync(path.join(planning, 'wip', `${wipName('acme')}.md`),
      '---\ntask: alta-de-cliente\nphase: Build\n---\n\n## Plan aprobado\n1. [ ] Montar el alta\n')
    const edit = { session_id: id, cwd: base, tool_input: { file_path: path.join(tree, 'a.js') } }
    blocked('plan-first', edit, /sin plan/)
    fs.writeFileSync(path.join(planning, 'wip', `${own}.md`),
      '---\ntask: t-pagos\nphase: Build\n---\n\n## Plan aprobado\n1. [ ] Cobrar\n')
    assert.doesNotThrow(() => execute('plan-first', edit), 'la línea tiene su plan escrito')
    // La principal, que no dijo ninguna línea, sigue con el suyo.
    assert.doesNotThrow(() => execute('plan-first', { cwd: base, tool_input: { file_path: path.join(repo, 'a.js') } }))

    // Lo que la persona concede mientras dure la tarea de la línea vence con el WIP de la línea, no con el de la
    // principal.
    const granted = (n, prompt) => {
      const input = { session_id: id, prompt_id: `m${n}`, cwd: ops }
      execute('chat', { ...input, prompt })
      return CHAT.unauthorized(input, ['notas.md'])
    }
    assert.deepEqual(granted(1, 'escribí notas.md mientras dure la tarea t-pagos'), [])
    assert.deepEqual(granted(2, 'seguí'), [], 'la tarea de la línea sigue en su WIP')
    fs.writeFileSync(path.join(planning, 'wip', `${own}.md`), 'status: IDLE\n')
    assert.deepEqual(granted(3, 'seguí'), ['notas.md'], 'cerrada en la línea, la concesión se terminó')
  } finally {
    for (const dir of [LS.DIR, CHAT.DIR]) fs.rmSync(path.join(dir, `${id}.json`), { force: true })
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})

// Que un id lleva línea lo dice un solo parser: `runner()` le agrega la pedida sólo cuando `lineOfRunner` no ve
// ninguna. Con dos, una marca vacía se leía como línea para uno y como principal para el otro (revisión del caso 429).
test('runner y lineOfRunner contestan lo mismo sobre si un id ya lleva línea', () => {
  const { runner } = require('../../engine/planning/claims')
  const { lineOfRunner, runnerOf } = require('../../engine/core/line-trees')
  const previous = process.env.CAUCE_RUNNER
  try {
    for (const id of ['acme', 'acme#line/admin', 'acme#line/']) {
      process.env.CAUCE_RUNNER = id
      assert.equal(runner('pagos'), lineOfRunner(id) ? id : runnerOf(id, 'pagos'), id)
    }
  } finally {
    if (previous === undefined) delete process.env.CAUCE_RUNNER
    else process.env.CAUCE_RUNNER = previous
  }
})

// Lo que quedó de antes del 429 —un reclamo y un plan de la línea hechos con el id sin marca— no se retoma exportando
// ese id, porque `runner()` le vuelve a agregar la línea: `context` dice la migración que sí se corre. Y una línea que
// ya no está declarada, si la trae la variable y no `--line`, se dice desde la variable.
test('el plan de una línea con el id de antes se migra, y una línea retirada en la variable se nombra', () => {
  const { base, ops } = session('cauce-linea-migrar-')
  const planning = path.join(ops, 'planning')
  fs.writeFileSync(path.join(planning, 'backlog', 'hp.md'), '---\norder: 10\nline: pagos\n---\n\n'
    + '## Hito hp — Pagos\n\n- [ ] **t-pagos** — Cobrar. _Aceptación: se cobra._ (service: pagos)\n')
  const fixed = { CAUCE_RUNNER: 'acme', CAUCE_OWNER: 'prueba@ejemplo' }
  fs.writeFileSync(path.join(planning, 'claims', 't-pagos.md'),
    '---\ntask: t-pagos\nowner: prueba@ejemplo\nrunner: viejo\nstarted: 2026-10-01\n---\n')
  fs.writeFileSync(path.join(planning, 'wip', `${wipName('viejo')}.md`),
    '---\ntask: t-pagos\nphase: Build\n---\n\n## Plan aprobado\n1. [ ] Cobrar\n')
  const seen = run(['context', planning, '--line', 'pagos'], base, fixed)
  assert.doesNotMatch(seen.stdout, /retomalo con/, seen.stdout)
  assert.match(seen.stdout,
    /^PLAN {3}t-pagos: su plan está en wip\/viejo\.md, de antes de que el id llevara la línea: /m)
  assert.match(seen.stdout, /CAUCE_RUNNER=viejo node tools\/ops\.js release \S+ t-pagos/)
  // Al WIP que esta sesión va a leer al retomarla, que es el de su id y no el del reclamo viejo con la línea.
  // Con las rutas relativas a donde se corrió, que es `base`.
  assert.ok(seen.stdout.includes(`\`mv ops/planning/wip/viejo.md ops/planning/wip/${wipName('acme#line/pagos')}.md\``),
    seen.stdout)

  const retired = run(['context', planning, '--json'], base, { ...fixed, CAUCE_RUNNER: 'acme#line/retirada' })
  assert.notEqual(retired.status, 0)
  assert.match(retired.stderr, /CAUCE_RUNNER=acme#line\/retirada trae la línea retirada, que no está declarada/)
})
