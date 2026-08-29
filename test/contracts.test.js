'use strict'

// Los contratos de planificación leídos como datos: qué acepta el parser, qué rechaza el validador y
// qué exige la evidencia. Son `engine/planning/` llamado directo, sin levantar un proceso.
//
// `planning.test.js` prueba lo mismo desde afuera, corriendo `check` contra una instancia y mirando su
// exit code. Acá se ve por qué falla; allá, que falle.

const { tempRoot } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const B = require('../engine/planning/business-rules')
const PC = require('../engine/planning/contracts')
const P = require('../engine/planning/parser')

test('business rules exige contrato y detecta IDs duplicados', () => {
  const root = tempRoot('ops-business-rules-')
  const metadata = '> **Dominio:** demo | **Estado:** vigente | **Actualizado:** 2026-08-14\n'
  const sections = '\n## Reglas\n\n| BR-DEMO-001 | Regla | Resultado |\n'
    + '\n## Por qué existe cada regla\n\n- Razón.\n\n## Historial\n\n- Creación.\n'
  fs.writeFileSync(path.join(root, 'first.md'), `# Primera\n\n${metadata}${sections}`)
  fs.writeFileSync(path.join(root, 'second.md'), `# Segunda\n\n${metadata}${sections}`)

  const errors = B.validate(root)

  assert.ok(errors.some((error) => error.includes('BR-DEMO-001 duplicado')))

  // El estado decide si la regla rige o espera aprobación, así que sale del conjunto cerrado y no de
  // texto libre. Aceptar cualquier valor, con la plantilla trayendo `vigente` cableado, hizo que tres
  // cargos publicaran reglas vigentes derivadas de un ADR que ellos mismos dejaron en propuesto.
  fs.writeFileSync(path.join(root, 'second.md'), `# Segunda\n\n${metadata}${sections}`
    .replace('BR-DEMO-001', 'BR-DEMO-002').replace('Estado:** vigente', 'Estado:** casi-vigente'))
  const stale = B.validate(root)
  assert.ok(stale.some((error) => /Estado «casi-vigente» no es propuesta, vigente, derogada/.test(error)))

  for (const state of ['propuesta', 'vigente', 'derogada']) {
    fs.writeFileSync(path.join(root, 'second.md'), `# Segunda\n\n${metadata}${sections}`
      .replace('BR-DEMO-001', 'BR-DEMO-002').replace('Estado:** vigente', `Estado:** ${state}`))
    assert.equal(B.validate(root).some((error) => error.includes('Estado')), false, state)
  }
})

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

// El marcador se lee del artefacto, no de un objeto de prueba: sin esto `oversizedUnits` podía estar
// perfecta y la razón escrita en la épica no llegar nunca hasta ella. Se comprueba en los tres niveles
// porque cada uno la busca en un texto distinto — el archivo, el encabezado del hito, la línea de la
// tarea— y equivocarse de alcance en uno solo lo vuelve inerte ahí y en ningún otro lado.
test('la razón de no partir se lee en los tres niveles', () => {
  const root = tempRoot('ops-nosplit-')
  fs.mkdirSync(path.join(root, 'roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demo
status: open
---

# Épica 001 — Demo

(sin partir: el harness mide este servicio y no se entrega solo)

## Criterios

- **C1** — Cuando algo, alguien obtiene algo.

## Contexto relevante

- Contexto.

## Historias

- [ ] **una** (→ C1) — Incremento. (service: app)
`)
  fs.writeFileSync(path.join(root, 'BACKLOG.md'), `# Backlog

## Hito primero — Primero (sin partir: es una sola migración y partirla la deja a medias)

- [ ] **una** [lite] — Incremento. (→ C1) (epic: 001) (service: app) (sin partir: los seis bordes son el mismo camino)
`)

  assert.equal(P.readEpics(root)[0].noSplit, 'el harness mide este servicio y no se entrega solo')
  const [hito] = P.readBacklog(root)
  assert.equal(hito.noSplit, 'es una sola migración y partirla la deja a medias')
  assert.equal(hito.tasks[0].noSplit, 'los seis bordes son el mismo camino')

  // El alcance importa: la razón de la tarea es de la tarea, no del hito que la contiene.
  fs.writeFileSync(path.join(root, 'BACKLOG.md'), `# Backlog

## Hito primero — Primero

- [ ] **una** [lite] — Incremento. (service: app) (sin partir: los seis bordes son el mismo camino)
`)
  assert.equal(P.readBacklog(root)[0].noSplit, '', 'el hito no hereda la razón de su tarea')
})

test('parser acepta historias legadas y múltiples referencias de criterio', () => {
  const root = tempRoot('ops-parser-')
  fs.mkdirSync(path.join(root, 'roadmap'))
  fs.writeFileSync(path.join(root, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demo
status: open
service: app
---

## Criterios

- **C1** — Primer resultado.
- **C2** — Segundo resultado.
- **C3** — Tercer resultado.

## Contexto relevante

- Contexto.

## Historias

* **historia-legada** (→ C1, C2, C3) — Resultado. (service: app)
- [ ] **envuelta** (→ C2) — Incremento cuyo texto no entra en un solo renglón y sigue abajo.
  _Aceptación: resultado observable._ (service: app)
`)

  const [epic] = P.readEpics(root)

  assert.deepEqual(epic.stories[0].criteria, ['C1', 'C2', 'C3'])

  // El cuerpo de la historia es multilínea, pero el `$` del lookahead casaba fin de *línea* por la
  // bandera `m`, así que cortaba en el primer salto: la historia envuelta perdía su criterio y su
  // servicio, y `check` respondía «no declara (service: <ruta>)» sobre una historia que sí lo declara.
  // Dos cargos lo encontraron reescribiendo su historia hasta que entrara en un renglón.
  const wrapped = epic.stories.find((story) => story.slug === 'envuelta')
  assert.deepEqual(wrapped.criteria, ['C2'], 'el criterio vive en la primera línea')
  assert.equal(wrapped.service, 'app', 'y el servicio en la segunda')
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

test('roadmap valida trazabilidad, cierre y estructura de épicas grandes', () => {
  const epic = {
    file: 'epic-002-demo/spec.md',
    num: '003',
    status: 'closed',
    criteria: [{ id: 'C1' }, { id: 'C1' }, { id: 'C2' }],
    stories: [
      { slug: 'repetida', criteria: ['C1'] },
      { slug: 'repetida', criteria: ['C1'] },
    ],
  }
  const errors = PC.validateEpic(epic, new Set())
  assert.ok(errors.some((error) => error.includes('nombre indica 002')))
  assert.ok(errors.some((error) => error.includes('criterio duplicado C1')))
  assert.ok(errors.some((error) => error.includes('historia duplicada repetida')))
  assert.ok(errors.some((error) => error.includes('C2 no está cubierto')))
  assert.ok(errors.some((error) => error.includes('closed sin evidencia')))

  const root = tempRoot('ops-roadmap-')
  const roadmap = path.join(root, 'roadmap')
  const large = path.join(roadmap, 'epic-001-grande')
  fs.mkdirSync(large, { recursive: true })
  fs.writeFileSync(path.join(large, 'draft.md'), '# Archivo desconocido\n')
  const structure = PC.validateRoadmapStructure(root)
  assert.ok(structure.some((error) => error.includes('falta spec.md')))
  assert.ok(structure.some((error) => error.includes('draft.md: archivo auxiliar no permitido')))
})

// Una épica que creció deja de ser un archivo y pasa a ser un directorio con `spec.md` al lado de sus
// notas. `epicFiles` lo contempla, pero ningún test lo ejercitaba: la rama quedaba cubierta o no según
// qué dejara otra prueba en disco, y esa intermitencia hacía fallar el piso de cobertura una de cada
// doce corridas. El caso es real y ahora se mide siempre.
test('una épica que creció a directorio se lee desde su spec.md', () => {
  const root = tempRoot('ops-epic-dir-')
  const big = path.join(root, 'roadmap', 'epic-004-grande')
  fs.mkdirSync(big, { recursive: true })
  fs.writeFileSync(path.join(big, 'spec.md'), `---
epic: 004
title: Grande
status: open
---

## Criterios

- **C1** — Un resultado observable.

## Contexto relevante

- Contexto.

## Historias

- [ ] **una-historia** (→ C1) — Hace algo. (service: app)
`)
  // Vive al lado del spec y no se confunde con él: sólo `spec.md` define la épica.
  fs.writeFileSync(path.join(big, 'notes.md'), '# Notas sueltas\n')

  const epics = P.readEpics(root)
  assert.equal(epics.length, 1, 'una épica, no dos: notes.md no es una')
  assert.equal(epics[0].file, 'epic-004-grande/spec.md', 'y se nombra por su ruta dentro del directorio')
  assert.equal(epics[0].num, '004')
  assert.deepEqual(epics[0].stories.map((story) => story.slug), ['una-historia'])

  // Un directorio con nombre de épica pero sin spec.md no aporta ninguna: se ignora, no revienta.
  fs.mkdirSync(path.join(root, 'roadmap', 'epic-005-vacia'))
  assert.equal(P.readEpics(root).length, 1)
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

// Una viñeta bajo un hito que no cumple el contrato de tarea no la lee nadie: ni `check`, ni `tree`,
// ni el runner que busca trabajo. El motor ya rechaza por esto la épica mal nombrada —«nadie lo lee»—
// y el BACKLOG no tenía la red: dos tareas escritas daban cero en cola y cero errores.
test('una línea de BACKLOG que nadie puede leer es un error, no un silencio', () => {
  const root = tempRoot('ops-backlog-')
  const escribir = (cuerpo) => fs.writeFileSync(path.join(root, 'BACKLOG.md'), cuerpo)
  const errores = () => PC.validateBacklogStructure(root)

  escribir(`# Backlog promovido

Solo contiene trabajo aprobado y listo. Las ideas viven en \`INBOX.md\`.

- una viñeta de prosa fuera de todo hito no es una tarea

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. (→ C1) (epic: 001) (service: api)
`)
  assert.deepEqual(errores(), [], 'la forma canónica pasa, y la prosa fuera de un hito no se juzga')

  escribir(`# Backlog promovido

## Hito alta — Alta de cuenta

- [ ] **alta-email-nuevo** [lite] (→ C1) (epic: 001) — Crear la cuenta. (service: api)
`)
  const refs = errores()
  assert.equal(refs.length, 1)
  assert.match(refs[0], /BACKLOG hito alta: no la lee nadie/)
  assert.match(refs[0], /alta-email-nuevo/, 'el error cita la línea que se pierde')

  escribir(`# Backlog promovido

## Hito alta — Alta de cuenta

- [x] **alta-email-nuevo** [lite] — Crear la cuenta. (service: api)
`)
  assert.match(errores()[0], /se mueve a DONE\.md/, 'tildar en el backlog borra la tarea del sistema')

  escribir(`# Backlog promovido

## Hito alta

- [ ] **alta-email-nuevo** [lite] — Crear la cuenta. (service: api)
`)
  const encabezado = errores()
  assert.match(encabezado[0], /## Hito <slug> — <T[ií]tulo>/, 'el hito sin título deja sus tareas huérfanas')

  escribir(`# Backlog promovido

## Hito alta — Alta de cuenta

<!--
- [ ] **slug-de-tarea** [full] — Resultado. _Aceptación: conducta observable._ (service: ruta)
-->
`)
  assert.deepEqual(errores(), [], 'el ejemplo comentado enseña el formato sin ser juzgado')
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

// El marcador ya existía en todo el toolkit —`organization/`, `delivery/`, las propuestas de cargo— con
// el mismo significado: acá todavía no escribió nadie. Lo que faltaba era la puerta: una épica se
// activaba con el borde sin decidir adentro, y METHODOLOGY decía «parar y resolver» sin que nada parara.
test('una épica no se activa con un marcador sin resolver', () => {
  const root = tempRoot('ops-placeholder-')
  fs.mkdirSync(path.join(root, 'roadmap'))
  const epica = (status, riesgo) => {
    fs.writeFileSync(path.join(root, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demo
status: ${status}
service: app
---

## Criterios

- **C1** — Un alta con email nuevo devuelve 201.

## Contexto relevante

- \`api/src/auth.js\` ya valida el formato.

## Historias

- [ ] **alta-nueva** (→ C1) — Crear la cuenta. (service: api)

## Riesgos y decisiones humanas

- ${riesgo}
`)
    return P.readEpics(root)[0]
  }

  // Borrador: el marcador es justamente para esto, y no es un error.
  const borrador = epica('open', 'Qué proveedor de correo usamos: Por definir.')
  assert.deepEqual(borrador.placeholders, ['- Qué proveedor de correo usamos: Por definir.'])
  assert.deepEqual(PC.validateEpic(borrador), [])

  const activa = epica('active', 'Qué proveedor de correo usamos: Por definir.')
  assert.deepEqual(PC.validateEpic(activa), [
    'roadmap/epic-001-demo.md: active con 1 marcador(es) sin resolver — '
    + '"- Qué proveedor de correo usamos: Por definir."',
  ])

  // Minúscula y el otro marcador del molde cuentan igual.
  assert.equal(PC.validateEpic(epica('active', 'El umbral: por definir.')).length, 1)
  assert.equal(PC.validateEpic(epica('active', 'Alcance: Por completar.')).length, 1)

  // Resuelto, la épica activa pasa.
  assert.deepEqual(PC.validateEpic(epica('active', 'Ninguno.')), [])
  // Y cerrada tampoco puede llevar uno: la evidencia quedaría apoyada en un borde sin decidir.
  assert.equal(PC.validateEpic(epica('closed', 'El umbral: Por definir.'), new Set(['alta-nueva'])).length, 1)
})

// El mismo salto que ya cortaba una historia envuelta cortaba un criterio: con la bandera `m`, `$` casa
// fin de línea. La mitad que se perdía era la de atrás —cómo se verifica, qué debe seguir funcionando—,
// y una tarea que hereda su aceptación recibía medio criterio sin que nada lo dijera.
test('un criterio envuelto en varias líneas no se trunca', () => {
  const root = tempRoot('ops-criterio-')
  fs.mkdirSync(path.join(root, 'roadmap'))
  fs.writeFileSync(path.join(root, 'roadmap', 'epic-001-x.md'), `---
epic: 001
title: X
status: open
service: api
---

## Criterios

- **C1** — Un alta con email nuevo devuelve 201 y deja la cuenta usable, y el correo de bienvenida
  sale por la cola con el destinatario correcto.
- **C2** — Un alta con email repetido devuelve 409.

## Contexto relevante

- algo

## Historias

- [ ] **h** (→ C1, C2) — x. (service: api)
`)
  const epic = P.readEpics(root)[0]
  assert.deepEqual(epic.criteria.map((criterion) => criterion.id), ['C1', 'C2'])
  assert.equal(
    epic.criteria[0].text,
    'Un alta con email nuevo devuelve 201 y deja la cuenta usable, y el correo de bienvenida '
    + 'sale por la cola con el destinatario correcto.',
    'el envuelto llega entero y en una sola línea',
  )
  assert.equal(epic.criteria[1].text, 'Un alta con email repetido devuelve 409.')
})

// El número de regla es el identificador que cita todo el sistema —«R14» aparece 225 veces en este
// repositorio—, y el override sólo se detectaba por nombre de archivo: una regla propia en un archivo
// nuevo creaba un segundo R8 que nadie veía, y desde ahí «R8» significaba dos cosas en el mismo planning.
test('un número de regla tiene una sola definición', () => {
  const root = tempRoot('ops-reglas-')
  const rules = path.join(root, 'rules')
  fs.mkdirSync(path.join(rules, 'system'), { recursive: true })
  fs.writeFileSync(path.join(rules, 'system', 'commits.md'), '# Commits\n\n## R8 — Un commit por naturaleza\n\nx\n')
  fs.writeFileSync(path.join(rules, 'system', 'process.md'), '# Proceso\n\n## R1 — Pensar antes de editar\n\nx\n')
  fs.writeFileSync(path.join(rules, 'README.md'), '# Reglas\n\n## R99 — no es una regla, es prosa del índice\n')
  const propia = (name, body) => fs.writeFileSync(path.join(rules, name), body)

  assert.deepEqual(PC.validateRules(root), [], 'sólo system/, y el README no cuenta')

  // El override declarado: mismo nombre de archivo, y por eso puede redefinir sus números.
  propia('commits.md', '# Mis commits\n\n## R8 — Lo hacemos distinto\n\nx\n')
  assert.deepEqual(PC.validateRules(root), [])

  // Un archivo nuevo que usa R crea una segunda definición que nadie declaró.
  fs.rmSync(path.join(rules, 'commits.md'))
  propia('mias.md', '# Mías\n\n## R8 — Otra cosa distinta\n\nx\n')
  assert.deepEqual(PC.validateRules(root), [
    'rules/mias.md: R8 ya lo define rules/system/commits.md; una regla propia se numera P1..Pn, '
    + 'o vive en un archivo con el mismo nombre para declarar el override',
  ])

  // Numerada como propia, pasa; repetida entre dos archivos propios, no.
  propia('mias.md', '# Mías\n\n## P1 — Lo nuestro\n\nx\n')
  assert.deepEqual(PC.validateRules(root), [])
  propia('otras.md', '# Otras\n\n## P1 — Lo nuestro también\n\nx\n')
  assert.deepEqual(PC.validateRules(root), ['rules/otras.md: P1 ya lo define rules/mias.md'])
})

// Dieciséis ADR reales y ninguna aserción: tres se publicaron con el menú de estado sin elegir, así que
// el 19 % de las decisiones no decía si regía. Presentar un menú no obliga a elegir cuando nada valida.
test('un ADR declara su estado, sus secciones y un nombre con id', () => {
  const root = tempRoot('ops-adr-')
  const adr = path.join(root, 'adr')
  fs.mkdirSync(path.join(adr, 'system'), { recursive: true })
  const cuerpo = (estado) => `# ADR-001 — Algo

**Estado:** ${estado}
**Fecha:** 2026-08-22
**Responsable:** Equipo

## Contexto

x

## Decisión

x

## Consecuencias

x

## Estado de implementación

x
`
  const escribir = (name, texto) => fs.writeFileSync(path.join(adr, name), texto)

  escribir('001-algo.md', cuerpo('Aceptado'))
  assert.deepEqual(PC.validateAdr(root), [])
  for (const estado of ['Propuesto', 'Obsoleto', 'Reemplazada por [002](002-otra.md)',
    'Reemplazada por [ADR-007](007-otra.md) (2026-07-31)']) {
    escribir('001-algo.md', cuerpo(estado))
    assert.deepEqual(PC.validateAdr(root), [], estado)
  }

  // El menú de la plantilla, publicado tal cual: es el caso medido.
  escribir('001-algo.md', cuerpo('Propuesto | Aceptado | Obsoleto | Reemplazada por [NNN](./NNN-slug.md)'))
  assert.deepEqual(PC.validateAdr(root),
    ['adr/001-algo.md: el estado sigue siendo el menú de la plantilla; elegí uno'])

  escribir('001-algo.md', cuerpo('Vigente'))
  assert.match(PC.validateAdr(root)[0], /estado "Vigente" fuera de Propuesto \| Aceptado \| Obsoleto/)

  // Una sección que falta deja la decisión sin lo que la sostiene.
  escribir('001-algo.md', cuerpo('Aceptado').replace('## Consecuencias\n\nx\n', ''))
  assert.deepEqual(PC.validateAdr(root), ['adr/001-algo.md: falta ## Consecuencias'])

  // Y el nombre lleva el id, que es de lo que depende reconocer un override.
  escribir('001-algo.md', cuerpo('Aceptado'))
  escribir('decision-sobre-cache.md', cuerpo('Aceptado'))
  assert.deepEqual(PC.validateAdr(root), [
    'adr/decision-sobre-cache.md: nadie lo lee como decisión. Una ADR se nombra NNN-<slug>.md, '
    + 'y la del sistema <ID>-NNN-<slug>.md en system/.',
  ])
  fs.rmSync(path.join(adr, 'decision-sobre-cache.md'))

  // Dos decisiones con el mismo número dejan de poder citarse.
  escribir('001-otra.md', cuerpo('Aceptado'))
  assert.deepEqual(PC.validateAdr(root), ['adr/001-otra.md: 001 ya lo usa adr/001-algo.md'])
})

// Todo esto se probaba lanzando el CLI contra un planning en disco, así que cada rama costaba un
// R17 estaba escrita desde antes y nada la medía: una épica de veinte criterios pasaba `check` sin una
// queja, siempre que cada uno tuviera su historia.
//
// Cruzar el umbral no es el error —R17 dispara la división, no la decide, y dejar la unidad entera es
// una salida legítima—. El error es cruzarlo sin decidir, así que lo que se exige es la razón. Sin ese
// paso la escapatoria era prosa sin mecanismo, que es lo que la regla fue hasta que esto existió.
test('los umbrales de R17 exigen decidir, y la razón escrita alcanza', () => {
  const criterios = (n) => Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}` }))
  const tareas = (n) => Array.from({ length: n }, (_, i) => ({ slug: `t-${i}`, criteria: [], noSplit: '' }))
  const epica = (n, noSplit = '') => ({ file: 'epic-001-x.md', criteria: criterios(n), noSplit })

  assert.deepEqual(PC.oversizedUnits({
    epics: [epica(7)], milestones: [{ slug: 'h', tasks: tareas(9), noSplit: '' }],
  }), [], 'en el umbral no dice nada: el borde entra')

  const cruzada = PC.oversizedUnits({ epics: [epica(8)] })
  assert.equal(cruzada.length, 1)
  assert.match(cruzada[0], /roadmap\/epic-001-x\.md: criterios: 8 \(umbral 7 de R17\)/, 'cuánto y contra qué')
  assert.match(cruzada[0], /sin partir: <razón>/, 'y cómo se cierra sin partir, que es la otra salida')

  // La razón escrita es lo que cierra el agujero: sin ella la escapatoria no dejaba rastro.
  assert.deepEqual(PC.oversizedUnits({ epics: [epica(8, 'el harness mide este servicio y no se entrega solo')] }),
    [], 'decidida y con la razón puesta, la unidad pasa')

  const hito = { slug: 'primero', tasks: tareas(10), noSplit: '' }
  assert.match(PC.oversizedUnits({ milestones: [hito] })[0], /hito primero: tareas: 10/)
  assert.deepEqual(PC.oversizedUnits({ milestones: [{ ...hito, noSplit: 'una sola migración' }] }), [])

  // La tarea se cuenta por los criterios que hereda. La aceptación en prosa no se cuenta: cuántas
  // condiciones tiene una frase es una lectura, y un número inventado ahí sería peor que ninguno.
  const larga = { slug: 'muchos', criteria: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'], noSplit: '' }
  assert.match(PC.oversizedUnits({ milestones: [{ slug: 'h', tasks: [larga], noSplit: '' }] })[0],
    /BACKLOG muchos: criterios: 6 \(umbral 5 de R17\)/)
})

// Todo esto se probaba lanzando el CLI contra un planning en disco, así que cada rama costaba un
// proceso y un árbol de archivos. Extraída, `validateState` recibe el estado ya leído y se ejercita en
// memoria: es lo que la mudanza compra, y sin esto sería sólo mover código de archivo.
test('validateState juzga el estado ya leído, sin tocar disco', () => {
  const epica = (extra = {}) => ({
    file: 'epic-001-x.md', num: '001', title: 'X', status: 'open', hasContext: true,
    criteria: [{ id: 'C1', text: 'Cuando algo, alguien obtiene algo.' }],
    stories: [{ slug: 'h-uno', criteria: ['C1'], service: 'api' }],
    ...extra,
  })
  const tarea = (extra = {}) => ({
    slug: 'h-uno', tier: 'lite', cast: { build: '', review: [] }, epic: '001',
    service: 'api', acceptance: 'algo observable', criteria: ['C1'], ...extra,
  })
  const estado = (extra = {}) => ({
    epics: [epica()], milestones: [{ slug: 'h', title: 'H', tasks: [tarea()] }],
    done: { entries: [], set: new Set(), duplicates: [] }, wip: null, ...extra,
  })
  const errores = (extra) => PC.validateState(estado(extra))

  assert.deepEqual(errores(), [], 'un estado coherente no produce nada')

  // Épica: identidad, contrato y cierre.
  assert.match(errores({ epics: [epica({ num: '1' })] }).join('|'), /epic debe ser NNN/)
  assert.match(errores({ epics: [epica(), epica({ file: 'epic-001-y.md' })] }).join('|'),
    /número de épica duplicado 001/)
  assert.match(errores({ epics: [epica({ title: '' })] })[0], /falta title/)
  assert.match(errores({ epics: [epica({ status: 'vigente' })] }).join('|'), /status inválido/)
  assert.match(errores({ epics: [epica({ criteria: [] })] }).join('|'), /falta al menos un criterio/)
  assert.match(errores({ epics: [epica({ stories: [] })] }).join('|'), /falta al menos una historia/)
  assert.match(errores({ epics: [epica({ hasContext: false })] })[0], /Contexto relevante/)

  // Historias: slug, trazabilidad y servicio.
  const historia = (extra) => errores({
    epics: [epica({ stories: [{ slug: 'h-uno', criteria: ['C1'], service: 'api', ...extra }] })],
  })
  assert.match(historia({ slug: 'H Uno' }).join('|'), /slug inválido/)
  assert.match(historia({ criteria: [] }).join('|'), /no rastrea a un criterio/)
  assert.match(historia({ criteria: ['C9'] }).join('|'), /cita C9, que no existe/)
  assert.match(historia({ service: '' }).join('|'), /no declara \(service/)

  // Una épica activa sin nada pendiente tiene que cerrar.
  assert.match(errores({
    epics: [epica({ status: 'active' })], done: { entries: [], set: new Set(['h-uno']), duplicates: [] },
  }).join('|'), /active sin historias pendientes/)

  // Hitos y tareas.
  const hito = (extra) => errores({ milestones: [{ slug: 'h', title: 'H', tasks: [tarea(extra)] }] })
  assert.match(errores({ milestones: [{ slug: 'H Uno', tasks: [] }] })[0], /hito con slug inválido/)
  assert.match(errores({
    milestones: [{ slug: 'h', tasks: [] }, { slug: 'h', tasks: [] }],
  }).join('|'), /hito duplicado/)
  assert.match(hito({ service: '' }).join('|'), /falta \(service/)
  assert.match(hito({ acceptance: '', criteria: [] }).join('|'), /falta aceptación explícita/)
  assert.match(hito({ acceptance: 'Por definir.' }).join('|'), /la aceptación no está decidida/)
  assert.match(hito({ slug: 'ajena' }).join('|'), /no existe en epic-001/)
  assert.deepEqual(PC.validateState({
    ...estado(), roles: new Set(['backend-engineer']),
    milestones: [{ slug: 'h', tasks: [tarea({ cast: { build: 'inventado', review: [] } })] }],
  }).filter((error) => /cast/.test(error)),
  ['BACKLOG h-uno: el cast nombra inventado, que no está en el catálogo'])

  // WIP y evidencia.
  assert.match(errores({ wip: { task: 'ajena', complete: 1, pending: 0 } }).join('|'),
    /WIP ajena: no existe en BACKLOG ni DONE/)
  assert.match(errores({ wip: { task: 'h-uno', complete: 0, pending: 0 } }).join('|'),
    /el plan no tiene pasos que el motor pueda contar/)
  assert.match(errores({ done: { entries: [], set: new Set(), duplicates: ['h-uno'] } })[0],
    /DONE duplicado: h-uno/)

  // Acciones humanas.
  assert.match(PC.validateState({
    ...estado(), humanActions: [{ task: 'h-uno', state: 'COMPLETADO', valid: false }],
  }).join('|'), /estado "COMPLETADO" fuera de/)
})

// La precedencia con que se elige tarea es del protocolo: el WIP activo manda por ser el mutex, incluso
// con una acción humana abierta; sin WIP, la primera no terminada y no bloqueada. Se probaba lanzando
// `context` contra un planning en disco, así que cada rama costaba un proceso.
test('currentTask aplica la precedencia del protocolo sobre el estado ya leído', () => {
  const ST = require('../engine/planning/state')
  const tarea = (slug) => ({ slug, tier: 'lite', cast: { build: '', review: [] }, service: 'api' })
  const estado = (extra = {}) => ({
    milestones: [{ slug: 'h', tasks: [tarea('uno'), tarea('dos'), tarea('tres')] }],
    done: { set: new Set() }, wip: null, ...extra,
  })

  assert.equal(ST.currentTask(estado()).task.slug, 'uno', 'la primera del primer hito')
  assert.deepEqual(ST.currentTask(estado()).skipped, [])

  // El WIP manda aunque su tarea tenga una acción humana abierta: es el mutex.
  const conWip = ST.currentTask(estado({ wip: { task: 'dos', service: 'api' } }), [{ task: 'dos' }])
  assert.equal(conWip.task.slug, 'dos')
  assert.deepEqual(conWip.skipped, [], 'con WIP no se salta nada: hay una sola tarea posible')

  // Un WIP que apunta fuera del backlog igual se entrega, para poder cerrarlo.
  const huerfano = ST.currentTask(estado({ wip: { task: 'ajena', service: 'api' } }))
  assert.equal(huerfano.task.slug, 'ajena')
  assert.equal(huerfano.task.hito, '', 'sin hito, porque no está en la cola')

  // Sin WIP, lo bloqueado se salta y queda nombrado.
  const bloqueada = ST.currentTask(estado(), [{ task: 'uno' }])
  assert.equal(bloqueada.task.slug, 'dos')
  assert.deepEqual(bloqueada.skipped, ['uno'])

  // Lo ya terminado no vuelve a la cola.
  const hecha = ST.currentTask(estado({ done: { set: new Set(['uno', 'dos']) } }))
  assert.equal(hecha.task.slug, 'tres')

  // Todo bloqueado: no hay tarea, y las saltadas se enumeran para poder decir por qué.
  const todas = ST.currentTask(estado(), [{ task: 'uno' }, { task: 'dos' }, { task: 'tres' }])
  assert.equal(todas.task, null)
  assert.deepEqual(todas.skipped, ['uno', 'dos', 'tres'])
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
