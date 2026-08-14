'use strict'

const fs = require('node:fs')
const path = require('node:path')

const REQUIRED = ['## Reglas', '## Por qué existe cada regla', '## Historial']
const ID_PATTERN = /\|\s*(BR-[A-Z0-9]+-\d{3})\s*\|/g

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
    if (!/> \*\*Dominio:\*\* .+ \| \*\*Estado:\*\* .+ \| \*\*Actualizado:\*\* \d{4}-\d{2}-\d{2}/.test(source)) {
      errors.push(`${relative}: falta metadata Dominio/Estado/Actualizado`)
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
