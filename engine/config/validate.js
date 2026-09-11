'use strict'

const MODES = ['embedded', 'sidecar', 'toolkit']

// Campos que existieron y se retiraron. Se nombran en vez de caer en «propiedad desconocida» porque
// quien actualiza merece saber qué hacer con la línea, no sólo que sobra.
//
// `planningDir` no configuraba, prometía: nadie lo honraba y la ubicación no es opinable —`findOpsRoot`
// reconoce una raíz ops por tener `ops.config.json` y `planning/` en ella, así que moverlo la
// desconocería—.
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
    '$schema', 'cauceVersion', 'project', 'mode', 'workspaceRoots', 'writableOutsideRoots', 'runner',
    'migrations',
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
  validateWritable(config.writableOutsideRoots, errors)
  validateRunner(config.runner, errors)
  validateMigrations(config.migrations, errors)
  return errors
}

// Qué cuenta como migración para el guard. Sin declararlo, sólo `.sql` — y ése es el default que hace
// falta decir, porque un proyecto TypeORM, Prisma, Django o Rails tiene el guard cableado y en verde sin
// que mire una sola migración (caso 077).
//
// La extensión se valida contra `[a-z0-9]+` por dos razones que se juntan: entra en una expresión
// regular, así que un valor con metacaracteres la rompería o la ampliaría sin que nadie lo pidiera; y
// declarar `.SQL` o `sql;` es un error de tipeo que conviene que se vea acá y no como cobertura que no
// existe.
function validateMigrations(migrations, errors) {
  if (migrations === undefined) return
  if (!migrations || typeof migrations !== 'object' || Array.isArray(migrations)) {
    errors.push('ops.config.json: migrations debe ser un objeto')
    return
  }
  for (const key of Object.keys(migrations)) {
    if (key !== 'extensions') errors.push(`ops.config.json: migrations.${key} no está permitido`)
  }
  if (!('extensions' in migrations)) return
  const declaradas = migrations.extensions
  if (!Array.isArray(declaradas) || !declaradas.length) {
    errors.push('ops.config.json: migrations.extensions debe listar al menos una extensión, o no estar')
    return
  }
  for (const one of declaradas) {
    if (typeof one !== 'string' || !/^[a-z0-9]+$/.test(one)) {
      errors.push(`ops.config.json: migrations.extensions "${one}" debe ser la extensión sin el punto `
        + 'y en minúscula, como "sql" o "ts"')
    }
  }
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
      if (!['name', 'path', 'verify'].includes(key)) {
        errors.push(`ops.config.json: workspaceRoots[${index}].${key} no está permitido`)
      }
    }
    // Opcional: la raíz que no lo declara deja que quien verifica descubra la puerta, como siempre.
    // Declararlo vacío es peor que no declararlo —promete una puerta y no la da—, así que se rechaza.
    if ('verify' in workspace && (typeof workspace.verify !== 'string' || !workspace.verify.trim())) {
      errors.push(`ops.config.json: workspaceRoots[${index}].verify debe ser el comando, o no estar`)
    }
    if (typeof workspace.name !== 'string' || !workspace.name.trim()) {
      errors.push(`ops.config.json: workspaceRoots[${index}].name es obligatorio`)
    }
    if (typeof workspace.path !== 'string' || !workspace.path.trim()) {
      errors.push(`ops.config.json: workspaceRoots[${index}].path es obligatorio`)
    }
  }
}

// Opcional de verdad: la mayoría de los proyectos no exenta nada, así que ausente y vacía son lo mismo
// y ninguna de las dos se reclama. Lo que sí se exige es que cada entrada sea una ruta escrita — un
// número o un objeto se resolvería igual a *algo*, y ese algo quedaría exento sin que nadie lo eligiera.
function validateWritable(paths, errors) {
  if (paths === undefined) return
  if (!Array.isArray(paths)) {
    errors.push('ops.config.json: writableOutsideRoots debe ser una lista de rutas')
    return
  }
  for (const [index, entry] of paths.entries()) {
    if (typeof entry !== 'string' || !entry.trim()) {
      errors.push(`ops.config.json: writableOutsideRoots[${index}] debe ser una ruta no vacía`)
    }
  }
}

function validateRunner(runner, errors) {
  if (!runner || typeof runner !== 'object' || Array.isArray(runner)) {
    errors.push('ops.config.json: runner debe ser un objeto')
    return
  }
  const booleans = ['humanCheckpointBetweenMilestones', 'commitPerTask', 'allowPush']
  const allowed = new Set(['maxTaskHours', 'pushToLiveBranches', ...booleans])
  for (const key of Object.keys(runner)) {
    if (!allowed.has(key)) errors.push(`ops.config.json: runner.${key} no está permitido`)
  }
  // Un patrón haría de un permiso por rama un permiso por familia, que es lo que el campo vino a evitar
  // (caso 108): el guard compara el nombre tal cual, y `release/*` no publicaría en ninguna.
  const live = runner.pushToLiveBranches
  if (live !== undefined && (!Array.isArray(live)
    || live.some((branch) => typeof branch !== 'string' || !/^[^\s*?[]+$/.test(branch)))) {
    errors.push('ops.config.json: runner.pushToLiveBranches debe ser una lista de nombres de rama exactos, '
      + 'sin espacios ni patrones')
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

module.exports = { validateOpsConfig }
