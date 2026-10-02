'use strict'

// Cauce no nombra a las empresas ni a los proyectos donde se usa. Muchos casos nacen en una instancia real y
// la sesión que los escribe pone su nombre, el de sus repositorios o una identidad de su nube; el repositorio es
// público, y lo que entra queda en la historia aunque después se saque. En los ejemplos van nombres ficticios
// —Acme, Globex, Initech—.
//
// La lista guarda los nombres como hash para que esta prueba no sea, ella misma, la mención que prohíbe. Se
// compara palabra por palabra, en minúsculas y cortando en todo lo que no sea letra o dígito, así que también
// atrapa el nombre dentro de una ruta, una variable de entorno o un correo. Para agregar uno:
// `printf '%s' nombre | sha256sum | cut -c1-16`.

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const FORBIDDEN = new Set([
  '623cff1cd4fff116', 'd753d7908319fc7c', '55871e7a2cf1879c', '0c0bcfed9db78f5e', '7abf3b7bb2013dca',
  '59d1f740213999b2', '1d6556840681508e', 'cfc7f49a6d3f9781', '66b61e6191ea3614', '156c182362aba86b',
  '4a0140b7bfa49271',
])
const hash = (word) => crypto.createHash('sha256').update(word).digest('hex').slice(0, 16)

test('ningún archivo del repositorio nombra una empresa o un proyecto donde se usa Cauce', () => {
  const root = path.resolve(__dirname, '..', '..')
  const listed = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  if (listed.status !== 0) return
  const found = []
  for (const file of listed.stdout.trim().split('\n')) {
    let text
    try { text = fs.readFileSync(path.join(root, file), 'utf8') } catch { continue }
    text.split('\n').forEach((line, index) => {
      if (line.toLowerCase().split(/[^a-z0-9]+/).some((word) => word && FORBIDDEN.has(hash(word)))) {
        found.push(`${file}:${index + 1}`)
      }
    })
  }
  assert.deepEqual(found, [], `menciones a reemplazar por un nombre ficticio:\n  ${found.join('\n  ')}`)
})

test('la comparación encuentra el nombre dentro de una ruta, una variable o un correo', () => {
  const words = (line) => line.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const line = '`../globex-ops/planning` y GLOBEX_KEY y ci@globex.co'
  assert.equal(words(line).filter((one) => one === 'globex').length, 3)
  assert.equal(hash('acme').length, 16)
})
