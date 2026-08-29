'use strict'

// Lo que queda escrito cuando algo se terminó o alguien tiene que intervenir: la traza de DONE, el
// commit que apunta a un sha real, las acciones humanas y el INBOX. Es la mitad del contrato que se
// lee después, cuando ya nadie recuerda qué pasó.

const { tempRoot, run } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const PC = require('../engine/planning/contracts')
const P = require('../engine/planning/parser')
const ST = require('../engine/planning/state')

test('contratos de evidencia rastrean pruebas y decisiones duraderas', () => {
  assert.equal(PC.validTestTrace('C1 → test:create; C2 -> npm test'), true)
  assert.equal(PC.validTestTrace('A → make lint'), true)
  assert.equal(PC.validTestTrace('n/a — cambio solo documental'), true)
  assert.equal(PC.validTestTrace('tests passed'), false)
  assert.equal(PC.validDecisionTrace('TTL de 72h. [supuesto: ventana del MVP]'), true)
  assert.equal(PC.validDecisionTrace('Se reutiliza el guard. [fuente: src/auth.js]'), true)
  assert.equal(PC.validDecisionTrace('TTL de 72h.'), false)
  assert.deepEqual(PC.validateDoneEntry({
    source: 'DONE.md', slug: 'demo', tests: '', decisions: '',
  }), ['DONE.md demo: falta tests:'])
})

// `commit:` es el puntero al artefacto, y sin forma lo cumplía cualquier prosa: `pendiente, lo subo
// mañana` pasaba el validador entero. R9 pide lo contrario —el artefacto manda—, así que el campo
// apunta a un sha o declara por qué no hay ninguno, con la misma salida explícita que `tests:`.
test('commit: apunta a un sha real o declara por qué no lo hay', () => {
  assert.equal(PC.validCommitTrace('abc1234 feat(planning): validar el estado'), true)
  assert.equal(PC.validCommitTrace('9f68583a1b2c3d4 fix(tools): correr el shim (api@main)'), true)
  assert.equal(PC.validCommitTrace('n/a — la tarea sólo abrió una fila en HUMAN_ACTIONS'), true)
  assert.equal(PC.validCommitTrace('pendiente, lo subo mañana'), false)
  // Una tarea que mezcla naturalezas lleva un commit por naturaleza, y cada uno responde por sí mismo:
  // validar sólo el primero dejaba pasar «y el otro ya lo subo», que es la mitad sin artefacto.
  assert.equal(PC.validCommitTrace(
    'c58812a refactor(orders): extract resolve; 584ed11 docs(orders): drop status (api@main; sin footer)',
  ), true, 'el `;` del paréntesis final no es un separador: detrás no hay sha')
  assert.equal(PC.validCommitTrace(
    '3e56e42 [Refactor] Move parentLabel | fc6ecc4 [Fix] Translate to pt (front@feature/DROP-26950)',
  ), true)
  assert.equal(PC.validCommitTrace('abc1234 feat(auth): create account | pendiente el segundo'), false)
  // El `;` seguido de prosa se lee como nota, no como tramo: es indistinguible del paréntesis final que
  // gouduet ya escribe, y elegir lo contrario rechazaría 71 entradas reales por una forma hipotética.
  assert.equal(PC.validCommitTrace('abc1234 feat(auth): create; nota al margen'), true)
  assert.equal(PC.validCommitTrace('ver el PR'), false)
  assert.equal(PC.validCommitTrace('abc1234'), false, 'un sha sin asunto no dice qué se entregó')
  assert.equal(PC.validCommitTrace('n/a'), false, 'la salida explícita lleva su razón')
  assert.deepEqual(PC.validateDoneEntry({
    source: 'DONE.md', slug: 'demo', tests: 'A → npm test', commit: 'pendiente, lo subo mañana',
  }), ['DONE.md demo: commit debe apuntar a <sha> <asunto> o justificar n/a — razón'])
})

// La plantilla no traía ejemplo, así que quien escribía viñetas planas veía un inbox vacío sobre un
// archivo lleno. La convención del nombre se conserva —es con lo que se cita el ítem— y lo que se
// corrige es que la diferencia sea visible.
test('el inbox dice cuántas viñetas quedaron sin contar', () => {
  const root = tempRoot('ops-inbox-')
  fs.writeFileSync(path.join(root, 'INBOX.md'), '# Inbox\n\n## Deuda\n\n'
    + '- **con-nombre** — Se cuenta.\n- sin nombre, no se cuenta.\n\n'
    + '## Ideas\n\n- **otra** — Se cuenta.\n- tampoco esta.\n')

  const inbox = P.readInbox(root)

  assert.equal(inbox.deuda, 1)
  assert.equal(inbox.ideas, 1)
  assert.equal(inbox.skipped, 2, 'las planas no desaparecen en silencio')
})

// El Estado de una fila decide si su tarea se puede tomar, y hasta que fue vocabulario cerrado lo
// decidía un `includes`: `COMPLETADO` bloqueaba para siempre porque no era ninguna de las palabras
// que el motor reconocía, y un `✅ COMPLETADO — cerrado con run-ui.mjs` desbloqueaba por la palabra
// «cerrado» suelta en la celda. Los dos fallos son silenciosos, y en direcciones opuestas.
test('el estado de una acción humana es vocabulario cerrado y se lee por el principio de la celda', () => {
  const root = tempRoot('ops-human-actions-')
  const fila = (estado) => `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| tarea-uno | ${estado} | Ready | Detalle |
`
  const leer = (estado) => {
    fs.writeFileSync(path.join(root, 'HUMAN_ACTIONS.md'), fila(estado))
    return P.readHumanActions(root)[0]
  }

  assert.deepEqual(P.HUMAN_ACTION_STATES, ['pendiente', 'resuelta'])
  assert.equal(leer('pendiente').resolved, false)
  assert.equal(leer('pendiente').valid, true)
  assert.equal(leer('resuelta').resolved, true)
  assert.equal(leer('Resuelta 2026-08-17').resolved, true, 'admite el detalle detrás del vocabulario')
  assert.equal(leer('resuelta 2026-08-17').valid, true)

  for (const invento of ['✅ COMPLETADO 2026-08-10', 'COMPLETADA', 'hecha', 'SIN EFECTO', '']) {
    const fuera = leer(invento)
    assert.equal(fuera.valid, false, `"${invento}" está fuera del vocabulario`)
    assert.equal(fuera.resolved, false, `"${invento}" no desbloquea: fuera del vocabulario se bloquea`)
  }

  // El accidente inverso: la palabra reconocida aparece dentro del texto, no como estado.
  const accidente = leer('✅ COMPLETADO 2026-08-17 — cerrado con run-ui.mjs')
  assert.equal(accidente.resolved, false, 'una palabra suelta en la celda no resuelve la fila')
  assert.equal(accidente.valid, false)
})

// La plantilla enseña el formato con filas comentadas, igual que BACKLOG y DONE. Sin filtrarlas, el
// ejemplo bloqueaba `slug-de-tarea` en toda instancia recién creada.
test('las filas de ejemplo comentadas no son acciones humanas', () => {
  const plantilla = path.resolve(__dirname, '..', 'template', 'planning')
  assert.deepEqual(P.readHumanActions(plantilla), [], 'la plantilla no trae ninguna acción abierta')
})

// El último eslabón de la trazabilidad: la historia cita `(→ C1)` y su evidencia dice qué prueba lo
// sostiene. Sin cruzarlos, una tarea cerraba con la prueba de otro criterio y el criterio citado se
// quedaba sin ninguna aserción, con `check` en verde y la épica cerrada. Todo lo anterior de la
// cadena ya se validaba; esto es lo único que hace que sirva.
test('la evidencia de DONE rastrea el criterio que la historia citó', () => {
  const entry = (tests) => ({
    source: 'DONE.md', slug: 'alta-email-nuevo', tests, commit: 'abc1234 feat(auth): create account',
  })

  assert.deepEqual(PC.validateDoneEntry(entry('C1 → test:auth crea cuenta'), ['C1']), [])
  assert.deepEqual(PC.validateDoneEntry(entry('C1 → test:auth; C2 → test:auth duplicado'), ['C1']), [],
    'rastrear de más no es un error: la prueba puede cubrir dos criterios')
  assert.deepEqual(
    PC.validateDoneEntry(entry('C2 → test:auth duplicado'), ['C1']),
    ['DONE.md alta-email-nuevo: la historia cita C1 y tests: no lo rastrea'],
  )
  assert.deepEqual(
    PC.validateDoneEntry(entry('C1 → test:auth'), ['C1', 'C3']),
    ['DONE.md alta-email-nuevo: la historia cita C3 y tests: no lo rastrea'],
  )
  // La salida explícita se respeta: ya declara su razón y se lee en el propio DONE.
  assert.deepEqual(PC.validateDoneEntry(entry('n/a — no hay superficie ejecutable'), ['C1']), [])
  // Sin épica no hay criterio que cruzar.
  assert.deepEqual(PC.validateDoneEntry(entry('A → make lint'), []), [])
})

// La creencia que tres cargos distintos escribieron como hecho y usaron para no escribir nada: que una
// fila de HUMAN_ACTIONS cuya tarea no existe rompe `check` o queda colgada. Ninguna de las dos es
// cierta, y la confusión tiene un origen razonable —el WIP sí exige existir en BACKLOG o DONE—, que es
// justamente la inferencia que R14 prohíbe: el default de un contrato no se deduce del vecino.
//
// Se fija acá porque `HUMAN_ACTIONS.md` ahora lo afirma, y una afirmación de mecanismo que vive sólo en
// un documento se pudre sin que nada falle.
test('una acción humana cuya tarea no está en el backlog no rompe check ni bloquea nada', () => {
  const ST = require('../engine/planning/state')
  const fila = { task: 'no-existe', state: 'pendiente', valid: true, action: 'crear la cuenta' }

  const errores = PC.validateState({
    epics: [], milestones: [{ slug: 'h', title: 'H', tasks: [] }],
    done: { entries: [], set: new Set(), duplicates: [] }, wip: null, humanActions: [fila],
  })
  assert.deepEqual(errores, [], 'check sólo juzga el Estado de la fila, nunca su tarea')

  const tarea = (slug) => ({ slug, tier: 'lite', cast: { build: '', review: [] }, service: 'api' })
  const { task, skipped } = ST.currentTask({
    milestones: [{ slug: 'h', tasks: [tarea('uno')] }], done: { set: new Set() }, wip: null,
  }, [fila])
  assert.equal(task.slug, 'uno', 'no bloquea a nadie: sólo se saltea lo que está en la cola')
  assert.deepEqual(skipped, [], 'y no se anuncia como salteada, porque no lo está')
})
