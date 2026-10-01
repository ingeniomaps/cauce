'use strict'

// El INBOX por entrada (caso 216). Lo que se mide: que `INBOX.md` y las carpetas se lean como un solo INBOX,
// que lo que quedó fuera de lugar se avise, y que dos líneas que anotan en la misma sección dejen de chocar.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const P = require('../../engine/planning/parser')
const IN = require('../../engine/planning/inbox')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')
const entry = (slug) => `- **${slug}** — Algo que decidir. (autobuild · Review · 2026-10-01)\n`
const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), text)
}

function planning(name) {
  const dir = path.join(tempRoot(name), 'planning')
  fs.cpSync(MOLDE, dir, { recursive: true })
  return dir
}

test('INBOX.md y las carpetas por sección se leen juntos, INBOX.md primero', () => {
  const dir = planning('cauce-inbox-union-')
  const inbox = path.join(dir, 'INBOX.md')
  fs.writeFileSync(inbox, fs.readFileSync(inbox, 'utf8')
    .replace('## Propuestas\n', `## Propuestas\n\n${entry('vieja')}`))
  write(dir, 'inbox/propuestas/nueva.md', entry('nueva'))
  write(dir, 'inbox/lecciones/aprendida.md', entry('aprendida'))
  write(dir, 'inbox/ideas/sin-nombre.md', '- una viñeta sin negrita\n')

  assert.deepEqual(P.inboxHeads(dir).propuestas, ['vieja', 'nueva'])
  assert.deepEqual(P.inboxHeads(dir).lecciones, ['aprendida'])
  const counts = P.readInbox(dir)
  assert.equal(counts.propuestas, 2)
  assert.equal(counts.skipped, 1, 'un archivo sin nombre en negrita se cuenta como salteado, no desaparece')
})

test('check avisa la carpeta que no es sección y el archivo que no se llama como su entrada', () => {
  const dir = planning('cauce-inbox-warn-')
  const noDone = { set: new Set() }
  assert.deepEqual(IN.warnings(dir, noDone, {}), [], 'el molde no avisa')

  write(dir, 'inbox/propuestas/cache-de-precios.md', entry('cache-de-precios'))
  write(dir, 'inbox/propuestas/otro-nombre.md', entry('reintentos-pagos'))
  write(dir, 'inbox/mejoras/algo.md', entry('algo'))
  assert.deepEqual(IN.warnings(dir, noDone, {}), [
    'inbox/mejoras/: no es una sección (deuda, ideas, propuestas, lecciones); lo que tiene no se lee',
    'inbox/propuestas/otro-nombre.md: la entrada se llama **reintentos-pagos**; renombrá el archivo',
  ])
  // La entrada que ya se promovió se nombra por su archivo, que es lo que hay que borrar.
  const promoted = IN.warnings(dir, { set: new Set(['cache-de-precios']) }, {})
  assert.ok(promoted.includes('inbox/propuestas/cache-de-precios.md: **cache-de-precios** se llama como '
    + 'done/cache-de-precios.md; si ya se promovió, borrala'), JSON.stringify(promoted))
})

test('los avisos de las carpetas salen por check sin cambiar su exit code', () => {
  const target = path.join(tempRoot('cauce-inbox-check-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const dir = path.join(target, 'planning')
  assert.ok(fs.existsSync(path.join(dir, 'inbox', 'README.md')), 'init trae la explicación')
  write(dir, 'inbox/mejoras/algo.md', entry('algo'))
  const result = JSON.parse(run(['check', dir, '--json']).stdout)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.ok(result.warnings.some((one) => one.startsWith('inbox/mejoras/: no es una sección')),
    JSON.stringify(result.warnings))
})

// La reproducción del caso con git de verdad, y su control: la misma pareja de ramas sobre `INBOX.md` choca,
// que es lo que dice que el escenario reproduce el defecto y no pasa por otra razón.
function twoLines(name, fileFor) {
  const repo = tempRoot(name)
  const git = (...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  write(repo, 'planning/INBOX.md', '# Inbox\n\n## Propuestas\n\n## Lecciones\n')
  git('add', '.'); git('commit', '-qm', 'base')
  for (const [branch, slug] of [['work/a', 'cache-de-precios'], ['work/b', 'reintentos-pagos']]) {
    git('switch', '-q', 'main'); git('switch', '-qc', branch)
    const file = fileFor(slug)
    const before = fs.existsSync(path.join(repo, file)) ? fs.readFileSync(path.join(repo, file), 'utf8') : ''
    write(repo, file, before.includes('## Propuestas\n')
      ? before.replace('## Propuestas\n', `## Propuestas\n\n${entry(slug)}`) : entry(slug))
    git('add', '.'); git('commit', '-qm', `note ${slug}`)
  }
  git('switch', '-q', 'main'); git('merge', '-q', '--no-edit', 'work/a')
  git('switch', '-q', 'work/b')
  return { repo, merged: git('merge', '--no-edit', 'main') }
}

test('dos líneas que anotan en la misma sección se traen sin conflicto', () => {
  const control = twoLines('cauce-inbox-git-shared-', () => 'planning/INBOX.md')
  assert.notEqual(control.merged.status, 0, 'en INBOX.md choca: el escenario reproduce el caso')
  assert.match(`${control.merged.stdout}${control.merged.stderr}`, /planning\/INBOX\.md/)

  const split = twoLines('cauce-inbox-git-split-', (slug) => `planning/inbox/propuestas/${slug}.md`)
  assert.equal(split.merged.status, 0, `${split.merged.stdout}${split.merged.stderr}`)
  assert.deepEqual(P.inboxHeads(path.join(split.repo, 'planning')).propuestas,
    ['cache-de-precios', 'reintentos-pagos'])
})
