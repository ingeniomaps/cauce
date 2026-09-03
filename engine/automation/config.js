'use strict'

// Cómo se fusiona y se retira lo nuestro dentro de un archivo del usuario: la configuración del runner
// y el bloque enmarcado de un `AGENTS.md` compartido. Es una sola pregunta —qué entregamos y cómo se
// saca sin llevarse lo ajeno— y cambia cuando cambia el formato de esos archivos, no cuando cambia un
// comando.

const fs = require('node:fs')
const path = require('node:path')
const F = require('../core/files')
const { supersededGuards, expectedHooks } = require('./hooks')

function mergeConfig(current, incoming) {
  if (Array.isArray(incoming)) {
    const values = [...(Array.isArray(current) ? current : []), ...incoming]
    const seen = new Set()
    return values.filter((value) => {
      const key = JSON.stringify(value)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  if (incoming && typeof incoming === 'object') {
    const object = current && typeof current === 'object' && !Array.isArray(current)
    const result = object ? { ...current } : {}
    for (const [key, value] of Object.entries(incoming)) {
      result[key] = mergeConfig(result[key], value)
    }
    return result
  }
  return incoming
}

// Una entrada de hook que puso Cauce se reconoce por el guard al que apunta, y lo nuestro es lo que
// efectivamente entregamos, no todo lo que vive en nuestra carpeta. Reconocer por directorio
// desregistraba el guard propio del proyecto en cada reinstalación: `template/AGENTS.md` invita a
// ponerlo justo ahí y promete que sobrevive a cada actualización, el archivo quedaba en disco, y lo
// único que se veía era una línea diciendo que se había quitado una entrada obsoleta.
// Se saca del archivo del usuario antes de fusionar para que el merge deje exactamente las de esta
// versión, ni una más.
const HOOK_PATH = /automatization\/hooks\/([a-z0-9-]+\.sh)(?:\s|$)/

// Dos fuentes, y la segunda es la que cierra el borde. `expectedHooks()` dice qué entrega el motor de
// hoy y alcanza para una instancia que nunca instaló; `delivered` es lo que esta instancia registró
// haber recibido la última vez, y es lo único que reconoce un guard que entregamos en una versión y
// retiramos en la siguiente: su nombre ya no está en la lista de hoy, así que sin el registro quedaría
// vivo en la configuración llamando a un guard que Cauce ya no mantiene. Un guard propio del proyecto
// no está en ninguna de las dos, que es exactamente por lo que sobrevive.
function isDelivered(command, delivered) {
  const hit = String(command).match(HOOK_PATH)
  if (!hit) return false
  return expectedHooks().includes(hit[1]) || delivered.has(String(command))
}

// Lo que de un conjunto de comandos es wiring de guards nuestro, para anotarlo como entregado.
function deliveredHookCommands(commands) {
  return [...commands].filter((command) => HOOK_PATH.test(String(command)))
}

function withoutDeliveredHooks(config, live, delivered = new Set()) {
  const dropped = []
  const walk = (node) => {
    if (Array.isArray(node)) {
      return node
        .filter((item) => {
          const command = item && typeof item === 'object' ? String(item.command || '') : ''
          if (!isDelivered(command, delivered)) return true
          // Sólo se anuncia lo que ya no vuelve: una entrada que el merge repone quedó igual, y decir
          // que se quitó y se puso la misma línea es ruido que esconde el caso que sí importa.
          if (!live.has(command)) dropped.push(command)
          return false
        })
        .map(walk)
        .filter((item) => !(item && typeof item === 'object' && Array.isArray(item.hooks) && !item.hooks.length))
    }
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, walk(value)]))
    }
    return node
  }
  return { config: walk(config), dropped }
}

// Por qué se fue cada entrada nuestra. Un guard suelto que ahora cubre un grupo no es lo mismo que una
// ruta que dejó de existir: el primero se ejecutaba dos veces por herramienta —con `verify`, la suite
// entera del proyecto dos veces por commit—, y el segundo no se ejecutaba nunca. Decirlo distinto es lo
// único que le permite a alguien darse cuenta de cuál de los dos tenía.
function reportRemoved(name, dropped, live, output) {
  const wrappers = new Map()
  const loose = []
  for (const command of dropped) {
    const hit = supersededGuards().find(
      (entry) => command.endsWith(entry.file) && [...live].some((v) => v.endsWith(entry.wrapper)),
    )
    if (hit) wrappers.set(hit.wrapper, [...(wrappers.get(hit.wrapper) || []), hit.file])
    else loose.push(command)
  }
  for (const [wrapper, files] of wrappers) {
    output.log(`− ${name}: reemplazado ${[...new Set(files)].join(', ')} por ${wrapper}`)
  }
  for (const command of loose) output.log(`− ${name}: quitada una entrada obsoleta (${command})`)
}

function includesConfig(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((item) => actual.some((value) => {
      // Un grupo de hooks se compara por su contenido, no por su forma serializada. La comprobación es
      // «contiene», que es lo correcto, pero con el ítem entero como unidad un grupo `{matcher, hooks}`
      // con un hook de más dejaba de ser el mismo objeto y contaba como ausente: `doctor` llamaba
      // divergente a una configuración que tenía todo lo esperado, y el anidamiento —donde vive la
      // diferencia real— no se miraba nunca. La instalación promete conservar lo que el proyecto ya
      // tenía, así que sumar un hook propio a un grupo nuestro es exactamente lo que permite.
      if (item && typeof item === 'object' && Array.isArray(item.hooks)) {
        return value && typeof value === 'object'
          && value.matcher === item.matcher
          && includesConfig(value.hooks, item.hooks)
      }
      return JSON.stringify(value) === JSON.stringify(item)
    }))
  }
  if (expected && typeof expected === 'object') {
    return actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => {
      return includesConfig(actual[key], value)
    })
  }
  return actual === expected
}

function hasHooks(config) {
  if (config.hooks && Object.keys(config.hooks).length) return true
  const events = [
    'PreToolUse',
    'PostToolUse',
    'PreInvocation',
    'PostInvocation',
    'Stop',
    'SessionEnd',
  ]
  return Object.values(config).some((entry) => {
    return entry && typeof entry === 'object' && events.some((event) => event in entry)
  })
}

// Quita de una estructura de configuración exactamente lo que este adaptador habría puesto, y nada más.
// Es el inverso de `mergeConfig`: una entrada del usuario nunca coincide literalmente con la nuestra, así
// que sobrevive; una que editó tampoco coincide, y por eso se conserva y se avisa en vez de borrarse.
function unmergeConfig(current, incoming) {
  if (Array.isArray(incoming)) {
    if (!Array.isArray(current)) return current
    const ours = new Set(incoming.map((value) => JSON.stringify(value)))
    return current.filter((value) => !ours.has(JSON.stringify(value)))
  }
  if (incoming && typeof incoming === 'object') {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return current
    const result = { ...current }
    for (const [key, value] of Object.entries(incoming)) {
      if (!(key in result)) continue
      const clean = unmergeConfig(result[key], value)
      // Una clave que queda vacía por habernos ido no es del usuario: la creamos nosotros al instalar.
      const empty = clean === undefined
        || (Array.isArray(clean) && !clean.length)
        || (clean && typeof clean === 'object' && !Array.isArray(clean) && !Object.keys(clean).length)
      if (empty) delete result[key]
      else result[key] = clean
    }
    return result
  }
  return JSON.stringify(current) === JSON.stringify(incoming) ? undefined : current
}

const blockStart = (name) => `<!-- cauce:${name} inicio — lo reescribe "automation install", no editar -->`
const blockEnd = (name) => `<!-- cauce:${name} fin -->`

function isSharedFile(root, target) {
  return path.resolve(target) === path.resolve(root, 'AGENTS.md')
}

function withoutBlock(text, name) {
  const sourceRoot = text.indexOf(blockStart(name))
  if (sourceRoot === -1) return text
  const until = text.indexOf(blockEnd(name), sourceRoot)
  if (until === -1) return text
  return `${text.slice(0, sourceRoot)}${text.slice(until + blockEnd(name).length)}`.trimEnd()
}

function mergeInstruction(file, name, content) {
  const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const instructionBody = withoutBlock(actual, name).trimEnd()
  const block = `${blockStart(name)}\n\n${content.trim()}\n\n${blockEnd(name)}\n`
  F.atomicWrite(file, instructionBody ? `${instructionBody}\n\n${block}` : block)
}

function blockUpToDate(file, name, content) {
  if (!fs.existsSync(file)) return false
  const body = fs.readFileSync(file, 'utf8')
  const sourceRoot = body.indexOf(blockStart(name))
  const until = body.indexOf(blockEnd(name))
  if (sourceRoot === -1 || until === -1) return false
  return body.slice(sourceRoot + blockStart(name).length, until).trim() === content.trim()
}

module.exports = {
  blockStart,
  mergeConfig, withoutDeliveredHooks, deliveredHookCommands, reportRemoved, includesConfig, hasHooks,
  unmergeConfig, isSharedFile, withoutBlock, mergeInstruction, blockUpToDate,
}
