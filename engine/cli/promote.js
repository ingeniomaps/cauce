'use strict'

// `ops promote <planning-dir> <epic-NNN-slug>`: lo decide `engine/planning/promote.js`; acá sólo se dice qué
// quedó escrito y qué sigue —`check` y el commit—, que son de la persona que promovió.

const PR = require('../planning/promote')
const { fail, planningRoot, REFUSED, USAGE } = require('./io')

function promote(dir, epicName) {
  const root = planningRoot(dir)
  if (!epicName) return fail('Uso: ops promote <planning-dir> <epic-NNN-slug>', USAGE)
  const result = PR.plan(root, epicName)
  if (result.error) return fail(`${result.error}: no se promovió nada.`, REFUSED)
  PR.apply(root, result)
  for (const one of result.files) {
    console.log(`✓ ${one.file}${one.line ? `  (line: ${one.line})` : ''}  ${one.tasks} tarea(s)`)
  }
  for (const warning of result.warnings) console.log(`⚠ ${warning}`)
  console.log(`roadmap/${result.epic.file} → active. Corré check y commiteá la promoción.`)
}

module.exports = { promote }
