'use strict'

// El aviso OPS-001: commits desde la última tarea cerrada que ninguna entrada de DONE nombra. Su daño es
// el que el caso 082 midió —trabajo que no está en `planning/`— y hasta acá no lo cubría ninguna prueba,
// que es cómo pudo quedarse mudo un año sin que nadie lo notara (caso 169).

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const R = require('../../engine/core/repos')

// Un repositorio con un commit y la instancia al lado, que es el layout que `reposFor` recorre.
function instancia(prefijo, { abbrev }) {
  const base = tempRoot(prefijo)
  const repo = path.join(base, 'producto')
  fs.mkdirSync(repo, { recursive: true })
  const git = (...args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout.trim()
  }
  git('init', '-q')
  git('config', 'user.email', 'x@y.z')
  git('config', 'user.name', 'x')
  // `core.abbrev` decide cuántos caracteres mide `%h`, y git lo elige solo según el tamaño del
  // repositorio: por eso el aviso no puede depender de una posición fija.
  git('config', 'core.abbrev', String(abbrev))
  fs.writeFileSync(path.join(repo, 'a.txt'), 'uno\n')
  git('add', 'a.txt')
  git('commit', '-q', '-m', 'feat: algo que nadie anotó')
  const ops = path.join(base, 'demo-ops')
  fs.mkdirSync(path.join(ops, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(ops, 'ops.config.json'),
    JSON.stringify({ mode: 'sidecar', workspaceRoots: [{ name: 'producto', path: '../producto' }] }))
  return { base, ops }
}

// El `%h` de git mide 7 por default y **sube solo** cuando el repositorio crece: en este mismo
// repositorio mide 8. El filtro leía la fecha por columna fija —`line.slice(8, 18)`—, así que con 8 leía
// un espacio y una fecha corta, que no compara igual, y con 9 o más leía la fecha corrida. El aviso
// quedaba mudo sin decirlo: cero commits sobre un repositorio lleno.
test('el aviso de commits sin anotar no depende de cuánto mida el hash abreviado', () => {
  const done = {
    entries: [{ fecha: '2000-01-01', commit: '' }],
    set: new Set(),
  }
  for (const abbrev of [7, 8, 12]) {
    const { ops } = instancia(`ops-cobertura-${abbrev}-`, { abbrev })
    const avisos = R.coverageWarnings(ops, done)
    assert.equal(avisos.length, 1, `con abbrev=${abbrev} el aviso no salió: ${JSON.stringify(avisos)}`)
    assert.match(avisos[0], /1 commit\(s\) desde 2000-01-01/, `abbrev=${abbrev}`)
  }
})

// Y la otra mitad: el commit que una entrada sí nombra no se cuenta. Sin esto, «el aviso sale» se
// cumpliría con un filtro que no filtra nada.
test('un commit que una entrada de DONE nombra no entra en el aviso', () => {
  const { ops } = instancia('ops-cobertura-anotado-', { abbrev: 8 })
  const repo = path.join(path.dirname(ops), 'producto')
  const sha = spawnSync('git', ['-C', repo, 'log', '-1', '--format=%H'], { encoding: 'utf8' }).stdout.trim()
  const done = { entries: [{ fecha: '2000-01-01', commit: sha }], set: new Set() }
  assert.deepEqual(R.coverageWarnings(ops, done), [])
})
