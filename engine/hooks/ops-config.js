'use strict'

// Las dos llaves que deciden si un `git push` se publica —`runner.allowPush` y `runner.pushToLiveBranches`—
// viven en `ops.config.json`, y hasta 0.82.0 ningún guard miraba ese archivo: el bloqueo que dice «esto lo
// decide una persona» se levantaba escribiendo el archivo que lo levanta, por `Write` o por `sed -i`, y el
// mensaje del bloqueo nombra el campo exacto que hay que agregar (caso 114).
//
// **Protege esos dos campos y no el archivo.** Protegerlo entero repondría el candado que el 090 sacó: el
// límite de raíces manda a declarar la ruta en `writableOutsideRoots`, de este mismo archivo, así que
// frenar esa edición dejaría al agente sin la salida que el otro guard le acaba de indicar. Todo lo demás
// —raíces, migraciones, lo que sea— sigue pasando como trabajo normal.
//
// Son dos guards y un solo archivo, como `secrets` y `secrets-shell`: corren en eventos distintos y cada
// grupo cubre a cada guard una vez, mientras que lo que deciden —cuál es el archivo, qué llave cambió y
// cómo se dice— es uno solo y copiarlo dejaría dos mitades que dejan de coincidir.

const path = require('node:path')
const { block, commandOf, configOf, contentOf, cwdOf, filesOf, opsRoot } = require('./input')
const CHAT = require('./chat')
const { writesWithBase } = require('./shell')

const INSTANCE_CONFIG = 'ops.config.json'
const PROTECTED = ['allowPush', 'pushToLiveBranches']
const NAMES = PROTECTED.map((name) => `runner.${name}`).join(' y ')

// El valor de cada llave en la forma en que se comparan. Ausente no es vacío: sacar `pushToLiveBranches`
// cambia qué ramas alcanza el permiso y tiene que distinguirse de dejarlo en una lista sin ramas. Lo hace
// `JSON.stringify`, que de un campo ausente no devuelve nada y de ninguno presente devuelve la cadena vacía.
function keysOf(config) {
  const runner = (config && typeof config.runner === 'object' && config.runner) || {}
  return PROTECTED.map((name) => JSON.stringify(runner[name])).join(' ')
}

// El mensaje le habla a la persona y deja el permiso como cosa suya; el porqué de esa redacción está en
// `HOW`, en `approval.js`.
const HANDS_OFF = 'Lo decide una persona (R10): decile qué se frenó y esperá. Lo pone ella editando el '
  + `archivo, o pidiéndotelo en el chat nombrando ${INSTANCE_CONFIG}.`

function changeMessage(file) {
  return `${file} lleva las dos llaves que deciden qué push se publica, ${NAMES}, y este cambio las toca. `
    + `${HANDS_OFF}\nEl resto del archivo no lo frena este guard: si venías a declarar una raíz o a tocar `
    + 'cualquier otro campo, mandá el mismo cambio sin mover esas dos llaves.'
}

// **Un contenido que no se puede leer como JSON se frena.** Un `Edit` manda el fragmento que reemplaza y no
// el archivo, así que no hay con qué comparar: dejarlo pasar apagaría este guard con la herramienta más
// común de todas, y frenarlo deja una salida más cara pero escrita —mandar el archivo entero, que sí se
// compara—. Es el mismo criterio con el que el motor decide cuando no puede leer el índice de git.
function unreadableMessage(file) {
  return `${file} no llega como un JSON completo que se pueda leer, así que no hay cómo saber si el cambio `
    + `toca ${NAMES}, las dos llaves que deciden qué push se publica. Un guard que no puede verificar no `
    + 'autoriza: mandá el archivo entero en una sola escritura y el guard compara lo que cambia.'
}

// **Por shell se frena toda escritura, y no sólo la de las dos llaves.** La mitad de archivos compara dos
// contenidos porque tiene los dos: el entrante viene en la llamada y el otro está en disco. Un comando no
// trae ninguno —`sed -i 's/false/true/'` dice qué reemplaza, no con qué va a quedar el archivo—, y
// averiguarlo sería ejecutarlo, que es justo lo que este guard corre antes de que ocurra. Sin contenido que
// comparar quedan dos conductas posibles y ninguna intermedia, y se elige la que cierra la vía que el 114
// midió.
function commandMessage(file) {
  return `el comando escribe en ${file}, donde viven las dos llaves que deciden qué push se publica, `
    + `${NAMES}. Un comando no dice con qué va a quedar el archivo, así que acá se frena toda escritura y `
    + `no sólo la de esas dos llaves. ${HANDS_OFF}\nSi el cambio es de cualquier otro campo, escribí el `
    + 'archivo entero con la herramienta de edición, que el guard sí puede comparar.'
}

// Lo que la persona pidió nombrando el archivo pasa: ahí quien decide es ella, que es lo que este guard
// cuida. Lo mismo que hace `self-approval` con la aprobación, y por lo mismo.
const asked = (input, file) => !CHAT.unauthorized(input, [file]).length

function judgeWrite(input, root, file) {
  if (!filesOf(input).some((raw) => path.resolve(cwdOf(input), raw) === file)) return
  if (asked(input, file)) return
  let incoming = null
  try { incoming = JSON.parse(contentOf(input)) } catch { block(unreadableMessage(file)) }
  if (keysOf(configOf(root)) !== keysOf(incoming)) block(changeMessage(file))
}

function judgeCommand(input, file) {
  for (const { raw, base } of writesWithBase(commandOf(input), cwdOf(input))) {
    // Una ruta relativa sin base contra la que resolverla no se puede juzgar, y esa pregunta es de
    // `shell-boundary`, que ya la contesta para todo destino.
    if (!path.isAbsolute(raw) && base === null) continue
    if (path.resolve(base || '/', raw) !== file) continue
    if (asked(input, file)) return
    block(commandMessage(file))
  }
}

// La configuración que decide, o nada. Sin raíz ops no hay ninguna: `push.js` lee el `runner` de esta
// misma raíz, así que donde no la hay tampoco hay permiso que escribirse.
function target(input) {
  const root = opsRoot(input)
  return root ? { root, file: path.join(root, INSTANCE_CONFIG) } : null
}

function opsConfig(input) {
  const found = target(input)
  if (found) judgeWrite(input, found.root, found.file)
}

function opsConfigShell(input) {
  const found = target(input)
  if (found) judgeCommand(input, found.file)
}

module.exports = { opsConfig, opsConfigShell }
