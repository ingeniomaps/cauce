'use strict'

// La aprobación de una operación: una lista de rutas que una persona escribió a mano para autorizar
// exactamente ese cambio. Existe porque la vía que había era una variable de entorno, y una variable es
// por sesión: prendida antes de lanzar el runner deja el guard apagado hasta que la sesión cierre.
//
// El archivo es uno solo para todos los guards, y por eso no se llama de gobernanza: lo que alguien
// escribe a mano son rutas, y quién las mira lo decide qué guard esté juzgando esa ruta. La
// contracara es que aprobar una migración y un borrado de prueba en la misma lista los autoriza a los
// dos — que es correcto, porque las escribió la misma persona en el mismo acto.
//
// El `Makefile` de este repositorio ya dice cuál es el alcance correcto —«la autorización de R10 es
// por operación y humana»—, y una llave que dura toda la sesión no lo es.
//
// **Se coteja, no se consume.** Borrar el archivo al leerlo daría el mismo alcance y traería dos cosas
// que no queremos: hoy ningún guard escribe en el repositorio, y `governance` corre antes que `verify`,
// así que un commit frenado por otra razón se habría llevado puesta la aprobación y habría que
// rehacerla. Cotejando, la aprobación vale para el conjunto que nombra y para ningún otro: en cuanto
// cambia lo que está en el índice deja de servir, que es «por operación» sin fecha ni contador.
//
// Queda a la vista porque `check` avisa mientras exista. Sin eso, un archivo olvidado sigue autorizando
// esas mismas rutas la próxima vez que alguien las stagee, que es la puerta abierta que esto evitaba.
//
// El archivo es la vía de cuando no hay chat. Con una persona hablando, lo que ella pidió ya está
// aprobado —cómo se sabe, en `chat.js`—, y escribir el archivo deja de ser necesario (caso 098).

const path = require('node:path')
const fs = require('node:fs')
const { opsRoot, cwdOf } = require('./input')
const CHAT = require('./chat')

const APPROVAL = '.ops-approval'

// Una ruta por línea, `#` para lo demás. El archivo ausente y el vacío son lo mismo: no hay nada
// aprobado, que es el estado normal. Un push se aprueba igual, con la línea `push <remoto> <rama>`
// tal cual y sin patrones: `feat/*` convertiría una aprobación puntual en un permiso (caso 103).
function read(root) {
  let text = ''
  try { text = fs.readFileSync(path.join(root, 'planning', APPROVAL), 'utf8') } catch { return [] }
  return text.split('\n').map((line) => line.replace(/#.*$/, '').trim()).filter(Boolean)
}

// Qué queda sin aprobar de lo que un guard está por bloquear. Se reporta sólo eso: mandar a revisar lo
// que ya se aprobó es lo que hace que la próxima vez nadie lea el mensaje. Cuenta también lo que la
// persona pidió en el chat.
function pending(root, files, input) {
  const approved = new Set(root ? read(root) : [])
  return CHAT.unauthorized(input, files.filter((file) => !approved.has(file)))
}

// El archivo que el guard va a leer, nombrado desde la carpeta en la que está la sesión. En sidecar la
// sesión se abre en el workspace y la instancia es una subcarpeta, así que `planning/` a secas nombraba
// otro directorio y pegar ahí no destrababa nada (caso 097).
function where(input) {
  const root = opsRoot(input)
  if (!root) return `planning/${APPROVAL}`
  const file = path.join(root, 'planning', APPROVAL)
  const session = process.env.CLAUDE_PROJECT_DIR || process.env.GEMINI_PROJECT_DIR || cwdOf(input)
  const relative = path.relative(session, file)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file
}

// Cómo se toma la salida angosta, dicho una vez porque lo dicen todos los bloqueos que la tienen. Lleva
// las líneas exactas porque cada guard coteja la ruta en la forma que tiene a mano —absoluta la que llega
// de un Write, relativa al repositorio la que sale del índice— y una línea en la otra forma no pega: sin
// decirla, lo que quedaba a mano era la variable (caso 089). Nombra también la variable: sigue
// existiendo, y esconderla haría que quien la necesite la descubra sin saber su alcance.
//
// Con una persona en el chat, además, deja anotado lo que se frenó —para eso llama a `hold`— y lo dice
// primero: contestar es más corto que editar un archivo, y es lo que la persona ya está haciendo. El
// archivo queda como cosa de ella: dicho en imperativo, el agente leía «aprobalo» como una orden para él
// e intentaba escribírselo en vez de reintentar, medido en una sesión real de Claude Code.
function HOW(variable, lines, input) {
  const chat = CHAT.hold(input, lines)
  return (chat
    ? 'Decile a la persona qué se frenó y por qué, y esperá: si contesta «dale», reintentá el mismo cambio y '
      + 'pasa. Si prefiere aprobarlo a mano, que pegue ella tal cual en'
    : 'Aprobalo pegando tal cual en')
    + ` ${where(input)} estas líneas:\n`
    + lines.map((line) => `  ${line}\n`).join('')
    + `Valen para ese conjunto y dejan de valer en cuanto cambie. La variable ${variable}=1 sigue existiendo `
    + 'y apaga el guard para toda la sesión, que es por lo que no es la vía recomendada.'
}

module.exports = { APPROVAL, read, pending, where, HOW }
