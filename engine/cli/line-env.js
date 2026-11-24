'use strict'

// Los `.env*` del árbol de una línea (caso 543). Un worktree trae lo que git versiona, y el `.env` de un producto casi
// siempre está ignorado porque lleva claves: el árbol nacía sin la configuración de sus servicios, y nada lo decía.
// Acá se nombran los que faltan, se copian del checkout de siempre a pedido, sin pisar ninguno, y se compara uno que
// ya está contra el original para ver cuál envejeció.
//
// Nada de esto imprime un valor: la salida nombra archivos y claves. El 399 había decidido no escribir el `.env` del
// árbol para no pisar lo del producto; la copia lo cuida copiando sólo lo que falta, y lo que difiere se reemplaza
// únicamente con `--apply`, guardando el anterior fuera de los repositorios.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { fail, opsRoot, REFUSED, USAGE } = require('./io')
const LT = require('../core/line-trees')

// `.env`, `.env.local`, `.env.development`… La plantilla no entra porque se versiona: cuenta sólo lo que git ignora.
const ENV = /^\.env(?:\.[\w.-]+)?$/
const COMPOSE = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml']
const NAME_KEY = 'COMPOSE_PROJECT_NAME'
const PREV = '.env-prev'

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
// Sólo un archivo de verdad, mirado sin seguir enlaces: un `.env` que es un enlace llevaba la copia, y las claves, a
// un archivo de afuera del árbol. Lo que está y no es un archivo se nombra y no se toca.
const regular = (file) => {
  try { return fs.lstatSync(file).isFile() } catch { return false }
}
const present = (file) => {
  try { return Boolean(fs.lstatSync(file)) } catch { return false }
}

// Compose nombra el proyecto por la carpeta, y el árbol se llama como el repositorio para que `../` resuelva igual:
// desde el árbol es el mismo proyecto (caso 399). Se mira si hay compose y no se lee: lo que choca primero es ese
// nombre, que no está escrito en el archivo.
const hasCompose = (dir) => COMPOSE.some((file) => fs.existsSync(path.join(dir, file)))
const composeProject = (repo, line) => `${path.basename(repo)}-${line}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  .replace(/^[^a-z0-9]+/, '')

// Un valor como lo lee Compose: sin el comentario de una línea sin comillas, y sin las comillas.
const plain = (value) => {
  const quoted = /^(['"])(.*)\1/.exec(value)
  return quoted ? quoted[2] : value.replace(/\s+#.*$/, '').trim()
}
// El proyecto con que corre el compose de una carpeta, en el orden de Compose: el nombre de su `.env`, el `name:` del
// compose, y si no, la carpeta, normalizada como él (minúsculas, sólo `[a-z0-9_-]`, sin `_` ni `-` delante). Lo que no
// se puede saber desde acá vale `null`: un nombre que sale de una variable, uno que Compose rechazaría, y un `name:`,
// porque el compose no se lee (caso 399). Con `null` no se aconseja bajar nada.
const UNKNOWN = null
const VALID = /^[a-z0-9][a-z0-9_-]*$/
function projectIn(dir) {
  let text = ''
  try { text = fs.readFileSync(path.join(dir, '.env'), 'utf8') } catch { return '' }
  const value = plain(keysOf(text).get(NAME_KEY) || '').toLowerCase()
  return value && !VALID.test(value) ? UNKNOWN : value
}
const namesItself = (dir) => COMPOSE.some((file) => {
  try { return /^name[ \t]*:/m.test(fs.readFileSync(path.join(dir, file), 'utf8')) } catch { return false }
})
function projectOf(dir) {
  const own = projectIn(dir)
  if (own || own === UNKNOWN) return own
  if (namesItself(dir)) return UNKNOWN
  return path.basename(dir).toLowerCase().replace(/[^a-z0-9_-]+/g, '').replace(/^[-_]+/, '')
}

// Los `.env*` de la raíz del checkout de siempre que git ignora. Uno versionado lo trae el árbol solo.
function ignoredEnvFiles(source) {
  let names = []
  try { names = fs.readdirSync(source) } catch { return [] }
  const candidates = names.filter((one) => ENV.test(one) && regular(path.join(source, one)))
  if (!candidates.length) return []
  const ignored = git(source, 'check-ignore', '--', ...candidates).stdout.split('\n').filter(Boolean)
  return candidates.filter((one) => ignored.includes(one)).sort()
}

const missing = (source, tree) => ignoredEnvFiles(source).filter((one) => !present(path.join(tree, one)))

// Las claves de un `.env`, con su valor, para comparar: nunca salen de acá.
function keysOf(text) {
  const keys = new Map()
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*=(.*)$/.exec(line)
    if (match) keys.set(match[1], match[2].trim())
  }
  return keys
}

// El nombre de proyecto de la línea en el `.env` del árbol, en lugar del que traía del original.
// Una sola vez: si la clave se repite, la que vale es otra que la primera, y el árbol seguía siendo el otro proyecto.
function withProject(text, project) {
  const line = `${NAME_KEY}=${project}`
  const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${NAME_KEY}[ \\t]*=[^\\r\\n]*(\\r?\\n|$)`, 'gm')
  let first = true
  const replaced = text.replace(pattern, (found, end) => (first ? ((first = false), `${line}${end}`) : ''))
  if (!first) return replaced
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`
}

// Copia un archivo del original al árbol, y si es el `.env` de un repositorio con compose, le deja el
// nombre de proyecto de la línea.
function copyInto(source, tree, file, project) {
  const from = path.join(source, file)
  const to = path.join(tree, file)
  // Se borra antes de copiar: un hardlink comparte el archivo con otro de afuera, y copiar encima lo escribía también.
  if (present(to)) fs.unlinkSync(to)
  fs.copyFileSync(from, to)
  if (file === '.env' && project) fs.writeFileSync(to, withProject(fs.readFileSync(to, 'utf8'), project))
}

// Lo que falta, copiado. Nunca pisa: un archivo que ya está en el árbol es de quien lo escribió.
function copyMissing(source, tree, repo, line) {
  const project = hasCompose(tree) ? composeProject(repo, line) : ''
  const files = missing(source, tree)
  for (const file of files) copyInto(source, tree, file, project)
  return files
}

// Cómo difiere cada `.env*` del árbol del original, por clave. El nombre de proyecto no cuenta: el de la línea es
// distinto a propósito.
function drift(source, tree) {
  return ignoredEnvFiles(source).map((file) => {
    const at = path.join(tree, file)
    if (!present(at)) return { file, absent: true }
    if (!regular(at)) return { file, odd: true }
    const theirs = keysOf(fs.readFileSync(path.join(source, file), 'utf8'))
    const ours = keysOf(fs.readFileSync(path.join(tree, file), 'utf8'))
    theirs.delete(NAME_KEY)
    ours.delete(NAME_KEY)
    return {
      file,
      added: [...theirs.keys()].filter((key) => !ours.has(key)),
      removed: [...ours.keys()].filter((key) => !theirs.has(key)),
      changed: [...theirs.keys()].filter((key) => ours.has(key) && ours.get(key) !== theirs.get(key)),
    }
  })
}

const differs = (one) => !one.odd && (one.absent || one.added.length + one.removed.length + one.changed.length > 0)

function describe(one) {
  if (one.odd) return 'no es un archivo (un enlace o una carpeta): no se compara ni se toca'
  if (one.absent) return 'falta en el árbol'
  if (!differs(one)) return 'igual al original'
  return [one.added.length && `el original tiene ${one.added.join(', ')}`,
    one.removed.length && `sólo el árbol tiene ${one.removed.join(', ')}`,
    one.changed.length && `cambió el valor de ${one.changed.join(', ')}`].filter(Boolean).join('; ')
}

// `ops lines env <ops-root> <línea> [--apply]`: qué `.env*` de cada árbol envejeció o falta, y con `--apply`, la copia
// del original. El que se reemplaza queda en `lines/<línea>/.env-prev/<repo>/`, que no es de ningún repositorio.
function env(dir, name, cli) {
  const root = opsRoot(dir)
  const config = LT.config(root)
  const session = config.mode && LT.sessionOf(root, config)
  if (!session) return fail(`${root} no es una instancia sidecar con líneas.`, USAGE)
  const repos = LT.declared(root, config)[name]
  if (!repos) return fail(`la línea ${name || '(sin nombre)'} no está declarada en ops.config.json.`, USAGE)
  const apply = cli.has('--apply')
  const report = []
  for (const repo of repos) {
    const source = path.join(session, repo)
    const tree = LT.treeOf(session, name, repo)
    if (!fs.existsSync(tree)) { report.push({ repo, tree, files: [], absent: true }); continue }
    const files = drift(source, tree)
    if (apply) {
      const project = hasCompose(tree) ? composeProject(repo, name) : ''
      for (const one of files.filter(differs)) {
        if (!one.absent) {
          const keep = path.join(session, LT.DIR, name, PREV, repo)
          fs.mkdirSync(keep, { recursive: true })
          // Con la hora en el nombre: un segundo `--apply` pisaba el respaldo del primero.
          one.kept = path.join(keep, `${one.file}.${new Date().toISOString().replace(/[:.]/g, '-')}`)
          fs.copyFileSync(path.join(tree, one.file), one.kept)
        }
        copyInto(source, tree, one.file, project)
        one.copied = true
      }
    }
    report.push({ repo, tree, files })
  }
  if (cli.has('--json')) return console.log(JSON.stringify({ line: name, apply, repos: report }))
  for (const one of report) {
    if (one.absent) { console.log(`${one.repo}  el árbol no está: ops line lo arma`); continue }
    if (!one.files.length) console.log(`${one.repo}  el checkout de siempre no tiene .env* ignorados`)
    for (const file of one.files) {
      const done = file.copied ? ` → copiado${file.kept ? `; el anterior quedó en ${file.kept}` : ''}` : ''
      console.log(`${one.repo}/${file.file}  ${describe(file)}${done}`)
    }
  }
  const pending = report.some((one) => one.files.some((file) => differs(file) && !file.copied))
  if (pending) {
    console.log(`Para copiar del original lo que difiere: ops lines env <ops-root> ${name} --apply, que guarda `
      + 'el anterior')
    process.exitCode = REFUSED
  }
}

// Lo que un árbol deja del lado del producto al retirarse, para avisarlo (caso 544): Cauce no lo desarma. El
// proyecto de compose es propio si el `.env` del árbol le da un nombre distinto del original; si no, es el mismo, y
// bajarlo desde el árbol bajaría el del checkout de siempre.
function leftBehind(source, tree) {
  const [own, theirs] = [projectOf(tree), projectOf(source)]
  const unknown = own === UNKNOWN || theirs === UNKNOWN
  const project = hasCompose(tree) ? { name: !unknown && own !== theirs ? own : '', unknown } : null
  return { project, envFiles: ignoredEnvFiles(tree) }
}

module.exports = { leftBehind, projectIn, projectOf, PREV, missing, copyMissing, drift, keysOf, withProject,
  hasCompose, composeProject, env, NAME_KEY }
