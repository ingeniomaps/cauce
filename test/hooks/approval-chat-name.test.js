'use strict'

// Lo que la persona nombra en el chat aprueba lo que su mensaje distingue, no todo lo que se llame igual (caso 447).
// Por qué se compara contra las otras líneas del archivo, en `self-approval.js`.

const { blocked, chatSession, messageOf, sidecar } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute, executeAll } = require('../../engine/hooks/run')

const AMBIGUOUS = /coincide con más de un lugar/

test('un archivo nombrado por su nombre no se aprueba en todos los repositorios que lo tienen', () => {
  const ws = sidecar('ops-approval-chat-name-')
  const chat = chatSession()
  const approval = path.join(ws.ops, 'planning', '.ops-approval')
  const writes = (content) => ({ cwd: ws.workspace, tool_input: { file_path: approval, content } })
  const api = path.join(ws.repos.api, 'package.json')
  const web = path.join(ws.repos.web, 'package.json')
  try {
    const bare = chat.says('agregá package.json a .ops-approval')
    blocked('workspace-boundary', bare(writes(`${api}\n${web}\n`)), AMBIGUOUS)
    // El bloqueo muestra las dos, que es lo que el «dale» va a aprobar.
    blocked('workspace-boundary', bare(writes(`${api}\n${web}\n`)), new RegExp(`\n {2}${web}\n`))
    // Con uno solo y sin otro que se llame igual no hay nada que distinguir: es lo de siempre.
    assert.doesNotThrow(() => execute('workspace-boundary', bare(writes(`${api}\n`))))
    // Si el otro repositorio también lo tiene, una sola línea es el agente eligiendo por ella.
    fs.writeFileSync(web, '{}\n')
    blocked('workspace-boundary', bare(writes(`${api}\n`)), AMBIGUOUS)
    // Partir la escritura en dos no lo esquiva: la segunda ve la primera en el archivo.
    fs.writeFileSync(approval, `${api}\n`)
    blocked('workspace-boundary', bare(writes(`${api}\n${web}\n`)), AMBIGUOUS)
    fs.rmSync(approval, { force: true })

    // Confirmar las dos las aprueba: la fricción es una pregunta, no un muro.
    const asked = chat.says('agregá package.json a .ops-approval')
    blocked('workspace-boundary', asked(writes(`${api}\n${web}\n`)), AMBIGUOUS)
    const goAhead = chat.says('dale, las dos')
    assert.doesNotThrow(() => execute('workspace-boundary', goAhead(writes(`${api}\n${web}\n`))))

    // Nombrar el repositorio distingue: pasa el suyo y el otro sigue sin pedirse.
    const named = chat.says('agregá api/package.json a .ops-approval')
    assert.doesNotThrow(() => execute('workspace-boundary', named(writes(`${api}\n`))))
    blocked('workspace-boundary', named(writes(`${api}\n${web}\n`)), new RegExp(`\n {2}${web}\n`))
    // Un tramo que las dos comparten no distingue: el árbol de una línea termina igual que el checkout principal.
    const tree = path.join(ws.workspace, 'lines', 'piloto', 'api', 'package.json')
    const both = messageOf('workspace-boundary', named(writes(`${api}\n${tree}\n`)))
    assert.match(both, AMBIGUOUS)
    assert.ok(both.includes(`  ${api}\n`) && both.includes(`  ${tree}\n`), both)
    // La ruta entera también, aunque el otro ya esté en el archivo.
    fs.writeFileSync(approval, `${api}\n`)
    const whole = chat.says(`agregá ${web} a .ops-approval`)
    assert.doesNotThrow(() => execute('workspace-boundary', whole(writes(`${api}\n${web}\n`))))
  } finally {
    chat.close()
    ws.restore()
  }
})

// Con el diálogo de Claude Code a mano no se espera un «sí» por chat: se pregunta ahí, mostrando las rutas.
test('con el diálogo nativo, las rutas que el nombre no distingue se preguntan en el diálogo', () => {
  const ws = sidecar('ops-approval-chat-native-')
  const chat = chatSession()
  const approval = path.join(ws.ops, 'planning', '.ops-approval')
  const api = path.join(ws.repos.api, 'package.json')
  const web = path.join(ws.repos.web, 'package.json')
  fs.writeFileSync(web, '{}\n')
  try {
    const bare = chat.says('agregá package.json a .ops-approval')
    const input = bare({ hook_event_name: 'PreToolUse', permission_mode: 'default', cwd: ws.workspace,
      tool_input: { file_path: approval, content: `${api}\n` } })
    let asked = null
    try { executeAll(['workspace-boundary'], input) } catch (error) { asked = error }
    assert.ok(asked && asked.ask, `no pidió el diálogo: ${asked && asked.message}`)
    assert.ok(asked.message.includes(`  ${api}\n`), asked.message)
  } finally {
    chat.close()
    ws.restore()
  }
})

// Un comando con su lugar es el mismo cruce: «git clean -fd» se lee igual en cualquier repositorio (caso 446).
test('un comando nombrado sin su lugar no se aprueba en todos los repositorios', () => {
  const ws = sidecar('ops-approval-chat-command-')
  const chat = chatSession()
  const approval = path.join(ws.ops, 'planning', '.ops-approval')
  const writes = (content) => ({ cwd: ws.workspace, tool_input: { file_path: approval, content } })
  const lines = `git clean -fd @ ${ws.repos.api}\ngit clean -fd @ ${ws.repos.web}\n`
  try {
    const bare = chat.says('agregá git clean -fd a .ops-approval')
    blocked('workspace-boundary', bare(writes(lines)), AMBIGUOUS)
    blocked('workspace-boundary', bare(writes(`git clean -fd @ ${ws.repos.api}\n`)), AMBIGUOUS)
    const inApi = chat.says('agregá git clean -fd a .ops-approval, para api')
    assert.doesNotThrow(() => execute('workspace-boundary', inApi(writes(`git clean -fd @ ${ws.repos.api}\n`))))
    blocked('workspace-boundary', inApi(writes(lines)), new RegExp(`\n {2}git clean -fd @ ${ws.repos.web}\n`))
  } finally {
    chat.close()
    ws.restore()
  }
})

// Una ruta puede colgar de dos raíces —un paquete de un monorepo declarado aparte—, y el lugar es el de la más
// cercana: medido desde la de afuera, el `package.json` del paquete no tendría con qué compararse.
test('en un monorepo, el package.json de un paquete se compara con el de la raíz', () => {
  const ws = sidecar('ops-approval-chat-monorepo-')
  const chat = chatSession()
  const approval = path.join(ws.ops, 'planning', '.ops-approval')
  const writes = (content) => ({ cwd: ws.workspace, tool_input: { file_path: approval, content } })
  const pkg = path.join(ws.repos.api, 'packages', 'x')
  fs.mkdirSync(pkg, { recursive: true })
  fs.writeFileSync(path.join(pkg, 'package.json'), '{}\n')
  fs.writeFileSync(path.join(ws.repos.api, 'package.json'), '{}\n')
  fs.writeFileSync(path.join(ws.ops, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'sidecar',
    workspaceRoots: [{ name: 'api', path: '../api' }, { name: 'x', path: '../api/packages/x' }] }))
  try {
    const bare = chat.says('agregá package.json a .ops-approval')
    blocked('workspace-boundary', bare(writes(`${path.join(pkg, 'package.json')}\n`)), AMBIGUOUS)
  } finally {
    chat.close()
    ws.restore()
  }
})
