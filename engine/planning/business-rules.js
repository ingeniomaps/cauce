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

// Una regla derogada dice qué rige en su lugar, o por qué se dio de baja sin reemplazo (caso 208). Una épica
// o un ADR que la citan quedan apuntando a algo que ya no rige, y sin esto no hay cómo seguir el hilo: es
// R25 —el nuevo nombre lleva el viejo al lado— para las reglas de negocio.
//
// Que falte avisa y no rompe: las reglas derogadas que ya existen no lo traían, y cortarles `check` en el
// `upgrade` sería quitar sin deprecar. Lo que sí es error es citar un reemplazo que no existe, porque eso
// no lo escribió nadie antes de esta regla: es una cita rota que se acaba de escribir.
const REPLACED_BY = /\*\*Reemplazada por:\*\*\s*(BR-[A-Z0-9]+-\d{3})/
const DROPPED = /\*\*Razón de baja:\*\*\s*\S/

function lineage(root) {
  const errors = []
  const warnings = []
  const known = new Set()
  const gone = new Set()
  const derogated = []
  for (const file of markdownFiles(root)) {
    const relative = path.relative(path.dirname(root), file)
    const source = fs.readFileSync(file, 'utf8')
    const ids = [...source.matchAll(ID_PATTERN)].map((match) => match[1])
    for (const id of ids) known.add(id)
    const metadata = source.match(METADATA)
    if (metadata && metadata[2].trim().toLowerCase() === 'derogada') {
      derogated.push({ relative, source })
      for (const id of ids) gone.add(id)
    }
  }
  for (const { relative, source } of derogated) {
    const replacement = source.match(REPLACED_BY)
    const own = new Set([...source.matchAll(ID_PATTERN)].map((match) => match[1]))
    if (replacement && !known.has(replacement[1])) {
      errors.push(`${relative}: dice que la reemplaza ${replacement[1]}, que no existe en business-rules/`)
    } else if (replacement && own.has(replacement[1])) {
      // La que la reemplaza está en el mismo archivo, así que quedó derogada con ella: el hilo no lleva a nada.
      errors.push(`${relative}: dice que la reemplaza ${replacement[1]}, que está en el mismo archivo y quedó `
        + 'derogada con ella')
    } else if (replacement && gone.has(replacement[1])) {
      // Avisa y no rompe: la derogada intermedia puede nombrar a su vez la que rige, y el hilo se sigue.
      warnings.push(`${relative}: la reemplaza ${replacement[1]}, que también está derogada; apuntá a la regla `
        + 'que rige')
    } else if (!replacement && !DROPPED.test(source)) {
      warnings.push(`${relative}: está derogada y no dice qué rige en su lugar; agregá «**Reemplazada por:** `
        + 'BR-…» o, si no la reemplaza ninguna, «**Razón de baja:** …»')
    }
  }
  return { errors, warnings }
}

module.exports = { validate, lineage }
