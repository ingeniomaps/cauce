'use strict'

// Piso de cobertura por archivo, contra el registro de `coverage-baseline.json`.
//
// Los umbrales de `node --test` son globales, y un promedio deja que un módulo bien cubierto tape a
// uno flojo: con veintitrés archivos, `core/files.js` podía caer de 100% a 31% de ramas y mover el
// total menos de dos puntos. Un piso por archivo no pide que todos lleguen al mismo número —`cli/ops.js`
// no puede, sus comandos terminan en `process.exit`—; pide que ninguno retroceda.
//
// Uso:
//   node test/coverage-files.js <lcov>              comprueba
//   node test/coverage-files.js <lcov> --update     registra lo actual como nuevo piso

const fs = require('node:fs')
const path = require('node:path')

const RAIZ = path.resolve(__dirname, '..')
const BASELINE = path.join(__dirname, 'coverage-baseline.json')
// Los workflows no se requieren nunca: los ejecuta el runtime del runner y los tests los leen como
// texto, así que no aparecen en el lcov. Excluirlos es declarar eso, no perdonarlos.
const SIN_COBERTURA = 'automatization/workflows/'
// Un punto de holgura, medido y no supuesto: en cuatro corridas seguidas `integrations/registry.js`
// alterna entre 48 y 49 de ramas, y `planning/parser.js` entre 72 y 73. Sin esto el piso falla solo,
// y un gate que falla al azar se termina apagando. La causa del vaivén merece mirarse aparte.
const HOLGURA = 1

function medido(lcov) {
  const found = {}
  let cur = null
  for (const line of fs.readFileSync(lcov, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) { cur = { file: line.slice(3).trim(), LF: 0, LH: 0, BRF: 0, BRH: 0, FNF: 0, FNH: 0 } }
    else if (cur && line === 'end_of_record') {
      const pct = (hit, total) => (total ? Math.floor((hit / total) * 100) : 100)
      found[cur.file] = {
        lines: pct(cur.LH, cur.LF), branches: pct(cur.BRH, cur.BRF), functions: pct(cur.FNH, cur.FNF),
      }
      cur = null
    } else if (cur) {
      const match = line.match(/^(LF|LH|BRF|BRH|FNF|FNH):(\d+)/)
      if (match) cur[match[1]] = Number(match[2])
    }
  }
  return found
}

// Los archivos que deberían tener piso, tomados del disco y no del lcov: uno que ningún test requiere
// no aparece ahí, así que confiar en el lcov dejaría entrar un módulo nuevo sin una sola prueba.
function enDisco() {
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const current = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(current)
      else if (entry.name.endsWith('.js')) found.push(path.relative(RAIZ, current))
    }
  }
  for (const dir of ['engine', 'automatization']) walk(path.join(RAIZ, dir))
  return found.filter((file) => !file.startsWith(SIN_COBERTURA)).sort()
}

const [lcov, modo] = process.argv.slice(2)
if (!lcov) { console.error('uso: node test/coverage-files.js <lcov> [--update]'); process.exit(2) }
const actual = medido(lcov)

if (modo === '--update') {
  const registro = {}
  for (const file of enDisco()) if (actual[file]) registro[file] = actual[file]
  fs.writeFileSync(BASELINE, `${JSON.stringify(registro, null, 2)}\n`)
  console.log(`✓ piso por archivo registrado para ${Object.keys(registro).length} archivo(s)`)
  process.exit(0)
}

const piso = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
const errores = []
for (const file of enDisco()) {
  const tiene = actual[file]
  const debe = piso[file]
  if (!debe) {
    errores.push(`${file}: sin piso registrado. Si es nuevo, corré "npm run coverage:update" y revisá el número`)
    continue
  }
  if (!tiene) { errores.push(`${file}: tiene piso pero ningún test lo carga`); continue }
  for (const metrica of ['lines', 'branches', 'functions']) {
    if (tiene[metrica] < debe[metrica] - HOLGURA) {
      errores.push(`${file}: ${metrica} bajó de ${debe[metrica]}% a ${tiene[metrica]}%`)
    }
  }
}
for (const file of Object.keys(piso)) {
  if (!enDisco().includes(file)) errores.push(`${file}: tiene piso y ya no existe; sacalo del registro`)
}

for (const error of errores) console.error(`✗ ${error}`)
if (errores.length) {
  console.error(`\n${errores.length} archivo(s) por debajo de su piso de cobertura.`)
  process.exit(1)
}
console.log(`✓ cobertura por archivo: ${Object.keys(piso).length} archivo(s) en su piso o por encima`)
