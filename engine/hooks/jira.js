'use strict'

// Editar la descripción de una tarjeta de Jira por MCP en markdown la reemplaza entera, y el markdown no
// lleva lo que el ADF sí: menciones, tablas, casillas, paneles (caso 229). Cauce no escribe en Jira, pero un
// agente sí puede, con la herramienta `editJiraIssue` del MCP de Atlassian; en una instancia real eso aplanó
// las filas de una tarjeta de release.
//
// Se frena sólo la edición de una descripción existente que no viene en ADF. Crear una tarjeta, editar otro
// campo o mandar el documento ADF pasan. Se aprueba como el resto, porque reemplazarla por texto plano puede
// ser lo que la persona quiere.

const { block, opsRoot } = require('./input')
const AP = require('./approval')

function jiraAdf(input) {
  if (!/^mcp__.+__editJiraIssue$/.test(String(input.tool_name || ''))) return
  const call = input.tool_input || {}
  const fields = call.fields || {}
  if (!Object.prototype.hasOwnProperty.call(fields, 'description')) return
  const description = fields.description
  // `null` la borra, y un objeto es un documento ADF: ninguno de los dos aplana nada.
  if (description === null || typeof description === 'object' || call.contentFormat === 'adf') return
  const item = `jira ${call.issueIdOrKey} description`
  if (!AP.pending(opsRoot(input), [item], input).length) return
  block(`editar la descripción de ${call.issueIdOrKey} en markdown la reemplaza entera y aplana lo que el ADF `
    + 'tenía —menciones, tablas, casillas—. Leela con getJiraIssue y responseContentFormat "adf", cambiá ese '
    + `documento y mandalo con contentFormat "adf".\n${AP.HOW(null, [item], input, [item], { fixable: true })}`)
}

module.exports = { jiraAdf }
