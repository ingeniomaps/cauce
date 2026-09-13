'use strict'

// Piso de cobertura por archivo, contra el registro de `coverage-baseline.json`.
//
// Los umbrales de `node --test` son globales, y un promedio deja que un módulo bien cubierto tape a
// uno flojo: con veintitrés archivos, `core/files.js` podía caer de 100% a 31% de ramas y mover el
// total menos de dos puntos. Un piso por archivo no pide que todos lleguen al mismo número —`cli/ops.js`
// no puede, sus comandos terminan en `process.exit`—; pide que ninguno retroceda.
//
// Uso:
//   node test/tools/coverage-files.js <lcov>                       comprueba
//   node test/tools/coverage-files.js <lcov...> --update           registra el mínimo como nuevo piso

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
// El registro es fijo en la corrida real, y `--baseline=` lo apunta a otro para poder ejercitar esta
// herramienta con números armados. Sin esa costura, probarla exigía editar el registro del propio
// repositorio —o sea, romper la puerta para mirarla—, que es por lo que nada la probaba hasta el 129.
const pointed = process.argv.slice(2).find((one) => one.startsWith('--baseline='))
const BASELINE = pointed
  ? path.resolve(pointed.slice('--baseline='.length))
  : path.join(__dirname, 'coverage-baseline.json')
// Los workflows no se requieren nunca: los ejecuta el runtime del runner y los tests los leen como
// texto, así que no aparecen en el lcov. Los fragmentos de `shared/` menos todavía: no son módulos
// sino texto que `{{INCLUDE:}}` pega dentro de un workflow al instalar. Excluirlos es declarar eso,
// no perdonarlos.
const NOT_COVERED = ['automatization/workflows/', 'automatization/shared/']
// Un punto de holgura, medido y no supuesto: `integrations/registry.js` alterna entre 48 y 49 de
// ramas sin que nadie lo toque. Sin esto el piso falla solo, y un gate que falla al azar se termina
// apagando.
//
// `integrations/state.js` se mueve mucho más —de 64 a 68— y por eso su piso quedó en el mínimo. La
// causa no es del repo: los tests que ejercitan el CLI lo lanzan como subproceso, y Node fusiona la
// cobertura de los hijos con lo que alcanzó a escribir cada uno. Medido cuando esas unidades vivían en
// un solo archivo —hoy repartidas en `contracts`, `integrations`, `core` y `bootstrap`—: sin lanzar
// ningún subproceso daba 61 estable seis veces; sumándole `ops.test.js`, que lanzaba cinco, 64 a 68.
// Mientras las órdenes terminen en `process.exit` no hay forma de probarlas en proceso, así que ese
// archivo tolera hasta cuatro puntos de regresión a cambio de que el gate no falle al azar.
//
// Lo mismo explica los pisos bajos de `cli/catalog.js`, `cli/wiring.js` y `cli/ops.js` —38, 45 y 47 de
// ramas—, y conviene decirlo acá porque un número así se lee como deuda y manda a escribir pruebas que
// no mueven nada: los tres usan `fail()` catorce, quince y ocho veces, y `fail()` es el único
// `process.exit` del CLI. Sus ramas de error sólo se ejercitan lanzando el comando, y lo que el hijo
// alcanzó a escribir se atribuye a medias. Están muy probados: los nombran diez, once y cincuenta
// suites.
//
// `runners/antigravity/hook.js` acumula las dos causas, y por eso su piso es el más bajo de todos. La del
// subproceso vale igual acá: las pruebas que ejercitan sus decisiones de `deny` y de `stop` lanzan el
// puente con `node -e` —tienen que hacerlo, porque miden cómo resuelve la raíz desde el workspace que
// Antigravity abre—, así que esas ramas se ejecutan sin que se le atribuyan. Y encima no usa `fail()`:
// su `main()` corre sólo bajo `require.main`, que al importarlo no se toma nunca, y el resto de lo que
// figura sin cubrir son guardas defensivas y segundos lados de `&&`/`||` dentro de un mismo `return`.
//
// Medido el 2026-09-13: **78,3 % de ramas reales contra un piso de 33**, y estable — 47/60 exacto en
// cinco corridas seguidas, sin una décima de variación. Un piso cuarenta y cinco puntos por debajo no
// protege de nada.
//
// Se sube a **75**, y el número sale de comprobar dónde muerde en vez de elegirlo con holgura: quitando
// la prueba que traduce decisiones al protocolo nativo, el archivo cae a 69 %. Con el piso en 70 eso
// **pasa** —`SLACK` se come el punto— y con 75 **cae**, que es lo que se le pide a un piso. Los tres
// puntos que quedan sobre 78,3 son para el denominador, que sí se mueve: al quitar esa prueba baja de 60
// ramas a 42, porque V8 sólo cuenta los bloques que se ejecutan.
//
// Lo que sí se cubrió es lo único que era conducta propia sin probar: el evento que `hookGroups` no
// conoce, que niega toda llamada a herramienta si un manifiesto lo escribe mal.
const SLACK = 1

// Cuán lejos puede quedar un piso de lo que el archivo mide. Registrar un piso y comprobar que sirve son
// dos actos distintos, y hasta el 129 sólo el primero tenía mecanismo: el del puente de Antigravity llegó
// a estar cuarenta y cinco puntos por debajo de lo real, así que quitar una prueba central lo bajaba nueve
// puntos y la puerta seguía en verde. La distancia crece sola —lo real sube cuando alguien agrega pruebas
// y el piso se queda donde estaba—, así que lo que hace falta no es un número más alto sino que alguien
// mire cuando se despega.
//
// Veinticinco sale de medir y no de elegir. Medido el 2026-09-13 sobre cinco corridas limpias y con los
// tres pisos del 129 ya subidos: con 25 no queda ningún par por encima, con 20 quedan dos y con 15 siete.
// Los dos más cercanos al umbral —`cli/archive.js` a 24 y `cli/ops.js` a 23— no varían ni un punto entre
// corridas, así que el umbral no puede empezar a fallar al azar, que es lo que apaga una puerta.
//
// `SHOW` es más bajo a propósito: por encima de quince la distancia se **muestra** sin fallar —hoy siete
// líneas, no doscientas—, y por encima de veinticinco falla. Avisar antes de frenar es lo que hace que
// subir un piso sea trabajo previsto y no una interrupción.
const MAX_DISTANCE = 25
const SHOW = 15

function measure(lcov) {
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
function onDisk() {
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const current = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(current)
      else if (entry.name.endsWith('.js')) found.push(path.relative(ROOT, current))
    }
  }
  for (const dir of ['engine', 'automatization']) walk(path.join(ROOT, dir))
  return found.filter((file) => !NOT_COVERED.some((prefix) => file.startsWith(prefix))).sort()
}

const argv = process.argv.slice(2)
const updating = argv.includes('--update')
const lcovs = argv.filter((value) => value && !value.startsWith('--'))
if (!lcovs.length) {
  console.error('uso: node test/tools/coverage-files.js <lcov...> [--update]')
  process.exit(2)
}

// El mínimo de todas las corridas, no la última. Una sola medición no alcanza para fijar un piso: un
// archivo que se mueve entre corridas —cuál y por qué, en `SLACK`— deja el piso arriba de lo
// alcanzable si se registra la corrida que tocó, y el gate fallando al azar. Nadie sube un piso por
// suerte; para subirlo hay que subir la cobertura en todas.
function floorOf(lcovFiles) {
  const found = {}
  for (const lcovFile of lcovFiles) {
    for (const [file, metrics] of Object.entries(measure(lcovFile))) {
      const previous = found[file]
      found[file] = previous
        ? Object.fromEntries(Object.keys(metrics).map((k) => [k, Math.min(metrics[k], previous[k])]))
        : metrics
    }
  }
  return found
}

const measured = floorOf(lcovs)

if (updating) {
  const recorded = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {}
  const record = {}
  const moved = []
  const couldRise = []
  for (const file of onDisk()) {
    if (!measured[file]) continue
    // La razón escrita sobrevive a una actualización. Cada entrada se reconstruye desde cero, así que sin
    // esto la primera corrida de `--update` borraría en silencio lo que alguien decidió a mano, y la
    // puerta volvería a pedir lo mismo la vez siguiente.
    record[file] = (recorded[file] || {}).far ? { far: recorded[file].far } : {}
    for (const [metric, value] of Object.entries(measured[file])) {
      const floor = (recorded[file] || {})[metric]
      if (floor === undefined) {
        record[file][metric] = value
        moved.push(`+ ${file}: ${metric} ${value}%`)
        continue
      }
      // Nunca sube solo. Tres corridas siguen sin ver el valle de un archivo que se mueve cuatro
      // puntos, así que una que salga alta subiría el piso por suerte y dejaría el gate fallando.
      // Subirlo es afirmar «esto se sostiene», y eso lo decide una persona editando el registro.
      record[file][metric] = Math.min(value, floor)
      if (value > floor) couldRise.push(`= ${file}: ${metric} llegó a ${value}% (piso sigue en ${floor}%)`)
      else if (value < floor) moved.push(`↓ ${file}: ${metric} ${floor}% → ${value}%`)
    }
  }
  fs.writeFileSync(BASELINE, `${JSON.stringify(record, null, 2)}\n`)
  // Nada se mueve en silencio: lo que baja es una regresión aceptada a mano y merece verse al hacerlo,
  // no sólo en el diff.
  for (const line of moved) console.log(`  ${line}`)
  for (const line of couldRise) console.log(`  ${line}`)
  console.log(`✓ piso registrado sobre ${lcovs.length} corrida(s) para ${Object.keys(record).length} archivo(s)`)
  process.exit(0)
}

const floors = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
const errors = []
const far = []
for (const file of onDisk()) {
  const has = measured[file]
  const needs = floors[file]
  if (!needs) {
    errors.push(`${file}: sin piso registrado. Si es nuevo, corré "npm run coverage:update" y revisá el número`)
    continue
  }
  if (!has) { errors.push(`${file}: tiene piso pero ningún test lo carga`); continue }
  for (const metric of ['lines', 'branches', 'functions']) {
    if (has[metric] < needs[metric] - SLACK) {
      errors.push(`${file}: ${metric} bajó de ${needs[metric]}% a ${has[metric]}%`)
      continue
    }
    const distance = has[metric] - needs[metric]
    const excused = (needs.far || {})[metric]
    if (distance > MAX_DISTANCE && !excused) {
      errors.push(`${file}: ${metric} está ${distance} puntos por encima de su piso (piso ${needs[metric]}%, `
        + `mide ${has[metric]}%). Subilo a un número comprobado —con qué pérdida cae— o registrá la razón `
        + 'por la que no se puede, en "far" al lado del piso')
    } else if (excused && distance <= MAX_DISTANCE) {
      errors.push(`${file}: ${metric} ya no está lejos de su piso (${distance} puntos); `
        + 'sacá la razón del registro')
    } else if (distance > SHOW) {
      far.push(`= ${file}: ${metric} mide ${has[metric]}% contra un piso de ${needs[metric]}% `
        + `(${distance} puntos)${excused ? ' — aceptado' : ''}`)
    }
  }
}
for (const file of Object.keys(floors)) {
  if (!onDisk().includes(file)) errors.push(`${file}: tiene piso y ya no existe; sacalo del registro`)
}

// La distancia se ve en cada corrida y no sólo al actualizar: es el dato que dice si un piso todavía
// sirve, y hasta el 129 sólo aparecía en `coverage:update`, que se corre cuando alguien se acuerda.
for (const line of far) console.log(`  ${line}`)
for (const error of errors) console.error(`✗ ${error}`)
if (errors.length) {
  console.error(`\n${errors.length} problema(s) de piso de cobertura.`)
  process.exit(1)
}
console.log(`✓ cobertura por archivo: ${Object.keys(floors).length} archivo(s) en su piso o por encima`)
