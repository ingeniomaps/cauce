'use strict'

// R18 en las pruebas de este repositorio: un doble —acá, un comando falso puesto delante en el `PATH`—
// sale del lugar compartido y declara por qué existe. Se mide la forma, no la razón: que el comentario
// esté no dice que sea cierto, y un falso escrito de otra manera —un ejecutable armado con `chmodSync`
// sobre una ruta que no se ve— no lo ve nadie más que quien revisa.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { sourceFiles } = require('../support/environment')

const ROOT = path.resolve(__dirname, '..', '..')
const SHARED = path.join(ROOT, 'test', 'support', 'fakes.js')
// Cuántas líneas arriba de la llamada se busca el porqué: alcanza para el comentario que encabeza el
// ayudante local que la envuelve, que es donde lo pone quien arma varios falsos iguales.
const REACH = 8

const tests = () => sourceFiles().filter((file) => file.startsWith(path.join(ROOT, 'test')) && file.endsWith('.js'))
  .filter((file) => file !== SHARED)

test('una prueba escribe un comando falso sólo con fakeCommand', () => {
  const direct = []
  for (const file of tests()) {
    const src = fs.readFileSync(file, 'utf8')
    for (const match of src.matchAll(/writeFileSync\(\s*path\.join\([^()]*'([A-Za-z][\w-]*)'\)/g)) {
      const call = src.slice(match.index, match.index + 800).split(/writeFileSync\(|fakeCommand\(/)[1]
      if (/mode:\s*0o?7/.test(call)) direct.push(`${path.relative(ROOT, file)}: ${match[1]}`)
    }
  }
  assert.deepEqual(direct, [], `comandos falsos escritos a mano:\n  ${direct.join('\n  ')}`)
})

test('cada comando falso dice por qué existe', () => {
  const silent = []
  let seen = 0
  for (const file of tests()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (!/\bfakeCommand\(/.test(line) || /require\(/.test(line)) return
      seen += 1
      const above = lines.slice(Math.max(0, i - REACH), i)
      if (!above.some((one) => /^\s*\/\//.test(one))) silent.push(`${path.relative(ROOT, file)}:${i + 1}`)
    })
  }
  assert.ok(seen > 10, `sólo se encontraron ${seen} comandos falsos`)
  assert.deepEqual(silent, [], `comandos falsos sin su porqué:\n  ${silent.join('\n  ')}`)
})
