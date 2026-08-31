'use strict'

// El ciclo por el que cambia el contrato de un cargo: informe semanal, propuesta mensual, revisión
// cuando la evaluación mostró el cambio mal calibrado, y el sello que lo vuelve irrepetible. Lo que
// se mide con ese contrato está en `evaluations.test.js`; de dónde sale la cadencia, en
// `sources.test.js`.

const { tempRoot, run, workflow, workflowStep, workflowCommand, filesBelow } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const learning = require('../../engine/agents/learning')
const { REPO, installedProject, writeSkill, firmarPropuesta } = require('../support/agents-fixtures')

test('el aprendizaje de la profesión se hace en el toolkit, no en cada empresa', () => {
  // Acá, en el repositorio del toolkit, el cargo es escribible y el ciclo corre.
  const contract = path.join(REPO, 'agents', 'roles', 'system', 'product-manager', 'SKILL.md')
  const before = fs.readFileSync(contract, 'utf8')
  // El directorio puede no existir: sólo se versiona cuando tiene un informe real, y al retirar los
  // moldes muertos dejó de existir en casi todos los cargos. `learn` lo crea
  // cuando hace falta, así que darlo por presente medía el disco de quien corre la prueba.
  const reports = path.join(REPO, 'agents', 'roles', 'system', 'product-manager', 'learning', 'reports')
  const stamps = () => {
    try { return fs.readdirSync(reports).filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)) } catch { return [] }
  }
  const known = stamps()
  const existed = fs.existsSync(reports)
  try {
    assert.equal(run(['learn', 'product-manager'], REPO).status, 0)
    assert.equal(fs.readFileSync(contract, 'utf8'), before, 'investigar no reescribe el cargo')
  } finally {
    for (const name of stamps()) {
      if (!known.includes(name)) fs.rmSync(path.join(reports, name))
    }
    // El informe se borraba pero el directorio quedaba, y `learn` lo crea. Una prueba no deja andamiaje
    // en el catálogo que el repositorio versiona. `rmdirSync` sólo saca el vacío: si quedó algo que esta
    // corrida no puso, se conserva en vez de taparlo con un error dentro del `finally`.
    if (!existed) { try { fs.rmdirSync(reports) } catch { /* no quedó vacío */ } }
  }
})

test('una empresa no puede investigar la profesión dentro del paquete', () => {
  const target = installedProject('Learning')

  const blocked = run(['learn', 'product-manager'], target)
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /se hace en el toolkit/)
  assert.match(blocked.stderr, /organization\/roles\/product-manager\.md/, 'y dice dónde sí va lo suyo')
  // Pero leerlo sí puede: evaluate es de sólo lectura.
  assert.equal(run(['evaluate', 'product-manager'], target).status, 0)

  // Un cargo propio de la empresa sí acumula su aprendizaje, porque es suyo.
  const own = writeSkill(path.join(target, 'agents', 'roles', 'qa-acme'), 'qa-acme', 'QA de Acme. No usar afuera.')
  assert.equal(run(['learn', 'qa-acme'], target).status, 0)
  assert.equal(fs.existsSync(path.join(own, 'learning', 'reports')), true)
})

// Cuatro agentes distintos convergieron en etiquetar `H1`, `H2`, … sin que nada se lo pidiera, y la
// etiqueta terminó siendo carga: dentro del informe une Hallazgos con Evidencia y Recomendación, y la
// propuesta mensual la cita para decir de qué hallazgo sale un cambio. Que funcione porque un modelo
// adivina la convención es exactamente lo que deja de funcionar en silencio.
test('el informe trae escritas las convenciones de las que depende el ciclo', () => {
  const target = installedProject('Convenciones')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  assert.equal(run(['learn', 'probe'], target).status, 0)
  const reports = path.join(own, 'learning', 'reports')
  const report = path.join(reports, fs.readdirSync(reports)[0])
  const scaffold = fs.readFileSync(report, 'utf8')
  assert.match(scaffold, /H1, H2/, 'la etiqueta de hallazgo')
  assert.match(scaffold, /No renombres los títulos/, 'y que los títulos se leen con un patrón')

  // El comentario va fuera de toda sección a propósito: dentro de «Recomendación» lo capturaría el
  // patrón de consolidación y viajaría como texto a cada propuesta del catálogo.
  fs.writeFileSync(report, scaffold.replace(
    '## Recomendación\n', '## Recomendación\n\n1. Rotar el token (cierra H1).\n',
  ))
  assert.equal(run(['learn', 'probe', '--proposal'], target).status, 0)
  const proposals = path.join(own, 'learning', 'proposals')
  const consolidated = fs.readFileSync(path.join(proposals, fs.readdirSync(proposals)[0]), 'utf8')
  assert.match(consolidated, /Rotar el token \(cierra H1\)/, 'la recomendación llega entera')
  assert.equal(consolidated.includes('No renombres'), false, 'y el comentario no viaja con ella')
})

// Una revisión es un andamio en blanco —no consulta informes ni consolida nada— y existe para que una
// persona escriba adentro por qué el texto que se aplicó falló su medición. Eso está bien; lo que no,
// es fabricarlo sin material. El ensamblaje lo abría para todo cargo cuya propuesta anterior estuviera
// aplicada, sin mirar si había algo nuevo: en la corrida del 2026-08-28, cinco de los seis PR llegaron
// con el molde vacío, cada uno pidiendo la firma humana que R10 reserva para lo que sí decide algo.
test('una revisión no se abre sin material que la justifique', () => {
  const target = installedProject('Revisión sin material')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const reports = path.join(own, 'learning', 'reports')
  const proposals = path.join(own, 'learning', 'proposals')

  assert.equal(run(['learn', 'probe'], target).status, 0)
  const report = path.join(reports, fs.readdirSync(reports)[0])
  fs.writeFileSync(report, fs.readFileSync(report, 'utf8')
    .replace('## Recomendación\n', '## Recomendación\n\n1. Rotar el token (cierra H1).\n'))
  assert.equal(run(['learn', 'probe', '--proposal'], target).status, 0)
  const primera = fs.readdirSync(proposals)
  assert.equal(primera.length, 1, 'el informe produjo su propuesta')

  // Firmada y aplicada. El informe quedó sellado al consolidarse, así que no hay nada nuevo que decir.
  const aplicada = path.join(proposals, primera[0])
  fs.writeFileSync(aplicada, fs.readFileSync(aplicada, 'utf8').replace(/^status:.*$/m, 'status: applied'))

  const vacia = learning.prepareProposal(target, 'probe')
  assert.equal(vacia.created, false, 'no se fabrica el andamio de revisión')
  assert.equal(vacia.file, '', 'y no queda archivo que el job lea como propuesta y mande a PR')
  assert.deepEqual(fs.readdirSync(proposals), primera, 'el directorio queda como estaba')

  // Y con material sí se abre: lo que se cierra es el andamio sin nada que corregir, no la revisión.
  const period = new Date().toISOString().slice(0, 7)
  fs.writeFileSync(path.join(reports, `${period}-01.md`),
    `---\nagent: probe\ndate: ${period}-01\nstatus: draft\n---\n\n## Recomendación\n\nAlgo nuevo.\n`)
  const revision = learning.prepareProposal(target, 'probe')
  assert.equal(revision.created, true, 'con un informe sin consolidar la revisión sigue disponible')
  assert.match(path.basename(revision.file), /-r2\.md$/, 'y es una revisión de la que ya se aplicó')
})

// El montaje que comparten las dos pruebas que aprenden de una corrida: un cargo con su propuesta ya
// aplicada —así el material de la corrida es el único que hay— y un registro sin sellar con el cuerpo
// que cada una quiera. Vive acá porque las dos lo arman igual y sólo cambia el cuerpo del registro.
const cargoConRegistro = (nombre, cuerpo) => {
  const target = installedProject(nombre)
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const proposals = path.join(own, 'learning', 'proposals')
  const results = path.join(own, 'evaluations', 'results')
  fs.mkdirSync(proposals, { recursive: true })
  fs.writeFileSync(path.join(proposals, '2099-06.md'),
    '---\nagent: probe\nperiod: 2099-06\nstatus: applied\n---\n\n# Propuesta mensual — 2099-06\n')
  fs.mkdirSync(results, { recursive: true })
  const registro = path.join(results, '2099-06-18.md')
  fs.writeFileSync(registro, `---\nagent: probe\ndate: 2099-06-18\n---\n\n${cuerpo}`)
  return { target, registro }
}

// Un cargo tenía sus propias mediciones desde siempre y nada las leía: aprendía de lo que cambiaba en
// su profesión y no de haber fallado su propio caso. Es el material que más claramente pide corregir
// —un rojo posterior a aplicar una propuesta no puede ser alcance nuevo, es el texto que no se
// sostuvo— y hasta acá no abría ningún documento. El registro lo escribe el mismo `evaluate --record`
// que el de un recorrido, así que se compone con el mismo lector.
test('un caso en rojo abre la revisión de un cargo, y la corrida queda sellada', () => {
  const { target, registro } = cargoConRegistro('Rojo sin informe',
    '### 01-uno\n\n- Veredicto: pasa\n\nSin novedad.\n\n'
    + '### 02-dos\n\n- Veredicto: no pasa\n\nFirmó sin comprobar el mecanismo.\n\n'
    + '### Registro afirmación por afirmación\n\nLa afirmación 3 no se sostiene.\n\n'
    + '### Cierre\n\nFalla por el comportamiento 1.\n')

  const revision = learning.prepareProposal(target, 'probe', new Date('2099-06-30T00:00:00Z'))
  assert.equal(revision.created, true, 'el rojo alcanza para abrirla, sin ningún informe')
  assert.equal(path.basename(revision.file), '2099-06-r2.md')

  const texto = fs.readFileSync(revision.file, 'utf8')
  assert.match(texto, /### 02-dos — 2099-06-18/, 'el hallazgo cita el caso y la corrida')
  assert.match(texto, /Firmó sin comprobar el mecanismo/, 'y trae su contraste')
  // El juez estructura su contraste con `###`, y el corte se hacía en el primero que apareciera: 285 de
  // los 774 veredictos del repositorio llegaban truncados, uno con 49 de sus 20.119 caracteres. No
  // fallaba nada, que es lo que lo volvía invisible: el documento se compone igual y se lee entero.
  assert.match(texto, /La afirmación 3 no se sostiene/, 'entero, no hasta el primer subtítulo del juez')
  assert.match(texto, /Falla por el comportamiento 1/, 'incluido el cierre, que es donde dice por qué')
  assert.equal(texto.includes('Sin novedad'), false, 'y un caso termina donde empieza el siguiente')
  assert.equal(texto.includes('01-uno'), false, 'el caso que pasó no pide cambio')
  assert.equal(texto.includes('Qué mostró la evaluación posterior'), false, 'y el molde en blanco no viaja')

  // Sin el sello el mismo rojo abriría una revisión por mes, para siempre.
  assert.match(fs.readFileSync(registro, 'utf8'), /^status: consolidated$/m)
})

// La contraparte del rojo: un caso que pasa también puede traer material. El porqué de que exista esta
// rama está en `engine/agents/learning.js`, donde se cosecha.
test('lo que el contrato no cubre entra aunque el caso pase', () => {
  // Los dos casos pasan. Sin la nota no habría nada que abrir, que es lo que pasaba antes de esta rama.
  const { target } = cargoConRegistro('Nota sin rojo',
    '### 01-uno\n\n- Veredicto: pasa\n\nSin novedad.\n\n'
    + '### 02-dos\n\n- Veredicto: pasa\n- Para el contrato: no dice qué hacer cuando la fuente es un '
    + 'resumen.\n\nTodo en orden.\n\n'
    // Uno que falla y además trae nota: el rojo ya pide corregir, así que la nota no puede entrar
    // aparte. Dos hallazgos sobre el mismo caso mandarían a arreglar dos veces lo que es una cosa.
    + '### 03-tres\n\n- Veredicto: no pasa\n- Para el contrato: falta decir qué es una fuente.\n\n'
    + 'No comprobó el mecanismo.\n\n'
    + '### 04-cuatro\n\n- Veredicto: pasa\n\nSu respuesta decía:\n'
    + '- Para el contrato: esto lo escribí yo.\n')

  const revision = learning.prepareProposal(target, 'probe', new Date('2099-06-30T00:00:00Z'))
  assert.equal(revision.created, true, 'una nota sola alcanza para abrir la revisión')

  const texto = fs.readFileSync(revision.file, 'utf8')
  assert.match(texto, /### 02-dos — 2099-06-18 · el caso pasa/, 'dice de qué caso, y que no es un fallo')
  assert.match(texto, /Lo que el contrato no cubre: no dice qué hacer cuando la fuente es un resumen/)
  assert.equal(/- Veredicto: no pasa/.test(texto), false, 'y no se lee como un rojo, porque no lo es')
  assert.equal(texto.includes('01-uno'), false, 'un caso que pasa sin nota no pide nada')
  assert.match(texto, /No comprobó el mecanismo/, 'el que falla entra por su rojo')
  // Su nota viaja dentro del contraste, que es donde el juez la escribió, y no como un hallazgo más:
  // dos entradas sobre el mismo caso mandarían a arreglar dos veces lo que es una sola cosa.
  assert.equal(texto.split('### 03-tres').length - 1, 1, 'el que falla entra una vez, no dos')
  assert.equal(texto.split('Lo que el contrato no cubre').length - 1, 1,
    'y sólo el que pasa aporta una nota como hallazgo')
  // La nota se lee de la línea que sigue al veredicto y de ninguna otra: más abajo empieza la respuesta
  // del sujeto, y ahí esa línea sería una nota que el sujeto se escribe a sí mismo.
  assert.equal(texto.includes('esto lo escribí yo'), false,
    'lo que el sujeto ponga en su respuesta no se cosecha como nota del juez')
})


// Una recomendación de diez líneas llegaba como una y el ciclo corría verde entregando casi nada: la
// consolidación no falla cuando se rompe, entrega menos. Por eso el caso afirma sobre las tres líneas.
//
// Corre sobre una instancia propia y no sobre este repositorio, aunque el cargo real esté acá: desde
// que la consolidación sella lo que consume, correrla contra el catálogo marcaba como consolidados los
// informes de verdad de los cargos. Borrar lo que la prueba creó no alcanzaba — el daño estaba en los
// archivos que no había creado.
// El informe que `prepareReport` deja es un andamio: trae «## Recomendación» vacía porque la llena el
// modelo. Desde que un mes sin ninguna recomendación no abre documento, un andamio crudo dejó de
// representar a un informe commiteado — `Collect report` frena el que vuelve sin contenido, así que en
// producción no llega ninguno así. Los casos que sólo necesitan «hay material pendiente» lo llenan con
// esto, para no medir la guarda nueva sin querer.
function withRecommendation(file, texto = 'Cambiar algo (cierra H1).') {
  const text = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, text.replace(/\n## Recomendación[^\S\n]*\n/, `\n## Recomendación\n\n${texto}\n`))
  return file
}

// Fija las tres mitades de la guarda de `prepareProposal`, que se pueden romper por separado: que un
// mes sin ninguna recomendación no abra documento, que sus informes queden en `draft`, y que el mes
// que alguno sí proponga algo entren todos —los callados como «Sin recomendación registrada»—.
// Las dos primeras se contestan sin la tercera y quedarían pasando con el ciclo roto en la mitad.
test('un mes sin nada que proponer no abre documento, y no se lleva los informes puestos', () => {
  const target = installedProject('Mes callado')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  const informe = (fecha, recomendacion) => {
    fs.writeFileSync(path.join(reports, `${fecha}.md`),
      `---\nagent: probe\ndate: ${fecha}\nstatus: draft\n---\n\n## Hallazgos\n\nH1. Algo cambió.\n\n`
      + `## Recomendación\n${recomendacion}\n\n## Preguntas abiertas\n\nNinguna.\n`)
    return path.join(reports, `${fecha}.md`)
  }
  const estado = (file) => (fs.readFileSync(file, 'utf8').match(/^status: (\S+)$/m) || [])[1]

  // Dos informes con hallazgos y sin nada que proponer.
  const callados = [informe('2099-01-07', ''), informe('2099-01-14', '\n')]
  const huella = () => filesBelow(target).sort().map((file) => `${file}:${fs.statSync(file).size}`)
  const antes = huella()
  const quieto = learning.prepareProposal(target, 'probe', new Date('2099-01-31T00:00:00Z'))
  assert.equal(quieto.file, '', 'no se abre documento cuando ninguno propone un cambio')
  // Lo que traduce «no se abre documento» en «no se abre PR»: `Detect changes` mira el árbol, así que
  // basta un archivo tocado para que el ciclo publique uno vacío. Es la mitad que hace falta afirmar
  // aparte — el resultado puede decir que no abrió nada y el árbol haber cambiado igual.
  assert.deepEqual(huella(), antes, 'no se escribe nada, que es lo que evita el PR sin contenido')
  assert.equal(quieto.quiet, 2, 'y se dice cuántos informes había, que no es lo mismo que no haber tenido')
  for (const file of callados) {
    assert.equal(estado(file), 'draft', 'no se sellan: sellar abriría un PR de puros sellos')
  }

  // Y el mes que uno sí propone algo, los callados entran con él como histórico.
  informe('2099-01-21', '\n1. Cambiar algo (cierra H1).')
  const abierta = learning.prepareProposal(target, 'probe', new Date('2099-01-31T00:00:00Z'))
  assert.equal(abierta.created, true, 'una sola recomendación alcanza para abrir')
  assert.equal(abierta.reports, 3, 'y se lleva los tres, no sólo el que propuso')
  const texto = fs.readFileSync(abierta.file, 'utf8')
  assert.match(texto, /Cambiar algo/, 'la recomendación real llega')
  assert.equal((texto.match(/Sin recomendación registrada\./g) || []).length, 2,
    'y los callados quedan como histórico, no descartados')
  for (const file of callados) {
    assert.equal(estado(file), 'consolidated', 'ahí sí se sellan, junto con la propuesta que los llevó')
  }
})

test('la propuesta mensual consolida la recomendación entera, no su primera línea', () => {
  const target = installedProject('Recomendación entera')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(reports, '2099-01-07.md'), '---\nagent: probe\ndate: 2099-01-07\nstatus: draft\n---\n\n'
    + '## Recomendación\n\nPrimera línea.\nSegunda línea.\nTercera línea.\n\n## Preguntas abiertas\n\nNinguna.\n')
  const result = learning.prepareProposal(target, 'probe', new Date('2099-01-31T00:00:00Z'))
  assert.equal(result.reports, 1)
  const text = fs.readFileSync(result.file, 'utf8')
  assert.match(text, /Primera línea/)
  assert.match(text, /Segunda línea/, 'la recomendación no se corta en el primer salto')
  assert.match(text, /Tercera línea/)
  assert.equal(text.includes('Preguntas abiertas'), false, 'y no se lleva la sección siguiente')
})

// Al ciclo le faltaba el final. Había firma, aplicación e historial, y `status:` nacía en `proposed` y
// no lo movía nadie: volver a promover encontraba la misma propuesta firmada —«aprobada y aplicada»
// también lee como aprobada— y la aplicaba de nuevo, duplicando cada viñeta y cada fuente sin fallar.
test('una propuesta aplicada no se puede volver a aplicar', () => {
  const target = installedProject('Sello de propuesta')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  withRecommendation(learning.prepareReport(target, 'probe', new Date('2099-06-10T00:00:00Z')).file)
  learning.prepareProposal(target, 'probe', new Date('2099-06-15T00:00:00Z'))
  const file = path.join(own, 'learning', 'proposals', '2099-06.md')

  assert.equal(learning.proposalState(fs.readFileSync(file, 'utf8')), 'proposed')
  assert.equal(learning.evaluate(target, 'probe').pending, 1, 'cuenta como pendiente')

  firmarPropuesta(file)
  const sealed = learning.seal(target, 'probe', '2099-06')
  assert.equal(sealed.already, false)
  assert.equal(learning.proposalState(fs.readFileSync(file, 'utf8')), 'applied')
  // Idempotente: sellar de nuevo no falla ni reescribe, avisa que ya estaba.
  assert.equal(learning.seal(target, 'probe', '2099-06').already, true)
  assert.equal(learning.evaluate(target, 'probe').pending, 0, 'y deja de pedir trabajo')
})

// El caso recorre el período entero —base, sello, revisión, sello— porque cada paso sólo se ve mal
// desde el siguiente: una revisión que abre de más no molesta hasta que hay dos firmas en juego.
test('una propuesta aplicada se puede corregir sin reabrirla', () => {
  const target = installedProject('Revisión de propuesta')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const dir = path.join(own, 'learning', 'proposals')
  const now = new Date('2099-06-15T00:00:00Z')
  withRecommendation(learning.prepareReport(target, 'probe', new Date('2099-06-10T00:00:00Z')).file)

  const base = learning.prepareProposal(target, 'probe', now)
  assert.equal(path.basename(base.file), '2099-06.md')

  assert.equal(learning.prepareProposal(target, 'probe', now).created, false, 'no abre otra si hay pendiente')

  firmarPropuesta(base.file)
  learning.seal(target, 'probe', '2099-06')

  // La propuesta base consumió y selló el único informe, así que acá no queda nada que corregir. Sin
  // un informe nuevo la revisión ya no se abre: es un andamio en blanco y cuesta la misma firma humana
  // que una con hallazgos. Éste es el material que la habilita.
  withRecommendation(learning.prepareReport(target, 'probe', new Date('2099-06-20T00:00:00Z')).file)
  const revision = learning.prepareProposal(target, 'probe', now)
  assert.equal(revision.created, true, 'aplicada la anterior y con material nuevo, sí abre la revisión')
  assert.equal(path.basename(revision.file), '2099-06-r2.md')
  assert.equal(revision.corrects, '2099-06.md', 'y dice cuál corrige')

  const text = fs.readFileSync(revision.file, 'utf8')
  assert.match(text, /^corrects: 2099-06\.md$/m, 'el frontmatter lo deja legible sin abrir la otra')
  assert.match(text, /^automatic_apply: false$/m)
  assert.equal(revision.reports, 0, 'no reconsolida lo que ya entró por la propuesta que corrige')

  assert.equal(learning.proposalState(fs.readFileSync(path.join(dir, '2099-06.md'), 'utf8')), 'applied',
    'la corregida queda sellada donde está, no se reabre')
  assert.equal(learning.prepareProposal(target, 'probe', now).created, false, 'y r3 espera a que r2 se aplique')

  firmarPropuesta(revision.file)
  const sealed = learning.seal(target, 'probe', '2099-06')
  assert.equal(path.basename(sealed.file), '2099-06-r2.md', 'el período sella la vigente, no la base')
  assert.equal(sealed.already, false, 'y la revisión no queda sin sellar, que es como se reaplica')
})

// Un informe puede llegar tarde: escrito después de que su mes se consolidó, o traído de una semana
// que nadie corrió. Filtrando por el prefijo del período no entraba en esa propuesta ni en ninguna
// posterior —la del mes siguiente sólo miraba su propio mes—, y el hallazgo se perdía entero sin que
// nada fallara. Los dos informes se veían igual: un archivo en `reports/`.
test('un informe atrasado entra en la próxima propuesta, y mientras tanto se ve', () => {
  const target = installedProject('Informe tardío')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  const escribir = (fecha, texto) => fs.writeFileSync(path.join(reports, `${fecha}.md`),
    `---\nagent: probe\ndate: ${fecha}\nstatus: draft\n---\n\n## Recomendación\n\n${texto}\n`)

  escribir('2099-01-07', 'Lo de enero.')
  const enero = learning.prepareProposal(target, 'probe', new Date('2099-02-01T13:17:00Z'), '2099-01')
  assert.equal(enero.reports, 1)
  assert.deepEqual(learning.evaluate(target, 'probe').warnings, [], 'consolidado, nada pendiente')

  // El que llega tarde: enero ya tiene su propuesta y esa no lo va a tomar.
  escribir('2099-01-28', 'Lo que llegó tarde.')
  assert.match(learning.evaluate(target, 'probe').warnings.join('\n'),
    /1 informe\(s\) sin consolidar \(2099-01-28\.md\): entran en la próxima propuesta/,
    'mientras espera, se ve')

  // Y la próxima lo toma, sin volver a traer el que ya entró.
  const febrero = learning.prepareProposal(target, 'probe', new Date('2099-03-01T13:17:00Z'), '2099-02')
  assert.equal(path.basename(febrero.file), '2099-02.md')
  assert.equal(febrero.reports, 1, 'sólo el atrasado')
  const texto = fs.readFileSync(febrero.file, 'utf8')
  assert.match(texto, /Lo que llegó tarde\./)
  assert.equal(texto.includes('Lo de enero.'), false, 'el sello impide que el mismo hallazgo entre dos veces')
  assert.deepEqual(learning.evaluate(target, 'probe').warnings, [])
})

test('la propuesta consolida el período que se le nombra, no el mes en que se la corre', () => {
  const target = installedProject('Período explícito')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  for (const day of ['03', '10', '17', '24', '31']) {
    fs.writeFileSync(path.join(reports, `2099-01-${day}.md`),
      `---\nagent: probe\ndate: 2099-01-${day}\nstatus: draft\n---\n\n## Recomendación\n\nHallazgo del ${day}.\n`)
  }

  // El día 1 del mes siguiente, que es cuando corre el cron.
  const corrida = new Date('2099-02-01T13:17:00Z')
  const result = learning.prepareProposal(target, 'probe', corrida, '2099-01')
  assert.equal(result.reports, 5, 'los cinco informes del mes que cerró')
  assert.equal(path.basename(result.file), '2099-01.md', 'y la propuesta lleva ese período')
  const text = fs.readFileSync(result.file, 'utf8')
  assert.match(text, /^period: 2099-01$/m)
  for (const day of ['03', '10', '17', '24', '31']) {
    assert.match(text, new RegExp(`Hallazgo del ${day}\\.`), `el informe del ${day} llega al documento`)
  }

  // Sin período nombrado sigue mandando el mes de la corrida: es lo correcto a mano, a mitad de mes.
  // Hace falta un informe de febrero para verlo: los de enero quedaron sellados por la consolidación
  // de arriba, y sin ninguno pendiente ya no se abre propuesta.
  withRecommendation(learning.prepareReport(target, 'probe', new Date('2099-02-01T00:00:00Z')).file)
  const sinPeriodo = learning.prepareProposal(target, 'probe', corrida)
  assert.equal(path.basename(sinPeriodo.file), '2099-02.md')
  assert.equal(sinPeriodo.reports, 1, 'el de febrero, no los de enero que ya entraron')

  assert.throws(() => learning.prepareProposal(target, 'probe', corrida, 'enero'), /período inválido/)
})

// La costura, que es donde falló todo. Cada pieza del ciclo tenía su prueba y ninguna cubría el paso
// de una a la siguiente: el informe se escribía y no se publicaba, la propuesta consolidaba el mes
// equivocado, el primer informe de un cargo abortaba su PR. Tres fallas mudas y ningún rojo, porque
// nada recorría la cadena entera. Esto la recorre, con los comandos que el workflow declara y sin
// modelo ni red: lo que el modelo aporta es el contenido del informe, no el mecanismo que lo mueve.
test('el ciclo de aprendizaje llega del informe semanal al contrato', () => {
  const yml = workflow('agent-learning')
  const target = installedProject('Ciclo completo')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  // Un cargo del catálogo antes de su primer informe: `learning/` versionado, `reports/` todavía no.
  fs.mkdirSync(path.join(own, 'learning'), { recursive: true })
  fs.writeFileSync(path.join(own, 'learning', 'sources.yaml'), 'version: 1\nsources:\n'
    + '  - name: Norma de ejemplo\n    url: https://example.org/x\n    tier: standard\n')
  const bash = (script) => execFileSync('bash', ['-c', script], { cwd: target, encoding: 'utf8' }).trim()
  // El repositorio como lo encuentra el job: todo versionado, y el informe todavía sin existir.
  const versionado = fs.readdirSync(target).filter((name) => !['.git', 'node_modules'].includes(name))
  bash('git init -q . && git add ' + versionado.map((name) => JSON.stringify(name)).join(' ')
    + ' && git -c user.email=t@t -c user.name=t commit -qm base')

  // ── Lunes: la investigación semanal ───────────────────────────────────────────────────────────
  assert.equal(run(['learn', 'probe'], target).status, 0, 'el andamiaje del informe')
  const reports = path.join(own, 'learning', 'reports')
  const informe = fs.readdirSync(reports)[0]
  const stamp = informe.slice(0, -3)
  // Lo que el modelo escribe: una recomendación bajo el título que la consolidación lee.
  fs.writeFileSync(path.join(reports, informe), fs.readFileSync(path.join(reports, informe), 'utf8')
    .replace('## Recomendación\n', '## Recomendación\n\n1. Rotar el token (cierra H1).\n'))

  const detect = workflowStep(yml, 'id: changes')
  // Fuera del repositorio: adentro, el chequeo de más abajo lo contaría como un archivo colado.
  const salida = path.join(tempRoot('cauce-output-'), 'github-output')
  bash(`export GITHUB_OUTPUT=${JSON.stringify(salida)}\n${detect}`)
  assert.match(fs.readFileSync(salida, 'utf8'), /^changed=true$/m, 'el informe recién escrito es un cambio')

  const report = bash(`AGENT=probe; stamp=${stamp}\n${workflowCommand(yml, 'report')}\nprintf '%s' "$report"`)
  assert.equal(report, `agents/roles/probe/learning/reports/${informe}`, 'y el paso lo encuentra por su ruta')

  // El chequeo que exige el informe y nada más, con `reports/` estrenándose.
  const sobra = bash(`dest=${JSON.stringify(report)}\n${workflowCommand(yml, 'otros')}\nprintf '%s' "$otros"`)
  assert.equal(sobra, '', 'nada más que publicar')
  bash(`git add ${report} && git -c user.email=t@t -c user.name=t commit -qm informe`)

  // ── La consolidación mensual ──────────────────────────────────────────────────────────────────
  const period = stamp.slice(0, 7)
  assert.equal(run(['learn', 'probe', '--proposal'], target).status, 0)
  const proposals = path.join(own, 'learning', 'proposals')
  const propuesta = fs.readFileSync(path.join(proposals, `${period}.md`), 'utf8')
  assert.match(propuesta, /Rotar el token \(cierra H1\)/, 'la recomendación del lunes llega a la propuesta')

  const paso = `AGENT=probe; period=${period}\n${workflowCommand(yml, 'changed')}\n`
    + `${workflowCommand(yml, 'proposal')}\n`
  const encontrada = bash(`${paso}printf '%s' "$proposal"`)
  assert.equal(encontrada, `agents/roles/probe/learning/proposals/${period}.md`, 'y el paso la encuentra')

  // Y lo que el paso stagea es el cambio entero, no sólo la propuesta. Consolidar **sella** el informe
  // que consume, y ese sello viaja en el mismo PR o no viaja: stageando sólo la propuesta se quedaba en
  // el runner, el informe seguía en `draft` en la rama base, y la consolidación del mes siguiente lo
  // volvía a leer. El mismo hallazgo dos veces, que es contra lo que el sello existe.
  const staged = bash(`${paso}printf '%s\\n' "$changed"`).split('\n').filter(Boolean).sort()
  assert.deepEqual(staged, [
    `agents/roles/probe/learning/proposals/${period}.md`,
    `agents/roles/probe/learning/reports/${informe}`,
  ], 'el informe sellado viaja con la propuesta, y nada más se cuela')

  // ── Y el informe queda marcado, así que nada lo reclama ni se consolida dos veces ─────────────
  assert.match(fs.readFileSync(path.join(reports, informe), 'utf8'), /^status: consolidated$/m)
  assert.deepEqual(learning.evaluate(target, 'probe').warnings, [])
})

// El mes anterior ya tiene una propuesta aplicada, que es la precondición sin la cual las dos formas
// —nombrar el mes o no— se ven iguales. Qué se abre en cada caso, en `prepareProposal`.
test('la consolidación automática se lleva lo pendiente y no abre una revisión', () => {
  const target = installedProject('Consolidación del cron')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(reports, '2099-01-26.md'),
    '---\nagent: probe\ndate: 2099-01-26\nstatus: draft\n---\n\n## Recomendación\n\nLo de enero.\n')

  // Enero ya tiene su propuesta, firmada y aplicada: el escenario en que el cron abría la revisión.
  const enero = learning.prepareProposal(target, 'probe', new Date('2099-01-20T00:00:00Z'))
  assert.equal(path.basename(enero.file), '2099-01.md')
  firmarPropuesta(enero.file)
  learning.seal(target, 'probe', '2099-01')
  // Y el informe llegó después de esa firma, así que no entró en ella.
  fs.writeFileSync(path.join(reports, '2099-01-26.md'),
    '---\nagent: probe\ndate: 2099-01-26\nstatus: draft\n---\n\n## Recomendación\n\nLo que llegó tarde.\n')

  const cron = learning.prepareProposal(target, 'probe', new Date('2099-02-01T13:17:00Z'))
  assert.equal(path.basename(cron.file), '2099-02.md', 'la propuesta lleva el mes en que se abre')
  assert.equal(cron.corrects, undefined, 'y no corrige nada: corregir lo decide una persona')
  assert.equal(cron.reports, 1)
  assert.match(fs.readFileSync(cron.file, 'utf8'), /Lo que llegó tarde\./, 'el informe de enero entra igual')
  assert.deepEqual(learning.evaluate(target, 'probe').warnings, [], 'y deja de estar pendiente')
})

// El propio cron lo dice: «la propuesta sólo vale si antes hubo informes: consolidar sin ellos produce
// un andamiaje vacío que nadie puede aprobar». Y era lo que hacía: escribía el archivo igual, con
// «No hay informes semanales para este período» donde van los hallazgos, y el job veía un archivo
// nuevo y abría el PR. Con cadencias distintas eso deja de ser un caso raro: un cargo trimestral
// abriría ocho PR al año para decir que no investigó.
test('sin informes pendientes no se abre propuesta', () => {
  const target = installedProject('Propuesta sin informes')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const proposals = path.join(own, 'learning', 'proposals')

  const vacia = learning.prepareProposal(target, 'probe', new Date('2099-06-15T00:00:00Z'))
  assert.equal(vacia.created, false)
  assert.equal(vacia.reports, 0)
  assert.equal(vacia.file, '', 'no hay archivo porque no se escribió ninguno')
  assert.equal(fs.existsSync(proposals) && fs.readdirSync(proposals).length, 0, 'el directorio queda vacío')

  // Con un informe pendiente sí se abre, y lo consolida.
  withRecommendation(learning.prepareReport(target, 'probe', new Date('2099-06-10T00:00:00Z')).file)
  const abierta = learning.prepareProposal(target, 'probe', new Date('2099-06-15T00:00:00Z'))
  assert.equal(abierta.created, true)
  assert.equal(abierta.reports, 1)
  assert.ok(fs.existsSync(abierta.file))
})
