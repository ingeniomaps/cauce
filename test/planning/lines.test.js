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
const P = require('../../engine/planning/parser')

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
  // La identidad vive en el repositorio, como en una instancia real: el `git merge` de `join --apply` la
  // necesita para su commit, y en CI no hay una global. Local tapaba el defecto (el CI del PR #817 lo vio).
  git(ops, 'config', 'user.email', 't@t')
  git(ops, 'config', 'user.name', 't')
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
  assert.match(refused.stderr, /auth-token no es de ninguna línea: se toma sin --line, desde la sesión principal/)
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
  // Sucio es un cambio sobre lo trackeado; un archivo suelto no frena.
  fs.appendFileSync(path.join(trees.main, 'BACKLOG.md'), '\n')
  fs.writeFileSync(path.join(trees.main, 'suelto.md'), 'x\n')
  const dirty = run(['lines', 'join', ops.main, 'admin', '--apply'])
  assert.equal(dirty.status, 1)
  assert.match(dirty.stderr, /1 cambio\(s\) sin commitear/)
  assert.equal(fs.existsSync(path.join(trees.main, 'claims', 'admin-consulta.md')), false, 'no mergeó')
  git(ops.main, 'checkout', '--', 'planning/BACKLOG.md')

  const applied = run(['lines', 'join', ops.main, 'admin', '--apply'])
  assert.equal(applied.status, 0, applied.stderr + applied.stdout)
  assert.match(applied.stdout, /planning válido/, 'check corrió sobre lo que quedó')
  assert.ok(fs.existsSync(path.join(trees.main, 'claims', 'admin-consulta.md')), 'el reclamo de la línea llegó')
  const log = spawnSync('git', ['log', '--merges', '--format=%s', '-1'], { cwd: ops.main, encoding: 'utf8' }).stdout
  assert.match(log, /line\/admin/)

  const again = run(['lines', 'join', ops.main, 'admin', '--apply'])
  assert.equal(again.status, 0)
  assert.match(again.stdout, /nada que traer/)

  // Un reclamo que ya está de los dos lados no viene con la línea.
  checkpoint(trees.line, 'admin', 'admin')
  commitIn(ops.line, 'checkpoint', 'planning')
  const next = JSON.parse(run(['lines', 'join', ops.main, 'admin', '--json']).stdout)
  assert.equal(next.commits, 1)
  assert.deepEqual(next.claims, [], 'el reclamo ya llegó en el join anterior')
})

test('lines dice que no hay base cuando el árbol principal está suelto, en vez de contar cero', () => {
  const trees = instance()
  const ops = { main: path.dirname(trees.main), line: path.dirname(trees.line) }
  fs.writeFileSync(path.join(ops.line, 'suelto.md'), 'x\n')
  git(ops.line, 'add', 'suelto.md')
  git(ops.line, 'commit', '-qm', 'adelante')
  git(ops.main, 'checkout', '-q', '--detach')
  const report = JSON.parse(run(['lines', ops.main, '--json']).stdout)
  assert.equal(report.base, '')
  const line = report.trees.find((one) => one.branch === 'line/admin')
  assert.equal(line.ahead, null, 'sin base no hay número')
  assert.match(run(['lines', ops.main]).stdout, /sin base contra qué contar/)
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
  const report = JSON.parse(applied.stdout)
  assert.equal(report.source, 'main')
  assert.equal(report.target, 'line/admin')
  assert.equal(report.applied, true)
  assert.equal(report.check.ok, true, 'lo que dijo check viaja dentro del mismo JSON')
  assert.ok(fs.existsSync(path.join(trees.line, 'claims', 'auth-token.md')))
})

// Cuando `check` no puede ni empezar sobre lo que quedó —la línea se llevó `BACKLOG.md`—, no imprime JSON: el
// informe lo dice igual, dentro del mismo documento, y el comando sale en 1.
test('join --apply --json cuenta un check que no pudo correr, sin romper el JSON', () => {
  const trees = instance()
  const ops = { main: path.dirname(trees.main), line: path.dirname(trees.line) }
  git(ops.line, 'rm', '-q', 'planning/BACKLOG.md')
  git(ops.line, 'commit', '-qm', 'sin cola')
  const result = run(['lines', 'join', ops.main, 'admin', '--apply', '--json'])
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.applied, true)
  assert.equal(report.check.ok, false)
  assert.match(report.check.output, /falta BACKLOG\.md/)
})

// Caso 394. Una sola instancia y la línea por argumento: la sesión principal y la de una línea corren `ops`
// desde el mismo árbol y sin `CAUCE_RUNNER`, así que lo único que las separa es `--line`.
function declared() {
  const ops = path.join(tempRoot('cauce-lineas-declaradas-'), 'demo-ops')
  assert.equal(run(['init', ops, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  fs.mkdirSync(path.join(ops, 'planning', 'backlog'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'planning', 'backlog', 'auth.md'), hito('auth', 'auth-token', ''))
  fs.writeFileSync(path.join(ops, 'planning', 'backlog', 'admin.md'), hito('admin', 'admin-consulta', 'admin'))
  const config = JSON.parse(fs.readFileSync(path.join(ops, 'ops.config.json'), 'utf8'))
  fs.writeFileSync(path.join(ops, 'ops.config.json'), JSON.stringify({ ...config, lines: { admin: ['app'] } }))
  git(ops, 'init', '-q', '-b', 'main')
  const as = (...args) => run(args, ops, { CAUCE_RUNNER: '', CAUCE_OWNER: 't@t' })
  return { ops, planning: path.join(ops, 'planning'), as }
}

test('la sesión dice su línea con --line, y sin argumento es la principal', () => {
  const { ops, planning, as } = declared()
  const read = (...args) => JSON.parse(as('context', planning, '--json', ...args).stdout)
  const principal = read()
  assert.deepEqual([principal.task.slug, principal.line, principal.otherLines], ['auth-token', '', ['admin']])
  const admin = read('--line', 'admin')
  assert.deepEqual([admin.task.slug, admin.line, admin.otherLines], ['admin-consulta', 'admin', ['auth']])
  assert.equal(principal.lineWarning, undefined, 'una línea declarada no es la de antes')

  // Los dos ids, y la prueba de que separan a las sesiones: reclaman a la vez.
  const top = fs.realpathSync(ops)
  assert.match(principal.wipFile, new RegExp(`^wip/${P.wipName(top)}\\.md$`))
  assert.equal(admin.wipFile, `wip/${P.wipName(`${top}#line/admin`)}.md`)
  assert.equal(as('claim', planning, 'auth-token').status, 0)
  const took = as('claim', planning, 'admin-consulta', '--line', 'admin')
  assert.equal(took.status, 0, `las dos sesiones reclaman a la vez: ${took.stderr}`)
  assert.equal(read('--line', 'admin').claimed, true)
  assert.equal(read().task.slug, 'auth-token', 'la principal sigue con la suya')

  // Cada una toma sólo lo suyo, y lo dice como se toma lo otro.
  assert.match(as('claim', planning, 'auth-token', '--line', 'admin').stderr,
    /no es de ninguna línea: se toma sin --line, desde la sesión principal/)
  const fromMain = as('release', planning, 'admin-consulta')
  assert.equal(fromMain.status, 1, 'la principal no suelta lo de la línea')
  // Y la manda a la sesión de la línea, no a exportar el id de la línea, que saltaría la separación (caso 432).
  assert.match(fromMain.stderr,
    /admin-consulta la tomó la sesión de la línea admin: se suelta desde ella, con --line admin/)
  assert.doesNotMatch(fromMain.stderr, /CAUCE_RUNNER=/)
  // Y al revés: la línea no suelta lo de la principal, ni recibe su id.
  const fromLine = as('release', planning, 'auth-token', '--line', 'admin')
  assert.equal(fromLine.status, 1)
  assert.match(fromLine.stderr, /auth-token la tomó la sesión principal: se suelta desde ella, sin --line/)
  assert.doesNotMatch(fromLine.stderr, /CAUCE_RUNNER=/)
  assert.equal(as('release', planning, 'admin-consulta', '--line', 'admin').status, 0)

  // Un reclamo de la línea con un id sin marca, como los que dejó un `CAUCE_RUNNER` fijado antes de 0.114.0 (caso 429):
  // la línea recibe el comando que lo suelta con ese id, y corrido tal cual, suelta.
  const fixed = (...args) => run(args, ops, { CAUCE_RUNNER: 'acme', CAUCE_OWNER: 't@t' })
  fs.writeFileSync(path.join(planning, 'claims', 'admin-consulta.md'),
    '---\ntask: admin-consulta\nowner: t@t\nrunner: acme\nstarted: 2026-10-21\n---\n')
  const old = fixed('release', planning, 'admin-consulta', '--line', 'admin')
  assert.equal(old.status, 1)
  assert.match(old.stderr, /desde el runner acme\. Si esa sesión no la retoma, soltala con su id: CAUCE_RUNNER=acme /)
  assert.equal(fixed('release', planning, 'admin-consulta').status, 0, 'el comando que imprime, sin --line')

  // Una línea que no está declarada se dice, en vez de contestar como la principal.
  for (const command of [['context', planning, '--json'], ['claim', planning, 'auth-token'],
    ['release', planning, 'auth-token'], ['worktree', planning, 'auth-token']]) {
    const unknown = as(...command, '--line', 'pagos')
    assert.equal(unknown.status, 2, command[0])
    assert.match(unknown.stderr, /la línea pagos no está declarada en ops\.config\.json/, command[0])
  }
})

test('una línea de antes sigue saliendo de la rama de su árbol, y context avisa que hay que migrarla', () => {
  const trees = instance()
  const line = context(trees.line, 'r-line').json
  assert.equal(line.line, 'admin')
  assert.match(line.lineWarning, /disposición de antes de 0\.111\.0.*ops lines migrate <ops-root> admin/)
  assert.match(run(['context', trees.line], undefined, { CAUCE_RUNNER: 'r-line' }).stdout, /⚠ la línea admin sale/)
  assert.equal(context(trees.main, 'r-main').json.lineWarning, undefined, 'la principal no tiene nada que migrar')
})

// Cómo se retoma un plan propio tomado desde otro id, en cada caso que distingue `resumeAdvice`; el caso entero, por
// `context`, en `test/hooks/line-trees.test.js`. Qué ruta va relativa a qué, en el encabezado de la función.
test('el consejo para retomar un plan propio depende de la línea del id y de la sesión', () => {
  const root = path.join(process.cwd(), 'planning')
  const claim = { runner: 'acme', slug: 't-pagos', wip: 'acme.md' }
  const session = { line: 'pagos', legacy: false, wipFile: 'wip/acme_line_pagos.md', busy: false, moved: false }
  // Sin línea, o en una línea de antes de 0.111.0, que lleva ids sin marca a propósito: el `export` sirve.
  for (const one of [{ ...session, line: '' }, { ...session, legacy: true }]) {
    assert.equal(LN.resumeAdvice(claim, one, root), ' — retomalo con `export CAUCE_RUNNER=acme`')
  }
  // El id de esta misma línea, también.
  assert.equal(LN.resumeAdvice({ ...claim, runner: 'acme#line/pagos' }, session, root),
    ' — retomalo con `export CAUCE_RUNNER=acme#line/pagos`')
  // El de otra línea se retoma desde ésa: exportarlo acá frena, porque el id trae otra línea que la pedida.
  assert.equal(LN.resumeAdvice({ ...claim, runner: 'acme#line/otra' }, session, root),
    ' — es de la línea otra: se retoma desde esa sesión, con --line otra')
  // Uno sin marca desde una línea nueva es de antes del 429: la migración, con un `mv` que se pega desde acá.
  assert.equal(LN.resumeAdvice(claim, session, root), ', de antes de que el id llevara la línea: soltala con '
    + '`CAUCE_RUNNER=acme node tools/ops.js release planning t-pagos`, tomala con --line pagos, y mové el plan con '
    + '`mv planning/wip/acme.md planning/wip/acme_line_pagos.md`')
  // Con espacios en la ruta, el `mv` sale citado.
  assert.match(LN.resumeAdvice(claim, session, path.join(process.cwd(), 'mis repos', 'planning')),
    /`mv 'mis repos\/planning\/wip\/acme\.md' 'mis repos\/planning\/wip\/acme_line_pagos\.md'`$/)
  // Si la sesión ya tiene el plan de otra tarea, mover éste encima lo pisaría.
  assert.match(LN.resumeAdvice(claim, { ...session, busy: true }, root),
    /esta sesión ya tiene su plan en wip\/acme_line_pagos\.md: cerrá ése antes de migrar éste/)
  // Y si el que tiene es el de esta tarea, el plan ya se movió: falta soltarla y tomarla.
  assert.equal(LN.resumeAdvice(claim, { ...session, moved: true }, root), ', de antes de que el id llevara la línea, '
    + 'y su plan ya está en wip/acme_line_pagos.md: falta soltarla con '
    + '`CAUCE_RUNNER=acme node tools/ops.js release planning t-pagos` y tomarla con --line pagos')
})
