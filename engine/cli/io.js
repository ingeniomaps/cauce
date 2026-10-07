'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { validZone } = require('../config/validate')

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
//
// El día es el del huso que el proyecto declara en `timeZone`, y UTC si no declara ninguno. Con UTC a secas,
// lo que se cerraba a la noche al oeste de Greenwich quedaba fechado al día siguiente (caso 303). Es del
// proyecto y no de la máquina para que dos personas del mismo equipo, y el CI, fechen igual.
//
// La raíz la anota el CLI antes de despachar, y el archivo se lee recién cuando alguien pregunta la fecha:
// la mayoría de los comandos no la usa. Un huso que `Intl` no conoce cae a UTC; `check` lo rechaza antes.
let asked = ''
let zone
const useRoot = (dir) => { asked = dir || ''; zone = undefined }
function declaredZone() {
  // El primer argumento de un comando no siempre es una raíz —`evaluate <cargo>`, `agents fork`—: si desde
  // ahí no se encuentra el archivo, se busca desde la raíz que exportó el shim, y recién después desde acá.
  for (const from of [asked, process.env.OPS_ROOT, '.']) {
    // Un argumento que no es una carpeta no es de dónde subir: resolvería contra el cwd y encontraría la
    // configuración de quien esté parado ahí.
    if (!from || !fs.existsSync(path.resolve(from))) continue
    let dir = path.resolve(from)
    // La raíz de un comando puede ser la carpeta de planning o una de más adentro: se sube hasta encontrarlo.
    for (let hops = 0; hops < 4; hops += 1) {
      const file = path.join(dir, 'ops.config.json')
      if (fs.existsSync(file)) {
        // Uno que está y no se puede leer no manda a buscar el de la carpeta de arriba, que es de otro.
        try {
          const declared = JSON.parse(fs.readFileSync(file, 'utf8')).timeZone
          return validZone(declared) ? declared : ''
        } catch { return '' }
      }
      if (path.dirname(dir) === dir) break
      dir = path.dirname(dir)
    }
  }
  return ''
}
function TODAY(now = new Date()) {
  if (zone === undefined) zone = declaredZone()
  if (!zone) return now.toISOString().slice(0, 10)
  // `en-CA` escribe la fecha como año-mes-día, que es la forma en que el resto del motor la compara.
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now)
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
    return fail(`no existe el planning en ${root} (ruta resuelta). Comprobá desde dónde estás invocando.`, USAGE)
  }
  // Existir no alcanza: un directorio cualquiera contestaría cola vacía igual. `BACKLOG.md` es el archivo
  // del que sale la cola, así que sin él la respuesta no significa nada.
  if (!fs.existsSync(path.join(root, 'BACKLOG.md'))) {
    return fail(`${root} (ruta resuelta) no es un planning: falta BACKLOG.md.`, USAGE)
  }
  return root
}

module.exports = { fail, opsRoot, planningRoot, TODAY, useRoot, USAGE, REFUSED }
