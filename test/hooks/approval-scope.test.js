'use strict'

// Una aprobación nombra un archivo de un checkout y de ningún otro (caso 445), en los gates de commit y en los
// guards que reciben la ruta de una herramienta. Por qué la forma es la absoluta, en `approval.js`.

const { blocked, git, initRepo, messageOf, pasteApproval, sidecar } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')

const commitIn = (cwd) => ({ cwd, tool_input: { command: 'git commit -m x' } })

test('un manifiesto aprobado para un repositorio no aprueba el del repositorio de al lado', () => {
  const ws = sidecar('ops-approval-scope-deps-')
  try {
    for (const repo of Object.values(ws.repos)) {
      fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x"}\n')
      fs.writeFileSync(path.join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
      git(['add', 'package.json', 'pnpm-lock.yaml'], repo)
      git(['commit', '-qm', 'init'], repo)
      fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x","dependencies":{"y":"1"}}\n')
      git(['add', 'package.json'], repo)
    }
    const message = messageOf('dependencies', commitIn(ws.repos.api))
    // El bloqueo dice de qué repositorio habla: `.:` no lo decía, y quien aprobaba no sabía que era para todos.
    assert.match(message, new RegExp(`^${ws.repos.api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: cambió`, 'm'))
    const pasted = pasteApproval(ws.ops, message)
    assert.deepEqual(pasted, [path.join(ws.repos.api, 'package.json')])
    assert.doesNotThrow(() => execute('dependencies', commitIn(ws.repos.api)))
    blocked('dependencies', commitIn(ws.repos.web), /sin actualizar su lockfile/)

    // La forma vieja ya no aprueba en ninguno: era la que valía para los dos.
    ws.approve('package.json')
    blocked('dependencies', commitIn(ws.repos.api), /sin actualizar su lockfile/)
    blocked('dependencies', commitIn(ws.repos.web), /sin actualizar su lockfile/)
  } finally { ws.restore() }
})

test('un manifiesto que no toca dependencias sigue pasando sin aprobación', () => {
  // `lockUnaffected` lee el archivo del índice por su ruta relativa: si la ruta de la aprobación se le colaba, el
  // `git show` fallaba y un cambio de scripts volvía a frenar (caso 181).
  const ws = sidecar('ops-approval-scope-inert-')
  try {
    const repo = ws.repos.api
    fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x"}\n')
    fs.writeFileSync(path.join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    git(['add', 'package.json', 'pnpm-lock.yaml'], repo)
    git(['commit', '-qm', 'init'], repo)
    fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"x","scripts":{"t":"true"}}\n')
    git(['add', 'package.json'], repo)
    assert.doesNotThrow(() => execute('dependencies', commitIn(repo)))
  } finally { ws.restore() }
})

test('verify y governance aprueban el archivo de su repositorio y no la ruta relativa', () => {
  const ws = sidecar('ops-approval-scope-verify-')
  try {
    for (const repo of Object.values(ws.repos)) {
      fs.mkdirSync(path.join(repo, 'openapi'))
      fs.writeFileSync(path.join(repo, 'openapi', 'api.yaml'), 'openapi: 3.0.0\n')
      git(['add', 'openapi/api.yaml'], repo)
    }
    ws.approve('openapi/api.yaml')
    blocked('verify', commitIn(ws.repos.api), /OpenAPI\/Swagger/)
    pasteApproval(ws.ops, messageOf('verify', commitIn(ws.repos.api)))
    assert.doesNotThrow(() => execute('verify', commitIn(ws.repos.api)))
    blocked('verify', commitIn(ws.repos.web), /OpenAPI\/Swagger/)

    // Gobernanza: la instancia es un repositorio más, y su archivo protegido se aprueba con su ruta entera.
    initRepo(ws.ops)
    fs.mkdirSync(path.join(ws.ops, 'planning', 'rules'), { recursive: true })
    fs.writeFileSync(path.join(ws.ops, 'planning', 'FLOW.md'), 'x\n')
    git(['add', 'planning/FLOW.md'], ws.ops)
    ws.approve('planning/FLOW.md')
    blocked('governance', commitIn(ws.ops), /gobernanza protegida/)
    pasteApproval(ws.ops, messageOf('governance', commitIn(ws.ops)))
    assert.match(fs.readFileSync(path.join(ws.ops, 'planning', '.ops-approval'), 'utf8'),
      new RegExp(`^${path.join(ws.ops, 'planning', 'FLOW.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'))
    assert.doesNotThrow(() => execute('governance', commitIn(ws.ops)))
  } finally { ws.restore() }
})

test('una migración que llega por parche se aprueba con la ruta resuelta desde donde corre', () => {
  // Un Write la trae absoluta; un `apply_patch`, relativa al cwd. Las dos tienen que dar la misma línea, y la de
  // un repositorio no puede valer para el otro.
  const ws = sidecar('ops-approval-scope-patch-')
  try {
    const patch = (cwd) => ({ cwd, tool_name: 'apply_patch', tool_input: { patch: '*** Begin Patch\n'
      + '*** Add File: migrations/010_drop.sql\n+DROP TABLE pedidos;\n*** End Patch' } })
    const write = (cwd) => ({ cwd, tool_input: { file_path: path.join(cwd, 'migrations', '010_drop.sql'),
      content: 'DROP TABLE pedidos;' } })
    ws.approve('migrations/010_drop.sql')
    blocked('migrations', patch(ws.repos.api), /SQL destructivo/)
    pasteApproval(ws.ops, messageOf('migrations', patch(ws.repos.api)))
    assert.doesNotThrow(() => execute('migrations', patch(ws.repos.api)))
    assert.doesNotThrow(() => execute('migrations', write(ws.repos.api)), 'la misma línea vale para el Write')
    blocked('migrations', patch(ws.repos.web), /SQL destructivo/)
  } finally { ws.restore() }
})

test('comments aprueba el archivo de su repositorio y no el del de al lado', () => {
  const ws = sidecar('ops-approval-scope-comments-')
  try {
    const config = path.join(ws.ops, 'ops.config.json')
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')),
      comments: { inlineMax: 2 } }))
    const long = 'function tres() {\n  // Una.\n  // Dos.\n  // Tres.\n  return 3\n}\n'
    for (const repo of Object.values(ws.repos)) {
      fs.writeFileSync(path.join(repo, 'cuerpo.js'), long)
      git(['add', 'cuerpo.js'], repo)
    }
    const message = messageOf('comments', commitIn(ws.repos.api))
    assert.match(message, /máximo 2/)
    assert.deepEqual(pasteApproval(ws.ops, message), [path.join(ws.repos.api, 'cuerpo.js')])
    // Lo duro pasa en `api`, y lo que queda es la pasada de R11, que no es una aprobación.
    assert.doesNotMatch(messageOf('comments', commitIn(ws.repos.api)), /máximo 2/)
    assert.match(messageOf('comments', commitIn(ws.repos.web)), /máximo 2/)
  } finally { ws.restore() }
})

// Los guards que reciben la ruta de una herramienta comparten el `approved` de `files.js`: un parche la trae relativa
// al cwd, y la línea tiene que ser la del archivo de ese repositorio.
test('los guards de escritura aprueban la ruta resuelta de un parche, y sólo en su repositorio', () => {
  const ws = sidecar('ops-approval-scope-files-')
  try {
    const patch = (cwd, file, body = 'x') => ({ cwd, tool_name: 'apply_patch', tool_input: {
      patch: `*** Begin Patch\n*** Add File: ${file}\n+${body}\n*** End Patch` } })
    for (const [guard, file, reason] of [
      ['secrets', '.env', /credencial|secret/i],
      ['generated', 'src/client.generated.ts', /generado/],
      ['integration-snapshot', 'integrations/jira/staging/sync-state.json', /sincronizador/],
    ]) {
      ws.approve(file)
      blocked(guard, patch(ws.repos.api, file), reason)
      assert.deepEqual(pasteApproval(ws.ops, messageOf(guard, patch(ws.repos.api, file))),
        [path.join(ws.repos.api, file)], guard)
      assert.doesNotThrow(() => execute(guard, patch(ws.repos.api, file)), guard)
      blocked(guard, patch(ws.repos.web, file), reason)
    }
    // El motor instalado vive en la instancia, y su ruta relativa se resuelve desde ahí.
    const engine = 'node_modules/@ingeniomaps/cauce/engine/x.js'
    ws.approve(engine)
    blocked('engine', patch(ws.ops, engine), /motor de Cauce/)
    ws.approve(path.join(ws.ops, engine))
    assert.doesNotThrow(() => execute('engine', patch(ws.ops, engine)))
  } finally { ws.restore() }
})
