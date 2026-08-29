'use strict'

// Lo que se numera y se cita: reglas de negocio, números de regla y decisiones. Un id repetido o un
// estado sin declarar rompen la referencia por la que todo el sistema los nombra, y eso no falla
// solo — se lee como si estuviera bien. Las suites hermanas cubren épicas, cola y evidencia.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const B = require('../../engine/planning/business-rules')
const PC = require('../../engine/planning/contracts')

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
