'use strict'

// Borrar un archivo instalado se lleva los directorios que quedan vacíos, y nunca sube más allá del límite.

const { tempRoot } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { removeFile } = require('../../engine/core/files')

test('removeFile limpia los directorios vacíos hasta el límite, y deja lo que tiene otra cosa', () => {
  const boundary = tempRoot('ops-borrar-')
  const nested = path.join(boundary, 'a', 'b')
  fs.mkdirSync(nested, { recursive: true })
  fs.writeFileSync(path.join(nested, 'uno.md'), 'x')
  fs.writeFileSync(path.join(boundary, 'a', 'vecino.md'), 'x')

  removeFile(path.join(nested, 'uno.md'), boundary)
  assert.equal(fs.existsSync(nested), false, 'el directorio que quedó vacío se va')
  assert.equal(fs.existsSync(path.join(boundary, 'a', 'vecino.md')), true, 'el que tiene un vecino se queda')

  fs.rmSync(path.join(boundary, 'a', 'vecino.md'))
  fs.mkdirSync(path.join(boundary, 'a', 'c'))
  fs.writeFileSync(path.join(boundary, 'a', 'c', 'dos.md'), 'x')
  removeFile(path.join(boundary, 'a', 'c', 'dos.md'), boundary)
  assert.equal(fs.existsSync(path.join(boundary, 'a')), false, 'sube mientras queden vacíos')
  assert.equal(fs.existsSync(boundary), true, 'y nunca borra el límite')

  // Un archivo cuyo directorio ya no está no es un error: no hay nada que limpiar.
  assert.doesNotThrow(() => removeFile(path.join(boundary, 'no', 'existe.md'), boundary))
})
