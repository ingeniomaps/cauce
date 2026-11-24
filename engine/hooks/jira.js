'use strict'

// Editar la descripción de una tarjeta de Jira por MCP en markdown la reemplaza entera, y el markdown no
// lleva lo que el ADF sí: menciones, tablas, casillas, paneles (caso 229). Cauce no escribe en Jira, pero un
// agente sí puede, con la herramienta de edición del MCP de Atlassian; en una instancia real eso aplanó
// las filas de una tarjeta de release.
//
// Se frena sólo la edición de una descripción existente en markdown. Crear una tarjeta, editar otro campo o
// mandarla en ADF o en HTML pasan: el conector v2 de Atlassian no acepta ADF, y su HTML lleva casillas, tablas y
// medios (caso 554). Se aprueba como el resto, porque reemplazarla por texto plano puede
// ser lo que la persona quiere.

const { block, opsRoot } = require('./input')
const AP = require('./approval')

function jiraAdf(input) {
  if (!/^mcp__.+__editJiraIssue$/.test(String(input.tool_name || ''))) return
  const call = input.tool_input || {}
  const fields = call.fields || {}
  if (!Object.prototype.hasOwnProperty.call(fields, 'description')) return
  const description = fields.description
  // `null` la borra, y un objeto es un documento ADF: ninguno de los dos aplana nada. Sin formato se frena: el
  // default depende del servidor, y en el v2 es markdown.
  const format = String(call.contentFormat || '').toLowerCase()
  if (description === null || typeof description === 'object' || ['adf', 'html'].includes(format)) return
  const item = `jira ${call.issueIdOrKey} description`
  if (!AP.pending(opsRoot(input), [item], input).length) return
  block(`editar la descripción de ${call.issueIdOrKey} en markdown la reemplaza entera y aplana lo que el ADF `
    + 'tenía —menciones, tablas, casillas—. Leela con getJiraIssue y responseContentFormat "html", cambiá ese HTML y '
    + 'mandalo con contentFormat "html"; en un servidor que acepta ADF, con "adf" en los dos.'
    + `\n${AP.HOW(null, [item], input, [item], { fixable: true })}`)
}

module.exports = { jiraAdf }
