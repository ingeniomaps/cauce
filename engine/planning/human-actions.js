'use strict'

// Las acciones humanas, de sus dos fuentes: la tabla `HUMAN_ACTIONS.md` y un archivo por fila en `human/`
// (caso 351). Quien pregunta qué bloquea, qué validar o qué archivar lee de acá y no distingue de dónde vino.
//
// La tabla fusiona por unión para que dos líneas de trabajo que registran una fila no choquen, y la unión no
// borra renglones: cuando una línea resuelve una fila mientras otra agrega la suya al lado quedan las dos
// versiones, la resuelta y la pendiente. El motor lee la pendiente y la tarea vuelve a estar bloqueada — una
// decisión que una persona tomó, deshecha por una fusión sin conflicto. Con un archivo por fila, resolver es
// editar un archivo que la otra línea no toca.
//
// La clave con la que el motor bloquea es `task:`, no el nombre del archivo: una fila puede ser de una épica
// o de un recorrido, y varias pueden ser de la misma. El nombre sólo tiene que ser único.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const P = require('./parser')

const DIR = 'human'
// Lo archivado: el archivo entero, movido. No es una fila que bloquee ni una que haya que listar.
const ARCHIVE = 'done'
const QUOTES = ['\'', '"']
// En un archivo el estado es la palabra sola, o la palabra y después su detalle. La tabla admite además lo
// que empiece igual —`resuelta?`—, y acá eso no resuelve nada.
const STATE = new RegExp(`^(${P.HUMAN_ACTION_STATES.join('|')})(?:\\s|$)`, 'i')
const oneLine = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean).join(' ')

// Misma forma que una fila de la tabla, más `file`. Cerrado por defecto (R27): un archivo sin estado, con
// uno fuera del vocabulario o con el campo escrito dos veces no está resuelto y bloquea — igual que la fila
// mal escrita. Dos `status` es lo que deja un conflicto resuelto quedándose con los dos lados.
function parse(name, raw) {
  // Un editor en Windows o un `core.autocrlf` no cambian lo que el archivo dice.
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const front = (text.match(/^---\n([\s\S]*?)\n---\n?/) || [])
  const all = (key) => [...(front[1] || '').matchAll(new RegExp(`^${key}:[ \\t]*(.*)$`, 'gm'))].map((one) => one[1])
  const field = (key) => {
    const bare = (all(key)[0] || '').trim()
    const quoted = bare.length > 1 && QUOTES.includes(bare[0]) && bare[bare.length - 1] === bare[0]
    return quoted ? bare.slice(1, -1).trim() : bare
  }
  const repeated = ['task', 'status', 'origin'].filter((key) => all(key).length > 1)
  const state = field('status')
  const known = repeated.includes('status') ? '' : (state.match(STATE) || [])[1] || ''
  return {
    task: field('task'), state, origin: field('origin'), action: oneLine(text.slice((front[0] || '').length)),
    valid: Boolean(known), resolved: known.toLowerCase() === 'resuelta', raw: '', file: `${DIR}/${name}`,
    readable: Boolean(front[0]), repeated,
  }
}

const entries = (dir) => {
  try { return fs.readdirSync(path.join(dir, DIR), { withFileTypes: true }) } catch { return [] }
}
const isAction = (entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md'

function fileRows(dir) {
  return entries(dir).filter(isAction).map((entry) => entry.name).sort()
    .map((name) => parse(name, P.read(path.join(dir, DIR, name))))
}

const read = (dir) => [...P.readHumanActions(dir), ...fileRows(dir)]

// La firma de una fila revivida es exacta y por eso es un error y no un aviso: la misma tarea, el mismo
// origen y la misma acción, una vez resuelta y otra pendiente. Una tarea que se vuelve a bloquear por otro
// motivo trae otra acción. Sólo puede pasar en la tabla.
function revivedRows(rows) {
  const table = rows.filter((row) => !row.file)
  const same = (one, other) => one.task === other.task && one.origin === other.origin && one.action === other.action
  const resolved = table.filter((row) => row.valid && row.resolved)
  return table.filter((row) => row.valid && !row.resolved && resolved.some((done) => same(done, row)))
    .map((row) => `HUMAN_ACTIONS: ${row.task} volvió a pendiente al juntar dos ramas: la misma fila figura `
      + 'también resuelta. Si la decisión ya se tomó, borrá la fila pendiente; si no, borrá la resuelta')
}

// Lo que en `human/` no se lee como una acción y lo parece: otra extensión, una subcarpeta, el README pisado.
// Nace afuera de lo que el motor mira, así que no bloquea y nada lo dice (R27). Lo que empieza con punto no
// lo parece: lo deja el sistema o git —`.DS_Store`, `.gitkeep`—, y rechazarlo ponía `check` en rojo por un
// archivo que nadie escribió.
function strays(dir) {
  const found = entries(dir).filter((entry) => !isAction(entry) && entry.name !== 'README.md'
    && !entry.name.startsWith('.') && !(entry.isDirectory() && entry.name === ARCHIVE))
    .map((entry) => `${DIR}/${entry.name}: no se lee como acción humana; va un archivo .md directamente en ${DIR}/`)
  const readme = P.read(path.join(dir, DIR, 'README.md'))
  return /^(?:\uFEFF)?---\r?\n/.test(readme)
    ? [...found, `${DIR}/README.md: trae un frontmatter, y el README no se lee como acción; va en su propio archivo`]
    : found
}

// Cada error nombra su archivo, que con una tabla no hacía falta: ahí la fila estaba a la vista.
function errors(dir, rows) {
  const found = []
  for (const row of rows.filter((one) => one.file)) {
    if (!row.readable) {
      found.push(`${row.file}: no arranca con un frontmatter que el motor pueda leer —\`---\`, los campos sin `
        + 'sangría y otro `---`—, así que no bloquea nada')
      continue
    }
    for (const key of row.repeated) found.push(`${row.file}: \`${key}\` está dos veces; dejá uno`)
    if (!row.task) found.push(`${row.file}: falta \`task\`, que es con lo que el motor bloquea; sin él no frena nada`)
    if (!row.valid && !row.repeated.includes('status')) {
      found.push(`${row.file}: status «${row.state}» no es \`${P.HUMAN_ACTION_STATES.join('` ni `')}\`; mientras `
        + 'no se entienda, la tarea queda bloqueada')
    }
  }
  return [...found, ...strays(dir), ...revivedRows(rows)]
}

// El archivo que figura resuelto sin que ningún commit lo diga, que es lo mismo que `unrecordedHumanActions`
// pregunta de la tabla (caso 121): una decisión que nadie dejó escrita es una aprobación autoservida. Sin
// repositorio calla, por lo mismo que aquél.
function unrecorded(dir, rows) {
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  if (git('rev-parse', '--show-toplevel').status !== 0) return []
  return rows.filter((row) => row.file && row.resolved).filter((row) => {
    const committed = git('show', `HEAD:./${row.file}`)
    return committed.status !== 0 || !parse(path.basename(row.file), committed.stdout).resolved
  }).map((row) => `${row.file}: ${row.task} figura resuelta y ningún commit la registró`)
}

// Una fila de archivo, escrita como renglón de tabla para el histórico y para mostrarla junto a las otras.
const asRow = (row) => row.raw
  || `| ${[row.task, row.state, row.origin, row.action].map((cell) => cell.replace(/(?<!\\)\|/g, '\\|')).join(' | ')} |`

module.exports = { DIR, ARCHIVE, read, errors, unrecorded, asRow }
