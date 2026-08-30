'use strict'

// El ciclo por el que cambia un recorrido. Un cargo aprende de su profesión; un recorrido sólo de
// cómo le fue, así que su insumo son los veredictos en contra de sus propias corridas — y el ciclo
// tiene que cerrarse igual: proponer, exigir firma y dejar historial.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const L = require('../../engine/agents/learning')

const ROOT = path.resolve(__dirname, '..', '..')
const CLI = path.join(ROOT, 'engine', 'cli', 'ops.js')

// Lo que hace una persona antes de aplicar: decir quién decide y qué cambia. Sin esto `seal` se niega,
// y por eso vive acá arriba: todos los tests del ciclo lo necesitan.
const firmar = (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
  .replace('- Responsable: por definir', '- Responsable: Quien Firma')
  .replace(/Por definir\. Lo que se corrige es el recorrido/, 'Se endurece el gate de la primera etapa'))

// Cuántas corridas esperan entrar a una propuesta. Es el disparador del ciclo de un recorrido, y se
// mide contra el sello, no contra la fecha: una corrida vieja sin consolidar sigue pendiente.
test('pendingRuns cuenta lo que no se consolidó, y deja de contarlo cuando entra', () => {
  const root = tempRoot('cauce-flow-pending-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  assert.equal(L.pendingRuns(root, 'probe'), 0, 'sin corridas no hay nada que consolidar')

  for (const name of ['2099-01-07.md', '2099-01-07-2.md']) {
    fs.writeFileSync(path.join(dir, 'evaluations', 'results', name),
      '---\nflow: probe\ndate: 2099-01-07\npassed: 0\ntotal: 1\n---\n\n'
      + '### 01-uno\n\n- Veredicto: no pasa\n\nEl gate dejó pasar la etapa.\n')
  }
  assert.equal(L.pendingRuns(root, 'probe'), 2, 'la re-corrida cuenta como corrida')

  L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  assert.equal(L.pendingRuns(root, 'probe'), 0, 'consolidadas, ya no piden otra propuesta')
})

// Un recorrido no aprende de una profesión: no tiene. Lo único que puede enseñarle algo es cómo le
// fue, así que su ciclo consume los veredictos en contra de sus propias corridas. Copiarle al cargo
// la investigación semanal le habría pedido leer una literatura inexistente, y habría devuelto
// informes vacíos que igual hay que firmar.
test('el ciclo de un recorrido aprende de sus corridas, no de una literatura', () => {
  const root = tempRoot('cauce-flow-learn-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  const registro = path.join(dir, 'evaluations', 'results', '2099-01-07.md')
  fs.writeFileSync(registro, '---\nteam: probe\ndate: 2099-01-07\npassed: 1\ntotal: 2\n---\n\n'
    + '### 01-uno\n\n- Veredicto: pasa\n\nSin novedad.\n\n'
    + '### 02-dos\n\n- Veredicto: no pasa\n\nEl gate dejó pasar la etapa sin su evidencia.\n')

  const propuesta = L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  assert.equal(propuesta.findings, 1, 'entra el veredicto en contra, no el que pasó')
  const texto = fs.readFileSync(propuesta.file, 'utf8')
  assert.match(texto, /### 02-dos — 2099-01-07/, 'el hallazgo cita el caso y la corrida')
  assert.match(texto, /El gate dejó pasar la etapa sin su evidencia/, 'y trae su contraste')
  assert.equal(texto.includes('01-uno'), false, 'el caso que pasó no pide cambio')
  assert.match(texto, /^automatic_apply: false$/m)

  // La corrida consumida queda sellada, así que no vuelve a entrar por una segunda propuesta.
  assert.match(fs.readFileSync(registro, 'utf8'), /^status: consolidated$/m)
  firmar(propuesta.file)
  L.seal(root, 'probe', '2099-01', 'flow')
  // Sin corridas nuevas no hay qué corregir, y entonces no se abre documento. Antes se abría uno para
  // decir «el recorrido aguantó lo que se le midió»: nadie firma eso, y una firma humana es lo que
  // cuesta. Es la misma regla que gobierna a un cargo — un documento que no puede nombrar un cambio
  // no se escribe—, y acá se comprobaba lo contrario.
  const siguiente = L.prepareProposal(root, 'probe', new Date('2099-02-28T00:00:00Z'), '', 'flow')
  assert.equal(siguiente.created, false, 'sin veredictos en contra no se abre nada')
  assert.equal(siguiente.file, '', 'y no queda archivo que el job lea como propuesta y mande a PR')

  const estado = L.evaluateTeam(root, 'probe')
  assert.deepEqual(estado.errors, [])
  assert.equal(estado.proposals, 1, 'sólo la de enero, que es la única que tuvo algo que decir')
  assert.equal(estado.pending, 0, 'y quedó aplicada')
  assert.match(estado.warnings.join('\n'), /sin learning\/HISTORY\.md/)
})

// El ciclo entero, que ninguna prueba recorría: proponer, firmar, sellar y quedar registrado.
// Ejercitarlo a mano encontró tres defectos y los tres viven acá.
test('el ciclo de un recorrido se cierra: propone lo vivo, exige firma y deja historial', () => {
  const root = tempRoot('cauce-flow-ciclo-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'learning'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'learning', 'HISTORY.md'),
    '# Historial\n\n| Fecha | Propuesta | Decisión | Aprobó | Cambio aplicado |\n|---|---|---|---|---|\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  const corrida = (name, cuerpo) => fs.writeFileSync(
    path.join(dir, 'evaluations', 'results', name),
    `---\nflow: probe\ndate: 2099-01-07\npassed: 0\ntotal: 2\n---\n\n${cuerpo}`)

  // Dos corridas: un caso que falló y después se arregló, y otro que sigue rojo en las dos.
  corrida('2099-01-07.md', '### 01-arreglado\n\n- Veredicto: no pasa\n\nFallaba por A.\n\n'
    + '### 02-vivo\n\n- Veredicto: no pasa\n\nPrimera vez.\n')
  corrida('2099-01-08.md', '### 01-arreglado\n\n- Veredicto: pasa\n\nYa no falla.\n\n'
    + '### 02-vivo\n\n- Veredicto: no pasa\n\nSigue rojo con el arreglo puesto.\n')

  const propuesta = L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  const texto = fs.readFileSync(propuesta.file, 'utf8')

  // Uno, no tres. Volcar todo «no pasa» de toda corrida pedía corregir lo ya corregido y repetía el
  // mismo caso una vez por corrida: sobre las cuatro de incident-review daban seis para un solo rojo.
  assert.equal(propuesta.findings, 1, 'sólo entra el caso que sigue rojo')
  assert.equal(texto.includes('01-arreglado'), false, 'el que se arregló no manda a arreglarlo de nuevo')
  assert.match(texto, /Sigue rojo con el arreglo puesto/, 'y del que vive entra su contraste más nuevo')
  assert.equal(texto.includes('Primera vez'), false, 'no el viejo')
  assert.match(texto, /falló en 2 corridas de esta tanda/, 'con cuántas veces: separa varianza de medición')

  // Sin firma no se sella. Un cargo llega acá después de `agent-promote`, que ya la exige; un recorrido
  // no tiene ese workflow, así que `--applied` sellaba lo que nadie decidió y el documento quedaba
  // diciendo `applied` en el frontmatter y «Estado: pendiente» en el cuerpo.
  assert.throws(() => L.seal(root, 'probe', '2099-01', 'flow'), /no la decidió nadie/)

  firmar(propuesta.file)
  L.seal(root, 'probe', '2099-01', 'flow')
  const aplicada = fs.readFileSync(propuesta.file, 'utf8')
  assert.match(aplicada, /^status: applied$/m)
  assert.match(aplicada, /^- Estado: aplicada$/m, 'y el cuerpo deja de contradecir al frontmatter')
  assert.equal(aplicada.endsWith('\n'), true, 'sin comerse el salto final del archivo')

  // Y queda registrado, que es lo que la plantilla del historial promete y nadie escribía.
  assert.match(fs.readFileSync(path.join(dir, 'learning', 'HISTORY.md'), 'utf8'),
    /\| `2099-01\.md` \| aplicada \| Quien Firma \| Se endurece el gate/)
})

// Un recorrido sin HISTORY.md se sella igual: el historial es del contrato y `evaluate` ya avisa que
// falta. Frenar el sello ahí convertiría una advertencia en un bloqueo por un archivo que se crea solo.
test('sellar no exige que el historial exista', () => {
  const root = tempRoot('cauce-flow-sin-historial-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  fs.writeFileSync(path.join(dir, 'evaluations', 'results', '2099-01-07.md'),
    '---\nflow: probe\ndate: 2099-01-07\npassed: 0\ntotal: 1\n---\n\n'
    + '### 01-uno\n\n- Veredicto: no pasa\n\nEl gate dejó pasar la etapa.\n')

  const propuesta = L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  firmar(propuesta.file)
  assert.equal(L.seal(root, 'probe', '2099-01', 'flow').already, false)
  assert.equal(fs.existsSync(path.join(dir, 'learning', 'HISTORY.md')), false, 'y no lo inventa')
})

// La re-corrida del mismo día se llama `<fecha>-2.md`, y es la que trae el veredicto más nuevo — el
// que dice si el arreglo funcionó. El patrón de nombre exigía `<fecha>.md` exacto, así que ninguna
// entraba a ninguna propuesta y nada lo delataba, y era más de una cuarta parte de los registros.
// Y el orden importa tanto como el patrón, porque `-` es menor que `.` y la segunda corrida se leería
// antes que la primera.
test('la re-corrida del mismo día entra al ciclo, y entra después de la primera', () => {
  const root = tempRoot('cauce-flow-rerun-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  const registro = (name, caso, detalle) => {
    const file = path.join(dir, 'evaluations', 'results', name)
    fs.writeFileSync(file, `---\nflow: probe\ndate: 2099-01-07\npassed: 0\ntotal: 1\n---\n\n`
      + `### ${caso}\n\n- Veredicto: no pasa\n\n${detalle}\n`)
    return file
  }
  const primera = registro('2099-01-07.md', '01-uno', 'La primera corrida.')
  const segunda = registro('2099-01-07-2.md', '02-dos', 'La re-corrida, con el arreglo puesto.')

  const propuesta = L.prepareProposal(root, 'probe', new Date('2099-01-31T00:00:00Z'), '', 'flow')
  assert.equal(propuesta.findings, 2, 'las dos corridas del día entran')
  const texto = fs.readFileSync(propuesta.file, 'utf8')
  assert.match(texto, /La re-corrida, con el arreglo puesto/, 'la segunda no se pierde')
  assert.ok(texto.indexOf('La primera corrida') < texto.indexOf('La re-corrida'),
    'y va después de la primera: `-` ordena antes que `.` si se compara el nombre crudo')
  for (const file of [primera, segunda]) {
    assert.match(fs.readFileSync(file, 'utf8'), /^status: consolidated$/m, 'las dos quedan selladas')
  }
})

// La forma desnuda de `learn` —la que para un cargo abre el informe de la semana— no tiene qué abrir
// para un recorrido: su propuesta se compone de `verdictFindings` y nunca lee `learning/reports/`.
// Antes lo decía buscando un archivo de cargo, «no existe agents/<tipo>/probe/SKILL.md», porque
// `prepareReport` resuelve con el `kind` por defecto. El error mandaba a crear un cargo que no falta.
test('learn sobre un recorrido sin --proposal dice qué corresponde, y no abre un informe huérfano', () => {
  const root = tempRoot('cauce-flow-learn-desnudo-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))

  const out = run(['learn', 'probe', '--flow'], root)
  const salida = `${out.stdout}${out.stderr}`
  assert.equal(out.status, 2, 'es un uso que no existe, no un éxito silencioso')
  assert.doesNotMatch(salida, /SKILL\.md/, 'no manda a crear un cargo: lo que se pidió fue un recorrido')
  assert.match(salida, /--proposal/, 'y dice con qué comando sí se aprende de las corridas')
  assert.equal(fs.existsSync(path.join(dir, 'learning', 'reports')), false,
    'ni deja un informe que su propia propuesta no va a leer')
})

// El contrapeso del anterior, y existe porque la negativa vive en el mismo `if`: quitarle la mitad
// `--proposal` deja el ciclo de todo recorrido muerto desde el CLI, y la batería entera seguía verde
// —48 de 48— porque los demás tests llaman a `prepareProposal` directo. Éste es el que se pone rojo.
test('y con --proposal el mismo recorrido sí abre su propuesta desde el CLI', () => {
  const root = tempRoot('cauce-flow-learn-propuesta-')
  const dir = path.join(root, 'flows', 'probe')
  fs.mkdirSync(path.join(dir, 'evaluations', 'results'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'FLOW.md'), '# Probe\n')
  fs.writeFileSync(path.join(dir, 'flow.json'), JSON.stringify({
    schemaVersion: 1, slug: 'probe', name: 'Probe', purpose: 'x', outcome: 'report',
    entryAgent: 'qa-engineer', facilitator: 'qa-engineer',
    stages: [{ id: 'uno', phase: 'discovery', agent: 'qa-engineer', dependsOn: [], produces: ['x'], exitGate: 'y' }],
    guardrails: ['x'], completion: ['x'],
  }))
  fs.writeFileSync(path.join(dir, 'evaluations', 'results', '2099-01-07.md'),
    '---\nflow: probe\ndate: 2099-01-07\npassed: 0\ntotal: 1\n---\n\n'
    + '# Casos adversariales — 2099-01-07\n\n### 01-uno\n\n- Veredicto: no pasa\n\nEl gate no frenó.\n')

  const out = run(['learn', 'probe', '--flow', '--proposal'], root)
  const salida = `${out.stdout}${out.stderr}`
  assert.doesNotMatch(salida, /es un recorrido: aprende de sus corridas/, 'la negativa no alcanza a este uso')
  assert.equal(out.status, 0, 'el ciclo de un recorrido se abre desde el CLI, no sólo desde la API')
  assert.equal(fs.existsSync(path.join(dir, 'learning', 'proposals')), true,
    'y el veredicto en contra llega a una propuesta')
})
