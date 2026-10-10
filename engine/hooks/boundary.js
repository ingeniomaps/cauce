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
const { outsideRoots, opsRoot, configOf, DECLARE_IT } = require('./input')
const AP = require('./approval')

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

// Dónde cae lo que se borra. Borrar un enlace quita el enlace y no lo que hay detrás, así que el último
// tramo no se sigue; con una barra al final sí, que es como se nombra lo de adentro.
const removed = (base, raw) => (raw.endsWith('/') ? landing(base, raw)
  : path.join(landing(base, path.dirname(raw)), path.basename(raw)))

// Por qué una escritura a `raw` desde `base` queda afuera, o null si no queda. `lands` es dónde cae.
function beyond(input, base, raw, allowed, lands = landing(base, raw)) {
  const file = path.resolve(base, raw)
  if (outsideRoots(file, allowed)) return { file, lands: file }
  if (lands === file || !outsideRoots(lands, allowed.map(real))) return null
  return outsideRoots(lands, sourceRoots(input)) ? { file, lands } : null
}

// El mismo aviso en los dos guards: dónde cae, y por dónde se llegó si no es donde está escrito.
const reached = ({ file, lands }) => (lands === file ? file : `${lands} (a donde lleva ${file})`)

// La salida por una vez, que hasta 0.106.1 no existía: los dos guards sólo mandaban a declarar la ruta, y lo
// que una persona pide por única vez —liberar disco, limpiar una caché— se frenaba igual (caso 370). Es más
// angosta que la de los otros guards, por tres cosas medidas antes de abrirla:
//
// - **El ítem lleva el verbo y la ruta resuelta** —`borra <ruta>`, `escribe <ruta>`—. La ruta sola es el mismo
//   ítem que aprueban los otros guards, así que una credencial cuya lectura quedó aprobada para siempre
//   habría quedado aprobada también para borrarla.
// - **Sin orden del chat, ni con la ruta entera.** La lista de verbos dice que la frase pide algo, no qué pide:
//   «mirá <ruta> y decime cuánto pesa» autorizaba borrarla. En los otros guards ese error cuesta un archivo
//   que git devuelve; acá lo borrado no vuelve (R23). Queda la confirmación del bloqueo, que es el que muestra
//   el verbo y la ruta resuelta, y la línea en el archivo cuando no hay chat.
// - **Sin heredar**, como los gates de commit: lo que hay en una ruta cambia, y el borrado que se repite
//   después no es el que la persona miró.
//
// Lo que `destructive` cuida no se abre por acá: son dos guards y corren los dos.
const ONLY_CONFIRMED = () => false
const confirmedOnly = (input, items) => AP.pendingNow(opsRoot(input), items, input, ONLY_CONFIRMED)
const item = (verb, out) => `${verb} ${out.lands}`
const unconfirmed = (input, found) => confirmedOnly(input, [...new Set(found.map(({ verb, out }) => item(verb, out)))])

// El bloqueo de los dos guards, con todo lo que cae afuera junto: una sola respuesta lo cubre, y cortar en la
// primera ruta hacía que la persona contestara dos veces por un comando.
function refusal(input, found, where) {
  const held = unconfirmed(input, found)
  if (!held.length) return ''
  return `${where(found)}, fuera de las raíces declaradas en ops.config.json. ${DECLARE_IT}\n`
    + AP.HOW(null, held, input)
}

module.exports = { beyond, reached, real, removed, refusal, confirmedOnly }
