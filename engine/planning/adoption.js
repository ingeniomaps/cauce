'use strict'

// El baseline de adopción: qué entradas de `DONE.md` ya existían cuando el proyecto empezó a usar Cauce,
// escritas bajo otro contrato de evidencia o bajo ninguno. Vive aparte de `contracts` porque no es un
// juicio sobre el planning sino una lista de perdones con su propia vida — se genera una vez, se mira en
// cada corrida y se achica a mano cuando una entrada vieja se reescribe.
//
// Es un archivo de texto y no un campo de configuración porque lo que lo mantiene sano es poder mirarlo
// y borrarle un renglón. Una fecha en `ops.config.json` perdonaría por tanda, y una tanda no se achica.

const path = require('node:path')
const crypto = require('node:crypto')
const P = require('./parser')
const PC = require('./contracts')

const BASELINE = '.adoption-baseline'

// El archivo ausente y el archivo vacío son lo mismo: no hay nada exento, que es lo que le pasa a casi
// todo proyecto. Reclamarlo obligaría a los que no adoptaron nada a declarar una lista vacía.
function read(dir) {
  return P.read(path.join(dir, BASELINE)).split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)
}

// Un renglón retirado se marca en vez de borrarse, y eso no es prolijidad: la huella de abajo se
// calcula sobre el conjunto que `adopt` generó, así que borrar un renglón la rompería tanto como
// agregar uno — y borrar es el camino que `check` recomienda. Marcado, el conjunto original sigue
// entero y la lista activa se achica igual, porque `read` descarta todo lo que empieza con `#`.
//
// El precio es un archivo que nunca se acorta. Es un registro histórico de qué se perdonó al adoptar:
// crece por diseño una sola vez y después sólo cambia de estado.
const RETIRED = /^#~\s*(\S+)/

// La huella: qué conjunto generó `adopt`. Doce hexadecimales alcanzan para lo que esto cuida —un
// agregado a mano, no un ataque— y entran en la misma línea que la cuenta, que es lo que se lee primero.
const SEAL = /^#\s*huella:\s*(\d+)\s+entradas?\s*·\s*sha256:([0-9a-f]{12})\s*$/m

// Sobre el conjunto ordenado y sin repetidos, no sobre el texto: así reordenar los renglones con
// cualquier herramienta no dispara un aviso, y retirar uno sigue siendo detectable como retiro.
function digest(slugs) {
  const unique = [...new Set(slugs)].sort()
  return crypto.createHash('sha256').update(unique.join('\n')).digest('hex').slice(0, 12)
}

// Todos los slugs que el archivo declara, activos y retirados: es el conjunto que `adopt` generó y
// contra el que se coteja la huella.
function declared(text) {
  const slugs = []
  for (const line of text.split('\n')) {
    const retired = line.match(RETIRED)
    if (retired) { slugs.push(retired[1]); continue }
    const active = line.replace(/#.*$/, '').trim()
    if (active) slugs.push(active)
  }
  return slugs
}

// Advertencias y no errores, igual que el resto de lo que rodea al baseline: agrandar la lista puede ser
// legítimo —quien lo haga puede recalcular la huella— y lo único que no puede es no verse. El punto no
// es cerrar la puerta con llave sino que abrirla deje marca, que es lo que separa una exención de un
// descuido.
function sealWarnings(dir) {
  const text = P.read(path.join(dir, BASELINE))
  if (!text.trim()) return []
  const seal = text.match(SEAL)
  if (!seal) {
    return [`${BASELINE}: sin huella, así que no hay con qué comprobar que no creció. `
      + 'Corré `ops adopt` sobre este planning para sellarlo sin regenerar la lista.']
  }
  const slugs = declared(text)
  if (digest(slugs) === seal[2]) return []
  const extra = Number(slugs.length) - Number(seal[1])
  if (extra > 0) {
    // Cuáles sobran no se puede decir sin el conjunto original, y la cuenta sí: se nombran los últimos,
    // que es donde se agrega a mano. Decir «alguna de éstas» es más honesto que señalar la equivocada.
    const últimos = slugs.slice(-extra).join(', ')
    return [`${BASELINE}: la lista creció. La huella sella ${seal[1]} entrada(s) y hay ${slugs.length}; `
      + `sobra(n) ${extra}, probablemente ${últimos}. Una entrada agregada a mano queda exenta para `
      + 'siempre y nada más lo dice.']
  }
  return [`${BASELINE}: la huella no coincide con la lista. Sella ${seal[1]} entrada(s) y hay `
    + `${slugs.length}: se cambió alguna. Para retirar una que ya cumple, poné \`#~\` delante en vez `
    + 'de borrarla.']
}

// Las tres cosas que hay que ver de una lista de perdones, y las tres son advertencias: la exención es
// legítima —el proyecto la declaró al adoptar— y lo único que no puede es dejar de verse.
//
// Que un slug ya cumpla el contrato no se detecta leyendo la lista: hay que volver a juzgar la entrada,
// que es para lo que existe `doneEntryErrors`. Sin este aviso la lista sólo envejece — nadie se entera
// de que doce de sus noventa perdones dejaron de hacer falta, y la exención sobrevive a su razón.
function report({ done, epics = [], adopted = [] }) {
  const slugs = [...new Set(adopted)]
  const warnings = []
  for (const slug of slugs) {
    const entry = done.entries.find((candidate) => candidate.slug === slug)
    if (!entry) {
      warnings.push(`${BASELINE}: ${slug} no está en DONE.md; sacalo de la lista`)
    } else if (!PC.doneEntryErrors(entry, epics).length) {
      warnings.push(`${BASELINE}: ${slug} ya cumple el contrato; retiralo poniéndole \`#~\` delante`)
    }
  }
  if (slugs.length) {
    warnings.push(`${BASELINE}: ${slugs.length} entrada(s) exenta(s) del contrato de evidencia por adopción`)
  }
  return warnings
}

module.exports = { BASELINE, read, report, digest, declared, sealWarnings }
