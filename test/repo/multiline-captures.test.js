'use strict'

// Caso 558: con la bandera `m`, un `\s` antes de capturar también consume el salto de línea, así que un campo vacío
// —`- Responsable:` sin nada— captura la línea de abajo. En la firma de una propuesta eso daba por firmada una sin
// responsable. Entre la etiqueta y lo que se captura va `[ \t]`, que no cruza de línea. Mira los literales de una línea
// con la bandera `m`; uno armado con `new RegExp` no lo ve.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
// Un literal de regex de una línea: el cuerpo, las banderas.
const LITERAL = /\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/([dgimsuy]*)/g
// Antes de capturar, de un `\S` o de una clase: lo que viene después es el valor del campo.
const CROSSES = /\\s[*+](?:\(|\\S|\[)/

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(full)
    return entry.name.endsWith('.js') ? [full] : []
  })
}

test('ninguna regex de varias líneas captura después de un \\s que cruza de línea', () => {
  const found = []
  for (const file of ['engine', 'automatization'].flatMap((dir) => sources(path.join(ROOT, dir)))) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, at) => {
      if (/^\s*\/\//.test(line)) return
      for (const [, body, flags] of line.matchAll(LITERAL)) {
        if (flags.includes('m') && CROSSES.test(body)) found.push(`${path.relative(ROOT, file)}:${at + 1}`)
      }
    })
  }
  assert.deepEqual(found, [])
})
