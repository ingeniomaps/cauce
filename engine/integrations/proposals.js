'use strict'

const fs = require('node:fs')
const path = require('node:path')
const S = require('./state')

const STATES = ['draft', 'approved', 'published']
const TYPES = ['Epic', 'Story', 'Task', 'Sub-task']

function read(root, provider) {
  const dir = path.join(root, 'integrations', provider, 'proposed')
  let files = []
  try {
    files = fs.readdirSync(dir).filter((file) => file.endsWith('.md') && file !== 'README.md')
  } catch { return [] }
  return files.sort().map((file) => {
    const content = fs.readFileSync(path.join(dir, file), 'utf8')
    const fields = S.frontmatter(content)
    const body = content.replace(/^---[\s\S]*?---\s*/, '')
    // `[ \t]` y no `\s`: `\s` casa el salto de línea, así que un `#` vacío se comía la siguiente
    // línea no vacía y devolvía «## Descripción» como título. Con eso, «falta título» no saltaba nunca.
    const summary = ((body.match(/^#[ \t]+(.+)$/m) || [])[1] || '').trim()
    const description = ((body.match(
      /^##\s+Descripción\s*\n([\s\S]*?)(?=^##\s+|(?![\s\S]))/im,
    ) || [])[1] || '').trim()
    return {
      file,
      path: path.join(dir, file),
      content,
      fields,
      summary,
      description,
    }
  })
}

function validate(root, provider, workspaces = []) {
  const errors = []
  const stagedKeys = new Set(S.readStaging(root, provider).map((item) => item.key))
  let maxHours = 4
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
    maxHours = config.runner.maxTaskHours
  } catch { /* reported by the main validator */ }
  for (const proposal of read(root, provider)) {
    const at = `integrations/${provider}/proposed/${proposal.file}`
    const fields = proposal.fields
    if (fields.provider !== provider) errors.push(`${at}: provider debe ser ${provider}`)
    if (!STATES.includes(fields.state)) errors.push(`${at}: state inválido`)
    if (!TYPES.includes(fields.type)) errors.push(`${at}: type inválido`)
    if (!proposal.summary) errors.push(`${at}: falta título`)
    if (!proposal.description) errors.push(`${at}: falta Descripción`)
    if (fields.parent && !/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(fields.parent)) {
      errors.push(`${at}: parent no es una clave remota válida`)
    }
    if (fields.type !== 'Epic' && !fields.parent) {
      errors.push(`${at}: ${fields.type || 'el tipo'} exige parent`)
    }
    if (fields.parent && !stagedKeys.has(fields.parent)) {
      errors.push(`${at}: parent ${fields.parent} no está presente en staging`)
    }
    if (fields.state === 'approved') {
      if (!fields.service) errors.push(`${at}: approved exige service`)
      const exists = workspaces.some((workspace) => {
        return fs.existsSync(path.join(workspace.resolved, fields.service || ''))
      })
      if (fields.service && !exists) errors.push(`${at}: service no existe`)
      const estimate = Number(fields.estimateHours)
      if (!Number.isFinite(estimate) || estimate <= 0) {
        errors.push(`${at}: approved exige estimateHours mayor que cero`)
      } else if (estimate > maxHours && !fields.justification) {
        errors.push(`${at}: supera ${maxHours}h; debe dividirse o justificarlo`)
      }
    }
    if (fields.state === 'published' && !fields.remote) {
      errors.push(`${at}: published exige remote`)
    }
  }
  return errors
}

module.exports = { STATES, read, validate }
