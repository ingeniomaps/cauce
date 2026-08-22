'use strict'

// Registro y ciclo común de proveedores externos.

const fs = require('node:fs')
const path = require('node:path')
const F = require('../core/files')
const S = require('./state')
const P = require('./proposals')
const W = require('./writeback')

const STATES = S.STATES
const sha256 = S.sha256

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) {
    throw new Error(`${file}: JSON inválido o ausente (${error.message})`)
  }
}

function safeSegment(value, label) {
  const segment = String(value || '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) || segment === '.' || segment === '..') {
    throw new Error(`${label} inválido: ${segment || '(vacío)'}`)
  }
  return segment
}

function providerConfig(root, name) {
  safeSegment(name, 'Proveedor')
  const registryFile = path.join(root, 'integrations', 'config.json')
  const registry = readJson(registryFile)
  const entry = (registry.providers || {})[name]
  if (!entry) throw new Error(`Proveedor no registrado: ${name}`)
  const configFile = path.resolve(path.dirname(registryFile), entry.config || `${name}/config.json`)
  F.assertWithin(path.dirname(registryFile), configFile, `${name}: config`)
  return { registry, entry, config: readJson(configFile), configFile }
}

function adapter(name) {
  if (name === 'jira') return require('./providers/jira')
  throw new Error(`No existe adaptador para ${name}`)
}

function sensitivePath(value, trail = '') {
  if (!value || typeof value !== 'object') return ''
  for (const [key, child] of Object.entries(value)) {
    const next = trail ? `${trail}.${key}` : key
    if (/(password|secret|token|authorization|cookie)$/i.test(key) && !/Env$/i.test(key)) return next
    const nested = sensitivePath(child, next)
    if (nested) return nested
  }
  return ''
}

const frontmatter = S.frontmatter
const replaceField = S.replaceField
const draftSections = S.sections
const renderDraft = S.renderDraft
const stagingItems = S.readStaging
function validate(root, onlyProvider = '') {
  const registryFile = path.join(root, 'integrations', 'config.json')
  const errors = []
  const warnings = []
  let registry
  try { registry = readJson(registryFile) } catch (error) { return { errors: [error.message], warnings } }
  // Sólo los habilitados: un proveedor registrado y apagado no tiene andamiaje —se materializa al
  // habilitarlo— y exigirle configuración sería pedirle a la empresa que mantenga lo que no usa.
  // Nombrarlo explícitamente sí lo valida, que es como se comprueba antes de encenderlo.
  const providers = Object.entries(registry.providers || {})
    .filter(([name, entry]) => (onlyProvider ? name === onlyProvider : entry && entry.enabled))
  let workspaces = []
  try {
    const ops = readJson(path.join(root, 'ops.config.json'))
    workspaces = (ops.workspaceRoots || []).map((workspace) => ({
      ...workspace,
      resolved: path.resolve(root, workspace.path),
    }))
  } catch (error) {
    errors.push(error.message)
  }
  if (!providers.length && onlyProvider) errors.push(`Proveedor no registrado: ${onlyProvider}`)
  for (const [name, entry] of providers) {
    if (!fs.existsSync(path.join(root, 'integrations', name))) {
      errors.push(`${name}: no está materializado. Corré "ops integration enable <raíz> ${name}"`)
      continue
    }
    if (!entry.adapter) errors.push(`${name}: falta adapter`)
    let loaded
    try { loaded = providerConfig(root, name) } catch (error) { errors.push(error.message); continue }
    const secret = sensitivePath(loaded.config)
    if (secret) errors.push(`${name}: ${secret} no puede contener secretos; usa una variable de entorno`)
    try {
      adapter(name).validateConfig(loaded.config, errors)
    } catch (error) {
      errors.push(`${name}: ${error.message}`)
    }
    const stagedKeys = new Map()
    for (const staged of stagingItems(root, name)) {
      const at = `integrations/${name}/staging/${staged.category}/${staged.key}`
      if (stagedKeys.has(staged.key)) {
        errors.push(`${at}: clave duplicada; también existe en ${stagedKeys.get(staged.key)}`)
      } else {
        stagedKeys.set(staged.key, at)
      }
      let snapshot
      let draft
      try {
        snapshot = readJson(path.join(staged.dir, 'remote.json'))
      } catch (error) {
        errors.push(error.message)
        continue
      }
      try { draft = fs.readFileSync(path.join(staged.dir, 'draft.md'), 'utf8') } catch (error) {
        errors.push(`${at}: falta draft.md`); continue
      }
      const fields = frontmatter(draft)
      if (snapshot.schemaVersion !== 2 || snapshot.provider !== name) {
        errors.push(`${at}: schema/provider inválido`)
      }
      if (snapshot.item.key !== staged.key || fields.remote !== staged.key) {
        errors.push(`${at}: identidad remota inconsistente`)
      }
      if (!STATES.includes(fields.state)) errors.push(`${at}: state inválido ${fields.state || '(vacío)'}`)
      if (!['candidate', 'context'].includes(snapshot.sync.role)) {
        errors.push(`${at}: sync.role inválido`)
      }
      if (!snapshot.sync.base || !snapshot.sync.baseAt) {
        errors.push(`${at}: falta la base remota reconciliada`)
      }
      if (typeof snapshot.sync.missingFromRemote !== 'boolean') {
        errors.push(`${at}: missingFromRemote debe ser boolean`)
      }
      const actualDraftChanged = sha256(draft) !== snapshot.sync.draftBaseHash
      if (snapshot.sync.draftBaseHash && snapshot.sync.draftChanged !== actualDraftChanged) {
        errors.push(`${at}: draftChanged no coincide con el contenido real`)
      }
      const signals = S.derive(snapshot, draft)
      if (snapshot.sync.role === 'context' && fields.state !== 'context') {
        errors.push(`${at}: context exige state=context`)
      }
      if (snapshot.sync.role === 'context' && signals.outgoing.length) {
        errors.push(`${at}: un contexto no puede contener curación local`)
      }
      if (snapshot.sync.missingFromRemote && fields.state === 'ready') {
        errors.push(`${at}: un item ausente del remoto no puede estar ready`)
      }
      if (fields.state === 'promoted' && signals.diverged) {
        warnings.push(`${at}: el remoto cambió después de la promoción`)
      }
      if (fields.state === 'ready') {
        const sections = draftSections(draft)
        if (!fields.service) errors.push(`${at}: ready exige service`)
        else if (!workspaces.some((workspace) => fs.existsSync(path.join(workspace.resolved, fields.service)))) {
          errors.push(`${at}: service ${fields.service} no existe en las raíces configuradas`)
        }
        if (!['epic', 'story'].includes(fields.promotionKind)) {
          errors.push(`${at}: ready exige promotionKind epic|story`)
        }
        if (fields.promotionKind === 'story' && (!/^\d{3}$/.test(fields.promotionEpic) || !fields.promotionCriteria)) {
          errors.push(`${at}: story exige promotionEpic NNN y promotionCriteria`)
        }
        if (!sections.Aceptación || /^(por definir|n\/a|pendiente)\.?$/i.test(sections.Aceptación)) {
          errors.push(`${at}: ready exige aceptación concreta`)
        }
        if (signals.incoming.length) {
          errors.push(`${at}: ready tiene cambios remotos sin reconciliar`)
        }
        if (signals.conflict.length) {
          errors.push(`${at}: ready tiene conflicto en ${signals.conflict.join(', ')}`)
        }
      }
    }
    errors.push(...P.validate(root, name, workspaces))
  }
  return { errors, warnings }
}

async function sync(root, name, options = {}) {
  const { entry, config } = providerConfig(root, name)
  if (!entry.enabled || !config.enabled) throw new Error(`${name} está deshabilitado`)
  const provider = adapter(name)
  const items = options.fixture
    ? provider.normalizeFixture(readJson(path.resolve(options.fixture)), config)
    : await provider.fetchItems(config)
  const staging = path.join(root, 'integrations', name, 'staging')
  fs.mkdirSync(staging, { recursive: true })
  const existing = new Map(stagingItems(root, name).map((item) => [item.key, item]))
  const seen = new Set()
  const result = { created: 0, refreshed: 0, preserved: 0, removed: 0, missing: 0 }
  for (const item of items) {
    const itemKey = safeSegment(item.key, `${name}: item.key`)
    if (seen.has(itemKey)) throw new Error(`${name}: item duplicado ${itemKey}`)
    const category = S.categoryOf(item)
    const desiredDir = path.join(staging, category, itemKey)
    const found = existing.get(itemKey)
    if (found && found.dir !== desiredDir) {
      fs.mkdirSync(path.dirname(desiredDir), { recursive: true })
      fs.renameSync(found.dir, desiredDir)
    }
    seen.add(itemKey)
    const snapshotFile = path.join(desiredDir, 'remote.json')
    const draftFile = path.join(desiredDir, 'draft.md')
    const previous = fs.existsSync(snapshotFile) ? readJson(snapshotFile) : null
    const previousDraft = fs.existsSync(draftFile) ? fs.readFileSync(draftFile, 'utf8') : ''
    const role = S.roleOf(item, config)
    const state = role === 'context' ? 'context' : 'pending'
    let draft
    let base
    let baseAt
    if (!previous) {
      draft = renderDraft(item, config, state)
      base = S.remoteView(item)
      baseAt = new Date().toISOString()
      result.created++
    } else {
      const signals = S.derive({ ...previous, item }, previousDraft)
      const locallyChanged = sha256(previousDraft) !== previous.sync.draftBaseHash
      const regenerate = role === 'context' || !locallyChanged
      if (regenerate) {
        draft = renderDraft(item, config, state)
        base = S.remoteView(item)
        baseAt = new Date().toISOString()
        result.refreshed++
      } else {
        draft = previousDraft
        if (signals.incoming.length && frontmatter(draft).state === 'ready') {
          draft = replaceField(draft, 'state', 'pending')
        }
        base = previous.sync.base || S.remoteView(previous.item)
        baseAt = previous.sync.baseAt || previous.sync.pulledAt
        result.preserved++
      }
    }
    const canonical = renderDraft(item, config, state)
    const snapshot = {
      schemaVersion: 2,
      provider: name,
      item,
      sync: {
        role,
        pulledAt: new Date().toISOString(),
        missingFromRemote: false,
        base,
        baseAt,
        draftBaseHash: sha256(canonical),
        draftChanged: sha256(draft) !== sha256(canonical),
        config: { serviceFrom: config.serviceFrom },
      },
    }
    fs.mkdirSync(desiredDir, { recursive: true })
    F.atomicWrite(draftFile, draft)
    F.atomicWriteJson(snapshotFile, snapshot)
  }
  // Siempre se limpia: ningún adaptador puede devolver una lectura parcial. El de Jira lanza al
  // exceder páginas, al repetir un token y ante cualquier HTTP que no sea 200, así que o trajo todo o
  // no trajo nada. Había una bandera `complete` para saltearlo, sin forma de activarla desde el CLI y
  // sin nadie que leyera el campo que escribía. Vuelve el día que un adaptador sepa decir «traje una
  // parte», que es cuando protegería algo.
  cleanupMissing(root, name, seen, result)
  F.atomicWriteJson(path.join(staging, 'sync-state.json'), {
    schemaVersion: 2,
    provider: name,
    pulledAt: new Date().toISOString(),
    keys: [...seen].sort(),
  })
  return { ...result, total: items.length }
}

function cleanupMissing(root, name, seen, result) {
  for (const staged of stagingItems(root, name)) {
    if (seen.has(staged.key)) continue
    const snapshotFile = path.join(staged.dir, 'remote.json')
    const draftFile = path.join(staged.dir, 'draft.md')
    const snapshot = readJson(snapshotFile)
    const draft = fs.readFileSync(draftFile, 'utf8')
    const state = frontmatter(draft).state
    const curated = sha256(draft) !== snapshot.sync.draftBaseHash
    if (!curated && !['promoted', 'ready'].includes(state)) {
      F.assertWithin(path.join(root, 'integrations', name, 'staging'), staged.dir)
      fs.rmSync(staged.dir, { recursive: true })
      result.removed++
      continue
    }
    snapshot.sync.missingFromRemote = true
    F.atomicWriteJson(snapshotFile, snapshot)
    result.missing++
  }
}

function promote(root, name, key) {
  safeSegment(name, 'Proveedor')
  safeSegment(key, `${name}: clave remota`)
  const validation = validate(root, name)
  if (validation.errors.length) {
    throw new Error(`La integración no está lista:\n- ${validation.errors.join('\n- ')}`)
  }
  const matches = stagingItems(root, name).filter((item) => item.key === key)
  if (matches.length !== 1) throw new Error(`${key}: no se resolvió un item único en staging`)
  const dir = matches[0].dir
  const snapshot = readJson(path.join(dir, 'remote.json'))
  const draftFile = path.join(dir, 'draft.md')
  let draft = fs.readFileSync(draftFile, 'utf8')
  const fields = frontmatter(draft)
  if (fields.state !== 'ready') throw new Error(`${key}: state debe ser ready`)
  const sections = draftSections(draft)
  const planning = path.join(root, 'planning')
  const roadmap = path.join(planning, 'roadmap')
  if (fields.promotionKind === 'epic') {
    const roadmapFiles = fs.readdirSync(roadmap).filter((file) => /^epic-\d{3}-/.test(file))
    const recovered = roadmapFiles.find((file) => {
      const content = fs.readFileSync(path.join(roadmap, file), 'utf8')
      return content.includes(`source: ${name}`) && content.includes(`remote: ${key}`)
    })
    const existing = roadmapFiles
      .map((file) => (file.match(/^epic-(\d{3})-/) || [])[1])
      .filter(Boolean)
    const next = String(Math.max(0, ...existing.map(Number)) + 1).padStart(3, '0')
    const recoveredNum = recovered && (recovered.match(/^epic-(\d{3})-/) || [])[1]
    const num = recoveredNum || fields.promotionEpic || next
    const slug = slugify(sections.title)
    const target = path.join(roadmap, recovered || `epic-${num}-${slug}.md`)
    const content = `---\nepic: ${num}\ntitle: ${sections.title}\nstatus: open\n` +
      `service: ${fields.service}\nsource: ${name}\nremote: ${key}\n---\n\n` +
      `# Épica ${num} — ${sections.title}\n\n## Resultado\n\n${sections.Descripción}\n\n` +
      `## Criterios\n\n- **C1** — ${oneLine(sections.Aceptación)}\n\n` +
      `## Contexto relevante\n\n- Importado desde ${name}:${key}; validar rutas del servicio antes de activar.\n\n` +
      `## Historias\n\n- [ ] **${slug}** (→ C1) — ${oneLine(sections.title)}. ` +
      `(service: ${fields.service})\n`
    if (fs.existsSync(target)) {
      const existingContent = fs.readFileSync(target, 'utf8')
      if (!existingContent.includes(`remote: ${key}`) || !existingContent.includes(`source: ${name}`)) {
        throw new Error(`Ya existe ${target}`)
      }
    } else {
      F.atomicWrite(target, content)
    }
  } else {
    const files = fs.readdirSync(roadmap).filter((file) => file.startsWith(`epic-${fields.promotionEpic}-`))
    if (files.length !== 1) throw new Error(`${key}: no se resolvió epic-${fields.promotionEpic}`)
    const target = path.join(roadmap, files[0])
    let spec = fs.readFileSync(target, 'utf8')
    if (!new RegExp(`\\*\\*${fields.promotionCriteria}\\*\\*`).test(spec)) {
      throw new Error(`${key}: no existe ${fields.promotionCriteria}`)
    }
    const slug = `${name}-${key.toLowerCase()}-${slugify(sections.title)}`
    const line = `- [ ] **${slug}** (→ ${fields.promotionCriteria}) — ` +
      `${oneLine(sections.title)}. _Aceptación: ${oneLine(sections.Aceptación)}_ ` +
      `(service: ${fields.service}) (remote: ${name}:${key})`
    if (!spec.includes(`**${slug}**`)) {
      const stories = spec.match(/^## Historias\s*$/m)
      if (!stories) throw new Error(`${key}: epic-${fields.promotionEpic} no tiene sección Historias`)
      const afterHeading = stories.index + stories[0].length
      const nextHeadingOffset = spec.slice(afterHeading).search(/^##\s+/m)
      const insertAt = nextHeadingOffset < 0 ? spec.length : afterHeading + nextHeadingOffset
      const before = spec.slice(0, insertAt).trimEnd()
      const after = spec.slice(insertAt).replace(/^\s+/, '')
      spec = `${before}\n\n${line}\n\n${after}`.trimEnd() + '\n'
      F.atomicWrite(target, spec)
    }
  }
  draft = replaceField(draft, 'state', 'promoted')
  draft = replaceField(draft, 'promotedAt', `"${new Date().toISOString()}"`)
  F.atomicWrite(draftFile, draft)
  snapshot.sync.draftChanged = true
  F.atomicWriteJson(path.join(dir, 'remote.json'), snapshot)
  return { key, kind: fields.promotionKind }
}

function reconcile(root, name, operation, keys) {
  providerConfig(root, name)
  return S.reconcile(root, name, operation, keys)
}

function writebackPlan(root, name) {
  const { config } = providerConfig(root, name)
  return W.summarize(W.plan(root, name, config))
}

const slugify = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)
const oneLine = (value) => String(value).replace(/\s+/g, ' ').trim()

// Si el proveedor está encendido en la instancia. Lee su propio `config.json`, que es donde vive la
// decisión, y no el registro: un proveedor listado y apagado no es un proveedor disponible.
function providerReady(root, name) {
  try {
    const suyo = path.join(root, 'integrations', name, 'config.json')
    return JSON.parse(fs.readFileSync(suyo, 'utf8')).enabled === true
  } catch { return false }
}
module.exports = {
  providerReady,
  STATES,
  adapter,
  frontmatter,
  promote,
  providerConfig,
  reconcile,
  safeSegment,
  sync,
  validate,
  writebackPlan,
}
