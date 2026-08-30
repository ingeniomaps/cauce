'use strict'

// Los evaluadores y la promoción, leídos como fuente. Son gemelos y por eso van juntos: un arreglo
// que entra en `agent-eval` y no en `flow-eval` es el modo de fallo que ya costó corridas, y sólo se
// ve exigiéndoles lo mismo a los dos en el mismo lugar.

require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const WF = path.resolve(__dirname, '..', '..', 'automatization', 'workflows')

// Se exige a los dos evaluadores sobre el fuente ya expandido, y por eso el `for`: el filtro entró
// primero en `agent-eval` y `flow-eval` quedó sin él meses después de que los dos lo necesitaran
// igual. Es la quinta vez que un arreglo entra en un gemelo y no en el otro —`contexto`, la ruta del
// CLI, el esquema de dos niveles, el freno de banco—, y las cuatro anteriores costaron corridas.
for (const name of ['agent-eval', 'flow-eval']) {
  test(`${name} puede correr sólo los casos que se le nombran`, () => {
    const src = require('../../engine/automation').render(path.join(WF, `${name}.js`), '', path.dirname(WF))
    assert.match(src, /const ONLY = onlyCases\(input\)/, 'acepta uno, varios o ninguno')
    assert.match(src, /context\.items = pick\.items/, 'y corre sólo ésos')

    // Un id que no existe frena en vez de correr una batería vacía y registrar cero de seis.
    assert.match(src, /stop\('caso-inexistente'/, 'un caso mal escrito no se convierte en corrida vacía')
    assert.match(src, /Tiene: \$\{pick\.present\.join\(', '\)\}/, 'y dice cuáles hay')

    // Y queda dicho que el registro parcial no vale por sí solo, que es lo que evita el próximo error:
    // dar por medido un sujeto con un registro que cubre uno de seis.
    assert.match(src, /el registro va a cubrir \$\{ONLY\.length\} de \$\{CATALOG\}/)
  })
}

// El único recorrido que modifica un cargo. Sus dos candados no son estilo: sin el primero un agente
// se autorizaría a sí mismo, y sin el segundo quedaría un contrato cambiado sin que nadie sepa si
// todavía se sostiene.
test('promover un cargo exige firma humana y verificación posterior', () => {
  const promote = fs.readFileSync(path.join(WF, 'agent-promote.js'), 'utf8')
  assert.match(promote, /sin-firma/, 'se detiene si no está aprobada')
  assert.match(promote, /nadie se autoriza a sí mismo/)
  assert.match(promote, /propuesta-vacia/, 'y si el cambio todavía es "por definir"')
  assert.match(promote, /agent-eval/, 'y manda a correr los casos contra el contrato nuevo')
  // Nunca aplica lo que no está firmado: la lectura de la firma ocurre antes que cualquier escritura.
  assert.ok(promote.indexOf("label: 'firma'") < promote.indexOf('aplica:'), 'la firma se lee primero')

  // Y no la aplica dos veces. La firma no sirve de candado —sigue firmada después—, así que el estado
  // terminal lo lleva el frontmatter, y sellarlo es lo último que ocurre: antes de eso sigue pendiente.
  assert.match(promote, /ya-aplicada/, 'una propuesta aplicada se rechaza')
  // Rechazar sin decir a dónde ir dejaba al cargo con un contrato que la evaluación mostró mal
  // calibrado y sin camino hasta el mes siguiente. La salida es la revisión, y va nombrada.
  assert.match(promote, /abrí una revisión/, 'y nombra la salida en vez de mandar a esperar')
  assert.match(promote, /-r\\d\+\)\?/, 'la revisión es un nombre que el recorrido sabe leer')
  assert.match(promote, /--applied --period/, 'y al terminar se sella')
  assert.ok(promote.indexOf("label: 'historial'") < promote.indexOf("label: 'sella'"), 'sella al final')

  // El que propone jamás toca el cargo: si lo hiciera, la firma llegaría tarde.
  const propose = fs.readFileSync(path.join(WF, 'agent-propose.js'), 'utf8')
  assert.match(propose, /No toques «Aprobación humana»/)
  assert.match(propose, /no su aplicación/, 'propone, no aplica')
})

// Un cargo nunca corre sólo con su SKILL.md: `AGENTS.md` lleva las reglas que todos obedecen, y el
// puntero que instala cada runner se lo dice. Medirlo sin ellas lo evaluaba en una situación que no
// ocurre — y ahí se perdía la regla general que corrige el patrón «se niega bien y no entrega».
test('la evaluación mide al cargo como corre, no aislado', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')
  assert.match(evalWf, /AGENTS\.md/, 'la respuesta se da con las reglas generales a la vista')
  assert.match(evalWf, /nunca ocurre/, 'y queda dicho por qué')
})

// El criterio del juez tiene que salir de un archivo versionado y no del prompt de quien lanza la
// corrida. Mientras dependió del prompt, el listón se movió entre rondas: un mismo caso se midió tres
// veces con tres criterios y su serie dejó de ser comparable consigo misma.
test('quien juzga recibe la conducta prohibida del contrato', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')
  assert.match(evalWf, /forbidden: \{ type: 'array'/, 'los prohibidos viajan con los casos')
  assert.match(evalWf, /context\.forbidden/, 'y llegan a quien juzga')
  assert.match(evalWf, /no ocurre ninguna conducta \`?\s*\+?\s*\`?prohibida/, 'y deciden el veredicto')
  // Un rótulo no es una verificación: el modo de fallo que aparece apenas la regla existe es escribir
  // «verificado» encima de algo que nadie comprobó.
  assert.match(evalWf, /no prueba que el contenido sea/, 'y el juez no acepta el rótulo como prueba')
  // Y lo que el rótulo bien puesto no salva: la copia que llegó sin él a un artefacto que se lee solo.
  // Estaba escrito como ponderación —«pesa más si salió del informe hacia…»— y no como comprobación, así
  // que dependía de que al juez se le ocurriera. A uno se le ocurrió y encontró una afirmación refutada
  // viajando en plano a una lección; en los demás casos no se sabe, porque el banco se borra con ella.
  assert.match(evalWf, /esa salida se comprueba, no se espera/, 'el juez va a mirar los artefactos derivados')
  assert.match(evalWf, /INBOX, la fila de acciones humanas, la lección/, 'y sabe cuáles son')
  assert.match(evalWf, /No se detecta releyendo el informe/, 'y por qué releer el informe no alcanza')
})

// El arnés medía a los cargos dentro del toolkit, donde `planning/` es `template/planning` y se
// distribuye a cada instalación. Un cargo que se niega a escribir ahí acierta, y el caso lo contaba
// como fallo: `product-manager` fallaba exactamente los dos casos que piden escribir, y ninguno más.
//
// Primero se documentó en un comentario, y no alcanzó. Después se cortó la corrida, y tampoco: negarse
// dejaba el catálogo sin forma de medirse. Lo que se fija acá es la salida — un banco donde trabajar.
test('la evaluación le arma al cargo un lugar donde trabajar', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')
  assert.match(evalWf, /ops\.config\.json.*mode/s, 'lee el modo del proyecto')
  assert.match(evalWf, /mode === 'toolkit'/, 'y distingue el toolkit de una instancia')
  assert.match(evalWf, /--bench/, 'en el toolkit le arma un banco desechable')
  assert.match(evalWf, /Trabajás en \$\{benchPath/, 'y el cargo trabaja ahí, no en la raíz')
  // Uno por caso: con un banco compartido los casos se leían entre sí y dejaban de medir lo suyo.
  assert.match(evalWf, /--bench \$\{item\.id\}/, 'un banco por caso, nombrado por el caso')
  assert.match(evalWf, /benchPath = \(item\)/, 'y cada caso resuelve el suyo')

  // El veredicto pertenece al contrato que lo rindió, y el banco se borra en la próxima corrida.
  assert.match(evalWf, /evaluate \$\{AGENT\} --record/, 'el registro va donde el motor dice')
  assert.match(evalWf, /no en el banco/, 'dicho explícitamente, que es donde se equivocaría')
  // La ruta la resuelve el motor y no el prompt. Componerla acá desde la fecha hacía que una segunda
  // corrida del mismo día —la que sigue a aplicar una propuesta— escribiera encima de la línea base.
  assert.doesNotMatch(evalWf, /results\/<fecha>/, 'sin componer el nombre desde la fecha')

  // La otra mitad del par: acá se lee el fuente del recorrido, y `bench.test.js` corre el comando.
  assert.match(evalWf, /cargo-del-catalogo/, 'y un cargo del catálogo se rechaza ahí')
  assert.match(evalWf, /agents fork/, 'nombrando la salida, no sólo el rechazo')

  // El artefacto de un caso adversarial se le nombra a quien responde y a quien juzga, y por motivos
  // distintos: uno tiene que leerlo, el otro tiene que saber que no lo escribió el cargo.
  assert.match(evalWf, /item\.fixtures/, 'el recorrido conoce el artefacto del caso')
  assert.match(evalWf, /Leelos antes de contestar/, 'y le dice al cargo que lo lea')
  assert.match(evalWf, /no es obra suya/, 'y al juez, que vino con el banco')

  // Comprobar las afirmaciones de mecanismo lo hacía a mano quien lanzaba la corrida, así que el hallazgo
  // dependía de que a alguien se le ocurriera la comprobación correcta y la vara se movía entre corridas.
  // Va con redacción fija y fuera del bloque de conducta prohibida: un cargo puede afirmar de más aunque
  // su contrato no declare ninguna.
  assert.match(evalWf, /Enumeralas con el registro que cada una lleva/, 'el juez busca las afirmaciones')
  assert.match(evalWf, /comprobá las que se puedan comprobar barato/, 'y comprueba las baratas')
  assert.match(evalWf, /nunca conectarte a un sistema real/, 'sin salirse de lo que R12 permite')
  // Las tres que fallaron tenían casi todo bien rotulado y floja justo la que sostenía su recomendación.
  assert.match(evalWf, /Empezá por la afirmación de la que depende la recomendación/, 'por dónde empezar')
  assert.match(evalWf, /en las dos direcciones/, 'afirmar de más y desinflar de más cuentan igual')
  assert.ok(
    evalWf.indexOf('Enumeralas con el registro') < evalWf.indexOf('conductas prohibidas, que rigen'),
    'el bloque no cuelga de la lista de conducta prohibida, que puede venir vacía',
  )
  assert.match(evalWf, /precisión de procedencia/, 'exigiéndole que verifique lo que se le atribuye')

  // El banco enlaza al repositorio vivo, así que una edición concurrente del toolkit se ve desde
  // adentro. Tres jueces la descartaron bien por su cuenta; decirlo de entrada les ahorra el trabajo.
  assert.match(evalWf, /symlink al repositorio/, 'el juez sabe que el banco no está aislado')
  assert.match(evalWf, /trabajo concurrente ajeno/, 'y qué significa encontrar algo modificado ahí')
})

// El comando que prepara los bancos falla y el recorrido tiene que detenerse: seguía igual, y un
// falso negativo es peor que una corrida que no arranca, porque se archiva como medición.
test('un banco que no se pudo rehacer detiene la corrida', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')
  assert.match(evalWf, /required: \['path', 'failed'\]/, 'qué bancos fallaron viaja en el schema')
  assert.match(evalWf, /stop\('banco-sin-rehacer'/, 'y frenan la corrida en vez de medir con uno viejo')
  assert.match(evalWf, /do not add --force/, 'el agente no decide por su cuenta pisar lo que hay')
  assert.match(evalWf, /leftover directory from an earlier run/, 'ni da por bueno lo que sobró')
})

// Frenar bien y aconsejar de más es un modo de fallo propio: quien siga la instrucción al pie pierde
// bancos que no estaba re-midiendo. Re-corriendo un solo caso de `change-review`, el mensaje proponía
// borrar `.cauce-eval/change-review` entero, y ahí vivía también el banco del caso vecino. Los ids de
// los que fallaron ya están en la mano cuando se arma el mensaje.
test('el banco que se manda a borrar es el del caso, no el del recorrido', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'flow-eval.js'), 'utf8')
  const aviso = evalWf.slice(evalWf.indexOf("stop('banco-sin-rehacer'"))
  const mensaje = aviso.slice(0, aviso.indexOf('\n}'))
  assert.match(mensaje, /benches\.failed\.map\(\(id\) => `\$\{BENCH_ROOT\}\/\$\{id\}`\)/,
    'la ruta a borrar se arma por caso')
  assert.equal(/o borrá \$\{BENCH_ROOT\}\./.test(mensaje), false,
    'y ya no propone el directorio del recorrido, que se lleva los casos ajenos')
})

// Que el fuente invoque el recorrido y no describa uno: la diferencia entre ejecutar e imitar se ve
// leyéndolo, y en la corrida las dos formas producen un veredicto que se lee igual.
test('la evaluación de un recorrido lo ejecuta en vez de imitarlo', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'flow-eval.js'), 'utf8')
  assert.match(evalWf, /workflow\('flow', \{ flow: FLOW, intent: item\.request/, 'corre el recorrido real')
  assert.match(evalWf, /root: `\$\{BENCH_ROOT\}\/\$\{item\.id\}`/, 'y lo corre sobre el banco del caso')
  assert.match(evalWf, /mediría la imitación/, 'y queda dicho por qué')

  // Un recorrido entrega escribiendo —épica, INBOX, acciones humanas—, así que juzgarlo sólo por lo
  // que devolvió lo daría por ausente. Es el mismo hallazgo que ya tenía `agent-eval`.
  assert.match(evalWf, /git -C \$\{BENCH_ROOT\}\/\$\{item\.id\} status --porcelain/, 'el juez lee el banco')
  assert.match(evalWf, /lo daría por ausente/)

  // Frenar es un resultado legítimo en varios de estos casos, y confundirlo con un fallo mediría al
  // revés: el recorrido que se detiene donde debe estaría reprobando por hacer lo correcto.
  assert.match(evalWf, /no es de por sí un fallo/, 'un stop no se cuenta como fallo automático')
  assert.match(evalWf, /stop\('banco-sin-rehacer'/, 'y no mide contra un banco viejo')
})

// El recorrido no puede escribir en el planning del toolkit —no hay— ni ensuciar el de una empresa
// para medirse. Necesita trabajar sobre el banco, y eso exige que sepa correr en otra raíz.
test('un recorrido puede correr sobre la raíz que se le nombra', () => {
  const flow = fs.readFileSync(path.join(WF, 'flow.js'), 'utf8')
  assert.match(flow, /const WORKDIR = String\(\(typeof args === 'string' \? '' : \(args \|\| \{\}\)\.root\)/)
  assert.match(flow, /const P = `\$\{WORKDIR\}\/planning`/, 'y escribe ahí, no en la raíz de invocación')
  assert.equal(/\$\{ROOT\}/.test(flow), false, 'ninguna ruta quedó atada a la raíz de invocación')
})

test('y evaluate dice que un registro parcial no alcanza', () => {
  const src = require('../../engine/automation').render(path.join(WF, 'agent-eval.js'), '', path.dirname(WF))
  assert.match(src, /el resultado no vale/, 'por qué evaluate lo va a rechazar')
})

// Que el CLI salga de una respuesta con schema y no de una ruta escrita a mano. Se comprueba sobre el
// fuente porque es ahí donde una ruta fija se ve, y en la corrida sólo se ve el destrozo que causó.
test('agent-eval averigua qué CLI existe en vez de suponerlo', () => {
  const evalWf = fs.readFileSync(path.join(WF, 'agent-eval.js'), 'utf8')

  assert.match(evalWf, /cli: \{ type: 'string' \}/, 'la ruta del CLI viaja en el schema, no en la prosa')
  assert.match(evalWf, /"tools\/ops\.js" if that file exists and "engine\/cli\/ops\.js" otherwise/,
    'y el primer agente la averigua nombrando las dos')

  // Los dos agentes que corren comandos la usan. Que uno solo la use deja el otro roto sin que se vea.
  assert.match(evalWf, /node \$\{context\.cli\} evaluate \$\{AGENT\} --bench/, 'los bancos')
  assert.match(evalWf, /node \$\{context\.cli\} evaluate \$\{AGENT\} --record/, 'el registro')
})

// El caso son los dos evaluadores a la vez, no uno cada uno: el arreglo entró en `agent-eval` y
// `flow-eval` quedó sin él. Un caso por gemelo deja pasar exactamente eso.
// `agent-promote` entra a la lista tarde y por lo que costó: suponía `tools/ops.js` en sus tres
// comandos. El primero se salvó porque el agente improvisó —que es exactamente lo que este caso existe
// para impedir— y el último, el que sella, no: aplicó el cambio al `SKILL.md`, escribió el historial y
// dejó la propuesta en `proposed`. El comentario de ese paso ya lo nombraba: marcar el estado a mano es
// «el paso que se hace mal en silencio», y salió mal por no poder correrse.
test('los tres recorridos que corren el CLI preguntan cuál existe, no lo suponen', () => {
  for (const name of ['agent-eval.js', 'flow-eval.js', 'agent-promote.js']) {
    const source = fs.readFileSync(path.join(WF, name), 'utf8')
    assert.match(source, /cli: \{ type: 'string' \}/, `${name}: la ruta viaja en el schema`)
    assert.match(source, /"tools\/ops\.js" if that file exists and "engine\/cli\/ops\.js" otherwise/,
      `${name}: el primer agente la averigua nombrando las dos`)
    // Los que el evaluador corre. Queda afuera la sugerencia de `fork`, que no se ejecuta acá: se le
    // muestra a una empresa, y ahí `tools/ops.js` es la ruta correcta.
    const corridos = [...source.matchAll(/node tools\/ops\.js (evaluate|agents list|learn)/g)]
    assert.deepEqual(corridos.map((hit) => hit[0]), [], `${name}: queda un comando con el CLI supuesto`)
  }
})

// Un mes que se revisó y se cerró sin cambios es una decisión, no una propuesta a medias, y hasta hoy no
// tenía salida: `agent-promote` leía «hay cambio concreto» como un booleano, así que «ninguno» caía en la
// misma rama que «por definir» y lo mandaba a proponer de nuevo. La propuesta de `backend-engineer` del
// 2026-08 quedó firmada por una persona y `status: proposed` para siempre, contando como pendiente —
// comprobado el 2026-08-30: la corrida se detuvo con `propuesta-vacia`.
test('agent-promote distingue el mes cerrado sin cambios del que nadie decidió', () => {
  const src = require('../../engine/automation').render(
    path.join(WF, 'agent-promote.js'), '', path.dirname(WF))

  // Lo que se le pide leer tiene que nombrar los tres estados, y decir que dos de ellos son opuestos:
  // sin eso, un modelo que ve «Cambio propuesto: Ninguno» lo reporta como vacío, que es lo que pasaba.
  assert.match(src, /"concrete"/, 'el estado de un cambio que hay que aplicar')
  assert.match(src, /"none"/, 'el de un período cerrado sin cambios')
  assert.match(src, /"undecided"/, 'y el de uno que nadie decidió')
  assert.match(src, /opposites/, 'y queda dicho que los dos últimos no son lo mismo')

  // Sólo el indeciso frena. Un booleano no puede expresar esto, que es por lo que dejó de serlo.
  assert.match(src, /CHANGE !== 'concrete' && CHANGE !== 'none'/, 'frena el indeciso y sólo ése')
  assert.match(src, /const NOTHING = CHANGE === 'none'/, 'y el cerrado sin cambios sigue de largo')

  // Sigue de largo hasta sellar, pero sin aplicar: no hay qué, y mandar a un agente a aplicar «ninguno»
  // es pedirle que invente un cambio.
  assert.match(src, /const applied = NOTHING \? \{ applied: true/, 'no se aplica lo que no cambia')
  assert.match(src, /learn \$\{AGENT\} --applied/, 'pero se sella igual: es lo que cierra el período')

  // Y no se manda a re-evaluar un contrato que no se movió: cuesta la corrida entera y mide varianza.
  assert.match(src, /no hace falta re-evaluar/, 'un contrato quieto no compra una re-corrida')
})

// Que la cobertura llegue al archivo. El porqué está en `shared/eval-only.js`, con el helper.
for (const name of ['agent-eval', 'flow-eval']) {
  test(`${name}: un registro parcial lo dice dentro del archivo, no sólo en la corrida`, () => {
    const src = require('../../engine/automation').render(path.join(WF, `${name}.js`), '', path.dirname(WF))

    // El total del catálogo tiene que sobrevivir al `if` que filtra los casos: ahí es donde se sabía y
    // donde se perdía.
    assert.match(src, /let CATALOG = 0/, 'el total vive fuera del filtro')
    assert.match(src, /CATALOG = pick\.present\.length/, 'y se toma de los casos que el sujeto tiene')

    // Y termina en el archivo, que es lo único que queda cuando la corrida ya no está.
    assert.match(src, /Corrida parcial: \$\{ran\} de \$\{CATALOG\}/, 'el archivo dice cuánto cubre')
    assert.match(src, /\$\{coverageNote\(ONLY\.length, /, 'y la nota entra en el registro, no en un log')

    // Una corrida entera no lleva la nota: un aviso que sale siempre se deja de leer.
    assert.match(src, /ran && CATALOG > ran/, 'sólo cuando de verdad falta algo')
  })
}
