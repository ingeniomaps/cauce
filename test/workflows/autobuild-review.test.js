'use strict'

// Lo que hace el recorrido con un veredicto: cuándo corrige, cuándo frena y cuándo sólo anota. Un
// hallazgo que no impide entregar no puede costar una vuelta de código, y uno que sí no puede
// pasar — las dos mitades se miden acá porque cualquiera sola deja pasar la otra.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow, reached, writesTo } = require('../support/autobuild-harness')

// La lista que trae `context` en su campo `rules` (caso 105); por qué Review la nombra está en `REVIEWED`.
const RULES = ['planning/rules/system/commits.md', 'planning/rules/security.md']
const withRules = (changes = {}) => ({ [KEY.context]: { ...baseScript()[KEY.context], rules: RULES }, ...changes })

test('las reglas que lista context llegan a Plan, Build y Review', async () => {
  const { result, prompts } = await runFlow(withRules({
    [KEY.review]: { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'], rules: [RULES[1]] },
  }))
  ranToEnd(result)
  for (const key of [KEY.plan, KEY.build, KEY.review]) {
    const { prompt } = prompts.find((one) => one.key === key)
    for (const rule of RULES) assert.ok(prompt.includes(rule), `${key} no recibió ${rule}`)
  }
})

// Caso 122. Review tiene que nombrar contra qué reglas revisó —si no, la corrida para con
// `review-unbacked`— y esa lista quedaba en el journal sin llegar a la entrada de DONE, que es el registro
// que sobrevive a la corrida. La revisión ocurrió y fue contra las reglas correctas; lo que no se podía
// reconstruir tres meses después, cuando el journal ya no está, es contra cuáles.
test('las reglas contra las que Review revisó llegan a la entrada de DONE', async () => {
  const { result, prompts } = await runFlow(withRules({
    [KEY.review]: { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'], rules: [RULES[1]] },
  }))
  ranToEnd(result)
  const done = prompts.find((one) => one.key === 'Done|done').prompt
  assert.match(done, /review=[^;]*reglas: planning\/rules\/security\.md/,
    'la entrada de DONE nombra contra qué regla se revisó')
  // Y sigue trayendo lo que ya traía. Sin esta mitad, reemplazar la línea entera por la lista de reglas
  // daría el mismo verde: la aserción de arriba no distingue agregar de sustituir.
  assert.match(done, /review=aprobado por [^;]*sobre api\/alta\.go/, 'sin perder el veredicto ni lo inspeccionado')
})

test('con reglas que rigen, Review no aprueba sin nombrar contra cuáles revisó', async () => {
  const { result } = await runFlow(withRules())
  assert.equal(result.reason, 'review-unbacked')
  assert.match(result.detail, /reglas/)
})

// Una decisión que quedó abierta se registra y no frena lo que sí se entregó. Frenaba, y en tres corridas
// reales frenó las tres veces con la tarea completa: toda aceptación en prosa tiene un borde indefinido, así
// que el freno saltaba siempre. Lo que de verdad bloquea sigue siendo completed:false con su blocker.
test('una decisión abierta queda escrita y el recorrido sigue', async () => {
  const { result, written } = await runFlow({
    [KEY.build]: {
      completed: true, summary: 'x', redFirst: [], closedTask: false,
      discovered: [{ kind: 'open', detail: 'nadie definió qué pasa con el alta sin país' }],
    },
  })
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'], 'lo entregado se cierra igual')
  assert.ok(
    written.some((text) => text.includes('HUMAN_ACTIONS') && text.includes('sin país')),
    'y queda registrada con quién puede tomarla, o vuelve a aparecer sin dueño',
  )
})

// Lo que impide entregar no pasa por ese canal: el cargo no completa, y ahí sí frena.
test('lo que de verdad bloquea sigue frenando por su propio camino', async () => {
  const { result } = await runFlow({
    [KEY.build]: {
      completed: false, summary: 'x', redFirst: [], discovered: [], closedTask: false,
      blockers: ['sin credencial del proveedor de pagos'],
    },
  })
  assert.equal(result.reason, 'build-blocked')
  assert.match(result.detail, /credencial/)
})

// El plan y el diff tienen una corrección y una sola. Que la segunda vuelta exista es la mitad; la otra
// es que no haya una tercera, porque un recorrido que insiste hasta que le aprueben no revisa nada.
test('un review que rechaza corrige una vez y sigue si la segunda aprueba', async () => {
  let turn = 0
  const { result, written } = await runFlow({
    [KEY.review]: () => {
      turn += 1
      return turn === 1
        ? {
          verdict: 'con-condiciones', consulted: ['api/alta.go'],
          concerns: [{ detail: 'falta el caso vacío', blocking: true }],
        }
        : { verdict: 'aprobado', concerns: [], consulted: ['api/alta.go'] }
    },
  })
  ranToEnd(result)
  assert.equal(turn, 2, 'la corrección se revisa de nuevo, no se da por buena')
  assert.ok(
    written.some((text) => text.includes('falta el caso vacío')),
    'y lo que hay que corregir viaja con el hallazgo, no como "arreglalo"',
  )
})

// El caso mira las dos fases con el mismo veredicto: el estado del medio entró por separado en Critique
// y en Review, y cubrir una sola deja pasar la otra sin que nada lo diga.
test('un veredicto bloqueado frena sin gastar una corrección', async () => {
  const review = await runFlow({
    [KEY.review]: {
      verdict: 'bloqueado', consulted: ['api/alta.go'],
      concerns: [{ detail: 'la aceptación pide un contrato que el diseño no define', blocking: true }],
    },
  })
  assert.equal(review.result.reason, 'review-blocked')
  assert.equal(writesTo(review.wrote, 'Review'), 0, 'no se manda a corregir lo que la corrección no arregla')

  const critique = await runFlow({
    [KEY.critique]: {
      verdict: 'bloqueado', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el plan depende de una decisión que nadie tomó', blocking: true }],
    },
  })
  assert.equal(critique.result.reason, 'plan-blocked')
  assert.ok(!reached(critique.asked, 'Build'), 'y no se construye')
})

// Y un hallazgo que no impide entregar deja de costar una vuelta de código: se anota y la tarea cierra.
test('lo que no bloquea se anota y no manda a tocar código', async () => {
  const { result, written, wrote } = await runFlow({
    [KEY.review]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el nombre del handler podría ser más claro', blocking: false }],
    },
  })
  ranToEnd(result)
  assert.deepEqual(result.done, ['T-1'])
  assert.equal(writesTo(wrote, 'Review'), 1, 'una sola escritura en Review: la del registro, no una corrección')
  assert.ok(
    written.some((text) => text.includes('INBOX') && text.includes('nombre del handler')),
    'lo anotado queda donde alguien lo decide después, sin promover',
  )
})

test('un review que sigue rechazando después de corregir frena', async () => {
  const { result } = await runFlow({
    [KEY.review]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'sigue faltando el caso vacío', blocking: true }],
    },
  })
  assert.equal(result.reason, 'review-failed')
  assert.match(result.detail, /sigue faltando/)
})

// Un veredicto bloqueado nombra lo que lo bloquea, pero puede llegar sin nombrar nada. En la segunda
// pasada eso frenaba con el detalle vacío: el motivo es lo único que queda para leer cuando la corrida
// terminó, y la primera pasada ya tenía este respaldo.
test('un bloqueo sin condiciones nombradas frena igual y lo dice', async () => {
  let reviewTurn = 0
  const review = await runFlow({
    [KEY.review]: () => {
      reviewTurn += 1
      return reviewTurn === 1
        ? {
          verdict: 'con-condiciones', consulted: ['api/alta.go'],
          concerns: [{ detail: 'falta el caso vacío', blocking: true }],
        }
        : { verdict: 'bloqueado', consulted: ['api/alta.go'], concerns: [] }
    },
  })
  assert.equal(review.result.reason, 'review-failed')
  assert.equal(review.result.detail, 'sin condiciones nombradas')

  let critiqueTurn = 0
  const critique = await runFlow({
    [KEY.critique]: () => {
      critiqueTurn += 1
      return critiqueTurn === 1
        ? {
          verdict: 'con-condiciones', consulted: ['api/alta.go'],
          concerns: [{ detail: 'el alcance se pasa de la aceptación', blocking: true }],
        }
        : { verdict: 'bloqueado', consulted: ['api/alta.go'], concerns: [] }
    },
    [KEY.replan]: {
      approach: 'segundo intento', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
  })
  assert.equal(critique.result.reason, 'plan-rejected')
  assert.equal(critique.result.detail, 'sin condiciones nombradas')
})

test('un plan que no sobrevive a la segunda crítica no llega a construirse', async () => {
  const { result, asked } = await runFlow({
    [KEY.critique]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el alcance se pasa de la aceptación', blocking: true }],
    },
    [KEY.replan]: {
      approach: 'segundo intento', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit',
    },
  })
  assert.equal(result.reason, 'plan-rejected')
  assert.ok(!reached(asked, 'Build'), 'no se construye sobre un plan rechazado')
})

// Por qué la fila reemplaza al reintento está en `planRejected`. Acá se miden las dos salidas juntas,
// porque son la misma decisión por dos caminos —el veredicto bloqueado en la primera crítica, y el que
// sigue bloqueado tras la corrección— y cubrir una sola deja la otra reintentándose en silencio.
test('un plan que ninguna crítica aprueba queda pedido por escrito, no reintentado', async () => {
  const bloqueado = {
    verdict: 'bloqueado', consulted: ['api/alta.go'],
    concerns: [{ detail: 'la aceptación mezcla dos resultados', blocking: true }],
  }
  const primera = await runFlow({ [KEY.critique]: bloqueado })
  assert.equal(primera.result.reason, 'plan-blocked')
  // Qué mirar se dice con la conducta y no con el número de la regla: el proyecto puede haberla retirado.
  assert.ok(primera.written.some((text) => text.includes('HUMAN_ACTIONS') && text.includes('vidas distintas')
    && text.includes('partirla')), `la fila dice qué mirar: ${JSON.stringify(primera.written)}`)

  const segunda = await runFlow({
    [KEY.critique]: {
      verdict: 'con-condiciones', consulted: ['api/alta.go'],
      concerns: [{ detail: 'sigue mezclando dos resultados', blocking: true }],
    },
    [KEY.replan]: { approach: 'otro intento', steps: ['1'], files: ['api/alta.go'], testStrategy: 'unit' },
  })
  assert.equal(segunda.result.reason, 'plan-rejected')
  const fila = segunda.written.find((text) => text.includes('HUMAN_ACTIONS'))
  assert.ok(fila, `también por este camino: ${JSON.stringify(segunda.written)}`)
  assert.match(fila, /sigue mezclando dos resultados/, 'y lleva el motivo, que es lo que se lee después')
  assert.ok(!reached(segunda.asked, 'Build'), 'y no se construye sobre un plan que nadie aprobó')
})

// La fila es el único rastro de la parada, así que se espera y se comprueba. Hasta 0.79.0 se lanzaba y
// el recorrido volvía en la línea siguiente: en una corrida real el resumen contó diez agentes, el
// journal nueve, y el décimo era el que escribía la fila. Se reportaba la parada correcta sobre un
// registro que no la tenía, y relanzar repetía la planificación entera (caso 087).
//
// Que la suite no lo viera no fue por falta de caso —el de arriba lo aserciaba— sino por el arnés, que
// anotaba la llamada en el mismo tick: una que nadie espera se veía igual que una esperada.
test('la fila que registra la parada se espera, y si no ocurre la parada lo dice', async () => {
  const bloqueado = {
    verdict: 'bloqueado', consulted: ['api/alta.go'],
    concerns: [{ detail: 'la aceptación mezcla dos resultados', blocking: true }],
  }
  const { result, wrote } = await runFlow({ [KEY.critique]: bloqueado })
  assert.ok(wrote.includes('Critique|plan-human'),
    `la escritura terminó antes de que el recorrido volviera: ${JSON.stringify(wrote)}`)
  assert.doesNotMatch(result.detail, /no se pudo registrar/, 'y cuando ocurre, no hay nada que avisar')

  // Y al revés: si el agente que la escribe no contesta, el motivo de la parada no cambia —sigue siendo
  // el que la causó— y el detalle dice que hay que escribirla a mano, en vez de dar por hecho que está.
  const mudo = await runFlow({ [KEY.critique]: bloqueado }, { silent: ['plan-human'] })
  assert.equal(mudo.result.reason, 'plan-blocked', 'el motivo es el de la parada, no el de la escritura')
  assert.match(mudo.result.detail, /no se pudo registrar: escribila a mano/)
})

// Caso 101. El tope lo aplica el recorrido sobre lo que le pasa al agente: cinco hallazgos no
// bloqueantes llegan como tres, en una línea cada uno, y los dos que no entran quedan contados en el
// hecho de revisión, que es lo que viaja a `done/`.
test('lo anotado entra al INBOX con tope, con la forma del molde y sin repetir nombres', async () => {
  const { baseScript } = require('../support/autobuild-harness')
  const concerns = ['uno', 'dos\nsegunda línea que no viaja', 'tres', 'cuatro', 'cinco']
    .map((detail) => ({ detail: `hallazgo ${detail}`, blocking: false }))
  const { result, prompts } = await runFlow({
    [KEY.review]: { verdict: 'aprobado', consulted: ['api/alta.go'], concerns },
    [KEY.context]: { ...baseScript()[KEY.context], inbox: { propuestas: ['ya-anotado'] } },
  })
  ranToEnd(result)
  const noted = prompts.find((one) => one.key === 'Review|review-noted').prompt
  assert.match(noted, /hallazgo uno.*hallazgo dos.*hallazgo tres/)
  assert.doesNotMatch(noted, /hallazgo cuatro|hallazgo cinco/, 'el cuarto y el quinto no llegan al agente')
  assert.doesNotMatch(noted, /segunda línea/, 'y cada hallazgo llega en una línea')
  assert.match(noted, /- \*\*slug-del-item\*\* — /, 'nombra la forma de entrada del molde')
  assert.match(noted, /en Propuestas ya están ya-anotado/, 'y lleva los nombres que ya hay en Propuestas')
  const done = prompts.find((one) => one.key === 'Done|done').prompt
  assert.match(done, /review=[^;]*· 2 anotado\(s\) sin volcar al INBOX/, 'lo que no entró queda contado en done/')
})

// Caso 115. Una entrada es un nombre y una línea, y de esa línea no se sabía quién la escribió ni
// cuándo. La procedencia la arma el recorrido —es el único que sabe las tres partes— y el pedido dice
// que se copie, en vez de confiar en que el agente se acuerde de agregarla.
test('lo anotado llega con de qué vía salió: recorrido, tarea y fecha', async () => {
  const { result, prompts } = await runFlow({
    [KEY.review]: {
      verdict: 'aprobado', consulted: ['api/alta.go'],
      concerns: [{ detail: 'el nombre del handler podría ser más claro', blocking: false }],
    },
  })
  ranToEnd(result)
  const noted = prompts.find((one) => one.key === 'Review|review-noted').prompt
  assert.match(noted, /más claro \(autobuild · T-1 · 2026-09-08\)/, 'la línea ya viene con su procedencia')
  assert.match(noted, /procedencia —\(autobuild · T-1 · 2026-09-08\)—/, 'y el pedido la nombra')
  assert.match(noted, /tal cual, sin reescribirla/, 'pidiendo que se copie, no que se redacte')
})

// Y qué cede cuando las dos cosas no entran en la línea. El porqué vive en INBOX_LINE.
test('un hallazgo largo se recorta y su procedencia llega entera', async () => {
  const { prompts } = await runFlow({
    [KEY.review]: {
      verdict: 'aprobado', consulted: ['api/alta.go'],
      concerns: [{ detail: `hallazgo ${'largo '.repeat(60)}`, blocking: false }],
    },
  })
  const noted = prompts.find((one) => one.key === 'Review|review-noted').prompt
  const [entry] = JSON.parse(noted.match(/Lo anotado: (\[[\s\S]*\])$/)[1])
  assert.ok(entry.endsWith('(autobuild · T-1 · 2026-09-08)'), `la procedencia se perdió: ${entry}`)
  assert.ok(entry.length <= 240, `la entrada mide ${entry.length} y el tope es 240`)
  assert.match(entry, /…/, 'y lo que se recortó es el hallazgo')
})

test('lo anotado dentro del tope no deja nada contado sin volcar', async () => {
  const { prompts } = await runFlow({
    [KEY.review]: { verdict: 'aprobado', consulted: ['api/alta.go'], concerns: [{ detail: 'uno', blocking: false }] },
  })
  assert.doesNotMatch(prompts.find((one) => one.key === 'Done|done').prompt, /sin volcar/)
})
