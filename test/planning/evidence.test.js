'use strict'

// Lo que queda escrito cuando algo se terminó o alguien tiene que intervenir: la traza de DONE, el
// commit que apunta a un sha real, las acciones humanas y el INBOX. Es la mitad del contrato que se
// lee después, cuando ya nadie recuerda qué pasó.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const PC = require('../../engine/planning/contracts')
const P = require('../../engine/planning/parser')

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
  // El `;` seguido de prosa se lee como nota, no como tramo: es indistinguible del `;` de adentro del
  // paréntesis final de arriba, que una instancia real ya escribe, y elegir lo contrario rechazaría
  // 71 entradas ya escritas por una forma hipotética.
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
  const plantilla = path.resolve(__dirname, '..', '..', 'template', 'planning')
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
  const ST = require('../../engine/planning/state')
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

// Los campos de una entrada son prosa y se envuelven a 120 columnas como cualquier otra línea. Leídos
// de a una línea física, `check` rechazaba entradas correctas culpando a otra cosa: una cita que cerraba
// abajo se reportaba como cita ausente, y el mensaje mandaba a revisar lo único que sí estaba. Costó
// cuatro tropiezos en días distintos, porque el error nombra una ausencia que no es la que hay.
test('un campo de DONE que se envuelve se lee entero', () => {
  const root = tempRoot('ops-done-wrap-')
  fs.writeFileSync(path.join(root, 'DONE.md'), `# Done activo

## Hito ejemplo — Un hito cualquiera

- [x] **tarea-envuelta** — Resultado construido.
  acept: criterio observable
  fecha: 2026-09-08
  done: lo que se hizo
  qa: lo que se observó por el camino real
  tests: A → make test
  decisions: se eligió A y no B porque el borde que C describe lo exige [fuente:
  planning/adr/001-decision.md]
  commit: abc1234 feat(x): subject
`)

  const [entry] = P.readDone(root).entries

  assert.equal(entry.decisions, 'se eligió A y no B porque el borde que C describe lo exige '
    + '[fuente: planning/adr/001-decision.md]')
  assert.equal(PC.validDecisionTrace(entry.decisions), true, 'la cita está: cierra una línea más abajo')
  assert.equal(entry.acceptance, 'criterio observable', 'el campo anterior no se lleva al siguiente')
  assert.equal(entry.commit, 'abc1234 feat(x): subject')
})

// Por qué el corte por línea en blanco existe lo cuenta `doneField`. Acá se fija lo que pasa si no
// está, que ningún contrato iba a decir: la entrada queda con una nota suelta debajo y `commit` la
// absorbe sin que `check` se queje.
test('el último campo de una entrada no se traga lo que viene después', () => {
  const root = tempRoot('ops-done-tail-')
  fs.writeFileSync(path.join(root, 'DONE.md'), `# Done activo

## Hito ejemplo — Un hito cualquiera

- [x] **tarea-con-cola** — Otro resultado.
  done: lo que se hizo
  commit: abc1234 feat(x): subject

  Nota suelta que alguien dejó debajo de la entrada.
`)

  const [entry] = P.readDone(root).entries

  assert.equal(entry.commit, 'abc1234 feat(x): subject')
})

// En markdown un pipe dentro de una celda se escribe `\|` —es la única forma— y partir por todo `|`
// corre las columnas de esa fila. Se miden las dos caras que el caso 042 separa, porque tienen daños
// distintos: la ruidosa rechaza una fila bien escrita culpando a la columna equivocada, y la silenciosa
// pasa `check` y le entrega al runner el contenido de `Origen` como si fuera la acción de desbloqueo.
test('un pipe escapado pertenece a su celda y no corre las columnas', () => {
  const root = tempRoot('ops-human-pipe-')
  const tabla = (fila) => `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
${fila}
`
  const leer = (fila) => {
    fs.writeFileSync(path.join(root, 'HUMAN_ACTIONS.md'), tabla(fila))
    return P.readHumanActions(root)[0]
  }

  // Cara ruidosa: el pipe cae en `Tarea` y el estado real nunca se lee.
  const ruidosa = leer('| poner el flag `<COP \\| USD>` | pendiente | Ready | Pedir el valor a Ops. |')
  assert.equal(ruidosa.task, 'poner el flag `<COP | USD>`', 'la tarea se lee entera')
  assert.equal(ruidosa.state, 'pendiente')
  assert.equal(ruidosa.valid, true, 'la fila está bien escrita y no se rechaza')

  // Cara silenciosa: el pipe cae en `Estado`, detrás de la palabra del vocabulario. `valid` sigue en
  // true —por eso no deja rastro— y lo que se corrompe es la acción, que es a quien sirve la columna.
  const silenciosa = leer('| sembrar-el-flag | pendiente — mide A \\| B | Ready | Sembrar FLAG y avisar. |')
  assert.equal(silenciosa.state, 'pendiente — mide A | B')
  assert.equal(silenciosa.resolved, false)
  assert.equal(silenciosa.origin, 'Ready')
  assert.equal(silenciosa.action, 'Sembrar FLAG y avisar.', 'la acción de desbloqueo llega entera')

  // El separador sin escapar sigue siendo separador: el arreglo no puede volver ilegible una fila normal.
  const normal = leer('| tarea-uno | resuelta | Ready | Detalle |')
  assert.deepEqual(
    [normal.task, normal.state, normal.origin, normal.action],
    ['tarea-uno', 'resuelta', 'Ready', 'Detalle'],
  )
})

// Va aparte y no dentro de la prueba de arriba para que se pueda ver caer sola: junta con las otras,
// la primera aserción falla antes y ésta nunca se ejerce.
test('leer bien la fila destapa el estado que la fila corrida escondía', () => {
  const root = tempRoot('ops-human-aflora-')
  fs.writeFileSync(path.join(root, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| dar acceso \\| pendiente | hecho | Ready | Pedir el permiso. |
`)
  // El caso lo anticipaba en Tradeoffs y no estaba comprobado: el pipe escapado empujaba `pendiente` a
  // la posición del estado, así que la fila pasaba `check` y desbloqueaba una tarea que nadie resolvió.
  // Leída bien, el estado es `hecho`, que está fuera del vocabulario. Empezar a fallar acá es el defecto
  // saliendo a la luz, no una regresión.
  const fila = P.readHumanActions(root)[0]
  assert.equal(fila.task, 'dar acceso | pendiente')
  assert.equal(fila.state, 'hecho')
  assert.equal(fila.valid, false, 'el estado real estaba fuera del vocabulario y ahora se ve')
  assert.equal(fila.resolved, false)
})

// La cabecera de una tabla markdown es la fila anterior a la de separadores, diga lo que diga su primera
// celda. Reconocerla por el literal `tarea` sólo funciona con el encabezado del molde: quien llega con
// una tabla propia recibe un error que nombra las etiquetas de sus columnas como si fueran datos.
test('la cabecera se reconoce por su forma y no por lo que dice su primera celda', () => {
  const root = tempRoot('ops-human-cabecera-')
  const leer = (texto) => {
    fs.writeFileSync(path.join(root, 'HUMAN_ACTIONS.md'), texto)
    return P.readHumanActions(root)
  }

  const propia = leer(`# Acciones humanas

| Tarea Requerida | Estado | Origen | Descripción / Instrucciones |
| :--- | :---: | :---: | :--- |
| sembrar-el-flag | pendiente | Ready | Sembrar \`FLAG\` en Infisical. |
`)
  assert.equal(propia.length, 1, 'la cabecera propia no es una acción humana')
  assert.equal(propia[0].task, 'sembrar-el-flag')

  // El caso que el propio 043 anticipa en Tradeoffs: con varias tablas hay que saltear la cabecera de
  // cada una. El archivo real que lo destapó tenía tres, una por sección.
  const varias = leer(`# Acciones humanas

## Infraestructura

| Tarea Requerida | Estado | Origen | Detalle |
|---|---|---|---|
| sembrar-el-flag | pendiente | Ready | Sembrar el flag. |

## Accesos

| Bloqueo | Estado | Origen | Detalle |
| :--- | :--- | :--- | :--- |
| dar-acceso | resuelta | Ready | Dar el acceso. |
`)
  assert.deepEqual(varias.map((fila) => fila.task), ['sembrar-el-flag', 'dar-acceso'])
  assert.deepEqual(varias.map((fila) => fila.valid), [true, true])

  // Y sin fila de separadores no hay forma que reconocer, así que el literal del molde sigue siendo la
  // única defensa. Markdown no renderiza eso como tabla; el parser lee las filas igual.
  const sinGuiones = leer(`# Acciones humanas

| Tarea | Estado | Origen | Detalle |
| sembrar-el-flag | pendiente | Ready | Sembrar el flag. |
`)
  assert.deepEqual(sinGuiones.map((fila) => fila.task), ['sembrar-el-flag'])
})
