'use strict'

// Caso 303. «Hoy» es el día del huso que el proyecto declara, y UTC si no declara ninguno.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { tempRoot } = require('../support/environment')
const { TODAY, useRoot } = require('../../engine/cli/io')
const { validateOpsConfig } = require('../../engine/config/validate')

const OPS = path.resolve(__dirname, '..', '..', 'engine', 'cli', 'ops.js')
const withZone = (timeZone) => {
  const root = tempRoot('ops-huso-')
  fs.mkdirSync(path.join(root, 'planning', 'wip'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(timeZone ? { timeZone } : {}))
  fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), '# Backlog promovido\n')
  return root
}

test('la fecha sale del huso declarado, y sin declararlo sigue siendo UTC', () => {
  // Las 21:10 del 6 de octubre en Bogotá, que en UTC ya es el 7: la hora del reporte que abrió el caso.
  const evening = new Date('2026-10-07T02:10:00Z')
  useRoot(withZone('America/Bogota'))
  assert.equal(TODAY(evening), '2026-10-06')
  useRoot(withZone(''))
  assert.equal(TODAY(evening), '2026-10-07')
  // Se lee desde la carpeta de planning igual que desde la raíz: es lo que reciben casi todos los comandos.
  useRoot(path.join(withZone('America/Bogota'), 'planning'))
  assert.equal(TODAY(evening), '2026-10-06')
  // Y un huso que no existe no decide un día.
  useRoot(withZone('Marte/Olympus'))
  assert.equal(TODAY(evening), '2026-10-07')

  // El primer argumento de un comando no siempre es una raíz: con un cargo ahí, vale la que exportó el shim.
  const saved = process.env.OPS_ROOT
  process.env.OPS_ROOT = withZone('America/Bogota')
  try {
    useRoot('product-manager')
    assert.equal(TODAY(evening), '2026-10-06')
  } finally {
    if (saved === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = saved
  }
  // Un archivo roto no manda a leer el de la carpeta de arriba, que es de otra instancia.
  const outer = withZone('America/Bogota')
  const inner = path.join(outer, 'adentro')
  fs.mkdirSync(inner)
  fs.writeFileSync(path.join(inner, 'ops.config.json'), '{ roto')
  useRoot(inner)
  assert.equal(TODAY(evening), '2026-10-07')
  useRoot('')
})

test('check rechaza un huso que no existe y acepta uno que sí', () => {
  const about = (timeZone) => validateOpsConfig({ timeZone }).filter((one) => /timeZone/.test(one))
  assert.deepEqual(about('Europe/Madrid'), [])
  for (const wrong of ['Marte/Olympus', '', 5]) {
    assert.match(about(wrong).join(' '), /timeZone debe ser un huso IANA/, String(wrong))
  }
  assert.deepEqual(validateOpsConfig({}).filter((one) => /timeZone/.test(one)), [], 'no declararlo no es un error')
})

// El comando entero, sin reloj falso: dos husos a veinticinco horas de distancia nunca comparten día, así
// que dos instancias que sólo difieren en eso tienen que contestar fechas distintas a cualquier hora.
test('el CLI fecha con el huso de la instancia que le nombran', () => {
  const today = (timeZone) => {
    const root = withZone(timeZone)
    const out = spawnSync('node', [OPS, 'context', path.join(root, 'planning'), '--json'], { encoding: 'utf8' })
    return (out.stdout.match(/"today":\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1] || `sin fecha: ${out.stderr.slice(0, 200)}`
  }
  const east = today('Pacific/Kiritimati')
  const west = today('Pacific/Pago_Pago')
  assert.match(east, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(west, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(east > west, `${east} tendría que ser posterior a ${west}`)
})
