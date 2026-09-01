'use strict'

// Cerrar una propuesta: los dos destinos que la sacan del ciclo y el historial que los registra.
//
// Vive aparte de `learning.js` porque son dos propósitos con vidas distintas: allá se **compone** una
// propuesta —leyendo informes y veredictos, decidiendo si hay algo que decir—, y acá se la **cierra**,
// que es un cambio de estado sobre un documento que ya existe. El umbral de 500 líneas fue lo que lo
// hizo mirar; lo que decidió la división es que ninguna de las dos mitades necesita a la otra.

const fs = require('node:fs')
const path = require('node:path')
const { atomicWrite } = require('../core/files')
const { isoDate, proposalFiles, proposalState, assertWritable, lastOfPeriod } = require('./learning-files')
const { section } = require('../planning/parser')

// El estado terminal del ciclo. Existía la firma, la aplicación y el historial, y faltaba justo el
// paso que vuelve irrepetible lo ya hecho: `status:` nacía en `proposed` y nadie lo movía nunca.
//
// No era un dato desprolijo. `agent-promote` busca la propuesta más nueva y aplica si el estado dice
// aprobada con responsable — y «aprobada y aplicada» cumple eso—, así que volver a correrlo sobre una
// propuesta ya aplicada la aplicaba de nuevo. Como los cambios son aditivos por diseño, el resultado
// no es un error visible sino un contrato con cada viñeta y cada fuente duplicadas.
function seal(root, agent, period = '', kind = 'agent') {
  const file = proposalFile(root, agent, period, kind)
  const dir = path.dirname(file)
  const text = fs.readFileSync(file, 'utf8')
  const state = proposalState(text)
  if (state === 'applied') return { file, already: true }
  if (!/^status:\s*\S+\s*$/m.test(text)) throw new Error(`${file} no declara status en su frontmatter.`)
  // Un cargo llega acá después de `agent-promote`, que se niega si «Aprobación humana» no está firmada.
  // Un recorrido no tiene ese workflow, así que sin esta puerta `--applied` sellaba una propuesta con
  // «Estado: pendiente» y «Cambio propuesto: Por definir»: el frontmatter decía `applied` y el cuerpo
  // decía lo contrario, dentro del mismo documento. Se comprueba para los dos porque la contradicción
  // no depende de quién sea el sujeto, y para el cargo la puerta ya la pasó quien firmó.
  const responsible = (text.match(/^-\s*Responsable:\s*(.+)$/m) || [])[1] || ''
  const change = section(text, /Cambio propuesto/i).split('\n').slice(1).join('\n').trim()
  const undecided = (value) => !value || /^(por definir|pendiente)\b/i.test(value)
  if (undecided(responsible.trim()) || undecided(change)) {
    throw new Error(
      `${path.basename(file)} todavía no la decidió nadie: «Aprobación humana» necesita un responsable `
      + 'y «Cambio propuesto» tiene que decir qué cambia. Aplicar es un acto humano y esto lo registra.',
    )
  }
  const stamped = text
    .replace(/^status:\s*\S+\s*$/m, 'status: applied')
    // `aprobada` además de `pendiente`: cuando `seal` corre, la firma ya pasó y `sign-proposal.yml`
    // dejó «aprobada», así que buscar sólo «pendiente» no reemplazaba nunca por el camino real. Las 24
    // propuestas aplicadas del repositorio quedaron con `status: applied` y «- Estado: aprobada»: la
    // contradicción entre frontmatter y cuerpo que la guarda de arriba dice evitar. La prueba no lo veía
    // porque su fixture firmaba dejando «pendiente», un estado que producción no produce.
    .replace(/^-[ \t]*Estado:[ \t]*(?:pendiente|aprobada)[ \t]*$/mi, '- Estado: aplicada')
    .replace(/^-[ \t]*Fecha:[ \t]*por definir[ \t]*$/mi, `- Fecha: ${isoDate(new Date())}`)
  atomicWrite(file, stamped)
  // El historial sólo lo escribe alguien para los cargos —`agent-promote`— y nadie para los recorridos,
  // así que el registro que la plantilla promete no existía nunca. Se escribe acá porque es determinista:
  // la fecha, el documento, quién aprobó y qué dice que cambia, todo sale de lo que se acaba de sellar.
  if (kind === 'flow') appendHistory(path.dirname(path.dirname(dir)), file, responsible.trim(), change)
  return { file, already: false }
}

// Archivar es el tercer destino de una propuesta, y hasta ahora no existía: aplicarla, dejarla
// esperando, o **mirarla y decidir que no cambia nada**. Ese tercero se venía haciendo mergeando el PR
// sin firmar, que deja el documento en `proposed` para siempre — indistinguible de una que espera
// trabajo. En septiembre quedaron dieciséis así, y el CLI iba a decir «1 sin aplicar» de cada una
// mientras nadie tuviera nada que hacer con ellas.
//
// Se niega sobre una propuesta firmada, y ésa es toda la guarda que hace falta: firmar es autorizar un
// cambio, así que lo que corresponde después es aplicarlo. Sin esto, archivar sería la vía para hacer
// desaparecer trabajo autorizado sin ejecutarlo ni decirlo, que es peor que el contador ruidoso.
// `--period 2026-08` nombra el período, no un archivo: con revisiones abiertas la que se resuelve es la
// vigente de ese período. Resolverlo siempre a `2026-08.md` devolvía «ya estaba aplicada» y dejaba la
// revisión sin sellar, que es justo el estado en que `agent-promote` la vuelve a aplicar. Una revisión
// concreta se nombra entera —`--period 2026-08-r2`— y entonces manda ésa.
function proposalFile(root, agent, period = '', kind = 'agent') {
  const dir = path.join(assertWritable(root, agent, kind), 'learning', 'proposals')
  const names = proposalFiles(dir)
  if (!names.length) throw new Error(`${agent} no tiene propuestas en learning/proposals/.`)
  const name = period
    ? (/^\d{4}-\d{2}$/.test(period) ? lastOfPeriod(dir, period) : `${period}.md`)
    : names[names.length - 1]
  if (!name || !names.includes(name)) throw new Error(`${agent} no tiene la propuesta ${period || name}.`)
  return path.join(dir, name)
}

function archive(root, agent, period = '', kind = 'agent') {
  const file = proposalFile(root, agent, period, kind)
  const text = fs.readFileSync(file, 'utf8')
  const state = proposalState(text)
  if (state === 'archived') return { file, already: true }
  if (state === 'applied') throw new Error(`${path.basename(file)} ya está aplicada: archivarla la borraría del ciclo.`)
  if (/^-[ \t]*Estado:[ \t]*aprobada[ \t]*$/mi.test(text)) {
    throw new Error(
      `${path.basename(file)} está firmada: lo que sigue es aplicarla con agent-promote, no archivarla. `
      + 'Archivar es para lo que se miró y no cambia nada.',
    )
  }
  atomicWrite(file, text
    .replace(/^status:\s*\S+\s*$/m, 'status: archived')
    .replace(/^-[ \t]*Estado:[ \t]*pendiente[ \t]*$/mi, '- Estado: archivada')
    .replace(/^-[ \t]*Fecha:[ \t]*por definir[ \t]*$/mi, `- Fecha: ${isoDate(new Date())}`))
  return { file, already: false }
}

// Una fila por propuesta aplicada. El cambio va en una línea: el documento entero está a un enlace, y
// una tabla que lo repite entero deja de leerse.
function appendHistory(target, file, responsible, change) {
  const history = path.join(target, 'learning', 'HISTORY.md')
  if (!fs.existsSync(history)) return
  const line = change.split('\n').map((one) => one.trim()).filter(Boolean)[0] || ''
  const row = `| ${isoDate(new Date())} | \`${path.basename(file)}\` | aplicada | ${responsible} `
    + `| ${line.slice(0, 160)} |\n`
  fs.appendFileSync(history, `${fs.readFileSync(history, 'utf8').endsWith('\n') ? '' : '\n'}${row}`)
}

module.exports = { proposalFile, seal, archive }
