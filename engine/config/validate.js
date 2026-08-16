'use strict'

const MODES = ['embedded', 'sidecar', 'toolkit']

// Campos que existieron y se retiraron. Se nombran en vez de caer en «propiedad desconocida» porque
// quien actualiza merece saber qué hacer con la línea, no sólo que sobra.
//
// `planningDir` era obligatorio y nadie lo honraba: el renderizador de la plantilla lo resolvía
// siempre a `planning`, y `findOpsRoot` y el registro de integraciones lo tienen escrito a mano. Un
// campo así no configura, promete. En el propio toolkit decía `template/planning` —el molde que se
// distribuye—, y un cargo que lo leyó concluyó que ahí vivía la planificación del proyecto.
//
// Se retira en vez de honrarse porque la ubicación no es opinable: `findOpsRoot` reconoce un
// repositorio de operaciones justamente por tener `planning/` en la raíz.
const RETIRED = {
  planningDir: 'el motor siempre busca planning/ en la raíz del repositorio. Borrá la línea',
}

function validateOpsConfig(config) {
  const errors = []
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['ops.config.json: debe ser un objeto']
  }
  // `cauceVersion` la escribe el toolkit, no la persona: registra de qué versión salió la instancia.
  const allowed = new Set([
    '$schema', 'cauceVersion', 'project', 'mode', 'workspaceRoots', 'runner',
  ])
  for (const key of Object.keys(config)) {
    if (RETIRED[key]) errors.push(`ops.config.json: ${key} ya no se usa: ${RETIRED[key]}`)
    else if (!allowed.has(key)) errors.push(`ops.config.json: propiedad desconocida ${key}`)
  }
  if (typeof config.project !== 'string' || !config.project.trim()) {
    errors.push('ops.config.json: project debe ser un string no vacío')
  }
  if (!MODES.includes(config.mode)) errors.push('ops.config.json: mode inválido')
  validateWorkspaces(config.workspaceRoots, errors)
  validateRunner(config.runner, errors)
  return errors
}

function validateWorkspaces(workspaces, errors) {
  if (!Array.isArray(workspaces) || !workspaces.length) {
    errors.push('ops.config.json: workspaceRoots debe contener al menos una raíz')
    return
  }
  for (const [index, workspace] of workspaces.entries()) {
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
      errors.push(`ops.config.json: workspaceRoots[${index}] debe ser un objeto`)
      continue
    }
    for (const key of Object.keys(workspace)) {
      if (!['name', 'path'].includes(key)) {
        errors.push(`ops.config.json: workspaceRoots[${index}].${key} no está permitido`)
      }
    }
    if (typeof workspace.name !== 'string' || !workspace.name.trim()) {
      errors.push(`ops.config.json: workspaceRoots[${index}].name es obligatorio`)
    }
    if (typeof workspace.path !== 'string' || !workspace.path.trim()) {
      errors.push(`ops.config.json: workspaceRoots[${index}].path es obligatorio`)
    }
  }
}

function validateRunner(runner, errors) {
  if (!runner || typeof runner !== 'object' || Array.isArray(runner)) {
    errors.push('ops.config.json: runner debe ser un objeto')
    return
  }
  const booleans = ['humanCheckpointBetweenMilestones', 'commitPerTask', 'allowPush']
  const allowed = new Set(['maxTaskHours', ...booleans])
  for (const key of Object.keys(runner)) {
    if (!allowed.has(key)) errors.push(`ops.config.json: runner.${key} no está permitido`)
  }
  if (typeof runner.maxTaskHours !== 'number' || runner.maxTaskHours <= 0) {
    errors.push('ops.config.json: runner.maxTaskHours debe ser mayor que cero')
  }
  for (const key of booleans) {
    if (typeof runner[key] !== 'boolean') {
      errors.push(`ops.config.json: runner.${key} debe ser boolean`)
    }
  }
}

module.exports = { MODES, validateOpsConfig }
