'use strict'

// Si una escritura cae fuera de las raíces del proyecto, mirando dónde cae de verdad y no sólo cómo está
// escrita. Lo comparten los dos guards de límites —el que lee comandos y el de la herramienta de archivos—,
// que tienen que contestar lo mismo sobre la misma ruta.
//
// Qué garantiza. Una ruta escrita afuera frena como siempre, con una salvedad en el guard de comandos: el
// temporal del sistema se exime por dónde cae la escritura, así que un enlace de afuera que lleva ahí pasa.
// Una ruta escrita adentro que por un enlace simbólico cae afuera, también frena (caso 317). Y lo que se
// alcanza por un enlace y sigue siendo del proyecto no frena: la raíz declarada como enlace, un enlace entre
// carpetas de una raíz, y las carpetas que una línea de trabajo enlaza desde la instancia de la que salió.

const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { landing } = require('../core/files')
const { outsideRoots, opsRoot, configOf } = require('./input')

const real = (file) => landing(path.sep, file)

// Las raíces de la instancia de la que salió este árbol, si es un árbol de trabajo de otro. `ops line` arma
// una línea así: un árbol aparte de la instancia, con el producto enlazado desde la original. Quien trabaja
// en la línea escribe en esas carpetas, que son del proyecto aunque no cuelguen de la línea. Se le pregunta a
// git y no a un registro propio: es quien sabe de qué árbol salió éste.
function sourceRoots(input) {
  const root = opsRoot(input)
  if (!root) return []
  // Sin las variables de git del entorno: con `GIT_DIR` apuntando a otro repositorio, el origen sería ése.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
  const asked = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir',
    '--show-toplevel'], { encoding: 'utf8', env })
  const [common, top] = asked.status === 0 ? asked.stdout.trim().split('\n') : []
  if (!top || path.basename(common) !== '.git') return []
  const source = path.join(path.dirname(common), path.relative(top, real(root)))
  const declared = (configOf(root).workspaceRoots || []).map((entry) => path.resolve(source, entry.path))
  return [source, ...declared].map(real)
}

// Por qué una escritura a `raw` desde `base` queda afuera, o null si no queda. `lands` es dónde cae.
function beyond(input, base, raw, allowed) {
  const file = path.resolve(base, raw)
  if (outsideRoots(file, allowed)) return { file, lands: file }
  const lands = landing(base, raw)
  if (lands === file || !outsideRoots(lands, allowed.map(real))) return null
  return outsideRoots(lands, sourceRoots(input)) ? { file, lands } : null
}

// El mismo aviso en los dos guards: dónde cae, y por dónde se llegó si no es donde está escrito.
const reached = ({ file, lands }) => (lands === file ? file : `${lands} (a donde lleva ${file})`)

module.exports = { beyond, reached, real }
