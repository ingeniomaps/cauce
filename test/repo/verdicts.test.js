'use strict'

// Lo que AGENTS.md pide de un cambio a un cargo o a un recorrido: que entregue su evaluación en el mismo PR.
// Ningún veredicto del catálogo mide una versión anterior de su contrato o de su caso, y ningún caso quedó
// sin medir. Que los casos pasen no se pide acá: un rojo es lo que el ciclo de aprendizaje viene a leer.
//
// Mide por fechas, las mismas que usa `evaluate`, y eso necesita historia de git. Sin ella —un clon
// superficial, o el índice que materializa `verify`— no hay con qué comparar y todo saldría vigente. En
// GitHub Actions eso es un error del checkout; en local se saltea diciendo por qué. Y compara días, no
// horas: un caso cambiado el mismo día que su último veredicto se sigue leyendo vigente.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const EV = require('../../engine/agents/evaluations')
const catalog = require('../../engine/agents/catalog')
const flows = require('../../engine/flows/registry')

const ROOT = path.resolve(__dirname, '..', '..')
// Lo que se decidió entregar sin medir, por cargo o recorrido y con su razón: es la forma escrita del «se dice
// en el PR» de AGENTS.md. Se retira al renovar la evaluación, igual que un piso de cobertura que sobra.
const UNMEASURED = {}

function hasHistory() {
  const git = (...args) => (spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).stdout || '').trim()
  return git('rev-parse', '--is-shallow-repository') === 'false' && Number(git('rev-list', '--count', 'HEAD')) > 1
}

test('ningún veredicto mide una versión anterior, y ningún caso quedó sin medir', (t) => {
  if (!hasHistory()) {
    if (process.env.GITHUB_ACTIONS) assert.fail('el checkout no trae historia: hace falta fetch-depth: 0')
    t.skip('sin historia de git no hay con qué fechar un veredicto')
    return
  }
  const subjects = [...catalog.list(ROOT).map((one) => [one.slug, undefined]),
    ...flows.list(ROOT).map((slug) => [slug, 'flow'])]
  const owed = []
  let measured = 0
  for (const [slug, kind] of subjects) {
    const result = EV.validate(ROOT, slug, kind)
    if (!result.state) continue
    measured += result.state.total
    const debts = result.warnings.filter((one) => /miden una versión anterior|sin medir|no se puede saber/.test(one))
    if (debts.length && !UNMEASURED[slug]) owed.push(...debts.map((one) => `${slug}: ${one}`))
    if (!debts.length && UNMEASURED[slug]) owed.push(`${slug}: declarado sin medir y ya está medido; se retira`)
  }
  assert.ok(measured > 300, `sólo se encontraron ${measured} veredictos`)
  assert.deepEqual(owed, [], `evaluaciones que el cambio no entregó:\n  ${owed.join('\n  ')}`)
})
