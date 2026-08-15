'use strict'

const fs = require('fs')
const path = require('path')
const catalog = require('../agents/catalog')

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PHASES = ['discovery', 'delivery']
// Qué deja el recorrido: una épica candidata que alguien puede promover, o un informe que registra
// lo aprendido. Sin declararlo, el workflow sólo sabría terminar de una forma.
const OUTCOMES = ['epic', 'report']

// El proyecto manda sobre el sistema: un team propio con el mismo slug reemplaza al de `system/`,
// que se sigue actualizando debajo sin que nadie tenga que forkearlo.
function systemTeams(root) {
  return require('../core/ownership').packageDir(root, 'teams')
}

function teamFile(root, slug) {
  if (!SLUG.test(slug || '')) throw new Error(`team inválido: ${slug || '(vacío)'}`)
  const own = path.join(root, 'teams', slug, 'team.json')
  if (fs.existsSync(own)) return own
  const system = systemTeams(root)
  return system ? path.join(system, 'system', slug, 'team.json') : own
}

// Devuelve el motivo real: "no existe" y "ambiguo" piden acciones distintas de quien lo lea.
function agentProblem(root, slug) {
  try { catalog.resolve(root, slug); return '' } catch (error) {
    return /ambiguo/.test(error.message) ? `agente ambiguo: ${slug}` : `agente inexistente: ${slug}`
  }
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
  if (!OUTCOMES.includes(manifest.outcome)) errors.push(`outcome debe ser ${OUTCOMES.join(' o ')}`)
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
    // Descubrimiento propone, entrega ejecuta. Sin la distinción, un recorrido de descubrimiento
    // terminaría construyendo antes de que exista la épica y antes de la promoción humana.
    if (!PHASES.includes(stage.phase)) errors.push(`${stage.id}: phase debe ser ${PHASES.join(' o ')}`)
  }
  for (const agent of agents) {
    if (!SLUG.test(agent || '')) errors.push(`slug de agente inválido: ${agent || '(vacío)'}`)
    else {
      const problem = agentProblem(root, agent)
      if (problem) errors.push(problem)
    }
  }
  if (!(manifest.stages || []).some((stage) => stage.phase === 'discovery')) {
    errors.push('falta al menos una etapa de discovery: un equipo sin descubrimiento no propone nada')
  }
  // Junto al team.json que ganó la resolución, no en una ruta fija: el team puede venir de system/.
  const workflow = path.join(path.dirname(teamFile(root, slug)), 'WORKFLOW.md')
  if (!fs.existsSync(workflow)) errors.push('falta WORKFLOW.md')
  return { errors, stages: (manifest.stages || []).length, agents: agents.size, manifest }
}

function slugsIn(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'system')
      .filter((entry) => fs.existsSync(path.join(dir, entry.name, 'team.json')))
      .map((entry) => entry.name)
  } catch { return [] }
}

// Un slug aparece una sola vez aunque exista en los dos niveles: el del proyecto ya ganó.
// Los propios de la empresa y los que trae Cauce, sin duplicar un slug que ya ganó el proyecto.
function list(root) {
  const system = systemTeams(root)
  const slugs = new Set([
    ...slugsIn(path.join(root, 'teams')),
    ...(system ? slugsIn(path.join(system, 'system')) : []),
  ])
  return [...slugs].sort()
}

module.exports = { list, read, validate }
