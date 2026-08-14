'use strict'

const fs = require('fs')
const path = require('path')

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function teamFile(root, slug) {
  if (!SLUG.test(slug || '')) throw new Error(`team inválido: ${slug || '(vacío)'}`)
  return path.join(root, 'teams', slug, 'team.json')
}

function agentMatches(root, slug) {
  const catalog = path.join(root, 'agents')
  let types = []
  try {
    types = fs.readdirSync(catalog, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  } catch { return [] }
  return types
    .map((entry) => path.join(catalog, entry.name, slug, 'SKILL.md'))
    .filter((file) => fs.existsSync(file))
}

function read(root, slug) {
  const file = teamFile(root, slug)
  if (!fs.existsSync(file)) throw new Error(`no existe teams/${slug}/team.json`)
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) {
    throw new Error(`teams/${slug}/team.json inválido: ${error.message}`)
  }
  return { file, manifest }
}

function validate(root, slug) {
  const { manifest } = read(root, slug)
  const errors = []
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion debe ser 1')
  if (manifest.slug !== slug) errors.push(`slug debe ser ${slug}`)
  for (const field of ['name', 'purpose', 'entryAgent', 'facilitator']) {
    if (typeof manifest[field] !== 'string' || !manifest[field].trim()) errors.push(`falta ${field}`)
  }
  if (!Array.isArray(manifest.stages) || !manifest.stages.length) errors.push('stages debe contener etapas')
  if (!Array.isArray(manifest.guardrails) || !manifest.guardrails.length) errors.push('guardrails debe contener controles')
  if (!Array.isArray(manifest.completion) || !manifest.completion.length) errors.push('completion debe contener criterios')

  const agents = new Set([manifest.entryAgent, manifest.facilitator])
  for (const agent of Object.values(manifest.decisionOwners || {})) agents.add(agent)
  for (const agent of manifest.conditionalAgents || []) agents.add(agent)
  const seen = new Set()
  for (const stage of manifest.stages || []) {
    if (!SLUG.test(stage.id || '')) errors.push(`id de etapa inválido: ${stage.id || '(vacío)'}`)
    else if (seen.has(stage.id)) errors.push(`etapa duplicada: ${stage.id}`)
    for (const dependency of stage.dependsOn || []) {
      if (!seen.has(dependency)) errors.push(`${stage.id}: dependencia inexistente o posterior ${dependency}`)
    }
    seen.add(stage.id)
    agents.add(stage.agent)
    if (!Array.isArray(stage.produces) || !stage.produces.length) errors.push(`${stage.id}: falta produces`)
    if (typeof stage.exitGate !== 'string' || !stage.exitGate.trim()) errors.push(`${stage.id}: falta exitGate`)
  }
  for (const agent of agents) {
    if (!SLUG.test(agent || '')) errors.push(`slug de agente inválido: ${agent || '(vacío)'}`)
    else {
      const matches = agentMatches(root, agent)
      if (!matches.length) errors.push(`agente inexistente: ${agent}`)
      if (matches.length > 1) errors.push(`agente ambiguo: ${agent}`)
    }
  }
  const workflow = path.join(root, 'teams', slug, 'WORKFLOW.md')
  if (!fs.existsSync(workflow)) errors.push('falta WORKFLOW.md')
  return { errors, stages: (manifest.stages || []).length, agents: agents.size, manifest }
}

function list(root) {
  const catalog = path.join(root, 'teams')
  try {
    return fs.readdirSync(catalog, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(catalog, entry.name, 'team.json')))
      .map((entry) => entry.name)
      .sort()
  } catch { return [] }
}

module.exports = { list, read, validate }
