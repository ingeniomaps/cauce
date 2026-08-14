'use strict'

const fs = require('node:fs')
const path = require('node:path')
const P = require('./proposals')
const S = require('./state')

const WRITABLE_STATES = ['pending', 'ready', 'promoted']

function plan(root, provider, config) {
  const updates = []
  const creates = []
  const blocked = []
  for (const staged of S.readStaging(root, provider)) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(staged.dir, 'remote.json'), 'utf8'))
    const draft = fs.readFileSync(path.join(staged.dir, 'draft.md'), 'utf8')
    const fields = S.frontmatter(draft)
    const signals = S.derive(snapshot, draft)
    if (!signals.outgoing.length) continue
    const refusal = reason => blocked.push({
      key: staged.key,
      fields: signals.outgoing,
      reason,
    })
    if (snapshot.sync.role !== 'candidate') {
      refusal('solo los candidatos pueden producir una escritura')
      continue
    }
    if (snapshot.sync.missingFromRemote) {
      refusal('el item ya no está presente en el remoto')
      continue
    }
    if (signals.conflict.length) {
      refusal(`conflicto en ${signals.conflict.join(', ')}; requiere reset o reconcile`)
      continue
    }
    if (!WRITABLE_STATES.includes(fields.state)) {
      refusal(`state=${fields.state || 'desconocido'} no autoriza escritura`)
      continue
    }
    const local = S.localView(draft)
    const changed = Object.fromEntries(
      signals.outgoing.map((field) => [field, local[field]]),
    )
    updates.push({ key: staged.key, fields: changed })
  }
  for (const proposal of P.read(root, provider)) {
    if (proposal.fields.state === 'published') continue
    if (proposal.fields.state !== 'approved') {
      blocked.push({ key: proposal.file, reason: `state=${proposal.fields.state}` })
      continue
    }
    creates.push({
      proposal: proposal.file,
      parent: proposal.fields.parent || '',
      type: proposal.fields.type,
      service: proposal.fields.service,
      summary: proposal.summary,
      description: proposal.description,
    })
  }
  return {
    provider,
    writeBack: config.writeBack === true,
    wouldWrite: config.writeBack === true ? updates.length + creates.length : 0,
    updates,
    creates,
    blocked,
  }
}

function summarize(result) {
  return {
    ...result,
    updates: result.updates.map((update) => ({
      key: update.key,
      fields: Object.fromEntries(Object.entries(update.fields).map(([name, value]) => {
        return [name, `${String(value).length} chars`]
      })),
    })),
    creates: result.creates.map((entry) => ({
      proposal: entry.proposal,
      parent: entry.parent,
      type: entry.type,
      service: entry.service,
    })),
  }
}

module.exports = { plan, summarize }
