'use strict'

// Las rutas que un proyecto declara escribibles sin que sean raíces de código: la memoria del runner, un
// scratchpad, un directorio de salida. Viven acá y no en cada consumidor porque son dos —el guard que
// las deja pasar y `check` que las muestra— y tienen que resolver igual: con una copia que se pudra, el
// guard permite una ruta distinta de la que se ve en la salida, que es la forma silenciosa del agujero.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Las rutas de una sola máquina —la memoria del runner de una persona, un proyecto suyo— no van en el archivo
// que se versiona y viaja a todo el equipo (caso 209). De éste se lee sólo `writableOutsideRoots`: es una
// exención del límite de escritura y nada más, así que nada de lo que decide una persona —el push— se puede
// declarar desde un archivo que nadie revisa.
const LOCAL_CONFIG = 'ops.config.local.json'

// `~` se expande sólo cuando es el prefijo entero. `~datos` es un nombre de directorio válido y no la
// casa de nadie; expandirlo ahí convertiría una ruta relativa en una absoluta que el autor no escribió.
// La usa también el contrato de secretos para las rutas de sus identidades, por la misma razón que
// arriba: una ruta declarada en un archivo del proyecto se resuelve igual la lea quien la lea.
function resolvePath(root, entry) {
  return path.resolve(root, String(entry).replace(/^~(?=$|[/\\])/, os.homedir()))
}

// Lee una configuración que puede estar mal escrita, así que no supone su forma. El validador rechaza
// `writableOutsideRoots: "~/memoria"` con un error que dice qué corregir, pero los dos consumidores
// llegan antes que él: el guard corre sin validar nada, y en `check` un `.filter` sobre un string se
// convertía en «JSON inválido», que manda a buscar una llave que no falta.
function writableOutsideRoots(root, config) {
  return [[config, 'ops.config.json'], [readLocal(root), LOCAL_CONFIG]].flatMap(([source, from]) => {
    const declared = source && Array.isArray(source.writableOutsideRoots) ? source.writableOutsideRoots : []
    return declared.filter((entry) => typeof entry === 'string' && entry.trim())
      .map((entry) => ({ declared: entry, path: resolvePath(root, entry), from }))
  })
}

// Ausente es lo habitual. Ilegible exenta menos, nunca más, y por eso el guard no bloquea por él: el límite
// sigue entero. Quien lo ve es `check`, que lo avisa.
function readLocal(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, LOCAL_CONFIG), 'utf8')) } catch { return null }
}

module.exports = { writableOutsideRoots, resolvePath, LOCAL_CONFIG }
