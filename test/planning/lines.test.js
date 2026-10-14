'use strict'

// Dos líneas de trabajo sobre la misma instancia (caso 239). Lo que se mide: que cada árbol vea sólo los hitos
// de su línea —la de su rama `line/<nombre>`— y el principal sólo los que no son de ninguna; que `claim` conteste
// lo mismo que `context`; que lo que ya tenés no se esconda; que un reclamo hecho en otro worktree se vea y frene;
// y que `check` rechace una línea mal escrita.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const LN = require('../../engine/planning/lines')

const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}
const hito = (slug, task, line) => `---\norder: 10\n${line ? `line: ${line}\n` : ''}---\n\n`
  + `## Hito ${slug} — ${slug}\n\n- [ ] **${task}** — Algo. _Aceptación: se ve._ (service: app)\n`

// Una instancia con un hito sin línea y uno de `admin`, y dos árboles más: la línea y una rama cualquiera.
function instance() {
  const base = tempRoot('cauce-lineas-')
  const ops = path.join(base, 'demo-ops')
  assert.equal(run(['init', ops, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  fs.mkdirSync(path.join(ops, 'planning', 'backlog'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'planning', 'backlog', 'auth.md'), hito('auth', 'auth-token', ''))
  fs.writeFileSync(path.join(ops, 'planning', 'backlog', 'admin.md'), hito('admin', 'admin-consulta', 'admin'))
  git(ops, 'init', '-q', '-b', 'main')
  // Todo lo que `init` dejó, incluido el `.gitignore` del molde: `wip/` es local, y sin él contaría como cambio
  // sin commitear. Lo que no está en el primer commit cuenta como sucio después, y no es lo que se mide.
  git(ops, 'add', ...fs.readdirSync(ops).filter((name) => name !== 'node_modules'))
  git(ops, 'commit', '-qm', 'base')
  const line = path.join(base, 'demo-ops-admin')
  git(ops, 'worktree', 'add', '-q', '-b', 'line/admin', line)
  const other = path.join(base, 'demo-ops-otra')
  git(ops, 'worktree', 'add', '-q', '-b', 'feat/otra', other)
  return { main: path.join(ops, 'planning'), line: path.join(line, 'planning'), other: path.join(other, 'planning') }
}
const context = (planning, runner, ...args) => {
  const result = run(['context', planning, '--json', ...args], undefined, { CAUCE_RUNNER: runner, CAUCE_OWNER: runner })
  return { ...result, json: result.status === 0 ? JSON.parse(result.stdout) : null }
}
const claim = (planning, runner, slug) => run(['claim', planning, slug], undefined,
  { CAUCE_RUNNER: runner, CAUCE_OWNER: runner })

test('cada árbol ve los hitos de su línea, y context y claim contestan lo mismo', () => {
  const trees = instance()
  const main = context(trees.main, 'r-main').json
  assert.equal(main.task.slug, 'auth-token')
  assert.equal(main.line, '')
  assert.deepEqual(main.otherLines, ['admin'])

  const line = context(trees.line, 'r-line').json
  assert.equal(line.task.slug, 'admin-consulta')
  assert.equal(line.line, 'admin')
  assert.deepEqual(line.otherLines, ['auth'])

  const refused = claim(trees.line, 'r-line', 'auth-token')
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /auth-token no es de ninguna línea: se toma desde el árbol principal/)
  assert.match(claim(trees.main, 'r-main', 'admin-consulta').stderr, /es de la línea admin/)
  assert.match(context(trees.line, 'r-line', '--hito', 'auth').stderr, /el hito auth no es de ninguna línea/)
})

test('un reclamo hecho en otro árbol se ve y frena', () => {
  const trees = instance()
  assert.equal(claim(trees.main, 'r-main', 'auth-token').status, 0)
  const other = context(trees.other, 'r-otra').json
  assert.equal(other.task, null, 'la única tarea de su cola está tomada en otro árbol')
  assert.deepEqual(other.taken.map((one) => one.slug), ['auth-token'])
  const refused = claim(trees.other, 'r-otra', 'auth-token')
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /desde otro árbol de la instancia/)
})

test('lo que ya tenés no se esconde aunque su hito pase a ser de otra línea', () => {
  const trees = instance()
  assert.equal(claim(trees.line, 'r-line', 'admin-consulta').status, 0)
  fs.writeFileSync(path.join(trees.line, 'backlog', 'admin.md'), hito('admin', 'admin-consulta', 'otra'))
  const line = context(trees.line, 'r-line').json
  assert.equal(line.task.slug, 'admin-consulta')
  assert.equal(line.claimed, true)
})

test('check rechaza una línea mal escrita, y la unidad no toca lo que no declara línea', () => {
  const trees = instance()
  fs.writeFileSync(path.join(trees.main, 'backlog', 'admin.md'), hito('admin', 'admin-consulta', 'Admin Nueva'))
  const result = run(['check', trees.main])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /backlog\/admin\.md: line «Admin Nueva» no es un nombre de línea/)
  const milestones = [{ slug: 'a', line: '', tasks: [] }, { slug: 'b', line: 'x', tasks: [] }]
  assert.deepEqual(LN.scope(milestones, '').milestones.map((one) => one.slug), ['a'])
  const loose = tempRoot('cauce-sin-git-')
  assert.equal(LN.currentLine(loose), '', 'fuera de git no hay línea')
  assert.deepEqual(LN.worktrees(loose), [], 'ni árboles')
})

// `ops lines`: el estado de todas las líneas desde cualquier árbol. Lo que se mide: que aparezcan todos los
// worktrees de la instancia y no sólo el propio; que cada uno muestre la cola de su línea y no la ajena; que
// un reclamo y un checkpoint hechos en una línea se vean en su bloque y en ningún otro; y que los commits
// adelante y lo que falta commitear salgan de cada árbol.
const checkpoint = (planning, hito, line) => {
  fs.mkdirSync(path.join(planning, 'checkpoints'), { recursive: true })
  fs.writeFileSync(path.join(planning, 'checkpoints', `${hito}.md`),
    `---\nstatus: pendiente\nhito: ${hito}\nline: ${line}\n---\n\n# Checkpoint: hito ${hito}\n`)
}

test('lines muestra cada árbol con la cola, los reclamos y el checkpoint de su línea', () => {
  const trees = instance()
  const ops = { main: path.dirname(trees.main), line: path.dirname(trees.line) }
  assert.equal(claim(trees.line, 'r-line', 'admin-consulta').status, 0)
  checkpoint(trees.line, 'admin', 'admin')
  // El mismo checkpoint en el principal, como queda después de juntar: ahí es donde se ve que frena sólo a su línea.
  checkpoint(trees.main, 'admin', 'admin')
  git(ops.line, 'add', 'planning')
  git(ops.line, 'commit', '-qm', 'claim')
  fs.writeFileSync(path.join(trees.line, 'suelto.md'), 'sin commitear\n')
  fs.mkdirSync(path.join(trees.line, 'wip'), { recursive: true })
  fs.writeFileSync(path.join(trees.line, 'wip', 'r-line.md'),
    '---\ntask: admin-consulta\nphase: Build\nservice: app\n---\n\n## Plan aprobado\n\n1. [ ] escribir\n')
  // Un árbol en una rama que nunca trajo el planning: se lista igual, y dice que ahí no hay nada que leer.
  const bare = path.join(path.dirname(ops.main), 'demo-ops-vacia')
  git(ops.main, 'worktree', 'add', '-q', '-b', 'feat/vacia', bare)
  git(bare, 'rm', '-rq', 'planning')
  git(bare, 'commit', '-qm', 'sin planning')

  const result = run(['lines', ops.main, '--json'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.base, 'main')
  const by = Object.fromEntries(report.trees.map((one) => [one.branch, one]))
  assert.deepEqual(Object.keys(by).sort(), ['feat/otra', 'feat/vacia', 'line/admin', 'main'],
    'todos los árboles, no sólo el propio')
  assert.equal(by['feat/vacia'].planning, false)
  assert.deepEqual(by['feat/vacia'].milestones, [])

  assert.equal(by.main.line, '')
  assert.deepEqual(by.main.milestones.map((one) => one.slug), ['auth'], 'el principal ve sólo lo que no es de nadie')
  assert.deepEqual(by.main.claims, [], 'el reclamo de la línea no es del principal')
  assert.deepEqual(by.main.checkpoints, [], 'y el checkpoint de admin no lo frena aunque esté en su disco')
  assert.equal(by.main.current, true)

  assert.equal(by['line/admin'].line, 'admin')
  assert.deepEqual(by['line/admin'].milestones.map((one) => one.slug), ['admin'])
  assert.deepEqual(by['line/admin'].claims.map((one) => one.slug), ['admin-consulta'])
  assert.deepEqual(by['line/admin'].checkpoints, ['checkpoints/admin.md'])
  assert.equal(by['line/admin'].ahead, 1)
  assert.equal(by['line/admin'].behind, 0)
  assert.equal(by['line/admin'].dirty, 1, 'lo que falta commitear se cuenta en su árbol')
  assert.equal(by['line/admin'].current, false)

  assert.equal(by['feat/otra'].line, '', 'una rama que no es line/ cuenta como principal')
  assert.deepEqual(by['feat/otra'].milestones.map((one) => one.slug), ['auth'])

  const text = run(['lines', ops.line])
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /base: main/)
  assert.match(text.stdout, /admin .*line\/admin.*\+1/)
  assert.match(text.stdout, /sin commitear/)
  assert.match(text.stdout, /en vuelo: admin-consulta \[Build\] r-line/)
  assert.match(text.stdout, /sin planning en este árbol/)
})

test('lines se niega fuera de git y sobre lo que no es una raíz ops', () => {
  const loose = tempRoot('cauce-lines-sin-git-')
  assert.notEqual(run(['lines', loose]).status, 0)
  const ops = path.join(loose, 'demo-ops')
  assert.equal(run(['init', ops, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const result = run(['lines', ops])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /no está en un repositorio git/)
})

// `ops lines join`: traer una línea a la rama del árbol donde se corre. Lo que se mide: que en seco diga qué
// conflictos habría, con su clase y qué hacer en cada uno, y los números de épica repetidos, que git no ve;
// que avise si la línea trae reclamos en vuelo; que con `--apply` se niegue sobre un árbol sucio; y que al
// aplicar sin conflictos quede el merge y corra `check`.
const commitIn = (ops, message, ...files) => { git(ops, 'add', ...files); git(ops, 'commit', '-qm', message) }
const lessons = (planning, row) => fs.appendFileSync(path.join(planning, 'LESSONS.md'),
  `| ${row} | propuesta | t | 2026-10-14 |\n`)
const epic = (planning, name) => {
  fs.writeFileSync(path.join(planning, 'roadmap', `${name}.md`),
    `---\nepic: ${name.slice(5, 8)}\ntitle: ${name}\nstatus: open\nservice: app\n---\n\n`
    + '# Épica\n\n## Criterios\n\n## Historias\n')
}

test('join en seco clasifica cada conflicto, ve las épicas repetidas y avisa de los reclamos en vuelo', () => {
  const trees = instance()
  const ops = { main: path.dirname(trees.main), line: path.dirname(trees.line) }
  lessons(trees.main, 'r-main'); epic(trees.main, 'epic-001-a')
  const backlog = (hito, slug) => `# Backlog\n\n## Hito ${hito} — ${hito}\n\n`
    + `- [ ] **${slug}** — X. _Aceptación: x._ (service: app)\n`
  fs.writeFileSync(path.join(trees.main, 'BACKLOG.md'), backlog('base', 'x'))
  commitIn(ops.main, 'main side', 'planning')
  lessons(trees.line, 'r-line'); epic(trees.line, 'epic-001-b')
  fs.writeFileSync(path.join(trees.line, 'BACKLOG.md'), backlog('otro', 'y'))
  assert.equal(claim(trees.line, 'r-line', 'admin-consulta').status, 0)
  commitIn(ops.line, 'line side', 'planning')

  const result = run(['lines', 'join', ops.main, 'admin', '--json'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.source, 'line/admin')
  assert.equal(report.target, 'main')
  assert.equal(report.commits, 1)
  assert.equal(report.applied, false)
  const kinds = Object.fromEntries(report.conflicts.map((one) => [one.file, one.kind]))
  assert.deepEqual(kinds, { 'planning/BACKLOG.md': 'decision', 'planning/LESSONS.md': 'lecciones' })
  assert.deepEqual(report.duplicates,
    [{ num: '001', files: ['planning/roadmap/epic-001-a.md', 'planning/roadmap/epic-001-b.md'] }])
  assert.deepEqual(report.claims, ['admin-consulta'], 'la línea trae un reclamo en vuelo')

  const text = run(['lines', 'join', ops.main, 'admin'])
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /JUNTAR line\/admin → main/)
  assert.match(text.stdout, /LESSONS\.md — lecciones: .*las filas de las dos/)
  assert.match(text.stdout, /BACKLOG\.md — decision: .*dos líneas decidieron/)
  assert.match(text.stdout, /001: .*renumber-epic/)
  assert.match(text.stdout, /reclamos en vuelo: admin-consulta/)
  assert.match(text.stdout, /--apply.*deja el merge en curso/)

  const inProgress = run(['lines', 'join', ops.main, 'admin', '--apply'])
  assert.equal(inProgress.status, 1)
  assert.match(inProgress.stderr, /quedó en curso/)
  assert.match(inProgress.stdout, /LESSONS\.md — lecciones/, 'la clasificación sale junto al merge que la necesita')
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], { cwd: ops.main }).status, 0)

  const unknown = run(['lines', 'join', ops.main, 'nadie'])
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /no existe la línea nadie.*Hay: admin/)
})

test('join --apply se niega sobre un árbol sucio, y sin conflictos mergea y corre check', () => {
  const trees = instance()
  const ops = { main: path.dirname(trees.main), line: path.dirname(trees.line) }
  assert.equal(claim(trees.line, 'r-line', 'admin-consulta').status, 0)
  commitIn(ops.line, 'claim', 'planning')
  fs.writeFileSync(path.join(trees.main, 'suelto.md'), 'x\n')
  const dirty = run(['lines', 'join', ops.main, 'admin', '--apply'])
  assert.equal(dirty.status, 1)
  assert.match(dirty.stderr, /1 cambio\(s\) sin commitear/)
  assert.equal(fs.existsSync(path.join(trees.main, 'claims', 'admin-consulta.md')), false, 'no mergeó')
  fs.rmSync(path.join(trees.main, 'suelto.md'))

  const applied = run(['lines', 'join', ops.main, 'admin', '--apply'])
  assert.equal(applied.status, 0, applied.stderr + applied.stdout)
  assert.match(applied.stdout, /planning válido/, 'check corrió sobre lo que quedó')
  assert.ok(fs.existsSync(path.join(trees.main, 'claims', 'admin-consulta.md')), 'el reclamo de la línea llegó')
  const log = spawnSync('git', ['log', '--merges', '--format=%s', '-1'], { cwd: ops.main, encoding: 'utf8' }).stdout
  assert.match(log, /line\/admin/)

  const again = run(['lines', 'join', ops.main, 'admin', '--apply'])
  assert.equal(again.status, 0)
  assert.match(again.stdout, /nada que traer/)
})

// La clasificación y las épicas repetidas son funciones puras: se prueban con listas, sin git de por medio.
test('classifyConflicts conoce cada archivo del planning esté donde esté, y duplicateEpics lee los nombres', () => {
  const kinds = (relative, files) => LN.classifyConflicts(relative, files).map((one) => `${one.file}:${one.kind}`)
  assert.deepEqual(kinds('ops/planning', [
    'ops/planning/LESSONS.md', 'ops/planning/INBOX.md', 'ops/planning/RECURRING.md', 'ops/planning/HUMAN_ACTIONS.md',
    'ops/planning/done/human-actions.md', 'ops/planning/done/x.md', 'ops/planning/README.md', 'src/app.js',
  ]), [
    'ops/planning/LESSONS.md:lecciones', 'ops/planning/INBOX.md:decision', 'ops/planning/RECURRING.md:decision',
    'ops/planning/HUMAN_ACTIONS.md:union', 'ops/planning/done/human-actions.md:union', 'ops/planning/done/x.md:unidad',
    'ops/planning/README.md:conflicto', 'src/app.js:conflicto',
  ])
  assert.deepEqual(kinds('', ['LESSONS.md', 'claims/a.md']), ['LESSONS.md:lecciones', 'claims/a.md:unidad'],
    'con el planning en la raíz del repositorio no hay prefijo')
  assert.deepEqual(LN.duplicateEpics(['roadmap/epic-001-a.md', 'roadmap/README.md'], ['roadmap/epic-001-a.md']), [],
    'el mismo archivo en los dos lados no es un duplicado')
  assert.deepEqual(LN.duplicateEpics(['roadmap/epic-002-b.md'], ['roadmap/epic-002-c.md', 'roadmap/epic-003-d.md']),
    [{ num: '002', files: ['roadmap/epic-002-b.md', 'roadmap/epic-002-c.md'] }])
})

test('join se niega sobre lo que no es una raíz, sobre la propia rama, y acepta --json al aplicar', () => {
  const loose = tempRoot('cauce-join-sin-raiz-')
  assert.equal(run(['lines', 'join', loose, 'admin']).status, 2)
  const trees = instance()
  const ops = { main: path.dirname(trees.main), line: path.dirname(trees.line) }
  const same = run(['lines', 'join', ops.main, 'main'])
  assert.equal(same.status, 2)
  assert.match(same.stderr, /ya estás en main/)
  // Desde la línea, lo que se trae es la rama principal por su nombre.
  assert.equal(claim(trees.main, 'r-main', 'auth-token').status, 0)
  commitIn(ops.main, 'claim', 'planning')
  const applied = run(['lines', 'join', ops.line, 'main', '--apply', '--json'])
  assert.equal(applied.status, 0, applied.stderr)
  const report = JSON.parse(applied.stdout.split('\n')[0])
  assert.equal(report.source, 'main')
  assert.equal(report.target, 'line/admin')
  assert.equal(report.applied, true)
  assert.ok(fs.existsSync(path.join(trees.line, 'claims', 'auth-token.md')))
})
