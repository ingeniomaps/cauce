'use strict'

const fs = require('node:fs')
const path = require('node:path')

const REQUIRED = ['## Reglas', '## Por qué existe cada regla', '## Historial']
const ID_PATTERN = /\|\s*(BR-[A-Z0-9]+-\d{3})\s*\|/g

// El estado se valida contra un conjunto cerrado, y no es prolijidad: es la diferencia entre una regla
// que rige y una que espera aprobación. Antes el patrón aceptaba cualquier texto y la plantilla traía
// `vigente` cableado, así que un cargo que copiaba la plantilla recibía «vigente» gratis y tenía que
// acordarse de debilitarlo — mientras la plantilla de ADR le presentaba el menú y lo obligaba a elegir.
//
// Esa asimetría produjo el mismo error en tres cargos distintos: reglas declarándose vigentes derivadas
// de un ADR que los mismos cargos habían dejado en `Propuesto`. Hacían lo que cada plantilla les pedía.
const STATES = ['propuesta', 'vigente', 'derogada']
const METADATA = /> \*\*Dominio:\*\* (.+) \| \*\*Estado:\*\* (.+) \| \*\*Actualizado:\*\* (\d{4}-\d{2}-\d{2})/

function markdownFiles(root) {
  if (!fs.existsSync(root)) return []
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const current = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...markdownFiles(current))
    else if (entry.name.endsWith('.md') && !['README.md', '000-template.md'].includes(entry.name)) {
      files.push(current)
    }
  }
  return files.sort()
}

function validate(root) {
  const errors = []
  const ids = new Map()
  for (const file of markdownFiles(root)) {
    const relative = path.relative(path.dirname(root), file)
    const source = fs.readFileSync(file, 'utf8')
    const metadata = source.match(METADATA)
    if (!metadata) errors.push(`${relative}: falta metadata Dominio/Estado/Actualizado`)
    else if (!STATES.includes(metadata[2].trim().toLowerCase())) {
      errors.push(`${relative}: Estado «${metadata[2].trim()}» no es ${STATES.join(', ')}`)
    }
    for (const heading of REQUIRED) {
      if (!source.includes(heading)) errors.push(`${relative}: falta ${heading}`)
    }
    const found = [...source.matchAll(ID_PATTERN)].map((match) => match[1])
    if (!found.length) errors.push(`${relative}: no declara reglas BR-DOM-NNN`)
    for (const id of found) {
      if (ids.has(id)) errors.push(`${relative}: ${id} duplicado en ${ids.get(id)}`)
      else ids.set(id, relative)
    }
  }
  return errors
}

module.exports = { markdownFiles, validate }
