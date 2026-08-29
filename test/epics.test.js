'use strict'

// La épica leída como dato: qué acepta el parser de sus historias y criterios, qué exige el
// validador antes de dejarla activar, y qué pasa cuando creció hasta ser un directorio. Es
// `engine/planning/` llamado directo — `planning.test.js` prueba lo mismo desde afuera.

const { tempRoot } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const PC = require('../engine/planning/contracts')
const P = require('../engine/planning/parser')

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

  // La historia envuelta en dos renglones, con su servicio después del salto. En un solo renglón el
  // caso pasa aun con el corte puesto, que es lo que dejó vivir tanto tiempo al defecto.
  const wrapped = epic.stories.find((story) => story.slug === 'envuelta')
  assert.deepEqual(wrapped.criteria, ['C2'], 'el criterio vive en la primera línea')
  assert.equal(wrapped.service, 'app', 'y el servicio en la segunda')
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
