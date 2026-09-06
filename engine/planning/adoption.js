'use strict'

// El baseline de adopción: qué entradas de `DONE.md` ya existían cuando el proyecto empezó a usar Cauce,
// escritas bajo otro contrato de evidencia o bajo ninguno. Vive aparte de `contracts` porque no es un
// juicio sobre el planning sino una lista de perdones con su propia vida — se genera una vez, se mira en
// cada corrida y se achica a mano cuando una entrada vieja se reescribe.
//
// Es un archivo de texto y no un campo de configuración porque lo que lo mantiene sano es poder mirarlo
// y borrarle un renglón. Una fecha en `ops.config.json` perdonaría por tanda, y una tanda no se achica.

const path = require('node:path')
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
      warnings.push(`${BASELINE}: ${slug} ya cumple el contrato; sacalo de la lista`)
    }
  }
  if (slugs.length) {
    warnings.push(`${BASELINE}: ${slugs.length} entrada(s) exenta(s) del contrato de evidencia por adopción`)
  }
  return warnings
}

module.exports = { BASELINE, read, report }
