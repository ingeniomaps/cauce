'use strict'

// Las rutas que un proyecto declara escribibles sin que sean raíces de código: la memoria del runner, un
// scratchpad, un directorio de salida. Viven acá y no en cada consumidor porque son dos —el guard que
// las deja pasar y `check` que las muestra— y tienen que resolver igual: con una copia que se pudra, el
// guard permite una ruta distinta de la que se ve en la salida, que es la forma silenciosa del agujero.

const os = require('node:os')
const path = require('node:path')

// `~` se expande sólo cuando es el prefijo entero. `~datos` es un nombre de directorio válido y no la
// casa de nadie; expandirlo ahí convertiría una ruta relativa en una absoluta que el autor no escribió.
function resolve(root, entry) {
  return path.resolve(root, String(entry).replace(/^~(?=$|[/\\])/, os.homedir()))
}

// Lee una configuración que puede estar mal escrita, así que no supone su forma. El validador rechaza
// `writableOutsideRoots: "~/memoria"` con un error que dice qué corregir, pero los dos consumidores
// llegan antes que él: el guard corre sin validar nada, y en `check` un `.filter` sobre un string se
// convertía en «JSON inválido», que manda a buscar una llave que no falta.
function writableOutsideRoots(root, config) {
  const declared = config && Array.isArray(config.writableOutsideRoots) ? config.writableOutsideRoots : []
  return declared.filter((entry) => typeof entry === 'string' && entry.trim())
    .map((entry) => ({ declared: entry, path: resolve(root, entry) }))
}

module.exports = { writableOutsideRoots }
