'use strict'

// Lo que la revisión mandó a corregir una y otra vez, y qué se hizo con eso (caso 214). Lo que importa es
// cuándo una regla vuelve como lección y cuándo no: proponer de más es ruido en el INBOX, y volver a
// proponer lo rechazado sin evidencia nueva es insistir.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const LS = require('../../engine/planning/lessons')

const MOLDE = path.resolve(__dirname, '..', '..', 'template', 'planning')
const RULE = 'planning/rules/system/commits.md#R8'

function planning(name) {
  const dir = path.join(tempRoot(name), 'planning')
  fs.cpSync(MOLDE, dir, { recursive: true })
  return dir
}

const entry = (slug, corrected) => `- [x] **${slug}** — Resultado
  acept: el resultado se observa
  fecha: 2026-10-01
  done: se construyó
  qa: observado
  tests: A → make test
  commit: abc1234 feat: ${slug}
  lane: full
  review: aprobado por software-architect, sobre app/x.js · corregido: ${corrected}
`
const done = (dir, slug, corrected) => fs.writeFileSync(path.join(dir, 'done', `${slug}.md`), entry(slug, corrected))
const ledger = (dir, rows) => fs.writeFileSync(path.join(dir, LS.FILE),
  `# Lecciones\n\n## Registro\n\n| Regla | Estado | Tareas | Fecha |\n|---|---|---|---|\n${rows.join('\n')}\n`)

test('lee lo corregido del review: cada hallazgo con su regla, sin lo que sigue', () => {
  assert.deepEqual(LS.corrected('aprobado · corregido: la clave en el log [./a.md#P2] | falta el índice '
    + '[criterio] · y 2 más'), [
    { detail: 'la clave en el log', ref: 'a.md#P2' },
    { detail: 'falta el índice', ref: 'criterio' },
  ])
  assert.deepEqual(LS.corrected('aprobado por software-architect'), [])
})

test('una regla corregida en dos tareas vuelve como lección; en una sola, no', () => {
  const dir = planning('cauce-lessons-')
  done(dir, 'alta', `sin firma [${RULE}]`)
  assert.deepEqual(LS.candidates(dir).proposals, [], 'una tarea es un error de esa tarea')
  done(dir, 'baja', `push sin rama [${RULE}] | otra cosa [criterio]`)
  const { proposals, criteria } = LS.candidates(dir)
  assert.deepEqual(proposals.map((one) => [one.name, one.ref, one.tasks.sort()]),
    [['reforzar-commits-r8', RULE, ['alta', 'baja']]])
  // El criterio se lista y no se agrupa: juntar dos frases distintas es juicio.
  assert.deepEqual(criteria, [{ task: 'baja', detail: 'otra cosa' }])
})

test('lo propuesto o aplicado no vuelve; lo rechazado, sólo con una tarea nueva', () => {
  const dir = planning('cauce-lessons-ledger-')
  done(dir, 'alta', `sin firma [${RULE}]`)
  done(dir, 'baja', `sin firma [${RULE}]`)
  for (const state of ['propuesta', 'aplicada']) {
    ledger(dir, [`| \`${RULE}\` | ${state} | alta, baja | 2026-10-01 |`])
    assert.deepEqual(LS.candidates(dir).proposals, [], state)
  }
  // Una tarea nueva no reabre lo que espera decisión o ya se reforzó: eso sólo lo hace un rechazo.
  done(dir, 'extra', `sin firma [${RULE}]`)
  for (const state of ['propuesta', 'aplicada']) {
    ledger(dir, [`| ${RULE} | ${state} | alta, baja | 2026-10-01 |`])
    assert.deepEqual(LS.candidates(dir).proposals, [], `${state} con una tarea nueva`)
  }
  fs.rmSync(path.join(dir, 'done', 'extra.md'))
  ledger(dir, [`| ${RULE} | rechazada | alta, baja | 2026-10-01 |`])
  assert.deepEqual(LS.candidates(dir).proposals, [], 'rechazada y sin evidencia nueva')
  done(dir, 'cambio', `sin firma [${RULE}]`)
  const [again] = LS.candidates(dir).proposals
  assert.equal(again.reopened, true)
  assert.deepEqual(again.tasks.sort(), ['alta', 'baja', 'cambio'])
})

test('check rechaza un estado del registro fuera del vocabulario', () => {
  const dir = planning('cauce-lessons-check-')
  ledger(dir, [`| ${RULE} | pendiente | alta | 2026-10-01 |`])
  assert.match(LS.validate(dir).join('\n'), /estado «pendiente», que no es propuesta, aplicada, rechazada/)
  const result = run(['check', dir])
  assert.equal(result.status, 1)
  assert.match(`${result.stdout}${result.stderr}`, /LESSONS\.md: la regla .* estado «pendiente»/)
})

test('ops lessons --json entrega lo mismo que el módulo', () => {
  const dir = planning('cauce-lessons-cli-')
  done(dir, 'alta', `sin firma [${RULE}]`)
  done(dir, 'baja', `sin firma [${RULE}]`)
  const result = run(['lessons', dir, '--json'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).proposals.map((one) => one.name), ['reforzar-commits-r8'])
  const text = run(['lessons', dir])
  assert.match(text.stdout, /reforzar-commits-r8 {2}planning\/rules\/system\/commits\.md#R8 — 2 tareas/)

  // En texto también dice lo rechazado que vuelve y lista lo de criterio, que nadie agrupa solo.
  ledger(dir, [`| ${RULE} | rechazada | alta | 2026-10-01 |`])
  done(dir, 'cambio', 'falta el índice [criterio]')
  const again = run(['lessons', dir])
  assert.match(again.stdout, /rechazada antes; hay tareas nuevas/)
  assert.match(again.stdout, /1 corrección\(es\) de criterio, sin regla[\s\S]*cambio: falta el índice/)

  const empty = run(['lessons', planning('cauce-lessons-cli-vacio-')])
  assert.match(empty.stdout, /ninguna regla se corrigió en 2 tareas o más sin lección/)
})
