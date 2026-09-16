'use strict'

// Archivar una propuesta: la otra forma de cerrarla, que no dice que el contrato cambió, y el rastro
// que deja de quién lo decidió.
//
// Aplicarla —la forma que sí lo dice— es de `learning-proposal.test.js`.

const { run } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const learning = require('../../engine/agents/learning')
const { installedProject, writeSkill } = require('../support/agents-fixtures')

// Lo que separa archivar de aplicar, que es lo único que un caso puede medir acá: los dos cierran el
// documento y sólo uno dice que el contrato cambió. El porqué del estado vive en `learning-seal.js`.
test('una propuesta se puede archivar, y archivarla no es aplicarla', () => {
  const target = installedProject('Archivar')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe'), 'probe', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(reports, '2099-01-07.md'),
    '---\nagent: probe\ndate: 2099-01-07\nstatus: draft\n---\n\n## Recomendación\n\nAlgo.\n')
  const propuesta = learning.prepareProposal(target, 'probe', new Date('2099-02-01T13:17:00Z'), '2099-01')

  assert.equal(learning.evaluate(target, 'probe').pending, 1, 'antes de archivar espera algo')

  const hecho = learning.archive(target, 'probe', '2099-01')
  assert.equal(hecho.already, false)
  const texto = fs.readFileSync(propuesta.file, 'utf8')
  assert.match(texto, /^status: archived$/m, 'el frontmatter la cierra')
  assert.match(texto, /^- Estado: archivada$/m, 'y el cuerpo no lo contradice')
  assert.equal(/^- Estado: aplicada$/m.test(texto), false, 'archivar no es aplicar')

  assert.equal(learning.evaluate(target, 'probe').pending, 0, 'y deja de reportar trabajo pendiente')
  assert.equal(learning.archive(target, 'probe', '2099-01').already, true, 'archivar dos veces no hace nada')

  // Y no bloquea la siguiente del **mismo** período, que es donde se notaba: mirando sólo `applied`, una
  // archivada dejaba al cargo sin poder proponer nunca más y la única salida era aplicar lo que se había
  // decidido no aplicar. Tiene que ser el mismo período: con otro, `lastOfPeriod` no la encuentra y la
  // comparación ni siquiera ocurre (caso 142).
  fs.writeFileSync(path.join(reports, '2099-01-21.md'),
    '---\nagent: probe\ndate: 2099-01-21\nstatus: draft\n---\n\n## Recomendación\n\nOtra cosa.\n')
  const siguiente = learning.prepareProposal(target, 'probe', new Date('2099-02-01T13:17:00Z'), '2099-01')
  assert.equal(siguiente.created, true, 'una archivada está cerrada: no retiene el período')
  assert.equal(path.basename(siguiente.file), '2099-01-r2.md', 'y la que sigue es su revisión')
})

// La guarda, medida por lo que hace: rechaza y deja el documento intacto.
test('una propuesta firmada no se puede archivar', () => {
  const target = installedProject('Archivar firmada')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe2'), 'probe2', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(reports, '2099-01-07.md'),
    '---\nagent: probe2\ndate: 2099-01-07\nstatus: draft\n---\n\n## Recomendación\n\nAlgo.\n')
  const propuesta = learning.prepareProposal(target, 'probe2', new Date('2099-02-01T13:17:00Z'), '2099-01')
  fs.writeFileSync(propuesta.file, fs.readFileSync(propuesta.file, 'utf8')
    .replace('- Estado: pendiente', '- Estado: aprobada'))

  // Sin decidir todavía: acá archivar es la salida, y es lo que rescata a una propuesta que se firmó
  // sobre el molde intacto. Pasó siete veces el 2026-09-14 (caso 142).
  assert.equal(learning.archive(target, 'probe2', '2099-01').already, false,
    'una firma sobre un documento que no decide nada no obliga a aplicarlo')
  const archivada = fs.readFileSync(propuesta.file, 'utf8')
  assert.match(archivada, /^status: archived$/m)
  // El cuerpo acompaña al frontmatter. Una firmada llega diciendo «aprobada», y la sustitución sólo
  // miraba «pendiente»: el documento quedaba archivado por arriba y aprobado por abajo, que es la
  // contradicción que cerrar una propuesta existe para no dejar.
  assert.match(archivada, /^- Estado: archivada$/m, 'y el cuerpo no se queda en «aprobada»')

  // Y con un cambio escrito, la guarda vuelve: ahí la firma sí autorizó algo, y archivarla lo tiraría.
  // El período nuevo necesita su propio informe: el anterior quedó sellado al componer la primera, así
  // que sin esto `prepareProposal` no abre nada y devuelve `file` vacío.
  fs.writeFileSync(path.join(reports, '2099-02-04.md'),
    '---\nagent: probe2\ndate: 2099-02-04\nstatus: draft\n---\n\n## Recomendación\n\nOtra cosa.\n')
  const decidida = learning.prepareProposal(target, 'probe2', new Date('2099-03-01T13:17:00Z'), '2099-02')
  assert.equal(decidida.created, true, 'la archivada no bloquea la siguiente del cargo')
  fs.writeFileSync(decidida.file, fs.readFileSync(decidida.file, 'utf8')
    .replace('- Estado: pendiente', '- Estado: aprobada')
    .replace(/(\n## Cambio propuesto\n)[\s\S]*?(?=\n## )/, '$1\nAgregar una viñeta a SKILL.md.\n'))
  assert.throws(() => learning.archive(target, 'probe2', '2099-02'), /está firmada/,
    'lo que sigue a una firma que decidió algo es aplicarla, no archivarla')
  assert.match(fs.readFileSync(decidida.file, 'utf8'), /^status: proposed$/m, 'y el documento queda intacto')
})

// La función y el comando son dos artefactos, y sólo el segundo se usa. `--archived` llegó a existir en
// el motor con su guarda y sus casos, y no se podía invocar: la lista de banderas válidas de `args.js`
// no lo tenía, así que el CLI lo rechazaba antes de llegar a nada. La puerta pasó verde porque los casos
// llamaban a `learning.archive()` de frente. Es lo que R9 nombra: tests verdes no reemplazan el artefacto.
test('archivar se puede invocar desde el CLI, no sólo desde el motor', () => {
  const target = installedProject('Archivar por CLI')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe3'), 'probe3', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(reports, '2099-01-07.md'),
    '---\nagent: probe3\ndate: 2099-01-07\nstatus: draft\n---\n\n## Recomendación\n\nAlgo.\n')
  const propuesta = learning.prepareProposal(target, 'probe3', new Date('2099-02-01T13:17:00Z'), '2099-01')

  const hecho = run(['learn', 'probe3', '--archived', '--period', '2099-01'], target)
  assert.equal(hecho.status, 0, `${hecho.stdout}${hecho.stderr}`)
  assert.match(hecho.stdout, /queda archivada/)
  assert.match(fs.readFileSync(propuesta.file, 'utf8'), /^status: archived$/m)
})

// Archivar dejaba el documento diciendo «Responsable: por definir» y ninguna fila en el historial, así
// que una propuesta mirada y descartada se leía igual que una que nadie miró. Lo pagaban los informes
// siguientes: dos cargos de la tanda del 2026-09-07 gastaron su recomendación explicando ese estado.
test('archivar deja quién lo decidió, en el documento y en el historial', () => {
  const target = installedProject('Archivar con responsable')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe4'), 'probe4', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(reports, '2099-01-07.md'),
    '---\nagent: probe4\ndate: 2099-01-07\nstatus: draft\n---\n\n## Recomendación\n\nAlgo.\n')
  const history = path.join(own, 'learning', 'HISTORY.md')
  fs.writeFileSync(history, '# Historial\n\n| Fecha | Propuesta | Decisión | Aprobó | Cambio aplicado |\n'
    + '|---|---|---|---|---|\n')
  const propuesta = learning.prepareProposal(target, 'probe4', new Date('2099-02-01T13:17:00Z'), '2099-01')

  const hecho = run(['learn', 'probe4', '--archived', '--period', '2099-01'], target,
    { CAUCE_OWNER: 'quien.decide@acme.test' })
  assert.equal(hecho.status, 0, `${hecho.stdout}${hecho.stderr}`)

  const doc = fs.readFileSync(propuesta.file, 'utf8')
  assert.match(doc, /^- Responsable: quien\.decide@acme\.test$/m, 'el documento dice quién la archivó')
  assert.equal(/por definir/.test(doc), false, `no queda nada sin decidir: ${doc}`)

  // La columna de la tabla se llama «Decisión» y hay dos: aplicar y archivar. La segunda no dejaba fila.
  const filas = fs.readFileSync(history, 'utf8').split('\n').filter((one) => /^\| 2\d{3}-/.test(one))
  assert.equal(filas.length, 1, `una fila por propuesta cerrada: ${JSON.stringify(filas)}`)
  assert.match(filas[0], /\| archivada \|/, 'y dice cuál de las dos decisiones fue')
  assert.match(filas[0], /quien\.decide@acme\.test/, 'con quién la tomó')

  // Archivar dos veces no duplica la fila: la segunda vuelta sale por «ya estaba archivada».
  run(['learn', 'probe4', '--archived', '--period', '2099-01'], target, { CAUCE_OWNER: 'otro@acme.test' })
  assert.equal(fs.readFileSync(history, 'utf8').split('\n').filter((one) => /^\| 2\d{3}-/.test(one)).length, 1,
    'el historial no crece por volver a archivar lo ya archivado')
})

// Por qué un historial puede llegar sin su tabla está en `appendHistory`. Acá se mide que la fila entre
// igual, y que la cabecera vaya antes y una sola vez.
test('una fila entra en su tabla aunque el historial no la traiga', () => {
  const target = installedProject('Historial sin tabla')
  const own = writeSkill(path.join(target, 'agents', 'roles', 'probe5'), 'probe5', 'x')
  const reports = path.join(own, 'learning', 'reports')
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(reports, '2099-01-07.md'),
    '---\nagent: probe5\ndate: 2099-01-07\nstatus: draft\n---\n\n## Recomendación\n\nAlgo.\n')
  const history = path.join(own, 'learning', 'HISTORY.md')
  fs.writeFileSync(history, '# Historial de aprendizaje\n\nUna fila por propuesta cerrada.\n')
  learning.prepareProposal(target, 'probe5', new Date('2099-02-01T13:17:00Z'), '2099-01')

  assert.equal(run(['learn', 'probe5', '--archived', '--period', '2099-01'], target,
    { CAUCE_OWNER: 'quien@acme.test' }).status, 0)

  const escrito = fs.readFileSync(history, 'utf8')
  assert.match(escrito, /^\| Fecha \| Propuesta \| Decisión \| Aprobó \| Cambio aplicado \|$/m,
    'la cabecera se agrega antes de la primera fila')
  assert.match(escrito, /^\|---\|---\|---\|---\|---\|$/m, 'con su separador, o no es una tabla')
  assert.ok(escrito.indexOf('| Fecha |') < escrito.indexOf('| 2'), 'y antes de la fila, no después')

  // Y no se repite: el segundo cierre encuentra la tabla que dejó el primero.
  fs.writeFileSync(path.join(reports, '2099-02-07.md'),
    '---\nagent: probe5\ndate: 2099-02-07\nstatus: draft\n---\n\n## Recomendación\n\nOtra.\n')
  learning.prepareProposal(target, 'probe5', new Date('2099-03-01T13:17:00Z'), '2099-02')
  run(['learn', 'probe5', '--archived', '--period', '2099-02'], target, { CAUCE_OWNER: 'quien@acme.test' })
  const dos = fs.readFileSync(history, 'utf8')
  assert.equal((dos.match(/^\| Fecha \|/gm) || []).length, 1, 'una sola cabecera')
  assert.equal((dos.match(/^\| 2\d{3}-/gm) || []).length, 2, 'y las dos filas')
})
