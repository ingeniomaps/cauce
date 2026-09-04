'use strict'

// Las fábricas que comparten las cuatro suites de cargos. Viven acá porque copiarlas es lo que pudre
// una de las copias sin que nada falle: `installedProject` fija cómo se monta una instancia de prueba
// y `writeSkill` el mínimo que los controles de `evaluate` exigen — si eso cambia, cambia en un lugar.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempRoot, run, linkEngine } = require('./environment')
const catalog = require('../../engine/agents/catalog')

// Este repositorio es a la vez el toolkit y el catálogo que se mide, así que casi todo cuelga de acá.
const REPO = path.resolve(__dirname, '..', '..')
const AGENTS_ROOT = path.join(REPO, 'agents')
const AGENTS = catalog.list(REPO).map((role) => ({ type: role.type, slug: role.slug }))

// Una instancia recién creada con el motor enganchado: el montaje de casi todo lo que se prueba acá.
function installedProject(name) {
  const root = tempRoot('cauce-agents-')
  const target = path.join(root, 'demo-ops')
  const result = run(['init', target, '--name', name, '--mode', 'sidecar'])
  assert.equal(result.status, 0, result.stderr)
  linkEngine(target)
  return target
}

// Un cargo propio de la empresa, que es el único que puede recibir su propio aprendizaje. El cuerpo es
// el mínimo que los controles de `evaluate` exigen: sin esas tres frases, fallan.
function writeSkill(dir, name, description) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n`
    + 'No inventar. Requiere autorización. Exige evidencia observable.\n')
  return dir
}

// Los documentos de un cargo, sin las transcripciones: `evaluations/results/` registra lo que el cargo
// respondió un día —comandos propuestos incluidos—, y exigirle las reglas de un documento que alguien
// sigue es un error de categoría. Corregirlo falsearía la evidencia.
//
// Por lo mismo queda afuera el material adjunto a un caso —`evaluations/cases/<id>/`—: es lo que el
// cargo recibe, no lo que escribe, y adentro vive el `make` de otra empresa o una ruta de un árbol
// que acá no existe. Un fixture que citaba `make arch-lint` hizo que el guard lo pidiera en este
// Makefile; falsearlo para que pase sería escribir la guía de la empresa ficticia al revés.
function agentDocs() {
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'results' && path.basename(dir) !== 'cases') walk(file)
      } else if (entry.name.endsWith('.md')) {
        found.push(file)
      }
    }
  }
  walk(AGENTS_ROOT)
  return found
}

// Lo que hace una persona antes de aplicar: decir quién decide y qué cambia. `agent-promote` se niega
// sin eso y `seal` también, así que un test que sella sin firmar prueba un camino que no existe.
// Firma como firma producción: `sign-proposal.yml` deja «aprobada», no «pendiente». Mientras esta
// fixture dejaba el estado sin tocar, ninguna prueba veía el documento que el sello recibe de verdad.
function firmarPropuesta(file) {
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
    .replace(/^-[ \t]*Estado:[ \t]*pendiente[ \t]*$/mi, '- Estado: aprobada')
    .replace('- Responsable: por definir', '- Responsable: Quien Firma')
    .replace(/^(## Cambio propuesto\n)/m, '$1\nSe agrega la fuente que el informe trajo.\n'))
}

module.exports = {
  REPO, AGENTS_ROOT, AGENTS, installedProject, writeSkill, agentDocs, firmarPropuesta,
}
