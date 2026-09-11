'use strict'

// El contrato de secretos que una empresa comparte entre sus repositorios, y el chequeo sin red que lo
// hace cumplir (caso 088). La base no conoce ningún gestor: lee `organization/secrets.json`, comprueba
// que sus referencias cierren, que ninguna credencial viva dentro de un repositorio y que cada copia de
// un archivo compartido coincida con la canónica que guarda la instancia. Lo que habla con el gestor y
// lo que se copia es de la empresa; esto sólo dice qué quedó atrás y cómo ponerlo al día.
//
// Compara los servicios de **una** instancia. Una empresa con varios proyectos los declara como raíces
// de la misma, y eso es lo que hace que un esqueleto y sus derivados se midan contra la misma copia.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const F = require('../core/files')
const { resolvePath } = require('../config/paths')
const { sensitivePath } = require('../integrations/registry')

const DECLARATION = path.join('organization', 'secrets.json')
const TOP_LEVEL = ['schemaVersion', 'accounts', 'projects', 'identities', 'shared', 'services']
const SOURCES = ['file', 'ci-secret']

function inside(base, target) {
  try { F.assertWithin(base, target); return true } catch { return false }
}

const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

// Una credencial dentro de un repositorio es la que se commitea por error, y el repositorio puede ser
// uno que la instancia no declara: sólo git sabe si el directorio está en un árbol de trabajo. Sin
// `GIT_DIR` heredado, que respondería por otro repositorio (caso 045).
function inRepository(file) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) return false
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, encoding: 'utf8', env })
  return result.status === 0 && result.stdout.trim() === 'true'
}

function readJson(file) {
  try { return { value: JSON.parse(fs.readFileSync(file, 'utf8')) } } catch (error) { return { error } }
}

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// Una sección que falta es una sección vacía; una que no es objeto es un error y se lee como vacía para
// que el resto del chequeo siga diciendo lo que encuentre.
function section(declaration, name, errors) {
  const value = declaration[name]
  if (value === undefined) return {}
  if (isObject(value) && Object.values(value).every(isObject)) return value
  errors.push(`${DECLARATION}: ${name} debe ser un objeto de entradas`)
  return {}
}

function reference(errors, where, field, value, declared, sectionName) {
  if (value === undefined) return errors.push(`${where}: falta ${field}`)
  if (!Object.hasOwn(declared, value)) {
    errors.push(`${where}: ${field} «${value}» no está declarado en ${sectionName}`)
  }
}

function checkIdentities(context) {
  const { root, identities, accounts, workspaces, errors, warnings } = context
  for (const [name, identity] of Object.entries(identities)) {
    const where = `identities.${name}`
    reference(errors, where, 'account', identity.account, accounts, 'accounts')
    if (!SOURCES.includes(identity.source)) {
      errors.push(`${where}: source debe ser ${SOURCES.join(' o ')}`)
      continue
    }
    if (identity.source === 'ci-secret') {
      if (identity.file !== undefined) errors.push(`${where}: una identidad ci-secret vive en el CI y no lleva file`)
      continue
    }
    if (typeof identity.file !== 'string' || !identity.file.trim()) {
      errors.push(`${where}: una identidad file necesita la ruta de su archivo`)
      continue
    }
    const file = resolvePath(root, identity.file)
    const base = [root, ...workspaces.map((workspace) => workspace.dir)].find((dir) => inside(dir, file))
    if (base) errors.push(`${where}: ${file} está dentro de ${base}; una credencial vive fuera de todo repositorio`)
    else if (inRepository(file)) {
      errors.push(`${where}: ${file} está dentro de un repositorio de git; una credencial vive fuera de todos`)
    }
    if (!fs.existsSync(file)) {
      warnings.push(`${where}: ${file} no está en esta máquina; la carga una persona, el chequeo no la lee`)
    }
  }
}

// Las copias de cada servicio contra la canónica. Devuelve cuántos servicios quedaron al día.
function checkServices(context) {
  const { root, declaration, services, projects, identities, shared, workspaces, errors } = context
  let current = 0
  for (const [name, service] of Object.entries(services)) {
    const where = `services.${name}`
    const before = errors.length
    reference(errors, where, 'project', service.project, projects, 'projects')
    if (service.identity !== undefined) {
      reference(errors, where, 'identity', service.identity, identities, 'identities')
    }
    const workspace = workspaces.find((entry) => entry.name === service.root)
    if (!workspace) {
      errors.push(`${where}: root «${service.root}» no es una raíz de ops.config.json`)
      continue
    }
    if (!fs.existsSync(workspace.dir)) {
      errors.push(`${where}: no existe ${workspace.dir}`)
      continue
    }
    const schema = service.schema || '.env.schema'
    if (!fs.existsSync(path.resolve(workspace.dir, schema))) {
      errors.push(`${where}: falta ${schema} en ${workspace.dir}`)
    }
    for (const [target, key] of Object.entries(isObject(service.files) ? service.files : {})) {
      if (!Object.hasOwn(shared, key)) {
        errors.push(`${where}: files.${target} apunta a «${key}», que no está declarado en shared`)
        continue
      }
      const copy = path.resolve(workspace.dir, target)
      const canonical = path.resolve(root, declaration.shared[key])
      if (!inside(workspace.dir, copy)) errors.push(`${where}: ${target} está fuera de su raíz`)
      else if (!fs.existsSync(canonical)) continue
      else if (!fs.existsSync(copy)) errors.push(`${where}: falta ${target}; copiala de ${declaration.shared[key]}`)
      else if (digest(copy) !== digest(canonical)) {
        errors.push(`${where}: ${target} no coincide con ${declaration.shared[key]}; para ponerla al día: `
          + `cp ${canonical} ${copy}`)
      }
    }
    if (errors.length === before) current += 1
  }
  return current
}

function checkShared(root, shared, errors) {
  for (const [key, value] of Object.entries(shared)) {
    const file = path.resolve(root, String(value))
    if (!inside(root, file)) errors.push(`shared.${key}: ${value} está fuera de la instancia`)
    else if (!fs.existsSync(file)) errors.push(`shared.${key}: no existe ${value}`)
  }
}

// El chequeo entero. Sin declaración no hay nada que comprobar, y no es un error: la mayoría de las
// instancias no la usa.
function check(root) {
  const file = path.join(root, DECLARATION)
  if (!fs.existsSync(file)) return { declared: false, errors: [], warnings: [], current: 0 }
  const errors = []
  const warnings = []
  const done = () => ({ declared: true, errors, warnings, current })
  let current = 0
  const read = readJson(file)
  if (read.error) errors.push(`${DECLARATION}: JSON inválido (${read.error.message})`)
  else if (!isObject(read.value)) errors.push(`${DECLARATION}: debe ser un objeto`)
  if (errors.length) return done()
  const declaration = read.value
  for (const key of Object.keys(declaration)) {
    if (!TOP_LEVEL.includes(key)) errors.push(`${DECLARATION}: propiedad desconocida ${key}`)
  }
  if (declaration.schemaVersion !== 1) errors.push(`${DECLARATION}: schemaVersion debe ser 1`)
  const secret = sensitivePath(declaration)
  if (secret) errors.push(`${DECLARATION}: ${secret} tiene forma de secreto; acá van referencias, nunca valores`)
  const config = readJson(path.join(root, 'ops.config.json'))
  const roots = config.error || !Array.isArray(config.value.workspaceRoots) ? [] : config.value.workspaceRoots
  if (config.error) errors.push(`ops.config.json: no se puede leer (${config.error.message})`)
  const workspaces = roots.filter(isObject).map((entry) => ({ name: entry.name, dir: path.resolve(root, entry.path) }))
  const accounts = section(declaration, 'accounts', errors)
  const projects = section(declaration, 'projects', errors)
  const identities = section(declaration, 'identities', errors)
  const services = section(declaration, 'services', errors)
  const shared = isObject(declaration.shared) ? declaration.shared : {}
  if (declaration.shared !== undefined && !isObject(declaration.shared)) {
    errors.push(`${DECLARATION}: shared debe ser un objeto de rutas`)
  }
  for (const [name, project] of Object.entries(projects)) {
    reference(errors, `projects.${name}`, 'account', project.account, accounts, 'accounts')
  }
  const context = { root, declaration, accounts, projects, identities, services, shared, workspaces, errors, warnings }
  checkIdentities(context)
  checkShared(root, shared, errors)
  current = checkServices(context)
  return done()
}

module.exports = { DECLARATION, check }
