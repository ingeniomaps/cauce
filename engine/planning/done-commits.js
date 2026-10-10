'use strict'

const { commitParts } = require('./contracts')

// El sha y el repositorio de cada commit que una entrada nombra: `<sha> <mensaje> (<repo>@<rama>)`.
//
// El repositorio es el paréntesis con esa forma que **cierra** la cita: al final, con o sin punto, o seguido
// de un separador y una aclaración. Uno que no la cierra —el `(lodash@4.17.21)` de un asunto, pero también
// `(api@main) n/a parcial`— no nombra nada, y la cita se busca en todos los repositorios del proyecto. Es la
// lectura que no esconde un hash fabricado ni acota la búsqueda por un paréntesis del asunto que se llame
// como un repositorio de acá; lo que cuesta es que el segundo ejemplo no se busca sólo en `api`.
const NAMED = /\(([^@()\s]+)@[^)]*\)/g
const CLOSES = /^\s*(?:[.]?\s*$|[—–·;,:]|-\s)/
const citedCommits = (commit) => commitParts(commit).map((part) => ({
  sha: (part.match(/^([0-9a-f]{7,40})\s/) || [])[1],
  repo: ([...part.matchAll(NAMED)]
    .filter((found) => CLOSES.test(part.slice(found.index + found[0].length))).pop() || [])[1],
})).filter((one) => one.sha)

// Avisa, no falla: un sha que no aparece puede ser un hash fabricado o un commit de una rama que esta máquina
// no trajo, y sólo lo primero es un error (caso 243). Lo que no se puede mirar —el repositorio no está acá— va
// en una sola línea: por entrada era ruido, medido en una instancia real con 55 de 64 avisos así.
function unknownCommitWarnings(entries, statusOf) {
  const cited = entries.flatMap((entry) => citedCommits(entry.commit).map((one) => ({ entry, ...one })))
  const status = statusOf(cited.map(({ sha, repo }) => ({ sha, repo })))
  const warnings = cited.filter((_, index) => status[index] === 'missing').map(({ entry, sha }) => `${entry.source} `
    + `${entry.slug}: el commit ${sha} no está en su repositorio; si es de una rama que no trajiste, traela, y si `
    + 'no existe, la traza no prueba nada')
  const unchecked = cited.filter((_, index) => status[index] === 'unchecked')
  if (unchecked.length) {
    const absent = [...new Set(unchecked.map((one) => one.repo || 'sin repositorio nombrado'))]
    warnings.push(`done/: ${unchecked.length} commit(s) no se comprobaron porque su repositorio no está en esta `
      + `máquina (${absent.join(', ')})`)
  }
  return warnings
}

module.exports = { citedCommits, unknownCommitWarnings }
