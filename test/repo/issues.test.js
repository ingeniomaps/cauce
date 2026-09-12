'use strict'

// Los casos de `docs/issues/`: la cola de trabajo local. Lo que se mide acá no es el contenido —eso lo
// lee una persona— sino que cerrar uno sea un acto y no la consecuencia de que el código esté listo.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ISSUES = path.resolve(__dirname, '..', '..', 'docs', 'issues')

// Desde qué versión rige la convención. Los casos cerrados antes se quedan como están: retro-rellenar
// treinta cierres sería escribir de memoria lo que el contraste tenía que haber encontrado en su
// momento, que es justamente lo que la convención existe para no hacer.
const DESDE = [0, 65, 0]

const version = (raw) => String(raw || '').trim().split('.').map(Number)
// El piso es un parámetro porque las dos exigencias no empezaron el mismo día: el contraste rige desde
// 0.65.0 y la prueba nombrada desde 0.75.0. Retro-rellenar cualquiera de las dos sería escribir de
// memoria lo que en su momento no se hizo.
const alcanzado = (v, desde = DESDE) => v.length === 3 && !v.some(Number.isNaN)
  && (v[0] !== desde[0] ? v[0] > desde[0] : v[1] !== desde[1] ? v[1] > desde[1] : v[2] >= desde[2])

function cases() {
  return fs.readdirSync(ISSUES).filter((name) => /^\d{3}-.*\.md$/.test(name)).sort().map((name) => {
    const text = fs.readFileSync(path.join(ISSUES, name), 'utf8')
    const field = (key) => ((text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm')) || [])[1] || '').trim()
    return { name, text, estado: field('estado'), resueltoEn: field('resuelto-en') }
  })
}

// `resuelto-en` no es decoración: las dos comprobaciones de abajo arrancan comparando esa versión contra el
// piso desde el que rige cada convención, así que a un caso al que le falte la llave **no lo mira ninguna**
// —`version('')` da `[NaN]` y `alcanzado` devuelve `false`—. Queda exento de todo sin que nada avise, que es
// peor que fallar: una puerta que no ve algo no se distingue de una que lo aprobó.
//
// Ésta no lleva piso, al revés que las otras dos, y la diferencia está en qué se pide. `resuelto-en` es un
// dato que se puede mirar —el encabezado del propio caso ya dice en qué versión cerró—, y un cierre es un
// juicio que había que hacer en su momento. Rellenar el dato es leerlo; rellenar el cierre sería inventarlo.
test('un caso resuelto declara en qué versión se cerró', () => {
  const faltan = cases()
    .filter((one) => one.estado === 'resuelto' && !one.resueltoEn)
    .map((one) => `${one.name}: estado resuelto y sin «resuelto-en»`)
  assert.deepEqual(faltan, [], `casos cerrados que ninguna puerta mira:\n  ${faltan.join('\n  ')}`)
})

// Un ítem del recorrido se escribe de dos formas y las dos dicen lo mismo: la viñeta, y el título en negrita
// seguido de su destino —«**El `await`** — hecho»—. Contar sólo la viñeta medía el formato y no el contraste:
// los cierres de 083, 084, 085 y 087 recorren su enumeración entera en la segunda forma y daban cero ítems.
const ITEM = /^- |^\*\*.+?\*\*\s+—/gm

// R15 dice que la enumeración que más se pierde es la que escribió la propia unidad de trabajo: lo que
// es código se tacha solo, y la revisión pendiente o el borde que hay que mirar no dejan rastro de
// haberse hecho ni de no haberse hecho. Cerrar por el diff los deja adentro del caso, cerrado.
//
// Esto no comprueba que el cierre sea honesto —eso lo lee quien revisa— y sí que exista, que es lo
// único mecanizable. Vale lo mismo que dice R10 de sus seis: decir qué mide una puerta y qué no es
// parte de la puerta, porque una que se presenta como más fuerte de lo que es enseña a no creerle.
test('un caso resuelto trae el contraste contra lo que enumeró', () => {
  const faltan = []
  let mirados = 0
  for (const one of cases()) {
    if (one.estado !== 'resuelto' || !alcanzado(version(one.resueltoEn))) continue
    mirados += 1
    const cierre = (one.text.match(/\n## Cierre\n([\s\S]*?)(?=\n## |$)/) || [])[1] || ''
    const items = (cierre.match(ITEM) || []).length
    if (!items) faltan.push(`${one.name}: sin «## Cierre» con qué pasó con cada cosa que enumeró`)
  }
  assert.ok(mirados > 0, 'ningún caso alcanzó la convención: el recorrido no está midiendo nada')
  assert.deepEqual(faltan, [], `casos cerrados sin contraste:\n  ${faltan.join('\n  ')}`)
})

// Cerrar un caso es afirmar que algo que no funcionaba ahora funciona, y eso es una afirmación de
// mecanismo: lleva su registro. El cierre tiene que nombrar qué se corrió —la salida, la mutación vista
// en rojo, el número medido—, no sólo qué se decidió.
//
// Lo que atrapa es la mitad de arriba: que la sección exista y recorra su enumeración no dice que nadie
// haya ejecutado nada. Un arreglo comprobado a medias —se midió que lo nuevo aparecía y no que lo viejo
// se hubiera ido— pasó ese contraste, se publicó, y volvió como el caso siguiente.
//
// Y lo que **no** atrapa hay que decirlo: mide que la palabra esté, no que sea cierta. Igual que el
// contraste de arriba, la honestidad la sostiene quien cierra. Rige desde 0.75.0 y no antes, por lo
// mismo que el contraste rige desde 0.65.0: retro-rellenarlo sería escribir de memoria la prueba que en
// su momento no se corrió.
const NOMBRA_SU_PRUEBA = /mutaci[óo]n|comprobad|medid|probad|se corrió|corrida real|ejecutad|en rojo/i
test('un caso resuelto dice qué se corrió para saber que funciona', () => {
  const faltan = []
  let mirados = 0
  for (const one of cases()) {
    if (one.estado !== 'resuelto' || !alcanzado(version(one.resueltoEn), [0, 75, 0])) continue
    mirados += 1
    const cierre = (one.text.match(/\n## Cierre\n([\s\S]*?)(?=\n## |$)/) || [])[1] || ''
    if (!NOMBRA_SU_PRUEBA.test(cierre)) {
      faltan.push(`${one.name}: el cierre no nombra qué se corrió`)
    }
  }
  assert.ok(mirados > 0, 'ningún caso alcanzó la convención: el recorrido no está midiendo nada')
  assert.deepEqual(faltan, [], `casos cerrados sin decir cómo se supo que funciona:\n  ${faltan.join('\n  ')}`)
})

// Un caso dice su estado en dos lugares —el frontmatter y el encabezado que se lee primero— y quien
// cierra toca uno de los dos. Desincronizados, el que miente es el que se lee sin abrir el archivo.
test('el estado del frontmatter y el del encabezado dicen lo mismo', () => {
  const desacuerdos = []
  for (const one of cases()) {
    const abierto = /^\*\*🔴 abierto\*\*/m.test(one.text)
    const resuelto = one.text.match(/^\*\*🟢 resuelto en ([0-9.]+)\*\*/m)
    if (one.estado === 'abierto' && !abierto) desacuerdos.push(`${one.name}: abierto y el encabezado no`)
    if (one.estado === 'resuelto' && !resuelto) desacuerdos.push(`${one.name}: resuelto y el encabezado no`)
    if (resuelto && one.resueltoEn && resuelto[1] !== one.resueltoEn) {
      desacuerdos.push(`${one.name}: resuelto-en ${one.resueltoEn} y el encabezado dice ${resuelto[1]}`)
    }
  }
  assert.ok(cases().length > 30, `sólo se leyeron ${cases().length} casos`)
  assert.deepEqual(desacuerdos, [], `estados que no coinciden:\n  ${desacuerdos.join('\n  ')}`)
})
