'use strict'

// Los criterios que Verify no puede comprobar con una prueba y que igual tienen que poder cerrarse: el
// que no tiene superficie ejecutable —un ADR, una política— (caso 189) y el que se declaró fuera de
// Verify porque nombra lo que existe después (caso 195). Los dos viajan a Done como hecho en vez de
// rebotar a escribir una prueba imposible.

require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow, reached } = require('../support/autobuild-harness')

const promptOf = (out, key) => (out.prompts.find((one) => one.key === key) || {}).prompt || ''
const withAcceptance = (acceptance) => ({ ...baseScript()[KEY.context], acceptance })
const verdict = (uncovered, extra = {}) => ({
  passed: true, details: 'make test 0', commands: [{ cmd: 'make test', exitCode: 0, ranTests: true }],
  uncovered, ...extra,
})

test('una tarea de sólo documento cierra con tests: n/a en vez de parar en verify-hollow', async () => {
  const crits = ['queda escrito en api/docs/ el destino de cada tabla', 'la decisión nombra la estructura canónica']
  const ctx = withAcceptance(crits.join('; '))
  let turn = 0
  const out = await runFlow({
    [KEY.context]: ctx,
    [KEY.plan]: { approach: 'ADR', steps: ['1'], files: ['api/docs/adr/003.md'], testStrategy: 'n/a' },
    [KEY.build]: { completed: true, summary: 'ADR escrito', redFirst: [], discovered: [], closedTask: false },
    [KEY.verify]: () => {
      turn += 1
      return verdict(crits.map((criterion) => ({ criterion, cause: 'no-surface', reason: 'es un ADR' })))
    },
  }, { contexts: [ctx] })
  ranToEnd(out.result)
  assert.equal(turn, 1, 'sin missing-test no hay segunda pasada')
  assert.ok(!out.asked.includes('Verify|missing-tests'), 'ni un agente escribiendo pruebas imposibles')

  const done = promptOf(out, 'Done|done')
  assert.match(done, /sin-superficie=/)
  for (const criterion of crits) assert.ok(done.includes(criterion), `Done recibe «${criterion}»`)
  assert.match(done, /tests: n\/a — /, 'y la forma que el contrato define')

  // QA no se saltea: comprueba el documento contra lo que la aceptación enumera.
  assert.ok(reached(out.asked, 'QA'))
  assert.match(promptOf(out, 'QA|qa'), /el documento existe y cubre/)
})

test('con causas mezcladas, el rebote pide sólo las pruebas que faltan', async () => {
  const code = 'el duplicado se rechaza'
  const doc = 'el manual explica el rechazo'
  const ctx = withAcceptance(`${code}; ${doc}`)
  let turn = 0
  const out = await runFlow({
    [KEY.context]: ctx,
    [KEY.verify]: () => {
      turn += 1
      return verdict([
        ...(turn === 1 ? [{ criterion: code, cause: 'missing-test' }] : []),
        { criterion: doc, cause: 'no-surface', reason: 'el manual no se ejecuta' },
      ], { covered: turn === 1 ? [] : [{ criterion: code, test: 'TestDuplicado' }] })
    },
  }, { contexts: [ctx] })
  ranToEnd(out.result)
  assert.equal(turn, 2)
  const bounce = promptOf(out, 'Verify|missing-tests')
  assert.ok(bounce.includes(code), 'el que falta')
  assert.ok(!bounce.includes(doc), 'y no el que no tiene superficie')
  // QA con superficie sigue ejercitando el comportamiento: el pedido cambia sólo si no queda ninguno.
  assert.doesNotMatch(promptOf(out, 'QA|qa'), /el documento existe y cubre/)

  const hollow = await runFlow({
    [KEY.context]: ctx,
    [KEY.verify]: verdict([
      { criterion: code, cause: 'missing-test' },
      { criterion: doc, cause: 'no-surface', reason: 'el manual no se ejecuta' },
    ]),
  }, { contexts: [ctx] })
  assert.equal(hollow.result.reason, 'verify-hollow')
  assert.ok(!hollow.result.detail.includes(doc), 'la parada nombra sólo lo que de verdad falta')
})

test('una condición marcada fuera de verify no llega a Verify ni a QA, y viaja a Done', async () => {
  const marked = 'el commit lleva el footer Task: T-1 (fuera de verify: lo registra Commit, después de Verify)'
  const ctx = withAcceptance(`el alta rechaza un duplicado; ${marked}`)
  const out = await runFlow({ [KEY.context]: ctx }, { contexts: [ctx] })
  ranToEnd(out.result)
  const verify = promptOf(out, 'Verify|verify')
  assert.ok(verify.includes('el alta rechaza un duplicado'), 'la otra condición sí llega')
  assert.ok(!verify.includes('footer Task'), 'la marcada no')
  assert.ok(!promptOf(out, 'QA|qa').includes('footer Task'), 'ni a QA')
  assert.ok(promptOf(out, 'Done|done').includes(`fuera-de-verify=${JSON.stringify([marked])}`))
})

// Caso 290. Que no se le mande no impide que Verify la traiga: la tarea entera está en el WIP. Reescrita a su
// modo —numerada, sin la marca—, se la reconoce igual y no frena; la que de verdad falta sigue frenando.
test('una condición fuera de verify que Verify devuelve sin cubrir no frena el recorrido', async () => {
  const marked = 'el job e2e del CI de la rama queda en verde (fuera de verify: se observa con la rama empujada)'
  const ctx = withAcceptance(`el alta rechaza un duplicado; ${marked}`)
  const echoed = { criterion: '2. El job e2e del CI de la rama queda en verde', cause: 'missing-test' }
  const out = await runFlow({ [KEY.context]: ctx, [KEY.verify]: verdict([echoed]) }, { contexts: [ctx] })
  ranToEnd(out.result)
  assert.ok(!out.asked.includes('Verify|missing-tests'), 'ni manda a escribir una prueba que no puede existir')

  const unsure = await runFlow({ [KEY.context]: ctx,
    [KEY.verify]: verdict([{ ...echoed, cause: 'ambiguous' }]) }, { contexts: [ctx] })
  ranToEnd(unsure.result)

  const real = { criterion: 'el alta rechaza un duplicado', cause: 'missing-test' }
  const hollow = await runFlow({ [KEY.context]: ctx, [KEY.verify]: verdict([echoed, real]) }, { contexts: [ctx] })
  assert.equal(hollow.result.reason, 'verify-hollow')
  assert.match(hollow.result.detail, /el alta rechaza un duplicado/)
  assert.doesNotMatch(hollow.result.detail, /e2e/, 'la parada nombra sólo lo que de verdad falta')
})

// Done escribía `tests: CN → prueba` sin que nadie le pasara qué prueba cubría qué: el mapeo lo tenía
// Verify, que lo contrastó leyendo el fuente, y no viajaba (hallazgo del 189). Y viajando como una frase no
// se podía contrastar: nadie distingue el nombre de la prueba de la aclaración que le sigue (caso 331). Verify
// lo da por partes y la traza la arma el recorrido, siempre con la misma forma.
test('Done recibe cada traza ya armada con el archivo, el nombre de la prueba y la aclaración', async () => {
  const root = '/srv/acme/ops'
  const rows = [
    [{ criterion: 'el alta rechaza un duplicado', file: 'test/alta_test.go', name: 'TestAltaDuplicada' },
      'test/alta_test.go › «TestAltaDuplicada» — criterio: el alta rechaza un duplicado'],
    // Lo que partiría la línea de `tests:` o cerraría el nombre antes de tiempo no viaja adentro.
    [{ criterion: 'responde 409; sin tocar la fila', file: './test/alta.spec.ts',
      name: 'rechaza  «dos» y «tres»;\nsiempre', note: 'asercia status y body; la fila no cambia' },
    'test/alta.spec.ts › «rechaza «dos" y «tres", siempre» — asercia status y body, la fila no cambia · '
      + 'criterio: responde 409, sin tocar la fila'],
    // Una ruta con el prefijo de la máquina llega como está en disco desde su raíz, que es por donde se la
    // busca: el servicio se llama `backend` y su carpeta `api`.
    [{ criterion: 'el esquema queda migrado', file: `${root}/api/db/schema_test.go`, name: 'TestSchema' },
      'db/schema_test.go › «TestSchema» — criterio: el esquema queda migrado'],
    // El archivo no puede traer lo que separa las partes.
    [{ criterion: 'c', file: 'test/x.test.js › «crea» — y', name: 'inventada' },
      '«inventada» — archivo: test/x.test.js crea — y · criterio: c'],
    // Una ruta con espacios no cabe en la forma, y sin nombre no hay prueba que buscar: van en la aclaración.
    [{ criterion: 'c', file: 'mi carpeta/y.test.js', name: 'crea' },
      '«crea» — archivo: mi carpeta/y.test.js · criterio: c'],
    [{ criterion: 'c', file: 'test/y.test.js', name: ' ' }, 'archivo: test/y.test.js · criterio: c'],
    // Sin archivo de pruebas, la traza no inventa uno.
    [{ criterion: 'la guía lo nombra', file: '', name: 'lectura de docs/alta.md',
      note: 'no hay prueba que lo ejecute' },
      '«lectura de docs/alta.md» — no hay prueba que lo ejecute · criterio: la guía lo nombra'],
  ]
  const covered = rows.map(([one]) => one)
  const out = await runFlow({
    [KEY.contract]: { ...baseScript()[KEY.contract], workspaceRoots: ['backend → ./api'] },
    [KEY.verify]: verdict([], { covered }),
  }, { root })
  ranToEnd(out.result)
  const done = promptOf(out, 'Done|done')
  const traces = JSON.parse(done.match(/cubiertos=(\[.*?\]); (?:sin-superficie|fuera-de-verify|qa)=/)[1])
  assert.deepEqual(traces, rows.map(([one, trace]) => ({ criterion: one.criterion, trace })))
  assert.match(done, /su trace copiada tal cual, sin agregarle ni sacarle nada/)
  // Y a quien verifica se le pide el dato por partes, con el nombre como está en el archivo.
  const ask = promptOf(out, KEY.verify)
  assert.match(ask, /en file, la ruta del archivo de pruebas desde la raíz de/)
  assert.match(ask, /en name, el nombre de la prueba tal como está escrito en ese archivo —el texto de su it, test o/)
  assert.match(ask, /sin los describe que la contienen ni lo que el runner le agrega al mostrarla/)
  assert.match(ask, /Una entrada por prueba: si dos pruebas cubren un criterio, van dos/)
  assert.match(ask, /Si lo que lo cubre no es un archivo de pruebas, file va vacío/)
})
