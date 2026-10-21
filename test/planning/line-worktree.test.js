'use strict'

// `ops worktree` en una línea de trabajo (casos 394, 421, 422 y 426): la tarea se construye en el árbol de la línea,
// una línea vacía recibe el repositorio de su primera tarea, y sólo con una tarea suya. Y mientras no tiene ninguno,
// `ops lines` la muestra igual, con su cola.

const { tempRoot, run, discard } = require('../support/environment')
const { montar, git } = require('../support/worktree-bench')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Un hito de la línea, con una tarea en el mismo servicio que la de la principal.
function lineMilestone(planning, line) {
  fs.writeFileSync(path.join(planning, 'backlog', 'hl.md'), `---\norder: 10\nline: ${line}\n---\n\n`
    + `## Hito hl — De la línea\n\n- [ ] **cobro** [lite] — Cobrar. _Aceptación: cobra._ (service: api)\n`)
}

// Caso 394. En una línea declarada la tarea se construye en el árbol de la línea, que ya existe: no se arma
// otro por tarea, y lo que se entrega dice que es de la línea para que se commitee ahí sin retirarlo.
test('con --line entrega el árbol de la línea, con dónde trabajar adentro', () => {
  const { base, repo, planning } = montar('cauce-wt-linea-')
  const ops = path.dirname(planning)
  git(ops, 'init', '-q', '-b', 'main')
  const made = run(['line', ops, 'pagos', 'producto'])
  assert.equal(made.status, 0, made.stderr)
  lineMilestone(planning, 'pagos')
  const tree = path.join(fs.realpathSync(base), 'lines', 'pagos', 'producto')
  const asked = run(['worktree', planning, 'cobro', '--line', 'pagos', '--json'])
  assert.equal(asked.status, 0, asked.stderr)
  const report = JSON.parse(asked.stdout)
  assert.deepEqual([report.path, report.work, report.branch, report.line, report.reused],
    [tree, path.join(tree, 'api'), 'line/pagos', 'pagos', true])
  assert.equal(report.repo, fs.realpathSync(repo))
  assert.equal(fs.existsSync(path.join(base, 'producto-cobro')), false, 'armó un árbol por tarea')
  assert.equal(git(repo, 'rev-parse', '--verify', '--quiet', 'refs/heads/task/cobro').status, 1)

  // Sin el árbol se vuelve a armar (caso 421), y lo que `ops line` se niega a armar se niega igual.
  discard(tree)
  const again = run(['worktree', planning, 'cobro', '--line', 'pagos', '--json'])
  assert.equal(again.status, 0, again.stderr)
  assert.deepEqual([JSON.parse(again.stdout).reused, fs.existsSync(path.join(tree, 'api'))], [false, true])
  const config = JSON.parse(fs.readFileSync(path.join(ops, 'ops.config.json'), 'utf8'))
  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({ ...config, lines: { pagos: ['otro'] } }))
  const bad = run(['worktree', planning, 'cobro', '--line', 'pagos'])
  assert.match(bad.stderr, /armar la línea pagos para api, que vive en .*producto: otro no es la raíz de un repo/)
  assert.equal(bad.status, 2, 'con el código de uso que da ops line')
})

// Caso 421. El porqué, en `lineWork` y en `assemble` (`engine/cli/lines.js`).
test('una línea vacía no arma nada, y la primera tarea que pide su árbol le suma el repositorio', () => {
  const { base, repo, planning } = montar('cauce-wt-linea-vacia-')
  const ops = path.dirname(planning)
  git(ops, 'init', '-q', '-b', 'main')
  const made = run(['line', ops, 'piloto'])
  assert.equal(made.status, 0, made.stderr)
  assert.match(made.stdout, /todavía no trabaja ningún repositorio: el árbol de cada uno se arma cuando una tarea/)
  const declared = () => JSON.parse(fs.readFileSync(path.join(ops, 'ops.config.json'), 'utf8')).lines
  assert.deepEqual(declared(), { piloto: [] })
  assert.equal(fs.existsSync(path.join(base, 'lines')), false, 'una línea vacía no deja nada en disco')
  // El banco de este archivo no pasa `check` entero —le falta lo que `init` arma—: lo que se mira es la línea.
  assert.doesNotMatch(run(['check', planning]).stderr, /lines/, 'y check la acepta')

  // Una tarea que no es de la línea no le suma su repositorio: ensancharía dónde escribe la sesión (caso 422).
  const foreign = run(['worktree', planning, 'alta', '--line', 'piloto'])
  assert.match(foreign.stderr, /alta no es de ninguna línea: se toma sin --line/)
  assert.deepEqual(declared(), { piloto: [] })
  lineMilestone(planning, 'piloto')
  // Caso 426: el panorama, antes de que tenga repositorios.
  const panorama = () => JSON.parse(run(['lines', ops, '--json']).stdout).declared
    .find((one) => one.name === 'piloto')
  assert.deepEqual([panorama().repos, panorama().milestones], [[], [{ slug: 'hl', tasks: 1 }]])
  const empty = /\npiloto {2}\(línea declarada\)\n {2}la línea piloto todavía no trabaja ningún repositorio: .*\n/
  assert.match(run(['lines', ops]).stdout, new RegExp(`${empty.source} {2}cola: hl \\(1\\)`))
  // Y la principal no le arma un árbol por tarea a una tarea de la línea, como `claim` no se la deja tomar.
  assert.match(run(['worktree', planning, 'cobro']).stderr, /cobro es de la línea piloto: se toma con --line piloto/)
  assert.equal(run(['line', ops, 'otra', 'producto']).status, 0)
  const tree = path.join(fs.realpathSync(base), 'lines', 'piloto', 'producto')
  const asked = run(['worktree', planning, 'cobro', '--line', 'piloto'])
  assert.equal(asked.status, 0, asked.stderr)
  assert.match(asked.stdout, /⚠ producto también es de la línea otra/, 'lo que ops line avisaría al armarlo')
  assert.match(asked.stdout, /producto se sumó a la línea piloto: ops\.config\.json la declara con él/)
  assert.deepEqual(declared(), { piloto: ['producto'], otra: ['producto'] })
  assert.deepEqual(panorama().repos.map((one) => one.repo), ['producto'],
    'y con el repositorio, su árbol')
  assert.equal(git(tree, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), 'line/piloto')
  const reused = JSON.parse(run(['worktree', planning, 'cobro', '--line', 'piloto', '--json']).stdout)
  assert.deepEqual([reused.path, reused.reused, reused.joined], [tree, true, false])
  assert.equal(reused.repo, fs.realpathSync(repo))
})

// El porqué, en `seenFrom` (`engine/cli/worktree.js`).
test('la línea suma por su nombre un repositorio que la carpeta de sesión alcanza por un enlace', () => {
  const { base, repo, planning } = montar('cauce-wt-linea-enlace-')
  const far = path.join(tempRoot('cauce-wt-afuera-'), 'producto')
  fs.renameSync(repo, far)
  fs.symlinkSync(far, repo, 'dir')
  const ops = path.dirname(planning)
  git(ops, 'init', '-q', '-b', 'main')
  assert.equal(run(['line', ops, 'piloto']).status, 0)
  lineMilestone(planning, 'piloto')
  const asked = run(['worktree', planning, 'cobro', '--line', 'piloto'])
  assert.equal(asked.status, 0, asked.stderr)
  const config = JSON.parse(fs.readFileSync(path.join(ops, 'ops.config.json'), 'utf8'))
  assert.deepEqual(config.lines, { piloto: ['producto'] })
  assert.ok(fs.existsSync(path.join(base, 'lines', 'piloto', 'producto', 'api', 'main.go')))
})

// Fuera de sidecar no hay carpeta de sesión de la que nombrar el repositorio: se niega con el motivo de `ops line`, y
// no con un error sin atrapar.
test('una línea declarada fuera de sidecar se niega con su motivo al pedir su árbol', () => {
  const { planning } = montar('cauce-wt-linea-embebida-')
  const ops = path.dirname(planning)
  git(ops, 'init', '-q', '-b', 'main')
  const file = path.join(ops, 'ops.config.json')
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), mode: 'embedded',
    lines: { piloto: [] } }))
  lineMilestone(planning, 'piloto')
  const asked = run(['worktree', planning, 'cobro', '--line', 'piloto'])
  assert.equal(asked.status, 1, asked.stderr)
  assert.match(asked.stderr, /una línea de trabajo necesita una instancia sidecar/)
  // Y el panorama no la ofrece como una línea a la que se le puede sumar un repositorio (caso 426).
  const shown = run(['lines', ops, '--json'])
  assert.equal(shown.status, 0, shown.stderr)
  assert.equal(JSON.parse(shown.stdout).declared, undefined)
})
