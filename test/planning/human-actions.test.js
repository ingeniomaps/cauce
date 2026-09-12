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
