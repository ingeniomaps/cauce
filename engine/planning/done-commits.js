'use strict'

const { commitParts } = require('./contracts')

// Avisa, no falla: un sha que no aparece puede ser un hash fabricado o un commit de una rama que esta máquina
// no trajo, y sólo lo primero es un error (caso 243). Lo que no se puede mirar —el repositorio no está acá— va
// en una sola línea: por entrada era ruido, medido en una instancia real con 55 de 64 avisos así.
function unknownCommitWarnings(entries, statusOf) {
  const cited = entries.flatMap((entry) => commitParts(entry.commit).map((part) => ({ entry,
    sha: (part.match(/^([0-9a-f]{7,40})\s/) || [])[1], repo: (part.match(/\(([^@()\s]+)@[^)]*\)\s*$/) || [])[1] }))
    .filter((one) => one.sha))
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

module.exports = { unknownCommitWarnings }
