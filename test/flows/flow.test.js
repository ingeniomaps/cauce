'use strict'

// Corre `flow` de verdad, con los cargos simulados. Es el mismo arnés que `autobuild.test.js` y existe
// por la misma razón: sus otros tests leen el fuente renderizado y comprueban que una línea esté escrita,
// lo que muestra que un freno existe pero no que frene cuando corresponde ni —sobre todo— que deje pasar
// cuando no. Cuatro corridas reales de `autobuild` encontraron tres defectos que ningún `match` veía.
//
// Lo que este arnés NO ve: los schemas. El runtime los valida antes de entregar la respuesta al recorrido,
// y acá el guion devuelve lo que se le pida, así que un `enum` recortado o un campo que dejó de ser
// obligatorio pasan sin ruido. Eso se cubre leyendo el fuente, en `workflows.test.js`.

require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const { compileWorkflow } = require('../support/workflow')

// Un equipo de dos etapas de descubrimiento: alcanza para ver el handoff entre una y la siguiente, que
// es donde vive casi todo lo que el recorrido decide.
function baseScript() {
  return {
    'flow-contract': {
      exists: true, name: 'feasibility-review', purpose: 'decidir si vale el esfuerzo',
      outcome: 'epic', entryAgent: 'product-manager', facilitator: 'product-manager',
      guardrails: ['No promover al BACKLOG.'],
      owners: [{ domain: 'producto', agent: 'product-manager' }],
      stages: [
        {
          id: 'encuadre', agent: 'product-manager', phase: 'discovery', skill: '/r/pm/SKILL.md',
          produces: ['problema acotado'], exitGate: 'el problema está acotado y es de alguien',
        },
        {
          id: 'factibilidad', agent: 'software-architect', phase: 'discovery', skill: '/r/sa/SKILL.md',
          produces: ['opciones y costo'], exitGate: 'hay al menos una opción con su costo',
        },
      ],
    },
    'stage:encuadre': {
      gate: 'cumplido', summary: 'el problema es el alta duplicada',
      analysis: '/w/planning/reports/encuadre-analisis.md',
      evidence: ['tres tickets de soporte'], assumptions: [], openQuestions: [],
    },
    'stage:factibilidad': {
      gate: 'cumplido', summary: 'una opción, dos semanas', analysis: '/w/planning/reports/factibilidad-analisis.md',
      evidence: ['el servicio ya expone el alta'], assumptions: [], openQuestions: [],
    },
    'epic-draft': {
      outcome: 'hacer', title: 'Alta sin duplicados', slug: 'alta-sin-duplicados',
      criteria: ['C1 el duplicado se rechaza'], stories: ['rechazar duplicado (→ C1)'],
    },
    'closing-check': { passed: true, details: 'check verde' },
  }
}

async function runFlow(changes = {}, intent = 'quiero que el alta no duplique vendedores') {
  const script = { ...baseScript(), ...changes }
  const asked = []
  const written = []
  const prompts = []

  const agent = async (prompt, options = {}) => {
    const key = options.label || (options.schema && options.schema.required || []).join(',')
    asked.push(key)
    prompts.push({ key, prompt })
    if (!options.schema) { written.push(prompt); return { ok: true } }
    if (!(key in script)) throw new Error(`el guion no cubre ${key}`)
    const answer = script[key]
    return typeof answer === 'function' ? answer() : answer
  }

  const result = await compileWorkflow('flow')(
    agent, () => {}, () => {},
    async (thunks) => Promise.all(thunks.map((t) => t())), async () => [], async () => ({}),
    { intent }, { total: null, spent: () => 0, remaining: () => Infinity },
  )
  return { result, asked, written, prompts }
}

test('flow recorre sus etapas y deja la épica sin promover', async () => {
  const { result, asked } = await runFlow()
  assert.equal(result.stopped, undefined, `frenó en ${result.reason || ''}: ${result.detail || ''}`)
  assert.equal(result.promoted, false, 'la promoción es una firma humana, no un paso del recorrido')
  assert.equal(result.stages, 2)
  assert.ok(asked.includes('stage:encuadre') && asked.includes('stage:factibilidad'))
})

// El resumen viaja entre etapas y el análisis entero sólo a la síntesis: son requisitos opuestos y por
// eso no son el mismo texto. Lo que llega a la síntesis es la ruta y la orden de leerla — el texto
// dejó de viajar por el esquema porque no llegaba, y el archivo es además donde R16 lo quiere.
test('entre etapas viaja el resumen, y a la síntesis la ruta del análisis', async () => {
  const { prompts } = await runFlow()
  const second = prompts.find((one) => one.key === 'stage:factibilidad').prompt
  assert.match(second, /el problema es el alta duplicada/, 'la siguiente recibe el resumen de la anterior')
  assert.equal(
    second.includes('encuadre-analisis.md'), false,
    'y ni siquiera la ruta: nada de lo que la etapa siguiente no necesita para decidir',
  )
  const draft = prompts.find((one) => one.key === 'epic-draft').prompt
  assert.match(draft, /encuadre-analisis\.md/, 'quien sintetiza recibe dónde está el análisis')
  assert.match(draft, /leé esos archivos antes de escribir/, 'y que tiene que leerlo, o se pierde')
  assert.equal(draft.includes('el problema es el alta duplicada'), false, 'y no recibe el resumen dos veces')
})

// Dos aserciones que se necesitan: que las hermanas no reciban el handoff de las otras, y que la que
// las junta sí reciba los tres. Con la primera sola, un motor que no le pasara nada a nadie pasaría
// igual. Por qué las hermanas tienen que ser independientes, en `levels`.
test('las etapas hermanas no se leen entre sí, y la que las junta las lee a las tres', async () => {
  const contrato = baseScript()['flow-contract']
  const etapa = (id, agent, dependsOn) => ({
    id, agent, dependsOn, phase: 'discovery', skill: '/s', produces: ['x'], exitGate: 'y',
  })
  const { prompts } = await runFlow({
    'flow-contract': {
      ...contrato,
      stages: [
        etapa('encuadre', 'a', []),
        etapa('uno', 'b', ['encuadre']),
        etapa('dos', 'c', ['encuadre']),
        etapa('junta', 'd', ['uno', 'dos']),
        etapa('solo-uno', 'e', ['uno']),
      ],
    },
    'stage:encuadre': { gate: 'cumplido', summary: 'lo del encuadre', analysis: '/a.md' },
    'stage:uno': { gate: 'cumplido', summary: 'lo de uno', analysis: '/a.md' },
    'stage:dos': { gate: 'cumplido', summary: 'lo de dos', analysis: '/a.md' },
    'stage:junta': { gate: 'cumplido', summary: 'lo de junta', analysis: '/a.md' },
    'stage:solo-uno': { gate: 'cumplido', summary: 'lo de solo-uno', analysis: '/a.md' },
  })
  const prompt = (id) => prompts.find((one) => one.key === `stage:${id}`).prompt

  assert.match(prompt('uno'), /lo del encuadre/, 've aquello de lo que declara depender')
  assert.equal(prompt('uno').includes('lo de dos'), false, 'y no a su hermana')
  assert.equal(prompt('dos').includes('lo de uno'), false, 'en las dos direcciones')

  // La que las junta ve a las tres: sus dos dependencias y lo que aquéllas dependían.
  const junta = prompt('junta')
  for (const visto of ['lo del encuadre', 'lo de uno', 'lo de dos']) {
    assert.match(junta, new RegExp(visto), `la que junta ve ${visto}`)
  }

  // Y ésta es la que prueba el filtro y no el paralelismo. Entre hermanas alcanza con que corran a la
  // vez —cuando se arma su prompt ninguna devolvió todavía—, así que romper `ancestors` no las rompía.
  // Una etapa posterior que depende de una sola sí necesita el filtro: `dos` ya está en los handoffs
  // cuando le toca, y verla sería exactamente lo que el contrato dice que no pasa.
  const soloUno = prompt('solo-uno')
  assert.match(soloUno, /lo de uno/, 've a aquélla de la que depende')
  assert.match(soloUno, /lo del encuadre/, 'y lo que aquélla dependía')
  assert.equal(soloUno.includes('lo de dos'), false, 'y no a la que no declaró')
})

// Independencia es una afirmación, y una afirmación se declara. Un contrato que no dice de qué depende
// se comporta como antes —cada etapa ve todo lo anterior—, porque lo contrario paralelizaría en silencio
// recorridos escritos para correr en fila.
test('una etapa sin dependsOn sigue viendo todo lo anterior', async () => {
  const contrato = baseScript()['flow-contract']
  const { prompts } = await runFlow({
    'flow-contract': {
      ...contrato,
      stages: contrato.stages.map(({ dependsOn, ...rest }) => rest),
    },
  })
  const segunda = prompts.find((one) => one.key === 'stage:factibilidad').prompt
  assert.match(segunda, /el problema es el alta duplicada/, 'sin declaración, ve a la anterior')
})

test('un exit gate no cumplido corta y deja la acción humana escrita', async () => {
  const { result, written, asked } = await runFlow({
    'stage:encuadre': {
      gate: 'no-cumplido', summary: 'no se pudo acotar', analysis: '/w/planning/reports/x-analisis.md',
      missing: 'nadie sabe a qué usuario le pasa', humanAction: 'preguntarle a soporte',
    },
  })
  assert.equal(result.reason, 'gate-no-cumplido')
  assert.ok(!asked.includes('stage:factibilidad'), 'no se sigue con la etapa siguiente')
  assert.ok(written.some((texto) => texto.includes('HUMAN_ACTIONS')), 'el bloqueo queda con su acción')
})

// El estado del medio: la etapa cumplió, y deja una condición que la síntesis tiene que respetar. Con dos
// estados se diluía en la prosa del handoff y la épica podía no recogerla.
test('una etapa cumple con condiciones y esas condiciones llegan a la síntesis', async () => {
  const { result, prompts, written } = await runFlow({
    'stage:factibilidad': {
      gate: 'con-condiciones', summary: 'una opción viable', analysis: '/w/planning/reports/x-analisis.md',
      openQuestions: [
        { detail: 'el costo depende de migrar la tabla, sin medir', blocking: true },
        { detail: 'convendría revisar el naming del endpoint', blocking: false },
      ],
    },
  })
  assert.equal(result.stopped, undefined, `frenó en ${result.reason || ''}`)
  const draft = prompts.find((one) => one.key === 'epic-draft').prompt
  // El detalle solo no sirve como aserción: viaja igual dentro del handoff completo, así que pasaría
  // aunque la condición no se destacara. Lo que se comprueba es que llegue señalada como condición.
  assert.match(
    draft, /Condiciones que las etapas dejaron abiertas[\s\S]{0,200}sin medir/,
    'la condición llega señalada a quien redacta, no diluida en el handoff',
  )
  assert.ok(
    written.some((texto) => texto.includes('HUMAN_ACTIONS') && texto.includes('sin medir')),
    'y queda como decisión pendiente, que es lo que impide que se lea como resuelta',
  )
  assert.equal(
    written.some((texto) => texto.includes('naming del endpoint')), false,
    'lo que no condiciona nada no se convierte en acción humana',
  )
})

test('una intención no viable deja la lección y no escribe épica', async () => {
  const { result, asked } = await runFlow({
    'epic-draft': { outcome: 'no-hacer', title: 'x', reason: 'no hay usuarios que lo pidan' },
  })
  assert.equal(result.reason, 'no-viable')
  assert.ok(asked.includes('inbox-lesson'), 'la conclusión queda registrada')
  assert.ok(!asked.includes('epic-write'), 'y no se escribe una épica que nadie va a ejecutar')
})

// La etapa que decide cierra con «investigar», que es la salida del medio. Lo que se mide es que no
// salga una épica igual: con dos salidas, investigar se leía como hacer.
test('cuando lo que falta es averiguar, no sale una épica disfrazada', async () => {
  const { result, asked } = await runFlow({
    'epic-draft': {
      outcome: 'investigar', title: 'Recuperación de cuenta',
      reason: 'nadie sabe dónde corre el proceso ni si sigue vivo',
    },
  })
  assert.equal(result.stopped, undefined, `frenó en ${result.reason || ''}`)
  assert.match(result.investigate, /dónde corre el proceso/, 'el recorrido devuelve qué hay que averiguar')
  assert.equal(result.promoted, false)
  assert.ok(asked.includes('investigar'), 'queda escrito qué averiguar y quién puede')
  assert.ok(!asked.includes('epic-write'), 'y no se escribe una épica que nadie pidió')
})

test('un check en rojo al cerrar frena en vez de dar por buena la épica', async () => {
  const { result } = await runFlow({
    'closing-check': { passed: false, details: 'la épica no trae criterios observables' },
  })
  assert.equal(result.reason, 'check-failed')
  assert.match(result.detail, /criterios observables/)
})

test('un equipo que no existe se dice, con los que sí', async () => {
  const { result } = await runFlow({
    'flow-contract': { exists: false, flows: ['product-development', 'incident-review'] },
  })
  assert.equal(result.reason, 'equipo-inexistente')
  assert.match(result.detail, /product-development/)
})

// `intake` existe para enrutar —su etapa `route` produce el destino recomendado— y ninguna etapa
// recibía qué recorridos existen: el destino salía de memoria, que es exactamente la conducta que los
// casos adversariales de los cargos miden y castigan. `flow list` sólo se corría cuando el slug fallaba,
// para decir cuáles hay.
//
// Va en las reglas comunes y no sólo en la etapa que enruta: cualquier etapa puede nombrar un destino
// al cerrar, y son seis slugs de contexto. Sale del registro, como la cadencia y como la matriz del
// cron: una lista escrita al lado se pudre el día que alguien agrega un recorrido.
test('cada etapa sabe qué recorridos existen, en vez de nombrarlos de memoria', async () => {
  const { prompts } = await runFlow({
    'flow-contract': { ...baseScript()['flow-contract'], flows: ['intake', 'incident-review'] },
  })

  const contrato = prompts.find((one) => one.key === 'flow-contract').prompt
  assert.match(contrato, /flow list/, 'el contrato los pide siempre, no sólo cuando el slug falla')

  for (const key of ['stage:encuadre', 'stage:factibilidad']) {
    const stage = prompts.find((one) => one.key === key).prompt
    assert.match(stage, /intake/, `${key} recibe el catálogo de recorridos`)
    assert.match(stage, /incident-review/)
    assert.match(stage, /sale de esa lista/, 'y con la instrucción de no inventarlo')
  }
})

// El bloqueo llega con etapas ya cerradas, y lo que se mide es que su trabajo salga en un informe y no
// dentro de una celda de tabla. R13: negarse bien y no dejar nada es la mitad barata del trabajo.
test('un recorrido que se bloquea entrega igual lo que las etapas anteriores establecieron', async () => {
  const { result, written } = await runFlow({
    'stage:factibilidad': {
      gate: 'no-cumplido', summary: 'no hay costo', analysis: '/w/planning/reports/x-analisis.md',
      missing: 'nadie estimó el esfuerzo', humanAction: 'pedirle la estimación a ingeniería',
    },
  })

  assert.equal(result.reason, 'gate-no-cumplido')
  assert.ok(written.some((one) => one.includes('HUMAN_ACTIONS')), 'el bloqueo queda con su acción')

  const parcial = written.find((one) => /parcial/i.test(one) && /reports/i.test(one))
  assert.ok(parcial, 'y lo establecido se entrega, marcado como parcial')
  assert.match(parcial, /encuadre/, 'con lo que la etapa que sí cerró dejó')
  assert.match(parcial, /nadie estimó el esfuerzo/, 'y con qué falta para completarlo')
})

// Y sobre todo cuando el bloqueo es de la primera etapa, que es donde el recorrido no deja nada. Con
// etapas cerradas la fila de acción humana ya resume lo establecido; sin ninguna, la fila es todo lo
// que existe — y ahí el informe estaba detrás de un `if (settled.length)` que lo apagaba justo
// entonces. Cuatro casos de `intake` e `incident-review` lo midieron: los tres de intake tenían a mano
// el pedido literal, sus supuestos y el destino recomendado, y el gate bloqueado pedía procedencia,
// que no impide ninguna de las tres.
// El análisis completo viaja por el input de la herramienta, y pasado cierto tamaño el modelo deja de
// emitir los campos y emite `{"raw": "<el JSON como string>", "len": N}`, que no valida. 86 de las 1550
// llamadas con schema de tres corridas salieron así, todas menos una declarando 6274 caracteres o más,
// y dos casos murieron sin medirse. Es la otra mitad de lo que R16 pide —el análisis «queda donde se
// escribió»— y el prompt no la decía.
//
// El envoltorio se nombra aparte del techo porque no se arregla acortando: la excepción de esas 86 era
// un quinto reintento de 924 caracteres que conservó la forma de los cuatro largos anteriores.
test('el análisis largo va a un archivo, no por el handoff', async () => {
  const { prompts } = await runFlow()
  const etapa = prompts.find((one) => one.key === 'stage:encuadre')
  assert.ok(etapa, 'la etapa corrió')
  assert.match(etapa.prompt, /encuadre-analisis\.md/, 'el análisis se escribe, con el id de la etapa')
  assert.match(etapa.prompt, /devolvé esa ruta en analysis/, 'y lo que vuelve por el esquema es la ruta')
  assert.match(etapa.prompt, /por debajo de 2000 caracteres/, 'el resto del esquema queda corto')
  assert.match(etapa.prompt, /Vale también para missing y humanAction/, 'incluida la etapa que frena')
  assert.match(etapa.prompt, /\{"raw": \.\.\., "len": \.\.\.\}/, 'y el envoltorio se prohíbe por su nombre')
})

test('el bloqueo de la primera etapa también entrega, y entrega el pedido', async () => {
  const { result, written } = await runFlow({
    'stage:encuadre': {
      gate: 'no-cumplido', summary: 'no se sabe de quién es', analysis: '/w/planning/reports/x-analisis.md',
      missing: 'no consta quién lo pidió ni por qué canal', humanAction: 'preguntarle a soporte',
    },
  })

  assert.equal(result.reason, 'gate-no-cumplido')
  const parcial = written.find((one) => /parcial/i.test(one) && /reports/i.test(one))
  assert.ok(parcial, 'sin etapas cerradas el informe va igual: es cuando más falta hace')
  assert.match(parcial, /transcribilo como se dijo/, 'y lo entregable es el pedido, no el acuse')
  assert.match(parcial, /supuestos que da por ciertos/)
  assert.match(parcial, /no consta quién lo pidió/, 'con lo que falta, sin rellenarlo')
})

// El caso pone el material que sostiene lo que iba a producir una etapa posterior, y esa etapa no va a
// correr. Lo que se mide es que se entregue igual, nombrando de qué etapa era.
test('lo que una etapa posterior habría hecho, pero el material ya sostiene, se entrega', async () => {
  const { written } = await runFlow({
    'stage:factibilidad': {
      gate: 'no-cumplido', summary: 'no hay costo', analysis: '/w/planning/reports/x-analisis.md',
      missing: 'nadie estimó el esfuerzo', humanAction: 'pedirle la estimación a ingeniería',
    },
  })

  const parcial = written.find((one) => /parcial/i.test(one) && /reports/i.test(one))
  assert.match(parcial, /esa etapa no va a correr/, 'la reserva se acota por lo que ya no va a pasar')
  assert.match(parcial, /lo pierde/, 'y se dice qué cuesta reservárselo')
  assert.match(parcial, /decí de qué etapa era/, 'sin borrar de quién era el trabajo')

  // Frenar no exime de la salida que el contrato reserva para no poder. `change-review` enumera tres
  // veredictos y el tercero es «no poder aprobar»; bloqueado, escribía «No hay veredicto», que no es
  // ninguno de los tres. Con el diff, el grep de importadores y las pruebas a la vista, un revisor sí
  // puede firmar que no aprueba: eso es un veredicto, no su ausencia.
  assert.match(parcial, /salida para «no se pudo»/, 'la salida de no poder es una salida, no un hueco')
  assert.match(parcial, /Frenar no exime/)
})
