'use strict'

// La cola partida por hito (caso 212). Dos líneas de trabajo en paralelo que escriben el mismo `BACKLOG.md`
// chocan cada vez que una trae a la otra; partida, cada una escribe el archivo de su hito. Lo que se mide:
// que la cola siga siendo una sola para quien la lee, que la forma partida se cumpla, que la migración no
// pise nada, y que dos líneas de verdad dejen de chocar.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const SR = require('../../engine/planning/structure')
const BK = require('../../engine/planning/backlog')
const { splitBacklog } = BK

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')
const task = (slug) => `- [ ] **${slug}** [lite] — Algo. _Aceptación: se observa._ (service: app)`
const milestone = (slug, order, tasks = [slug]) => `---\norder: ${order}\n---\n\n## Hito ${slug} — Título\n\n`
  + `${tasks.map(task).join('\n')}\n`

function planning(name) {
  const dir = path.join(tempRoot(name), 'planning')
  fs.cpSync(MOLDE, dir, { recursive: true })
  return dir
}
const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), text)
}

test('la cola es BACKLOG.md y después backlog/ por order, y cada tarea sabe su archivo', () => {
  const dir = planning('cauce-backlog-split-')
  write(dir, 'BACKLOG.md', `# Backlog\n\n## Hito viejo — Viejo\n\n${task('vieja')}\n`)
  // Los nombres ordenan al revés que `order` a propósito: así la prueba distingue un orden del otro.
  write(dir, 'backlog/a-despues.md', milestone('a-despues', 20))
  write(dir, 'backlog/z-antes.md', milestone('z-antes', 10))
  const queue = BK.readBacklog(dir)
  assert.deepEqual(queue.map((one) => one.slug), ['viejo', 'z-antes', 'a-despues'])
  assert.deepEqual(queue.flatMap((one) => one.tasks.map((t) => t.file)),
    ['BACKLOG.md', 'backlog/z-antes.md', 'backlog/a-despues.md'])
  assert.deepEqual(SR.validateBacklogStructure(dir), [])
})

test('un archivo de hito tiene un solo hito, con su nombre y su order, y ningún hito vive en dos', () => {
  const dir = planning('cauce-backlog-split-forma-')
  const errors = (file, text) => {
    write(dir, file, text)
    const found = SR.validateBacklogStructure(dir)
    fs.rmSync(path.join(dir, file))
    return found.join('\n')
  }
  assert.match(errors('backlog/uno.md', `${milestone('uno', 10)}\n## Hito dos — Dos\n\n${task('dos')}\n`),
    /backlog\/uno\.md: tiene que tener un solo hito, ## Hito uno — <Título>; tiene uno, dos/)
  assert.match(errors('backlog/uno.md', milestone('otro', 10)), /tiene que tener un solo hito, ## Hito uno/)
  assert.match(errors('backlog/uno.md', `## Hito uno — Uno\n\n${task('uno')}\n`), /backlog\/uno\.md: falta order/)
  write(dir, 'BACKLOG.md', `# Backlog\n\n## Hito uno — Uno\n\n${task('vieja')}\n`)
  assert.match(errors('backlog/uno.md', milestone('uno', 10)), /el hito uno ya está en BACKLOG/)
})

test('partir deja la prosa en BACKLOG.md y cada hito en su archivo, con el orden que tenía', () => {
  const { backlog, files } = splitBacklog(`# Backlog\n\n> Lo que falta.\n\n## Hito a — A\n\n${task('ta')}\n`
    + `  nota de ta\n\n## Notas\n\nprosa\n\n## Hito b — B\n\n${task('tb')}\n`)
  assert.equal(backlog, '# Backlog\n\n> Lo que falta.\n\n## Notas\n\nprosa\n')
  assert.deepEqual(files.map((one) => one.file), ['backlog/a.md', 'backlog/b.md'])
  assert.equal(files[0].text, `---\norder: 10\n---\n\n## Hito a — A\n\n${task('ta')}\n  nota de ta\n`)
  assert.match(files[1].text, /^---\norder: 20\n---/)
})

test('split-backlog migra a la forma partida, y si un archivo ya existe no escribe nada', () => {
  const dir = planning('cauce-backlog-split-cli-')
  write(dir, 'BACKLOG.md', `# Backlog\n\n## Hito a — A\n\n${task('ta')}\n\n## Hito b — B\n\n${task('tb')}\n`)
  write(dir, 'backlog/b.md', milestone('b', 5, ['otra']))
  const refused = run(['split-backlog', dir])
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /ya existen backlog\/b\.md: no se escribió nada/)
  assert.ok(!fs.existsSync(path.join(dir, 'backlog', 'a.md')), 'escribió a pesar de negarse')

  fs.rmSync(path.join(dir, 'backlog', 'b.md'))
  const moved = run(['split-backlog', dir])
  assert.equal(moved.status, 0, moved.stderr)
  assert.deepEqual(BK.readBacklog(dir).map((one) => [one.slug, one.tasks[0].file]),
    [['a', 'backlog/a.md'], ['b', 'backlog/b.md']])
  assert.deepEqual(SR.validateBacklogStructure(dir), [], 'lo migrado cumple la forma partida')
  assert.match(run(['split-backlog', dir]).stdout, /no tiene hitos que partir/)
})

// La reproducción del caso, con git de verdad: dos líneas promueven cada una su hito y una trae a la otra.
// Con un solo `BACKLOG.md` esto choca; partido, entra solo.
test('dos líneas que promueven cada una su hito se traen sin conflicto', () => {
  const repo = tempRoot('cauce-backlog-split-git-')
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  write(repo, 'planning/BACKLOG.md', '# Backlog\n')
  git('add', '.'); git('commit', '-qm', 'base')
  git('switch', '-qc', 'work/a')
  write(repo, 'planning/backlog/a-uno.md', milestone('a-uno', 10))
  git('add', '.'); git('commit', '-qm', 'promote A')
  git('switch', '-q', 'main'); git('switch', '-qc', 'work/b')
  write(repo, 'planning/backlog/b-uno.md', milestone('b-uno', 20))
  git('add', '.'); git('commit', '-qm', 'promote B')
  git('switch', '-q', 'main'); git('merge', '-q', '--no-edit', 'work/a')
  git('switch', '-q', 'work/b')
  const merged = git('merge', '--no-edit', 'main')
  assert.equal(merged.status, 0, `${merged.stdout}${merged.stderr}`)
  assert.deepEqual(BK.readBacklog(path.join(repo, 'planning')).map((one) => one.slug), ['a-uno', 'b-uno'])
})

test('context entrega el archivo de la cola donde vive la tarea', () => {
  const target = path.join(tempRoot('cauce-backlog-split-ctx-'), 'demo')
  assert.equal(run(['init', target, '--name', 'Cola']).status, 0)
  const dir = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  write(dir, 'backlog/alta.md', milestone('alta', 10))
  const result = run(['context', dir, '--json'])
  assert.equal(result.status, 0, result.stderr)
  const { task } = JSON.parse(result.stdout)
  assert.deepEqual(task && [task.slug, task.file], ['alta', 'backlog/alta.md'])
})
