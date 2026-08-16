'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execute, executeAll, guards, hookGroups } = require('../engine/hooks/run')

function blocked(name, input) {
  assert.throws(() => execute(name, input), (error) => error.blocked === true)
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

test('guard-destructive bloquea pérdida o publicación y permite lecturas', () => {
  blocked('destructive', { tool_input: { command: 'git push origin main' } })
  blocked('destructive', { tool_input: { command: 'git reset --hard HEAD' } })
  blocked('destructive', { tool_input: { command: 'docker compose down' } })
  blocked('destructive', { tool_input: { command: 'rm -rf /' } })
  assert.doesNotThrow(() => execute('destructive', { tool_input: { command: 'git status --short' } }))
  assert.doesNotThrow(() => execute('destructive', { tool_input: { command: 'rm -r build/cache' } }))
})

test('guard-git-add exige stage explícito', () => {
  for (const command of ['git add .', 'git add -A', 'git add --all']) blocked('git-add', { tool_input: { command } })
  assert.doesNotThrow(() => execute('git-add', { tool_input: { command: 'git add src/app.js' } }))
})

test('guards de archivos protegen secretos y snapshots, pero permiten plantillas y drafts', () => {
  blocked('secrets', { tool_input: { file_path: '/project/.env.production' } })
  blocked('secrets', { tool_input: { patch: '*** Begin Patch\n*** Add File: .env\n+TOKEN=x\n*** End Patch' } })
  blocked('secrets', { tool_input: { file_path: '/project/service-account.json' } })
  assert.doesNotThrow(() => execute('secrets', { tool_input: { file_path: '/project/.env.example' } }))
  blocked('integration-snapshot', { tool_input: { file_path: '/project/integrations/jira/staging/KEY-1/remote.json' } })
  blocked('integration-snapshot', {
    tool_input: { file_path: '/project/integrations/jira/staging/stories/KEY-1/remote.json' },
  })
  const snapshotPatch = '*** Begin Patch\n'
    + '*** Update File: integrations/jira/staging/KEY-1/remote.json\n'
    + '*** End Patch'
  blocked('integration-snapshot', { tool_input: { patch: snapshotPatch } })
  const draft = { tool_input: { file_path: '/project/integrations/jira/staging/KEY-1/draft.md' } }
  assert.doesNotThrow(() => execute('integration-snapshot', draft))
  blocked('generated', { tool_input: { file_path: '/project/api/client_generated.go' } })
  blocked('generated', { tool_input: { patch: '*** Begin Patch\n*** Update File: src/api.gen.ts\n*** End Patch' } })
  assert.doesNotThrow(() => execute('generated', { tool_input: { file_path: '/project/src/client.go' } }))
})

test('guard-governance bloquea commits con reglas staged', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-hook-gov-'))
  git(['init', '-q'], root)
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'planning', 'PROTOCOL.md'), '# protocol\n')
  git(['add', 'planning/PROTOCOL.md'], root)
  blocked('governance', { cwd: root, tool_input: { command: 'git commit -m test' } })
})

test('guard-verify ejecuta gates reales antes del commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-hook-verify-'))
  git(['init', '-q'], root)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }))
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = true\n')
  git(['add', 'package.json', 'app.js'], root)
  blocked('verify', { cwd: root, tool_input: { command: 'git commit -m test' } })
})

test('guard-verify exige regenerar después de cambiar OpenAPI o SQL fuente', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-hook-generated-drift-'))
  git(['init', '-q'], root)
  fs.mkdirSync(path.join(root, 'openapi'))
  fs.writeFileSync(path.join(root, 'openapi', 'api.yaml'), 'openapi: 3.0.0\n')
  git(['add', 'openapi/api.yaml'], root)
  blocked('verify', { cwd: root, tool_input: { command: 'git commit -m test' } })
  fs.writeFileSync(path.join(root, 'client_generated.go'), 'package client\n')
  git(['add', 'client_generated.go'], root)
  assert.doesNotThrow(() => execute('verify', { cwd: root, tool_input: { command: 'git commit -m test' } }))
})

test('guard-workspace-boundary limita escrituras a las raíces declaradas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-hook-boundary-'))
  fs.mkdirSync(path.join(root, 'planning'))
  fs.mkdirSync(path.join(root, 'service'))
  const config = { workspaceRoots: [{ name: 'service', path: 'service' }] }
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(config))
  assert.doesNotThrow(() => execute('workspace-boundary', { cwd: root, tool_input: { file_path: 'service/app.js' } }))
  blocked('workspace-boundary', { cwd: root, tool_input: { file_path: '../outside.txt' } })
})

test('guard-engine protege el motor instalado y deja trabajar al toolkit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-hook-engine-'))
  const pkg = path.join(root, 'node_modules', '@ingeniomaps', 'cauce', 'engine')
  fs.mkdirSync(pkg, { recursive: true })
  fs.mkdirSync(path.join(root, 'agents'))
  fs.mkdirSync(path.join(root, 'planning'))

  // En una empresa el motor es de sólo lectura: llega por npm y se arregla arriba.
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  blocked('engine', { cwd: root, tool_input: { file_path: 'node_modules/@ingeniomaps/cauce/engine/cli/ops.js' } })
  // Lo que sí es suyo sigue abierto: el guard no puede volverse un candado general.
  assert.doesNotThrow(() => execute('engine', { cwd: root, tool_input: { file_path: 'agents/roles/mio.md' } }))

  // En el toolkit el motor es el producto: acá editarlo es el trabajo, no una infracción.
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'toolkit' }))
  const own = { file_path: 'node_modules/@ingeniomaps/cauce/engine/cli/ops.js' }
  assert.doesNotThrow(() => execute('engine', { cwd: root, tool_input: own }))
})

// El mensaje es la única guía que recibe quien se choca con el guard, así que el comando tiene que
// funcionar de verdad. `npm update` no sirve: `declareEngine` clava la versión exacta y npm no mueve
// un pin exacto —dice «up to date» y no hace nada—. Y `install @latest` a secas escribe `^`, que
// rompe esa disciplina; de ahí `--save-exact`. Traer el motor tampoco alcanza: las rutas del sistema
// de la instancia se refrescan con `upgrade`, que es el segundo paso.
test('guard-engine indica un camino de actualización que funciona', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-hook-engine-msg-'))
  fs.mkdirSync(path.join(root, 'node_modules', '@ingeniomaps', 'cauce'), { recursive: true })
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar' }))
  const input = { cwd: root, tool_input: { file_path: 'node_modules/@ingeniomaps/cauce/x.js' } }
  let message = ''
  try { execute('engine', input) } catch (error) { message = error.message }
  assert.ok(message, 'el guard tiene que haber bloqueado')
  assert.match(message, /npm install --save-dev --save-exact @ingeniomaps\/cauce@latest/)
  assert.match(message, /ops\.js upgrade/, 'y el segundo paso, o la instancia queda a medias')
  assert.ok(!message.includes('npm update'), 'npm update no mueve un pin exacto')
})

test('guard-migrations protege historial y SQL destructivo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-hook-migrations-'))
  fs.mkdirSync(path.join(root, 'migrations'))
  fs.writeFileSync(path.join(root, 'migrations', '001_init.sql'), 'CREATE TABLE users (id int);\n')
  const rewrite = { file_path: 'migrations/001_init.sql', new_string: 'ALTER TABLE users ADD name text;' }
  blocked('migrations', { cwd: root, tool_input: rewrite })
  const destructive = { file_path: 'migrations/002_drop.sql', content: 'DROP TABLE users;' }
  blocked('migrations', { cwd: root, tool_input: destructive })
  const additive = { file_path: 'migrations/002_add.sql', content: 'ALTER TABLE users ADD name text;' }
  assert.doesNotThrow(() => execute('migrations', { cwd: root, tool_input: additive }))
})

test('guard-dependencies exige consistencia y bloquea publicación', () => {
  blocked('dependencies', { tool_input: { command: 'npm publish' } })
  blocked('dependencies', { tool_input: { command: 'pnpm add -g typescript' } })
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-hook-deps-'))
  git(['init', '-q'], root)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { example: '1.0.0' } }))
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n')
  git(['add', 'package.json'], root)
  blocked('dependencies', { cwd: root, tool_input: { command: 'git commit -m deps' } })
  git(['add', 'package-lock.json'], root)
  assert.doesNotThrow(() => execute('dependencies', { cwd: root, tool_input: { command: 'git commit -m deps' } }))
})

test('los grupos cubren cada guard exactamente una vez', () => {
  const grouped = Object.values(hookGroups).flat()
  assert.deepEqual([...grouped].sort(), Object.keys(guards).sort(), 'ningún guard queda fuera ni duplicado')
  for (const name of grouped) assert.ok(guards[name], `${name} no existe como guard`)
})

test('executeAll corre el grupo entero, no sólo su primer guard', () => {
  assert.throws(
    () => executeAll(['pre-shell'], { tool_input: { command: 'git push origin main' } }),
    (error) => error.blocked === true,
    'destructive es el primero del grupo',
  )
  assert.throws(
    () => executeAll(['pre-shell'], { cwd: os.tmpdir(), tool_input: { command: 'npm publish' } }),
    (error) => error.blocked === true,
    'dependencies está en el medio del grupo',
  )
  assert.throws(
    () => executeAll(['pre-files'], {
      tool_input: { file_path: '/project/integrations/jira/staging/KEY-1/remote.json' },
    }),
    (error) => error.blocked === true,
    'integration-snapshot es el último del grupo',
  )
  assert.doesNotThrow(() => executeAll(['pre-shell'], { tool_input: { command: 'git status --short' } }))
  assert.doesNotThrow(() => executeAll(['pre-files'], {
    tool_input: { file_path: 'docs/README.md', content: '# hola' },
  }))
  assert.throws(() => executeAll(['grupo-inexistente'], {}), /Hook desconocido/)
  assert.throws(() => executeAll([], {}), /guard o de un grupo/)
})

test('un guard suelto sigue siendo invocable por nombre', () => {
  assert.throws(
    () => executeAll(['git-add'], { tool_input: { command: ['git', 'add', '.'].join(' ') } }),
    (error) => error.blocked === true,
  )
})
