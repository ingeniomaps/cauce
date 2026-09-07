'use strict'

// La aprobación de un commit de gobernanza: una lista de rutas que una persona escribió a mano para
// autorizar exactamente ese cambio. Existe porque la vía que había era una variable de entorno, y una
// variable es por sesión: prendida antes de lanzar el runner deja el guard apagado hasta que la sesión
// cierre. El `Makefile` de este repositorio ya dice cuál es el alcance correcto —«la autorización de R10
// es por operación y humana»—, y una llave que dura toda la sesión no lo es.
//
// **Se coteja, no se consume.** Borrar el archivo al leerlo daría el mismo alcance y traería dos cosas
// que no queremos: hoy ningún guard escribe en el repositorio, y `governance` corre antes que `verify`,
// así que un commit frenado por otra razón se habría llevado puesta la aprobación y habría que
// rehacerla. Cotejando, la aprobación vale para el conjunto que nombra y para ningún otro: en cuanto
// cambia lo que está en el índice deja de servir, que es «por operación» sin fecha ni contador.
//
// Queda a la vista porque `check` avisa mientras exista. Sin eso, un archivo olvidado sigue autorizando
// esas mismas rutas la próxima vez que alguien las stagee, que es la puerta abierta que esto evitaba.

const path = require('node:path')
const fs = require('node:fs')

const APPROVAL = '.governance-approval'

// Una ruta por línea, `#` para lo demás. El archivo ausente y el vacío son lo mismo: no hay nada
// aprobado, que es el estado normal.
function read(root) {
  let text = ''
  try { text = fs.readFileSync(path.join(root, 'planning', APPROVAL), 'utf8') } catch { return [] }
  return text.split('\n').map((line) => line.replace(/#.*$/, '').trim()).filter(Boolean)
}

module.exports = { APPROVAL, read }
