'use strict'

// La copia de un plugin registrada para todo el usuario, cuando el runner ya descubre la del proyecto. `agy` 1.4.0
// carga el plugin del `.agents/` del proyecto sin registrarlo, y una copia en `~/.gemini/config/plugins/cauce` corre
// en toda carpeta que no tenga plugin propio, con la raíz, las reglas y los cargos del proyecto que la registró. Es
// lo contrario de lo que se medía en el caso 201, donde la copia registrada era la única que corría y por eso
// Cauce pedía crearla. Medido con agy 1.4.0 en el caso 392.
//
// El runner declara dónde vive esa copia —`strayCopy` en su manifiesto— y cómo se quita. Sin esa declaración no
// hay nada que mirar.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Qué sobra fuera de esta instalación. No se borra desde acá: es configuración del usuario, fuera del proyecto. Y
// se mira que sea un puente de Cauce: un plugin ajeno que se llame igual no es asunto de este doctor.
function registrationProblems(paths, runner) {
  const stray = runner.strayCopy
  if (!stray) return []
  const dir = stray.path.replace(/^~(?=\/|$)/, os.homedir())
  let bridge = ''
  try { bridge = fs.readFileSync(path.join(dir, 'hook.js'), 'utf8') } catch { return [] }
  if (!bridge.includes('Cauce')) return []
  return [`hay una copia del plugin registrada para todo el usuario en ${dir}: ${runner.command} la corre en toda `
    + 'carpeta que no tenga plugin propio, con la raíz y las reglas del proyecto que la registró. Este proyecto no '
    + `la necesita, porque ${runner.command} descubre el plugin de ${paths.install}. Quitala con `
    + `"${stray.remove}".`]
}

module.exports = { registrationProblems }
