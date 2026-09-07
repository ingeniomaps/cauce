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
const alcanzado = (v) => v.length === 3 && !v.some(Number.isNaN)
  && (v[0] !== DESDE[0] ? v[0] > DESDE[0] : v[1] !== DESDE[1] ? v[1] > DESDE[1] : v[2] >= DESDE[2])

function cases() {
  return fs.readdirSync(ISSUES).filter((name) => /^\d{3}-.*\.md$/.test(name)).sort().map((name) => {
    const text = fs.readFileSync(path.join(ISSUES, name), 'utf8')
    const field = (key) => ((text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm')) || [])[1] || '').trim()
    return { name, text, estado: field('estado'), resueltoEn: field('resuelto-en') }
  })
}

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
    const items = (cierre.match(/^- /gm) || []).length
    if (!items) faltan.push(`${one.name}: sin «## Cierre» con qué pasó con cada cosa que enumeró`)
  }
  assert.ok(mirados > 0, 'ningún caso alcanzó la convención: el recorrido no está midiendo nada')
  assert.deepEqual(faltan, [], `casos cerrados sin contraste:\n  ${faltan.join('\n  ')}`)
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
