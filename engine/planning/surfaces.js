'use strict'

// Las superficies que la empresa declaró que no se pueden romper, leídas de la tabla «Qué no se puede
// romper» de `organization/company.md`. Las devuelve el motor y no un agente porque son un dato: quien
// las use para decidir cuánta revisión merece una tarea no puede depender de que alguien haya abierto
// el archivo (caso 205).
//
// Garantiza dos cosas. Una fila sin nombre de superficie —`Por definir` o vacía— no se cuenta como
// declarada, y `pending` lo dice: que no se sepa dónde vive un flujo crítico es un hallazgo, no una
// tabla vacía. Y si el archivo o la sección no están, o alguna celda de una fila declarada sigue en
// `Por definir`, `pending` también es verdadero, por lo mismo.

const fs = require('node:fs')
const path = require('node:path')

const HEADING = /^##\s+Qué no se puede romper\s*$/
const UNDECLARED = /^por definir$/i

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function criticalSurfaces(instanceRoot) {
  const file = path.join(instanceRoot, 'organization', 'company.md')
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return { declared: [], pending: true } }
  const lines = text.split('\n')
  const start = lines.findIndex((line) => HEADING.test(line))
  if (start === -1) return { declared: [], pending: true }
  const declared = []
  let pending = false
  let rows = 0
  let header = true
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break
    if (!line.trim().startsWith('|')) continue
    const [surface = '', stops = '', reaches = '', lives = ''] = cells(line)
    // El encabezado es lo que va antes del separador, se llame como se llame la columna: una empresa
    // puede renombrarla, y contarla como superficie mandaría a revisión cada tarea `express`.
    if (/^:?-{3,}/.test(surface)) { header = false; continue }
    if (header) continue
    rows += 1
    if (!surface || UNDECLARED.test(surface)) { pending = true; continue }
    // Una superficie con nombre y sin saber dónde vive sigue rigiendo, y el hueco se reporta igual.
    if ([stops, reaches, lives].some((cell) => !cell || UNDECLARED.test(cell))) pending = true
    declared.push({ surface, stops, reaches, lives })
  }
  return { declared, pending: pending || rows === 0 }
}

module.exports = { criticalSurfaces }
