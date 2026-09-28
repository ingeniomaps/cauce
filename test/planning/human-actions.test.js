'use strict'

// La fila de `HUMAN_ACTIONS.md` que figura resuelta sin que ninguna decisión haya quedado en disco. Ready
// la rechazaba —la leyó como aprobación autoservida, y tenía razón— y `check` salía en verde, así que el
// defecto se descubría en la fase 4 de un recorrido, ya gastados Triage, Pick, Claim y Decompose: 1,21 M de
// tokens en una sola medición (caso 121). De los tres defectos de enunciado que Ready encontró es el único
// mecanizable, porque lo contesta `git log` y no hace falta un agente para preguntarlo.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

test('check avisa una fila resuelta que ningún commit registró, y se calla sin repositorio', () => {
  const target = path.join(tempRoot('cauce-human-sin-commit-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  const file = path.join(planning, 'HUMAN_ACTIONS.md')
  const base = fs.readFileSync(file, 'utf8')
  const fila = (estado) => `${base}| t-001 | ${estado} | ops | dar de alta la cuenta |\n`
  const avisos = () => JSON.parse(run(['check', planning, '--json']).stdout)
    .warnings.filter((one) => /HUMAN_ACTIONS/.test(one))
  const git = (...args) => spawnSync('git', args, { cwd: target, encoding: 'utf8' })

  // Una instancia recién creada no es un repositorio, y ahí no hay historia que consultar: degrada sin
  // avisar de más, como hizo el 086 con las migraciones.
  fs.writeFileSync(file, fila('resuelta'))
  assert.deepEqual(avisos(), [], 'sin repositorio no se inventa un aviso')

  fs.writeFileSync(file, fila('pendiente'))
  for (const args of [['init', '-q'], ['config', 'user.email', 'prueba@ejemplo.invalid'],
    ['config', 'user.name', 'Prueba'], ['add', '-A'], ['commit', '-qm', 'la fila queda pendiente']]) {
    git(...args)
  }

  fs.writeFileSync(file, fila('resuelta'))
  assert.deepEqual(avisos(), ['HUMAN_ACTIONS.md: t-001 figura resuelta y ningún commit la registró'],
    'pasó a resuelta sin que nada la decidiera, que es lo que Ready rechazaba tres fases más tarde')

  git('add', '-A')
  git('commit', '-qm', 'se resuelve la fila')
  assert.deepEqual(avisos(), [], 'con el commit que la registra, se calla')
})

// Por qué `git log -S` pierde la fila está junto a `unrecordedHumanActions` (caso 204). La fila tiene una
// `x` a 256 bytes de su final, que es lo que desborda la tabla; que el salto caiga sobre ella depende de lo
// que la precede, así que el relleno se busca en vez de fijarse: el molde cambia y la alineación con él.
test('una fila resuelta larga y commiteada no se avisa, aunque el pickaxe de git no la encuentre', () => {
  const target = path.join(tempRoot('cauce-human-fila-larga-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  const file = path.join(planning, 'HUMAN_ACTIONS.md')
  const base = fs.readFileSync(file, 'utf8')
  const git = (...args) => spawnSync('git', args, { cwd: target, encoding: 'utf8' })
  const larga = `| t-002 | resuelta | ops | x${'a'.repeat(254)} |`
  const contenido = (k) => `${base}| t-001 | pendiente | ops | ${'q'.repeat(k)}x${'q'.repeat(k)} |\n${larga}\n`
  const vacio = path.join(target, 'vacio')
  fs.writeFileSync(vacio, '')
  const pierde = (k) => {
    fs.writeFileSync(file, contenido(k))
    return !git('diff', '--no-index', '--stat', `-S${larga}`, vacio, file).stdout.trim()
  }
  const k = Array.from({ length: 400 }, (_, i) => i).find(pierde)
  assert.ok(k !== undefined, 'ningún relleno reproduce el salto de kwset: si git lo arregló, esta prueba sobra')
  fs.rmSync(vacio)
  fs.writeFileSync(file, contenido(k))
  for (const args of [['init', '-q'], ['config', 'user.email', 'prueba@ejemplo.invalid'],
    ['config', 'user.name', 'Prueba'], ['add', '-A'], ['commit', '-qm', 'la fila larga queda resuelta']]) {
    git(...args)
  }
  assert.equal(git('log', '--format=%h', `-S${larga}`, '--', 'planning/HUMAN_ACTIONS.md').stdout.trim(), '',
    'la precondición: el pickaxe no la encuentra aunque está en el commit')
  const avisos = JSON.parse(run(['check', planning, '--json']).stdout)
    .warnings.filter((one) => /HUMAN_ACTIONS/.test(one))
  assert.deepEqual(avisos, [], 'está en HEAD, así que ningún aviso')
})

test('una fila resuelta con un comentario adentro se reconoce en el commit', () => {
  const target = path.join(tempRoot('cauce-human-comentario-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  const file = path.join(planning, 'HUMAN_ACTIONS.md')
  const git = (...args) => spawnSync('git', args, { cwd: target, encoding: 'utf8' })
  fs.appendFileSync(file, '| t-001 | resuelta | ops | dar de alta la cuenta <!-- la dio Ana --> |\n')
  for (const args of [['init', '-q'], ['config', 'user.email', 'prueba@ejemplo.invalid'],
    ['config', 'user.name', 'Prueba'], ['add', '-A'], ['commit', '-qm', 'se resuelve con nota']]) {
    git(...args)
  }
  const avisos = JSON.parse(run(['check', planning, '--json']).stdout)
    .warnings.filter((one) => /HUMAN_ACTIONS/.test(one))
  assert.deepEqual(avisos, [], 'el parser lee la fila sin el comentario, y el commit se compara igual')
})
