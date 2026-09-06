'use strict'

// Adoptar Cauce en un proyecto que ya tiene historia. Lo que se mide es el contrato del perdón: a qué
// alcanza, qué sigue juzgando, y que la lista no pueda envejecer sin que nadie se entere.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const AD = require('../../engine/planning/adoption')
const PC = require('../../engine/planning/contracts')

const vieja = (slug) => ({ source: 'DONE.md', slug, done: 'lo único que aquel proceso registraba' })
const estado = (entries, adopted) => ({
  epics: [],
  milestones: [{ slug: 'h', title: 'H', tasks: [] }],
  done: { entries, set: new Set(entries.map((entry) => entry.slug)), duplicates: [] },
  wip: null,
  adopted: new Set(adopted),
})

test('el baseline se lee por renglón y descarta lo que no es un slug', () => {
  const root = tempRoot('ops-adoption-read-')
  fs.writeFileSync(path.join(root, AD.BASELINE), '# Entradas anteriores (2026-09-03)\n'
    + 'tarea-de-2024\n\n  otra-de-2024  \nultima  # con nota al margen\n')

  assert.deepEqual(AD.read(root), ['tarea-de-2024', 'otra-de-2024', 'ultima'])
  assert.deepEqual(AD.read(tempRoot('ops-adoption-none-')), [], 'sin archivo no hay nada exento')
})

// La entrada del fixture trae un `commit:` con formato ajeno, así que falla por lo que no escribió y
// también por lo que sí. Las dos mitades tienen que callarse juntas; `validateState` dice por qué.
test('una entrada exenta no la juzga ninguna de las cinco comprobaciones', () => {
  const conCommitAjeno = { ...vieja('tarea-de-2024'), commit: 'r4521 · migración de cobros' }

  const sinExentar = PC.validateState(estado([conCommitAjeno], []))
  assert.ok(sinExentar.some((one) => /falta acept:/.test(one)), 'falla por lo que no escribió')
  assert.ok(sinExentar.some((one) => /commit debe apuntar/.test(one)), 'y por lo que sí escribió')

  assert.deepEqual(PC.validateState(estado([conCommitAjeno], ['tarea-de-2024'])), [])
})

test('exentar una entrada no exenta a las demás', () => {
  const errores = PC.validateState(estado([vieja('tarea-de-2024'), vieja('nueva')], ['tarea-de-2024']))

  assert.ok(errores.length, 'la que no está en la lista sigue respondiendo por sí misma')
  assert.deepEqual(errores.filter((error) => error.includes('tarea-de-2024')), [])
})

// Las tres salidas del informe en una sola corrida, incluida la que no aparece: la exención que
// todavía hace falta no dice nada. Qué gana cada aviso lo cuenta `report`.
test('el informe señala la exención que sobra y la que nombra a un fantasma', () => {
  const cumple = {
    source: 'DONE.md',
    slug: 'ya-reescrita',
    acceptance: 'el resultado se observa',
    done: 'se reescribió bajo el contrato completo',
    qa: 'observado por el camino real',
    tests: 'A → make test',
    commit: 'abc1234 chore(hist): backfill',
  }
  const done = { entries: [vieja('sigue-vieja'), cumple], set: new Set(), duplicates: [] }

  const avisos = AD.report({ done, adopted: ['sigue-vieja', 'ya-reescrita', 'nunca-existio'] })

  assert.ok(avisos.some((one) => /ya-reescrita ya cumple el contrato/.test(one)))
  assert.ok(avisos.some((one) => /nunca-existio no está en DONE\.md/.test(one)))
  assert.deepEqual(avisos.filter((one) => /sigue-vieja/.test(one)), [], 'la que todavía hace falta no molesta')
  assert.match(avisos[avisos.length - 1], /3 entrada\(s\) exenta\(s\)/, 'y la cuenta se ve siempre')
  assert.deepEqual(AD.report({ done, adopted: [] }), [], 'sin exenciones no hay nada que mostrar')
})

// El recorrido entero contra una instancia de verdad: rojo, `adopt`, verde con la exención a la vista.
// Y la segunda corrida, que `adopt` explica por qué se niega.
test('adopt exenta la historia que llegó con el proyecto, y sólo se corre una vez', () => {
  const base = tempRoot('cauce-adopt-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  fs.appendFileSync(path.join(planning, 'DONE.md'), '\n## Hito viejo — Antes de la adopción\n\n'
    + '- [x] **tarea-de-2024** — Lo que se construyó entonces.\n'
    + '  done: lo único que aquel proceso registraba\n')

  assert.equal(run(['check', planning]).status, 1, 'una entrada vieja deja el planning en rojo')

  const adoptado = run(['adopt', planning])
  assert.equal(adoptado.status, 0, adoptado.stderr)
  const escrito = fs.readFileSync(path.join(planning, AD.BASELINE), 'utf8')
  assert.match(escrito, /^tarea-de-2024$/m)
  assert.match(escrito, /^# Entradas anteriores a la adopción de Cauce \(\d{4}-\d{2}-\d{2}\)/)

  const verde = run(['check', planning])
  assert.equal(verde.status, 0, verde.stderr)
  assert.match(verde.stdout + verde.stderr, /1 entrada\(s\) exenta\(s\)/, 'la exención se ve en cada corrida')

  const otraVez = run(['adopt', planning])
  assert.equal(otraVez.status, 1, 'regenerarlo perdonaría de nuevo lo que alguien ya arregló')
  assert.match(otraVez.stderr, /ya existe/)
})

test('adopt no escribe nada cuando no hay historia que exentar', () => {
  const base = tempRoot('cauce-adopt-limpio-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')

  const result = run(['adopt', planning])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /no hay nada que exentar/)
  assert.equal(fs.existsSync(path.join(planning, AD.BASELINE)), false, 'ni siquiera vacío')
})
