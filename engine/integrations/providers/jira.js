'use strict'

// Adaptador Jira: lectura y normalización, sin escritura remota.

const JIRA_KEY = /^[A-Z][A-Z0-9_]*-\d+$/

function validateConfig(config, errors) {
  if (typeof config.enabled !== 'boolean') errors.push('jira: enabled debe ser boolean')
  if (config.enabled && !/^https:\/\/[^/]+$/.test(config.baseUrl || '')) {
    errors.push('jira: baseUrl debe ser HTTPS sin path final')
  }
  if (config.enabled && !String(config.jql || '').trim()) errors.push('jira: falta jql')
  if (!['basic', 'bearer'].includes(config.auth && config.auth.type)) {
    errors.push('jira: auth.type debe ser basic|bearer')
  }
  if (!config.auth || !config.auth.tokenEnv) errors.push('jira: falta auth.tokenEnv')
  if (config.auth && config.auth.type === 'basic' && !config.auth.emailEnv) {
    errors.push('jira: basic exige auth.emailEnv')
  }
  if (config.writeBack !== false) {
    errors.push('jira: writeBack debe permanecer false; no existe un ejecutor remoto aprobado')
  }
  if (config.timeoutMs !== undefined
    && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1_000)) {
    errors.push('jira: timeoutMs debe ser un entero de al menos 1000 ms')
  }
  if (config.maxPages !== undefined
    && (!Number.isInteger(config.maxPages) || config.maxPages < 1)) {
    errors.push('jira: maxPages debe ser un entero positivo')
  }
  if (config.candidateAssigneeEnv
    && !/^[A-Z][A-Z0-9_]*$/.test(config.candidateAssigneeEnv)) {
    errors.push('jira: candidateAssigneeEnv debe nombrar una variable de entorno')
  }
}

function adfToMarkdown(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(adfToMarkdown).join('')
  const children = adfToMarkdown(node.content || [])
  switch (node.type) {
    case 'doc': return children.trim()
    case 'text': {
      let value = node.text || ''
      for (const mark of node.marks || []) {
        if (mark.type === 'strong') value = `**${value}**`
        if (mark.type === 'em') value = `_${value}_`
        if (mark.type === 'code') value = `\`${value}\``
        if (mark.type === 'link') value = `[${value}](${mark.attrs && mark.attrs.href})`
      }
      return value
    }
    case 'hardBreak': return '\n'
    case 'paragraph': return `${children}\n\n`
    case 'heading': return `${'#'.repeat(node.attrs && node.attrs.level || 2)} ${children}\n\n`
    case 'bulletList': return `${listItems(node, '-')}\n`
    case 'orderedList': return `${listItems(node, '1.')}\n`
    case 'listItem': return children
    case 'codeBlock': return `\`\`\`${node.attrs && node.attrs.language || ''}\n${children}\n\`\`\`\n\n`
    case 'blockquote': return children.split('\n').filter(Boolean).map((line) => `> ${line}`).join('\n') + '\n\n'
    case 'rule': return '---\n\n'
    case 'mention': return (node.attrs && (node.attrs.text || node.attrs.displayName)) || ''
    case 'inlineCard': return (node.attrs && node.attrs.url) || ''
    default: return children
  }
}

function listItems(node, marker) {
  return (node.content || []).map((item, index) => {
    const prefix = marker === '1.' ? `${index + 1}.` : marker
    return `${prefix} ${adfToMarkdown(item).trim().replace(/\n+/g, '\n  ')}`
  }).join('\n')
}

function deriveAcceptance(description, heading = 'Criterios de aceptación') {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(description || '').match(new RegExp(`^##\\s+(?:\\d+[.)]\\s*)?${escaped}\\s*$`, 'im'))
  if (!match) return ''
  const rest = description.slice(match.index + match[0].length)
  const next = rest.search(/^##\s+/m)
  return (next < 0 ? rest : rest.slice(0, next)).trim()
}

function normalizeIssue(issue, config) {
  const fields = issue.fields || {}
  const description = typeof fields.description === 'string' ? fields.description : adfToMarkdown(fields.description)
  const item = {
    key: issue.key,
    id: String(issue.id || ''),
    url: `${config.baseUrl}/browse/${issue.key}`,
    type: fields.issuetype && fields.issuetype.name || 'Issue',
    summary: String(fields.summary || '').trim(),
    description: description.trim(),
    acceptance: deriveAcceptance(description, config.acceptanceHeading || 'Criterios de aceptación'),
    status: fields.status && fields.status.name || '',
    assignee: fields.assignee ? {
      accountId: fields.assignee.accountId || '',
      displayName: fields.assignee.displayName || '',
    } : null,
    parent: fields.parent ? fields.parent.key || '' : '',
    components: (fields.components || []).map((value) => value.name).filter(Boolean),
    labels: fields.labels || [],
    updatedAt: fields.updated || '',
  }
  if (!JIRA_KEY.test(item.key)) throw new Error(`Clave Jira inválida: ${item.key}`)
  if (!item.summary) throw new Error(`${item.key}: falta summary`)
  return item
}

function normalizeFixture(payload, config) {
  const issues = Array.isArray(payload) ? payload : payload.issues
  if (!Array.isArray(issues)) throw new Error('Fixture Jira debe ser un array o { issues: [] }')
  return issues.map((issue) => normalizeIssue(issue, config))
}

async function fetchItems(config, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const timeoutMs = options.timeoutMs || config.timeoutMs || 30_000
  const maxPages = options.maxPages || config.maxPages || 100
  const token = process.env[config.auth.tokenEnv]
  const email = config.auth.emailEnv ? process.env[config.auth.emailEnv] : ''
  if (!token) throw new Error(`Falta la variable ${config.auth.tokenEnv}`)
  if (config.auth.type === 'basic' && !email) throw new Error(`Falta la variable ${config.auth.emailEnv}`)
  const authorization = config.auth.type === 'basic'
    ? `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
    : `Bearer ${token}`
  const fields = [
    'summary',
    'description',
    'issuetype',
    'status',
    'assignee',
    'parent',
    'components',
    'labels',
    'updated',
  ]
  const issues = []
  const tokens = new Set()
  let pages = 0
  let nextPageToken
  do {
    if (++pages > maxPages) throw new Error(`Jira excedió el límite de ${maxPages} páginas`)
    if (nextPageToken && tokens.has(nextPageToken)) {
      throw new Error('Jira devolvió un nextPageToken repetido')
    }
    if (nextPageToken) tokens.add(nextPageToken)
    const response = await fetchImpl(`${config.baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { authorization, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ jql: config.jql, fields, maxResults: config.pageSize || 100, nextPageToken }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`Jira respondió HTTP ${response.status}`)
    const page = await response.json()
    issues.push(...(page.issues || []))
    nextPageToken = page.nextPageToken
    if (page.isLast === true) nextPageToken = undefined
  } while (nextPageToken)
  return issues.map((issue) => normalizeIssue(issue, config))
}

module.exports = { fetchItems, normalizeFixture, validateConfig }
