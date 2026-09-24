'use strict'

// Dónde se aprende la profesión de un cargo, y de qué material se abre una revisión de su contrato.
//
// Es el principio del ciclo: informe semanal, propuesta mensual, revisión cuando la evaluación mostró
// el cambio mal calibrado, y el sello que lo vuelve irrepetible. Lo que sigue —consolidar, firmar,
// aplicar— está en `learning-proposal.test.js`, y cerrar sin aplicar en `learning-archive.test.js`. Lo
// que se mide con ese contrato está en `evaluations.test.js`; de dónde sale la cadencia, en
// `sources.test.js`.

const { run, tempRoot } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const learning = require('../../engine/agents/learning')
const { REPO, installedProject, writeSkill } = require('../support/agents-fixtures')

test('el aprendizaje de la profesión se hace en el toolkit, no en cada empresa', () => {
  // Una raíz de toolkit propia y no el repositorio: `learn` escribe el informe del día en el catálogo, y
  // las demás pruebas lo recorren en paralelo. Sobre el árbol real, una lo listaba y el `finally` de ésta
  // lo borraba antes de que la otra lo leyera — un ENOENT en CI sobre un archivo que ningún cambio tocó.
  const root = tempRoot('cauce-toolkit-')
  fs.copyFileSync(path.join(REPO, 'ops.config.json'), path.join(root, 'ops.config.json'))
  const role = path.join(root, 'agents', 'roles', 'system', 'product-manager')
  const source = path.join(REPO, 'agents', 'roles', 'system', 'product-manager')
  const reports = path.join(role, 'learning', 'reports')
  // Sin los informes versionados, para que `learn` abra uno siempre y no dependa de si hoy ya había.
  fs.cpSync(source, role, { recursive: true, filter: (file) => file !== path.join(source, 'learning', 'reports') })
  const contract = path.join(role, 'SKILL.md')
  const before = fs.readFileSync(contract, 'utf8')

  assert.equal(run(['learn', 'product-manager'], root).status, 0)
  assert.equal(fs.readdirSync(reports).length, 1, 'el ciclo corre: abre el informe')
  assert.equal(fs.readFileSync(contract, 'utf8'), before, 'investigar no reescribe el cargo')
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

// El sello buscaba `status:` en el documento entero, y un registro de corrida **nace sin `status` en el
// frontmatter** —lo dice el comentario de `markConsolidated`—, mientras que su cuerpo lleva la respuesta
// verbatim del cargo. Si esa respuesta trae una línea `status: <palabra>` a columna cero, el sello caía
// ahí: el cuerpo quedaba marcado y el frontmatter sin marcar, o sea el registro sin sellar, o sea el
// mismo hallazgo entrando a la propuesta siguiente. Es justo el modo de fallo que el sello cierra.
test('el sello va al frontmatter aunque el cuerpo traiga su propia línea de status', () => {
  const { target } = cargoConRegistro('Sello mal puesto',
    '### 02-dos\n\n- Veredicto: no pasa\n\nEl cargo respondió:\nstatus: rechazado\n\nFalló por esto.\n')
  const registro = path.join(target, 'agents', 'roles', 'probe', 'evaluations', 'results',
    fs.readdirSync(path.join(target, 'agents', 'roles', 'probe', 'evaluations', 'results'))[0])

  learning.prepareProposal(target, 'probe', new Date('2099-07-01T00:00:00Z'), '2099-06')

  const texto = fs.readFileSync(registro, 'utf8')
  const front = texto.match(/^---\n([\s\S]*?)\n---\n/)[1]
  assert.match(front, /^status: consolidated$/m, 'el sello va al frontmatter, que es lo que se lee')
  assert.match(texto, /^status: rechazado$/m, 'y la línea del cuerpo se queda como la escribió el cargo')
})

// El predicado se mira también de cerca, y no sólo por el ciclo: sus cuatro caminos deciden si un
// documento puede cerrar el ciclo, y por el CLI sólo se alcanzan los que traen texto. El caso vacío es el
// que ninguna corrida real produce —quien firma escribe algo— y es justamente el que no puede fallar.
test('undecided reconoce lo que nadie decidió, y sólo eso', () => {
  const { undecided } = require('../../engine/agents/learning-files')
  const viejo = 'Una revisión suele **no** ser aditiva: reemplaza texto que la propuesta anterior agregó. '
    + 'Decilo\nexplícitamente y decí por qué la aditividad no aplica acá — vale para lo que ya rindió sus '
    + 'casos, no para\nun texto que acaba de fallar su primera medición.'

  assert.equal(undecided(''), true, 'vacío')
  assert.equal(undecided(undefined), true, 'ausente')
  assert.equal(undecided('   \n  '), true, 'sólo espacios')
  assert.equal(undecided('Por definir tras revisar los hallazgos.'), true, 'el molde de una propuesta')
  assert.equal(undecided('Pendiente de la próxima corrida.'), true, 'y el otro prefijo')
  assert.equal(undecided(viejo), true, 'el molde viejo de una revisión, que no empieza por ninguno')
  assert.equal(undecided(`${viejo}\n\nY además esto.`), false, 'continuado deja de ser el molde')
  assert.equal(undecided('Agregar una viñeta a SKILL.md.'), false, 'un cambio concreto')
  assert.equal(undecided('Por definirse el alcance, agregamos la viñeta X.'), false,
    'el prefijo pide la palabra entera: «definirse» no es «definir»')
})

// Arreglar el molde protege lo que se componga de ahora en más y deja pasar lo ya escrito, que era el
// caso que originó todo: nueve propuestas del repositorio llevan el molde viejo intacto y siete llegaron
// firmadas a `main`. Por eso el criterio reconoce además ese texto literal —y **completo**, no por su
// primer renglón: quien redacta suele continuar la frase en vez de borrarla, y un documento así sí decidió.
test('una revisión con el molde viejo tampoco se sella, y una que lo continuó sí', () => {
  const viejo = 'Una revisión suele **no** ser aditiva: reemplaza texto que la propuesta anterior agregó. '
    + 'Decilo\nexplícitamente y decí por qué la aditividad no aplica acá — vale para lo que ya rindió sus '
    + 'casos, no para\nun texto que acaba de fallar su primera medición.'
  const componer = (nombre, cambio) => {
    const { target } = cargoConRegistro(nombre, '### 02-dos\n\n- Veredicto: no pasa\n\nFalló por esto.\n')
    const revision = learning.prepareProposal(target, 'probe', new Date('2099-06-30T00:00:00Z'))
    fs.writeFileSync(revision.file, fs.readFileSync(revision.file, 'utf8')
      .replace(/(\n## Cambio propuesto\n)[\s\S]*?(?=\n## )/, `$1\n${cambio}\n`)
      .replace('- Estado: pendiente', '- Estado: aprobada')
      .replace('- Responsable: por definir', '- Responsable: Quien Firma'))
    return { target, file: revision.file }
  }

  const intacto = componer('Molde viejo intacto', viejo)
  const frenado = run(['learn', 'probe', '--applied', '--period', '2099-06'], intacto.target)
  assert.equal(frenado.status, 2, 'el molde viejo no decide nada, aunque no empiece por «Por definir»')
  assert.match(fs.readFileSync(intacto.file, 'utf8'), /^status: proposed$/m)

  // La contracara, y es la que importa: marcar de más rompe trabajo legítimo. `qa-engineer/2026-08-r2.md`
  // continuó la frase del molde para decir qué cambiaba, y se aplicó.
  const seguido = componer('Molde viejo continuado',
    'Una revisión suele **no** ser aditiva, y ésta lo es en parte: agrega una viñeta a SKILL.md.')
  const sellado = run(['learn', 'probe', '--applied', '--period', '2099-06'], seguido.target)
  assert.equal(sellado.status, 0, `continuar la frase es decidir:\n${sellado.stderr}`)
  assert.match(fs.readFileSync(seguido.file, 'utf8'), /^status: applied$/m)
})

// El molde de una revisión empieza por «Por definir» como los otros dos, y eso no es redacción: es lo
// único que hace que el criterio de «sin decidir» —`/^(por definir|pendiente)\b/` en `learning-seal.js`—
// la reconozca. Con «Una revisión suele…» pasaba de largo, y una revisión firmada con el molde adentro
// se sellaba como aplicada: el ciclo cerraba sobre un documento que nadie decidió (caso 135).
test('una revisión recién compuesta no se puede sellar, porque nadie decidió el cambio', () => {
  const { target } = cargoConRegistro('Revisión sin decidir',
    '### 02-dos\n\n- Veredicto: no pasa\n\nFalló por esto.\n')

  const revision = learning.prepareProposal(target, 'probe', new Date('2099-06-30T00:00:00Z'))
  const cambio = fs.readFileSync(revision.file, 'utf8').split('## Cambio propuesto\n')[1].trim()
  assert.match(cambio, /^Por definir\b/, 'el molde lo declara como los otros dos')

  // Firmada como firma producción —`sign-proposal.yml` deja «aprobada»— y con el molde intacto, que es
  // exactamente el documento que llegó a `main` siete veces el 2026-09-14.
  fs.writeFileSync(revision.file, fs.readFileSync(revision.file, 'utf8')
    .replace('- Estado: pendiente', '- Estado: aprobada')
    .replace('- Responsable: por definir', '- Responsable: Quien Firma'))
  const sellado = run(['learn', 'probe', '--applied', '--period', '2099-06'], target)
  assert.equal(sellado.status, 2, 'sellar sin decidir no deja terminar el ciclo')
  assert.match(sellado.stderr, /todavía no la decidió nadie/)
  assert.match(fs.readFileSync(revision.file, 'utf8'), /^status: proposed$/m, 'y el documento no avanza')
})

// Por qué el detalle se anida vive donde se cosecha, en `engine/agents/learning.js`. Acá importa cómo se
// mira: por los títulos y no por el texto, porque el defecto no perdía nada —el detalle viajaba entero—
// sino que lo ponía donde no iba, y una aserción sobre el contenido pasaba con el defecto puesto.
test('los encabezados de la respuesta no se vuelven secciones de la propuesta', () => {
  const { target } = cargoConRegistro('Encabezados del cargo',
    '### 02-dos\n\n- Veredicto: no pasa\n\nFalló por esto.\n\n'
    + '## Sección propia\n\nTexto de la respuesta.\n\n### Subsección propia\n\nMás texto.\n')

  const revision = learning.prepareProposal(target, 'probe', new Date('2099-06-30T00:00:00Z'))
  const texto = fs.readFileSync(revision.file, 'utf8')
  assert.deepEqual([...texto.matchAll(/^## (.+)$/gm)].map((hit) => hit[1]),
    ['Hallazgos', 'Evidencia', 'Cambio propuesto', 'Riesgos y regresiones', 'Evaluación',
      'Aprobación humana'], 'las secciones son las del molde y ninguna más')
  assert.match(texto, /^### Sección propia$/m, 'la de la respuesta baja un nivel')
  assert.match(texto, /^#### Subsección propia$/m, 'y lo que colgaba de ella la sigue')
  assert.match(texto, /Más texto/, 'sin perder una línea del detalle')
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
