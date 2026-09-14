'use strict'

// Cómo llegan a un runner las reglas que rigen la instancia (casos 099 y 105). Su archivo de instrucciones las
// nombraba fijas —las cuatro de `system/`—, así que la sesión cargaba la que la empresa había sobrescrito y
// ninguna de las propias. El adaptador trae un marcador y el motor lo resuelve contra `effectiveRules` al
// instalar. Y como `upgrade` no reinstala, `check` y `doctor` comparan lo instalado con lo vigente.

const fs = require('node:fs')
const path = require('node:path')
const F = require('../core/files')
const O = require('../core/ownership')

// `imports` para el runner que carga archivos con `@ruta`; `list` para el que sólo lee prosa, donde un `@` no
// significa nada.
const MARKER = /\{\{RULES:(imports|list)\}\}/g
const START = '<!-- cauce:reglas inicio — lo reescribe "automation install" con las reglas vigentes -->'
const END = '<!-- cauce:reglas fin -->'
// Se reconoce por el arranque y no por la línea entera: quien quiera el bloque en un archivo propio escribe las
// dos marcas a mano, y pedirle el texto exacto de la primera es pedirle que acierte un guion largo.
const START_AT = '<!-- cauce:reglas inicio'
// Lo que un `CLAUDE.md` o un `GEMINI.md` instalado antes de 0.82.0 trae en el lugar del bloque.
const LEGACY_IMPORT = /^@\S*planning\/rules\/\S+\.md\s*$/

// Una regla que declara `aplica:` rige igual, y se carga sólo cuando se toca esa superficie. Lo que se
// ahorra está medido: el contexto de arranque de **cada** agente son ~16 K tokens sólo de lo que Cauce
// pone, y una regla que importa en una tarea de cada cien se leía cien veces (caso 141).
//
// El default es lo que vuelve seguro esto: sin el campo, la regla se carga como siempre. Al revés —pedir
// que declare `siempre` para seguir cargándose— cada instancia habría perdido sus reglas propias en el
// próximo `upgrade`, una por una y sin que nada lo dijera.
//
// `effectiveRules` no cambia: sigue devolviendo todo lo que rige, que es lo que `ops context` le entrega
// al recorrido. Acá sólo se decide qué se **carga**, y por eso la partición vive de este lado.
const SURFACE = /^aplica:[ \t]*(\S.*?)[ \t]*$/m
function surfaceOf(root, file) {
  try {
    const text = fs.readFileSync(path.join(root, file), 'utf8')
    // Sólo en el frontmatter: un `aplica:` en la prosa de una regla es una frase, no una declaración.
    if (!text.startsWith('---')) return ''
    const end = text.indexOf('\n---', 3)
    return end === -1 ? '' : ((text.slice(0, end).match(SURFACE) || [])[1] || '')
  } catch { return '' }
}

// Las que se cargan y las que sólo se nombran. Las dos listas salen de la misma lectura para que el
// bloque que se escribe y el aviso que lo audita no puedan discrepar: con dos recorridos, `doctor`
// reportaría como faltante la que a propósito no se carga, para siempre y sin forma de callarlo.
function split(root) {
  const loaded = []
  const named = []
  for (const file of O.effectiveRules(root)) {
    const surface = surfaceOf(root, file)
    if (surface) named.push({ file, surface })
    else loaded.push(file)
  }
  return { loaded, named }
}

// Cuánto pesa lo que el bloque carga, en bytes. En bytes y no en tokens a propósito: los bytes los mide
// el motor y se pueden comprobar, mientras que la equivalencia en tokens depende del modelo y del
// tokenizador. Un número estimado en una salida que alguien cita para decidir vale menos que uno exacto.
//
// Sólo `loaded`: una regla declarada por superficie no viaja en el arranque, y contarla haría que
// declararla no sirviera de nada. Vive acá —y no en quien lo imprime— porque lo miran dos, `install` al
// instalar y `check` en cada corrida, y con dos cuentas separadas se contradicen el día que alguien toque
// una sola.
function weight(root) {
  const { loaded } = split(root)
  let bytes = 0
  const files = []
  for (const file of loaded) {
    try {
      const size = fs.statSync(path.join(root, file)).size
      bytes += size
      files.push({ file, size })
    } catch { /* la que no está en disco ya la reporta `check` por su lado */ }
  }
  return { count: loaded.length, bytes, files: files.sort((a, b) => b.size - a.size) }
}

const KB = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

// A partir de dónde el peso deja de ser el costo de arrancar y pasa a ser una decisión que conviene mirar.
// El piso que Cauce impone —las cuatro reglas del sistema— son 38,3 KB, así que un umbral por debajo de
// eso avisaría en toda instancia recién creada y se apagaría por ruido el primer día: eso descartó los
// 60 KB que el caso 141 proponía. 64 KB deja ~26 KB para lo propio, que son varias reglas de tamaño
// normal, antes de que el aviso hable.
const HEAVY = 64 * 1024

// La línea que declara el peso, para que la digan igual `install` y `check`. Nombra las dos más grandes
// porque es lo accionable: saber que el bloque pesa no dice cuál conviene declarar por superficie.
function weightLine(root) {
  const { count, bytes, files } = weight(root)
  const top = files.slice(0, 2).map((one) => path.basename(one.file)).join(', ')
  return `el bloque de reglas carga ${count} archivo(s), ${KB(bytes)} en cada agente`
    + (top ? ` (las más grandes: ${top})` : '')
}

// Sólo cuando pasó el umbral. Devuelve lista porque es lo que `check` empalma con el resto de avisos.
function heavyRules(root) {
  return weight(root).bytes > HEAVY ? [weightLine(root)] : []
}

// Sin raíz el marcador queda como está —así lo leen las pruebas que revisan el texto de un adaptador—: un
// bloque vacío se leería igual que un proyecto sin reglas, y un marcador sin resolver se ve.
function fill(text, root) {
  if (!root || !text.includes('{{RULES:')) return text
  const { loaded, named } = split(root)
  return text.replace(MARKER, (_, format) => [
    START,
    ...loaded.map((file) => (format === 'imports' ? `@{{OPS_DIR}}${file}` : `- \`{{OPS_DIR}}${file}\``)),
    // Nombrada y no cargada: pesa una línea en vez de su archivo entero, y quien la lea sabe qué la
    // dispara. Va en el mismo bloque a propósito — fuera de él, una sesión que no corre un recorrido no
    // se enteraría de que existe, y una regla que nadie sabe que existe es una que no rige.
    ...named.map((one) => `- \`{{OPS_DIR}}${one.file}\` (aplica: ${one.surface})`),
    END,
  ].join('\n'))
}

function blockOf(text) {
  const start = text.indexOf(START_AT)
  if (start === -1) return null
  const end = text.indexOf(END, start)
  if (end === -1) return null
  return { start, end: end + END.length, body: text.slice(start, end + END.length) }
}

// Las reglas que nombra un archivo instalado, relativas a la raíz ops: las del bloque o, si es anterior al
// bloque, sus imports sueltos.
function listed(text) {
  const found = blockOf(text)
  const lines = found ? found.body.split('\n') : text.split('\n').filter((line) => LEGACY_IMPORT.test(line))
  return lines.map((line) => (line.match(/planning\/rules\/[^\s`]+\.md/) || [])[0]).filter(Boolean)
}

// Un archivo de instrucciones con cambios de la empresa se conserva, y hasta acá eso lo dejaba sin reglas
// nuevas para siempre. Recibe el bloque donde estaba el suyo, o donde estaban los imports fijos de antes, y el
// resto queda como lo dejó quien lo editó. Devuelve null si el archivo no tiene dónde recibirlo: uno propio,
// sin marcas ni imports de Cauce, no se toca.
function withBlock(text, rendered) {
  const fresh = blockOf(rendered)
  if (!fresh) return null
  const current = blockOf(text)
  if (current) return `${text.slice(0, current.start)}${fresh.body}${text.slice(current.end)}`
  const lines = text.split('\n')
  const first = lines.findIndex((line) => LEGACY_IMPORT.test(line))
  if (first === -1) return null
  const kept = lines.filter((line, index) => index === first || !LEGACY_IMPORT.test(line))
  kept[first] = fresh.body
  return kept.join('\n')
}

// Qué archivos de un runner nombran otras reglas que las vigentes: sólo los que su adaptador entrega con el
// marcador y que están en disco. Se carga tarde porque `runners` usa `fill` para renderizar.
function drift(root, name) {
  const { runnerManifest, runnerPaths, resolveItem } = require('./runners')
  const runner = runnerManifest(root, name)
  const paths = runnerPaths(root, name, runner)
  // Contra todo lo que rige, y no contra la partición: una regla declarada por superficie igual aparece
  // en el bloque —nombrada en vez de importada—, y `listed` extrae la ruta de las dos formas. Así que el
  // audit la ve y no la extraña, sin que este lado tenga que saber que la partición existe.
  //
  // Se intentó filtrar acá por simetría con `fill` y no cambiaba nada: la mutación que lo revertía dejaba
  // las pruebas en verde. Queda dicho porque la simetría es tentadora y el código que no altera ninguna
  // conducta se lee como si sostuviera algo.
  const expected = O.effectiveRules(root)
  const found = []
  for (const item of [...(runner.instructions || []), ...(runner.artifacts || [])]) {
    const { source, target } = resolveItem(paths, root, name, item)
    if (!fs.existsSync(target) || !fs.readFileSync(source, 'utf8').includes('{{RULES:')) continue
    const text = fs.readFileSync(target, 'utf8')
    const have = listed(text)
    const missing = expected.filter((file) => !have.includes(file))
    const extra = have.filter((file) => !expected.includes(file))
    if (!blockOf(text) && !have.length) found.push({ target: item.target, bare: true, missing, extra })
    else if (missing.length || extra.length) found.push({ target: item.target, bare: false, missing, extra })
  }
  return found
}

// Escribe el bloque nuevo dentro de un archivo con cambios propios; dice si hubo algo que escribir.
function refresh(file, rendered) {
  const current = fs.readFileSync(file, 'utf8')
  const updated = withBlock(current, rendered)
  if (updated === null || updated === current) return false
  F.atomicWrite(file, updated)
  return true
}

function driftLine(name, one) {
  if (one.bare) {
    return `${one.target} no carga las reglas vigentes; reinstalá el adaptador (make install-${name}), `
      + `y si ese archivo es tuyo, marcá dónde va el bloque con ${START_AT} --> y ${END}`
  }
  const parts = [
    one.missing.length ? `no carga ${one.missing.join(', ')}` : '',
    one.extra.length ? `carga ${one.extra.join(', ')}, que ya no rige` : '',
  ].filter(Boolean)
  return `${one.target} ${parts.join(' y ')}; reinstalá el adaptador (make install-${name})`
}

// Lo mismo para cada runner que esta instancia instaló, que es lo que `check` mira en cada corrida: una regla
// escrita después de instalar, o traída por un `upgrade`, no llega a ninguna sesión hasta reinstalar.
function staleLines(root) {
  const { RUNNER_NAMES } = require('./runners')
  const recorded = Object.keys(require('../core/manifest').readRunners(root))
  const lines = []
  for (const name of RUNNER_NAMES) {
    if (!recorded.some((key) => key.startsWith(`${name}/`))) continue
    // Sin el paquete no hay adaptador contra el cual comparar, y eso ya lo dice `automation doctor`.
    try { for (const one of drift(root, name)) lines.push(`${name}: ${driftLine(name, one)}`) } catch { continue }
  }
  return lines
}

module.exports = { fill, refresh, drift, driftLine, staleLines, split, weightLine, heavyRules }
