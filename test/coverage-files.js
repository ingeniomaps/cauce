'use strict'

// Piso de cobertura por archivo, contra el registro de `coverage-baseline.json`.
//
// Los umbrales de `node --test` son globales, y un promedio deja que un módulo bien cubierto tape a
// uno flojo: con veintitrés archivos, `core/files.js` podía caer de 100% a 31% de ramas y mover el
// total menos de dos puntos. Un piso por archivo no pide que todos lleguen al mismo número —`cli/ops.js`
// no puede, sus comandos terminan en `process.exit`—; pide que ninguno retroceda.
//
// Uso:
//   node test/coverage-files.js <lcov>                       comprueba
//   node test/coverage-files.js <lcov...> --update           registra el mínimo como nuevo piso

const fs = require('node:fs')
const path = require('node:path')

const RAIZ = path.resolve(__dirname, '..')
const BASELINE = path.join(__dirname, 'coverage-baseline.json')
// Los workflows no se requieren nunca: los ejecuta el runtime del runner y los tests los leen como
// texto, así que no aparecen en el lcov. Excluirlos es declarar eso, no perdonarlos.
const SIN_COBERTURA = 'automatization/workflows/'
// Un punto de holgura, medido y no supuesto: `integrations/registry.js` alterna entre 48 y 49 de
// ramas sin que nadie lo toque. Sin esto el piso falla solo, y un gate que falla al azar se termina
// apagando.
//
// `integrations/state.js` se mueve mucho más —de 64 a 68— y por eso su piso quedó registrado en el
// mínimo en vez de en lo habitual. Varían tres ramas de `reconcile`, y el vaivén parece venir de que
// los archivos de test corren en paralelo. Vale perseguirlo: hasta entonces ese archivo tolera una
// regresión de hasta cuatro puntos, que es el precio de que el gate no falle al azar.
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

const argumentos = process.argv.slice(2)
const actualizar = argumentos.includes('--update')
const lcovs = argumentos.filter((valor) => valor && !valor.startsWith('--'))
if (!lcovs.length) {
  console.error('uso: node test/coverage-files.js <lcov...> [--update]')
  process.exit(2)
}

// El mínimo de todas las corridas, no la última. Una sola medición no alcanza para fijar un piso:
// `integrations/state.js` va de 64 a 68 según cómo caigan los archivos de test en paralelo, así que
// registrar la corrida que tocó dejaba el piso arriba de lo alcanzable y el gate fallando al azar.
// Nadie sube un piso por suerte; para subirlo hay que subir la cobertura en todas.
function piso(archivos) {
  const found = {}
  for (const archivo of archivos) {
    for (const [file, valores] of Object.entries(medido(archivo))) {
      const previo = found[file]
      found[file] = previo
        ? Object.fromEntries(Object.keys(valores).map((k) => [k, Math.min(valores[k], previo[k])]))
        : valores
    }
  }
  return found
}

const actual = piso(lcovs)

if (actualizar) {
  const anterior = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {}
  const registro = {}
  const movidos = []
  const podrian = []
  for (const file of enDisco()) {
    if (!actual[file]) continue
    registro[file] = {}
    for (const [metrica, valor] of Object.entries(actual[file])) {
      const antes = (anterior[file] || {})[metrica]
      if (antes === undefined) {
        registro[file][metrica] = valor
        movidos.push(`+ ${file}: ${metrica} ${valor}%`)
        continue
      }
      // Nunca sube solo. Tres corridas siguen sin ver el valle de un archivo que se mueve cuatro
      // puntos, así que una que salga alta subiría el piso por suerte y dejaría el gate fallando.
      // Subirlo es afirmar «esto se sostiene», y eso lo decide una persona editando el registro.
      registro[file][metrica] = Math.min(valor, antes)
      if (valor > antes) podrian.push(`= ${file}: ${metrica} llegó a ${valor}% (piso sigue en ${antes}%)`)
      else if (valor < antes) movidos.push(`↓ ${file}: ${metrica} ${antes}% → ${valor}%`)
    }
  }
  fs.writeFileSync(BASELINE, `${JSON.stringify(registro, null, 2)}\n`)
  // Nada se mueve en silencio: lo que baja es una regresión aceptada a mano y merece verse al hacerlo,
  // no sólo en el diff.
  for (const linea of movidos) console.log(`  ${linea}`)
  for (const linea of podrian) console.log(`  ${linea}`)
  console.log(`✓ piso registrado sobre ${lcovs.length} corrida(s) para ${Object.keys(registro).length} archivo(s)`)
  process.exit(0)
}

const pisoRegistrado = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
const errores = []
for (const file of enDisco()) {
  const tiene = actual[file]
  const debe = pisoRegistrado[file]
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
for (const file of Object.keys(pisoRegistrado)) {
  if (!enDisco().includes(file)) errores.push(`${file}: tiene piso y ya no existe; sacalo del registro`)
}

for (const error of errores) console.error(`✗ ${error}`)
if (errores.length) {
  console.error(`\n${errores.length} archivo(s) por debajo de su piso de cobertura.`)
  process.exit(1)
}
console.log(`✓ cobertura por archivo: ${Object.keys(pisoRegistrado).length} archivo(s) en su piso o por encima`)
