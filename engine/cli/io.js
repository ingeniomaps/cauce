'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Los dos códigos con que termina el CLI, y el corte entre ellos. Están nombrados porque el número suelto
// no dice de qué lado cae: un «2» y un argumento ausente se leen igual de arbitrarios, así que cada sitio
// nuevo elegía por imitación del vecino y tres terminaron del lado equivocado.
//
//   USAGE   — no se llegó a la pregunta. El comando no existe, le falta un argumento, o la raíz que
//             nombra no es lo que dice ser. Lo arregla quien invoca, cambiando la invocación.
//   REFUSED — se llegó, y la respuesta es que no. Cubre tres formas y ninguna pide otro código: una
//             validación encontró problemas, el estado se niega, o una operación falló a mitad de camino.
//             La invocación estaba bien; lo que hay que mirar es el proyecto.
//
// La distinción se gana lo que cuesta porque afuera ya se la necesitaba sin tenerla: la parada
// `claim-stuck` de `autobuild` separa dos defectos leyendo el **texto** de lo que `claim` contestó, y por
// qué tiene que distinguirlos está ahí. Uno de los dos es exactamente USAGE.
//
// Un tercero no hace falta y costaría: las tres formas de REFUSED terminan igual para quien scriptea
// —mirá el proyecto—, y separarlas obligaría a conocer el reparto para hacer lo mismo con las tres.
const USAGE = 2
const REFUSED = 1

// Terminar la corrida con un mensaje y un código. Vive aparte porque lo usa cada familia de comandos, y
// dejarlo en el despacho obligaría a que cada módulo dependa del que lo invoca.
//
// El default se queda siendo REFUSED aunque la puerta exija que cada sitio diga el suyo: es el piso
// seguro —distinto de cero— para un llamador que la puerta todavía no mire.
function fail(message, code = REFUSED) {
  console.error(message)
  process.exit(code)
}

// La fecha de hoy, en un solo lugar: los comandos que la usan tienen que estar mirando el mismo día, y
// el módulo que calcula vencimientos la recibe en vez de preguntarla. Vive acá desde que la puerta de
// planning se separó de los comandos que la leen — quedaba en el archivo que se partió, y dejar una copia
// a cada lado habría roto en silencio lo único que esta función promete.
const TODAY = () => new Date().toISOString().slice(0, 10)

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
    return fail(`no existe el planning en ${root} (ruta resuelta). Comprobá desde dónde estás invocando.`, USAGE)
  }
  // Existir no alcanza: un directorio cualquiera contestaría cola vacía igual. `BACKLOG.md` es el archivo
  // del que sale la cola, así que sin él la respuesta no significa nada.
  if (!fs.existsSync(path.join(root, 'BACKLOG.md'))) {
    return fail(`${root} (ruta resuelta) no es un planning: falta BACKLOG.md.`, USAGE)
  }
  return root
}

module.exports = { fail, opsRoot, planningRoot, TODAY, USAGE, REFUSED }
