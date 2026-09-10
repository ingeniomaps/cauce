'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Terminar la corrida con un mensaje y un código. Vive aparte porque lo usa cada familia de comandos, y
// dejarlo en el despacho obligaría a que cada módulo dependa del que lo invoca.
function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

// La raíz ops de un comando que no la recibe. El shim `tools/ops.js` la exporta porque sabe dónde
// vive: sin eso, invocarlo desde otra carpeta —lo normal en sidecar— la resolvía contra el cwd.
function opsRoot(dir) {
  return path.resolve(dir || process.env.OPS_ROOT || '.')
}

// La raíz de planning de un comando: resuelta **y comprobada**, en un solo lugar. Lo que no se pudo leer
// no contesta como si se hubiera leído, y eso no puede depender de que cada comando se acuerde: sobre un
// directorio ausente, `claim` no encuentra el slug, `evidence` no encuentra entradas y `runners` no
// encuentra runners, y los tres reportan ese vacío como un hecho del dominio.
//
// El daño no es el mensaje sino la acción que induce. Medido en una corrida real: `claim` contestó «no
// está en BACKLOG» sobre una tarea que **sí** estaba, y el recorrido mandó a una persona a promover lo
// único que ya estaba bien, citando la regla correcta con la conclusión al revés (caso 075). Y cuatro de
// los ocho comandos que lo hacían salían con **exit 0**, así que un script veía éxito.
//
// Va en la resolución y no en cada comando porque es lo que cierra la clase en vez de la instancia: la
// misma se arregló de a una en `stagedFiles` (0.63.0) y en `context` (0.71.0), y volvió las dos veces.
//
// La ruta va **resuelta** y no como se escribió, porque el error que ataca es de resolución: en sidecar
// `<empresa>-ops/planning` desde adentro de la raíz apunta a `<empresa>-ops/<empresa>-ops/planning`.
function planningRoot(dir) {
  const root = path.resolve(dir || '.')
  if (!fs.existsSync(root)) {
    return fail(`no existe el planning en ${root} (ruta resuelta). Comprobá desde dónde estás invocando.`, 2)
  }
  // Existir no alcanza: un directorio cualquiera contestaría cola vacía igual. `BACKLOG.md` es el archivo
  // del que sale la cola, así que sin él la respuesta no significa nada.
  if (!fs.existsSync(path.join(root, 'BACKLOG.md'))) {
    return fail(`${root} (ruta resuelta) no es un planning: falta BACKLOG.md.`, 2)
  }
  return root
}

module.exports = { fail, opsRoot, planningRoot }
