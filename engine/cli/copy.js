'use strict'

// `ops copy <repo> [destino]`: una copia de un repositorio para mutar o probar sin tocar el árbol vivo (caso 536).
// R23 pide que una mutación que apaga una defensa corra en una copia siempre, y sin comando cada agente la armaba a
// mano por una de dos vías que fallan sin avisar: `git ls-files` deja afuera la prueba recién escrita, que todavía no
// está trackeada, y la mutación corre sin ella; `cp -r` arrastra lo ignorado, y una caché de 11 GB dejó sin memoria a
// una máquina en cada mutación.
//
// Copia lo que git sigue más lo nuevo que no ignora, mide antes y se niega pasado un tope, nunca borra —el destino no
// existe o está vacío— y no lleva el `.git`: con él, un `git add` en la copia stagea en el repositorio de verdad.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { fail, REFUSED, USAGE } = require('./io')

const MB = 1024 * 1024
const DEFAULT_MAX_MB = 500

const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 256 * MB })

// Lo que se copia: lo trackeado y lo nuevo no ignorado que existe en disco. Uno borrado sin commitear sigue en el
// índice y no está: no se copia.
let listedError = ''
function listed(repo) {
  // `--deduplicate`: con un merge en conflicto, `-c` lista el mismo archivo una vez por etapa.
  const out = git(repo, 'ls-files', '-co', '--exclude-standard', '--deduplicate', '-z')
  listedError = (out.stderr || '').trim() || (out.error && out.error.code) || ''
  if (out.status !== 0) return null
  return out.stdout.split('\0').filter(Boolean).filter((one) => {
    try { return Boolean(fs.lstatSync(path.join(repo, one))) } catch { return false }
  })
}

// Si el destino está en un tmpfs, que vive en la memoria: ahí el tope es además un cuarto de la memoria disponible.
// Se lee de `/proc`, que es de Linux; en otro sistema queda sólo el tope fijo.
function tmpfsLimit(dir) {
  let mounts = ''
  let meminfo = ''
  try { mounts = fs.readFileSync('/proc/mounts', 'utf8'); meminfo = fs.readFileSync('/proc/meminfo', 'utf8') } catch {
    return Infinity
  }
  const real = (() => { try { return fs.realpathSync(dir) } catch { return dir } })()
  const point = mounts.split('\n').map((line) => line.split(' ')).filter((one) => one[1] && (real === one[1]
    || real.startsWith(one[1].endsWith('/') ? one[1] : `${one[1]}/`)))
    .reduce((deepest, one) => (!deepest || one[1].length > deepest[1].length ? one : deepest), null)
  if (!point || point[2] !== 'tmpfs') return Infinity
  const available = Number((/^MemAvailable:[ \t]+(\d+) kB/m.exec(meminfo) || [])[1])
  return Number.isFinite(available) ? (available * 1024) / 4 : Infinity
}

// La ruta real de algo que puede no existir todavía: el ancestro más cercano que existe, resuelto, más el resto. Sin
// eso, un repositorio alcanzado por un enlace y un destino hondo que no existe se leían como afuera.
function real(one) {
  const rest = []
  let at = one
  for (;;) {
    try { return path.join(fs.realpathSync(at), ...rest) } catch { /* se sube un nivel */ }
    const up = path.dirname(at)
    if (up === at) return one
    rest.unshift(path.basename(at))
    at = up
  }
}

function copy(given, target, cli) {
  if (!given) return fail('Falta el repositorio. `ops copy <repo> [destino]`', USAGE)
  const top = git(path.resolve(given), 'rev-parse', '--show-toplevel')
  if (top.status !== 0) return fail(`${given} no está en un repositorio git.`, USAGE)
  const repo = top.stdout.trim()
  const files = listed(repo)
  if (!files) return fail(`git no pudo listar los archivos de ${repo}: ${listedError}`, REFUSED)
  const bytes = files.reduce((total, one) => {
    const stat = fs.lstatSync(path.join(repo, one))
    return total + (stat.isFile() ? stat.size : 0)
  }, 0)
  const asked = cli.value('--max-mb')
  const maxMb = Number(asked || process.env.CAUCE_COPY_MAX_MB || DEFAULT_MAX_MB)
  if (!Number.isFinite(maxMb) || maxMb <= 0) {
    return fail('El tope —--max-mb o CAUCE_COPY_MAX_MB— lleva un número de MB mayor que cero.', USAGE)
  }

  let dest = target ? path.resolve(target) : ''
  const stat = dest ? (() => { try { return fs.lstatSync(dest) } catch { return null } })() : null
  if (stat && (!stat.isDirectory() || fs.readdirSync(dest).length)) {
    return fail(`${dest} ya existe y no es una carpeta vacía; ops copy no borra nada. Nombrá otra.`, REFUSED)
  }
  // Adentro del repositorio, la copia quedaría como archivos nuevos del árbol vivo, y la vuelta siguiente la copiaría.
  if (dest && (real(path.dirname(dest)) + path.sep).startsWith(real(repo) + path.sep)) {
    return fail(`${dest} está dentro de ${repo}: la copia quedaría en el árbol que copia. Nombrá un destino afuera.`,
      REFUSED)
  }
  const limit = Math.min(maxMb * MB, tmpfsLimit(dest ? path.dirname(dest) : os.tmpdir()))
  if (bytes > limit) {
    const where = limit < maxMb * MB ? ', un cuarto de la memoria disponible, porque el destino es un tmpfs' : ''
    return fail(`${repo} pesa ${(bytes / MB).toFixed(1)} MB sin lo ignorado, y el tope es ${(limit / MB).toFixed(0)} MB`
      + `${where}. Nombrá un destino en disco, o subí el tope con --max-mb.`, REFUSED)
  }
  try {
    if (!dest) dest = fs.mkdtempSync(path.join(os.tmpdir(), `cauce-copy-${path.basename(repo)}-`))
    else fs.mkdirSync(dest, { recursive: true })
  } catch (error) {
    return fail(`No se pudo crear ${dest || os.tmpdir()} (${error.code || error.message}).`, REFUSED)
  }
  const skipped = []
  const outward = []
  let copied = 0
  try {
    for (const one of files) {
      const from = path.join(repo, one)
      const to = path.join(dest, one)
      const kind = fs.lstatSync(from)
      if (!kind.isFile() && !kind.isSymbolicLink()) { skipped.push(one); continue }
      fs.mkdirSync(path.dirname(to), { recursive: true })
      if (kind.isFile()) fs.copyFileSync(from, to)
      else {
        // Un enlace que sale de la copia escribe donde apunta: si es el árbol vivo, la mutación lo toca.
        const link = fs.readlinkSync(from)
        const lands = path.resolve(path.dirname(to), link)
        if (path.isAbsolute(link) || !lands.startsWith(dest + path.sep)) outward.push(one)
        fs.symlinkSync(link, to)
      }
      copied += 1
    }
  } catch (error) {
    return fail(`La copia quedó a medias en ${dest} (${error.code || error.message}); ops copy no la borra.`, REFUSED)
  }
  console.log(dest)
  if (skipped.length) {
    console.error(`No se copió lo que no es archivo —submódulos, repos anidados—: ${skipped.join(', ')}`)
  }
  if (outward.length) {
    console.error('Estos enlaces apuntan fuera de la copia, y lo que se escriba por ellos cae ahí: '
      + outward.join(', '))
  }
  console.error(`${copied} archivo(s), ${(bytes / MB).toFixed(1)} MB. No vino lo que git ignora —dependencias, `
    + '`.env`, cachés—: si la suite lo necesita, instalalo en la copia. Tampoco el `.git`: si la suite usa git, '
    + '`git init` adentro de la copia.')
}

module.exports = { copy, listed }
