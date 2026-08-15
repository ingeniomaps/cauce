'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { hookMetadata } = require('../engine/hooks/run')

const CLI = path.resolve(__dirname, '..', 'engine', 'cli', 'ops.js')

function run(args, cwd = path.dirname(CLI)) {
  const env = { ...process.env, LANG: process.env.LANG || 'C.UTF-8' }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env })
}

function filesBelow(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const current = path.join(root, entry.name)
    return entry.isDirectory() ? filesBelow(current) : [current]
  })
}

test('la plantilla canónica pasa el validador', () => {
  const result = run(['check', path.resolve(__dirname, '..', 'template', 'planning')])
  assert.equal(result.status, 0, result.stderr)
})

test('automation list-hooks explica los guards disponibles', () => {
  const result = run(['automation', 'list-hooks', path.resolve(__dirname, '..')])
  assert.equal(result.status, 0, result.stderr)
  assert.ok(hookMetadata.some((hook) => hook.name === 'workspace-boundary'))
  assert.ok(hookMetadata.some((hook) => hook.name === 'migrations'))
  assert.ok(hookMetadata.some((hook) => hook.name === 'planning-drift'))
  assert.equal(hookMetadata.length, 11)
})

test('init produce una instancia autocontenida y no sobrescribe', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-'))
  const target = path.join(base, 'demo-ops')
  const created = run(['init', target, '--name', 'Demo', '--mode', 'sidecar'])
  assert.equal(created.status, 0, created.stderr)
  assert.equal(fs.existsSync(path.join(target, '.ops', 'engine', 'cli', 'ops.js')), true)
  assert.equal(fs.existsSync(path.join(target, 'planning', 'PROTOCOL.md')), true)
  const systemAdr = path.join(
    target,
    'planning',
    'adr',
    'system',
    'OPS-003-integraciones-seguras-por-staging.md',
  )
  assert.equal(fs.existsSync(systemAdr), true)
  const systemRule = path.join(
    target,
    'planning',
    'business-rules',
    'system',
    'BR-OPS-004-done-requiere-evidencia.md',
  )
  assert.equal(fs.existsSync(systemRule), true)
  const deliveryProfile = path.join(target, 'planning', 'delivery', 'project.md')
  assert.equal(fs.existsSync(deliveryProfile), true)
  assert.match(fs.readFileSync(deliveryProfile, 'utf8'), /Demo/)
  assert.equal(fs.existsSync(path.join(target, 'Makefile')), true)
  assert.equal(fs.existsSync(path.join(target, 'automatization', 'config.json')), true)
  assert.equal(fs.existsSync(path.join(target, '.ops', 'engine', 'integrations', 'providers', 'jira.js')), true)
  assert.equal(run(['automation', 'check', target]).status, 0)
  assert.equal(run(['integration', 'check', target, 'jira']).status, 0)
  const templateToken = /\{\{(?:PROJECT_NAME|MODE|PLANNING_DIR|WORKSPACE_PATH)\}\}/
  const unresolved = filesBelow(target)
    .filter((file) => !file.includes(`${path.sep}.ops${path.sep}engine${path.sep}`))
    .filter((file) => templateToken.test(fs.readFileSync(file, 'utf8')))
  assert.deepEqual(unresolved, [])

  fs.mkdirSync(path.join(target, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(target, '.claude', 'settings.json'), '{"custom":true}\n')
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  const claude = JSON.parse(fs.readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8'))
  assert.equal(claude.custom, true)
  assert.ok(claude.hooks.PreToolUse.length)
  assert.equal(fs.existsSync(path.join(target, 'CLAUDE.md')), true)
  assert.equal(run(['automation', 'doctor', target, 'claude']).status, 0)
  for (const workflow of [
    { source: 'autobuild.js', target: 'autobuild.js' },
    { source: path.join('integrations', 'sync.js'), target: 'integration-sync.js' },
    { source: path.join('integrations', 'promote.js'), target: 'integration-promote.js' },
  ]) {
    const installedWorkflow = path.join(target, '.claude', 'workflows', workflow.target)
    const sourceWorkflow = path.join(target, 'automatization', 'workflows', workflow.source)
    assert.equal(fs.existsSync(installedWorkflow), true)
    assert.equal(fs.readFileSync(installedWorkflow, 'utf8'), fs.readFileSync(sourceWorkflow, 'utf8'))
  }
  assert.equal(run(['automation', 'install', target, 'codex']).status, 0)
  const codexHooks = JSON.parse(fs.readFileSync(path.join(target, '.codex', 'hooks', 'hooks.json'), 'utf8'))
  assert.ok(codexHooks.hooks.PreToolUse.length)
  assert.equal(run(['automation', 'doctor', target, 'codex']).status, 0)
  assert.equal(run(['automation', 'install', target, 'gemini']).status, 0)
  const gemini = JSON.parse(fs.readFileSync(path.join(target, '.gemini', 'settings.json'), 'utf8'))
  assert.equal(gemini.general.checkpointing.enabled, true)
  assert.equal(fs.existsSync(path.join(target, 'GEMINI.md')), true)
  assert.equal(fs.existsSync(path.join(target, '.gemini', 'commands', 'ops', 'autobuild.toml')), true)
  assert.equal(run(['automation', 'doctor', target, 'gemini']).status, 0)
  assert.equal(run(['automation', 'install', target, 'antigravity']).status, 0)
  assert.equal(fs.existsSync(path.join(target, '.agents', 'plugins', 'cauce', 'plugin.json')), true)
  assert.equal(run(['automation', 'doctor', target, 'antigravity']).status, 0)
  assert.equal(fs.existsSync(path.join(target, 'organization', 'company.md')), true)
  assert.equal(fs.existsSync(path.join(target, 'agents', 'roles', 'product-manager', 'SKILL.md')), true)
  assert.equal(fs.existsSync(path.join(target, 'agents', 'workflows')), true)
  assert.equal(fs.existsSync(path.join(target, 'agents', 'coordinators')), true)
  assert.equal(fs.existsSync(path.join(target, 'agents', 'specialists')), true)
  assert.equal(fs.existsSync(path.join(target, 'teams')), true)
  const workflows = path.join(target, '.github', 'workflows')
  assert.equal(fs.existsSync(path.join(workflows, 'agent-learning.yml')), true)
  assert.equal(fs.existsSync(path.join(workflows, 'ci.yml')), false, 'el CI del toolkit no se distribuye')

  const env = { ...process.env, LANG: process.env.LANG || 'C.UTF-8' }
  delete env.NODE_TEST_CONTEXT
  const localArgs = [path.join(target, 'tools', 'ops.js'), 'check', path.join(target, 'planning')]
  const local = spawnSync(process.execPath, localArgs, {
    cwd: target, encoding: 'utf8', env,
  })
  assert.equal(local.status, 0, local.stderr)

  fs.writeFileSync(path.join(target, 'README.md'), 'propiedad del usuario\n')
  fs.writeFileSync(path.join(target, 'agents', 'roles', 'product-manager', 'SKILL.md'), 'personalizado\n')
  const runnerReadme = path.join(target, 'automatization', 'runners', 'codex', 'README.md')
  const runtimeParser = path.join(target, '.ops', 'engine', 'planning', 'parser.js')
  fs.writeFileSync(runnerReadme, 'runner personalizado\n')
  fs.writeFileSync(runtimeParser, 'runtime personalizado\n')
  const forced = run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(fs.readFileSync(path.join(target, 'README.md'), 'utf8'), 'propiedad del usuario\n')
  assert.equal(fs.readFileSync(path.join(target, 'agents', 'roles', 'product-manager', 'SKILL.md'), 'utf8'), 'personalizado\n')
  assert.equal(fs.readFileSync(runnerReadme, 'utf8'), 'runner personalizado\n')
  assert.equal(fs.readFileSync(runtimeParser, 'utf8'), 'runtime personalizado\n')
})

test('init rechaza destinos atravesados por symlinks', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-symlink-'))
  const target = path.join(base, 'project')
  const outside = path.join(base, 'outside')
  fs.mkdirSync(target)
  fs.mkdirSync(outside)
  fs.symlinkSync(outside, path.join(target, 'automatization'))
  const result = run(['init', target, '--name', 'Unsafe', '--mode', 'embedded', '--force'])
  assert.notEqual(result.status, 0)
  assert.deepEqual(fs.readdirSync(outside), [])
})

test('check rechaza una tarea sin aceptación', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-invalid-'))
  const target = path.join(base, 'project')
  assert.equal(run(['init', target, '--name', 'Invalid', '--mode', 'embedded']).status, 0)
  const invalidBacklog = '# Backlog\n\n## Hito demo — Demo\n\n'
    + '- [ ] **sin-aceptacion** — hacer algo (service: app)\n'
  fs.writeFileSync(path.join(target, 'planning', 'BACKLOG.md'), invalidBacklog)
  const result = run(['check', path.join(target, 'planning')])
  assert.notEqual(result.status, 0)
})

test('install reemplaza el wiring por guard suelto y conserva lo que no es suyo', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-migrate-'))
  const target = path.join(base, 'project')
  assert.equal(run(['init', target, '--name', 'Migrate', '--mode', 'sidecar']).status, 0)
  const settings = path.join(target, '.claude', 'settings.json')
  const guard = (name) => `$CLAUDE_PROJECT_DIR/automatization/hooks/guard-${name}.sh`
  fs.mkdirSync(path.dirname(settings), { recursive: true })
  fs.writeFileSync(settings, JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: ['destructive', 'git-add', 'dependencies', 'governance', 'verify']
          .map((name) => ({ type: 'command', command: guard(name) })) },
        { matcher: 'Edit|Write', hooks: [
          { type: 'command', command: guard('secrets') },
          { type: 'command', command: '$CLAUDE_PROJECT_DIR/scripts/mi-hook.sh' },
        ] },
      ],
    },
    env: { MI_VARIABLE: 'no-tocar' },
  }))

  const result = run(['automation', 'install', target, 'claude'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /reemplazado .*guard-verify\.sh.* por guard-shell\.sh/)

  const config = JSON.parse(fs.readFileSync(settings, 'utf8'))
  const commands = JSON.stringify(config)
  for (const name of ['destructive', 'git-add', 'dependencies', 'governance', 'verify', 'secrets']) {
    assert.equal(commands.includes(`guard-${name}.sh`), false, `${name} quedó registrado dos veces`)
  }
  assert.match(commands, /guard-shell\.sh/)
  assert.match(commands, /guard-files\.sh/)
  assert.match(commands, /mi-hook\.sh/, 'el hook del usuario sobrevive')
  assert.equal(config.env.MI_VARIABLE, 'no-tocar', 'la configuración ajena no se toca')
  assert.equal(run(['automation', 'doctor', target, 'claude']).stderr, '', 'doctor queda sin advertencias')

  const second = run(['automation', 'install', target, 'claude'])
  assert.equal(second.status, 0, second.stderr)
  assert.equal(/reemplazado/.test(second.stdout), false, 'la segunda instalación no tiene nada que podar')
})

test('check --json entrega estado consumible y conserva el exit code', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const valid = run(['check', planning, '--json'])
  assert.equal(valid.status, 0, valid.stderr)
  const report = JSON.parse(valid.stdout)
  assert.equal(report.ok, true)
  assert.deepEqual(report.errors, [])
  for (const field of ['epics', 'queued', 'done']) assert.equal(typeof report[field], 'number')

  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-json-'))
  const target = path.join(base, 'project')
  assert.equal(run(['init', target, '--name', 'Json', '--mode', 'embedded']).status, 0)
  fs.writeFileSync(
    path.join(target, 'planning', 'BACKLOG.md'),
    '# Backlog\n\n## Hito demo — Demo\n\n- [ ] **sin-aceptacion** — hacer algo (service: app)\n',
  )
  const invalid = run(['check', path.join(target, 'planning'), '--json'])
  assert.equal(invalid.status, 1)
  const failed = JSON.parse(invalid.stdout)
  assert.equal(failed.ok, false)
  assert.ok(failed.errors.some((error) => error.includes('sin-aceptacion')))
})

test('tree --json refleja el mismo estado que la salida de texto', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const result = run(['tree', planning, '--json'])
  assert.equal(result.status, 0, result.stderr)
  const state = JSON.parse(result.stdout)
  for (const field of ['roadmap', 'backlog']) assert.ok(Array.isArray(state[field]))
  assert.equal(state.wip, null)
  assert.equal(typeof state.done, 'number')
  for (const bucket of ['deuda', 'ideas', 'propuestas', 'lecciones']) {
    assert.equal(typeof state.inbox[bucket], 'number')
  }
  const text = run(['tree', planning, '--no-color'])
  assert.match(text.stdout, new RegExp(`DONE\\s+${state.done} tareas`))
})

test('context entrega el contexto mínimo y respeta la precedencia del protocolo', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-context-'))
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Context', '--mode', 'sidecar']).status, 0)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demostrar contexto
status: active
service: app
---

# Épica 001 — Demostrar contexto

## Criterios

- **C1** — El resultado se observa.
- **C2** — El segundo criterio no se pide.

## Contexto relevante

- El servicio vive en app/.

## Historias

- [ ] **primera** (→ C1) — Entregar resultado. (service: app)
- [ ] **segunda** (→ C2) — Otro resultado. (service: app)
`)
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog

## Hito demo — Demo

- [ ] **primera** [full] — Entregar resultado. (→ C1) (service: app) (epic: 001)
- [ ] **segunda** [lite] — Otro resultado. (→ C2) (service: app) (epic: 001)
`)

  const queued = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(queued.task.slug, 'primera')
  assert.deepEqual(queued.criteria.map((criterion) => criterion.id), ['C1'], 'sólo el criterio citado')
  assert.equal(queued.wip, null)
  assert.equal(queued.blocked, '')

  fs.writeFileSync(path.join(planning, 'WIP.md'), `---
task: segunda
hito: "demo — Demo"
epic: 001
phase: Build
service: app
---

## Plan aprobado
1. [x] Escribir prueba
2. [ ] Implementar
`)
  const active = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(active.task.slug, 'segunda', 'el WIP activo manda sobre el orden del backlog')
  assert.deepEqual(active.wip, { phase: 'Build', complete: 1, pending: 1 })

  fs.writeFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| tercera | pendiente | Ready | Definir el proveedor antes de estimar |
| vieja | resuelta | Ready | Ya se decidió |
`)
  const blockers = JSON.parse(run(['context', planning, '--json']).stdout).humanActions
  assert.deepEqual(blockers.map((action) => action.task), ['tercera'], 'las resueltas no bloquean')

  fs.writeFileSync(path.join(planning, 'WIP.md'), 'status: IDLE\n')
  fs.writeFileSync(path.join(planning, 'HUMAN_ACTIONS.md'), `# Acciones humanas

| Tarea | Estado | Origen | Acción concreta y condición de desbloqueo |
|---|---|---|---|
| primera | pendiente | Ready | Definir el proveedor antes de estimar |
`)
  const skipping = JSON.parse(run(['context', planning, '--json']).stdout)
  assert.equal(skipping.task.slug, 'segunda', 'salta la tarea con acción humana abierta')
  assert.deepEqual(skipping.blockedTasks, ['primera'])
  assert.equal(skipping.acceptance, undefined)
  assert.equal(skipping.task.acceptance, 'El segundo criterio no se pide.', 'hereda el texto del criterio citado')

  fs.writeFileSync(path.join(planning, 'AWAITING_REVIEW.md'), '# Checkpoint\n\nRevisar el hito demo.\n')
  const gated = run(['context', planning])
  assert.equal(gated.status, 0, gated.stderr)
  assert.match(gated.stdout, /^BLOCKED\s+awaiting-review — Revisar el hito demo\.$/m)
  assert.equal(JSON.parse(run(['context', planning, '--json']).stdout).blocked, 'awaiting-review')
})

test('context no muta archivos de estado', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const before = filesBelow(planning).map((file) => fs.readFileSync(file, 'utf8'))
  const result = run(['context', planning])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(filesBelow(planning).map((file) => fs.readFileSync(file, 'utf8')), before)
})

test('tree no muta archivos de estado', () => {
  const planning = path.resolve(__dirname, '..', 'template', 'planning')
  const before = fs.readFileSync(path.join(planning, 'WIP.md'), 'utf8')
  const result = run(['tree', planning, '--no-color'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(path.join(planning, 'WIP.md'), 'utf8'), before)
})

test('valida y archiva el ciclo completo de una épica', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-cycle-'))
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Cycle', '--mode', 'sidecar']).status, 0)
  const planning = path.join(target, 'planning')
  fs.mkdirSync(path.join(target, 'app'))
  const config = JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8'))
  config.workspaceRoots = [{ name: 'app', path: 'app' }]
  fs.writeFileSync(path.join(target, 'ops.config.json'), `${JSON.stringify(config, null, 2)}\n`)
  fs.writeFileSync(path.join(planning, 'roadmap', 'epic-001-demo.md'), `---
epic: 001
title: Demostrar ciclo
status: active
service: app
---

# Épica 001 — Demostrar ciclo

## Criterios

- **C1** — El resultado se observa.

## Contexto relevante

- El servicio vive en app/.

## Historias

- [ ] **demostrar-ciclo** (→ C1) — Entregar resultado. (service: app)
`)
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), `# Backlog

## Hito demo — Demo

- [ ] **demostrar-ciclo** [full] — Entregar resultado. (→ C1) (service: app) (epic: 001)
`)
  assert.equal(run(['check', planning]).status, 0)

  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), '# Backlog\n')
  fs.writeFileSync(path.join(planning, 'DONE.md'), `# Done

## Hito demo — Demo

- [x] **demostrar-ciclo** (epic: 001) — Entregado
  acept: el resultado se observa
  done: node --test terminó con exit code 0
  qa: recorrido real observado con exit code 0
  tests: C1 → node --test test/demo.test.js
  commit: abc1234 feat(app): demonstrate cycle (app@feat/demo)
`)
  const epicPath = path.join(planning, 'roadmap', 'epic-001-demo.md')
  fs.writeFileSync(epicPath, fs.readFileSync(epicPath, 'utf8').replace('status: active', 'status: closed'))
  assert.equal(run(['check', planning]).status, 0)
  assert.equal(run(['archive', planning, '001']).status, 0)
  assert.equal(fs.existsSync(path.join(planning, 'done', 'epic-001.md')), true)
  assert.doesNotMatch(fs.readFileSync(path.join(planning, 'DONE.md'), 'utf8'), /demostrar-ciclo/)

  const archived = fs.readFileSync(path.join(planning, 'done', 'epic-001.md'), 'utf8')
  const recoveredEntry = archived.match(/- \[x\] \*\*demostrar-ciclo\*\*[\s\S]*$/m)[0]
  fs.appendFileSync(path.join(planning, 'DONE.md'), `\n${recoveredEntry}\n`)
  assert.equal(run(['archive', planning, '001']).status, 0)
  assert.doesNotMatch(fs.readFileSync(path.join(planning, 'DONE.md'), 'utf8'), /demostrar-ciclo/)
})

test('Jira sincroniza ADF, preserva curación y promueve sin escribir remoto', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-jira-'))
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Jira demo', '--mode', 'sidecar']).status, 0)
  fs.mkdirSync(path.join(base, 'app'))

  const registryFile = path.join(target, 'integrations', 'config.json')
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'))
  registry.providers.jira.enabled = true
  fs.writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`)
  const jiraFile = path.join(target, 'integrations', 'jira', 'config.json')
  const jira = JSON.parse(fs.readFileSync(jiraFile, 'utf8'))
  jira.enabled = true
  jira.baseUrl = 'https://example.atlassian.net'
  jira.jql = 'project = DEMO'
  fs.writeFileSync(jiraFile, `${JSON.stringify(jira, null, 2)}\n`)

  const fixture = path.resolve(__dirname, 'fixtures', 'jira-search.json')
  assert.equal(run(['integration', 'sync', target, 'jira', '--fixture', fixture]).status, 0)
  const staged = path.join(target, 'integrations', 'jira', 'staging', 'stories', 'DEMO-42')
  const draftFile = path.join(staged, 'draft.md')
  let draft = fs.readFileSync(draftFile, 'utf8')
  assert.match(draft, /La fecha del último sync es visible/)
  assert.match(draft, /service: "app"/)

  draft = draft.replace('state: pending', 'state: ready')
    .replace('promotionKind: ""', 'promotionKind: epic')
    .replace('- Definir destino de promoción.', '- La incidencia se convertirá en épica local.')
  fs.writeFileSync(draftFile, draft)
  assert.equal(run(['integration', 'sync', target, 'jira', '--fixture', fixture]).status, 0)
  assert.match(fs.readFileSync(draftFile, 'utf8'), /incidencia se convertirá/)
  assert.equal(run(['integration', 'check', target, 'jira']).status, 0)
  assert.equal(run(['integration', 'promote', target, 'jira', 'DEMO-42']).status, 0)

  const promoted = fs.readdirSync(path.join(target, 'planning', 'roadmap')).find((file) => /^epic-001-/.test(file))
  assert.ok(promoted)
  const spec = fs.readFileSync(path.join(target, 'planning', 'roadmap', promoted), 'utf8')
  assert.match(spec, /source: jira/)
  assert.match(spec, /remote: DEMO-42/)
  assert.match(fs.readFileSync(draftFile, 'utf8'), /state: promoted/)

  const interrupted = fs.readFileSync(draftFile, 'utf8')
    .replace('state: promoted', 'state: ready')
    .replace(/^promotedAt:.*$/m, 'promotedAt: ""')
  fs.writeFileSync(draftFile, interrupted)
  assert.equal(run(['integration', 'promote', target, 'jira', 'DEMO-42']).status, 0)
  const matchingEpics = fs.readdirSync(path.join(target, 'planning', 'roadmap'))
    .filter((file) => {
      const content = fs.readFileSync(path.join(target, 'planning', 'roadmap', file), 'utf8')
      return content.includes('remote: DEMO-42')
    })
  assert.equal(matchingEpics.length, 1)
  assert.match(fs.readFileSync(draftFile, 'utf8'), /state: promoted/)
})

test('upgrade reemplaza lo del sistema y no toca nada del proyecto', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-upgrade-'))
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)

  const version = () => JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8')).cauceVersion
  assert.ok(version(), 'init registra de qué versión salió la instancia')

  // El proyecto trabaja: agrega lo suyo, sobrescribe una regla y suma un guard propio.
  const rules = path.join(target, 'planning', 'rules')
  fs.writeFileSync(path.join(rules, 'acme-naming.md'), '# convención propia\n')
  fs.writeFileSync(path.join(rules, 'commits.md'), '# el override de acme\n')
  fs.writeFileSync(path.join(target, 'organization', 'company.md'), '# Acme S.A.\n')
  const ownGuard = path.join(target, 'automatization', 'hooks', 'guard-acme.sh')
  fs.writeFileSync(ownGuard, '#!/usr/bin/env bash\necho propio\n')

  // Nada que actualizar mientras la versión coincida.
  const current = run(['upgrade', target, '--check'])
  assert.equal(current.status, 0)
  assert.match(current.stdout, /está al día/)

  const upgraded = run(['upgrade', target])
  assert.equal(upgraded.status, 0, upgraded.stderr)
  assert.match(upgraded.stdout, /conservado planning\/rules\/commits\.md/, 'el override se reporta')

  assert.equal(fs.readFileSync(path.join(rules, 'acme-naming.md'), 'utf8'), '# convención propia\n')
  assert.equal(fs.readFileSync(path.join(rules, 'commits.md'), 'utf8'), '# el override de acme\n')
  assert.equal(fs.readFileSync(path.join(target, 'organization', 'company.md'), 'utf8'), '# Acme S.A.\n')
  assert.equal(fs.existsSync(ownGuard), true, 'un guard propio no se borra al refrescar el runtime')
  assert.ok(fs.existsSync(path.join(rules, 'system', 'commits.md')), 'system/ sigue completo')
  assert.equal(run(['check', path.join(target, 'planning')]).status, 0)
})

test('upgrade se niega a pisar una edición del runtime sin --force', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-upgrade-edit-'))
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)

  const guard = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  fs.writeFileSync(guard, '#!/usr/bin/env bash\n# lo edité a mano\n')

  const refused = run(['upgrade', target])
  assert.notEqual(refused.status, 0, 'no puede perder el cambio en silencio')
  assert.match(refused.stderr, /guard-verify\.sh/)
  assert.match(refused.stderr, /--force/)
  assert.match(fs.readFileSync(guard, 'utf8'), /lo edité a mano/, 'el archivo sigue intacto')

  const forced = run(['upgrade', target, '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(/lo edité a mano/.test(fs.readFileSync(guard, 'utf8')), false, '--force sí lo reemplaza')
})

test('el motor viene de la dependencia cuando el repo usa npm, y de la copia cuando no', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-engine-'))

  // Un repo sin npm no puede recibir una dependencia: se lleva la copia.
  const plain = path.join(base, 'sin-npm')
  assert.equal(run(['init', plain, '--name', 'Plain', '--mode', 'sidecar']).status, 0)
  assert.equal(fs.existsSync(path.join(plain, '.ops', 'engine', 'cli', 'ops.js')), true)
  assert.equal(fs.existsSync(path.join(plain, 'package.json')), false, 'no se le impone un stack')

  // Un repo con package.json declara la dependencia y no duplica el motor.
  const npm = path.join(base, 'con-npm')
  fs.mkdirSync(npm, { recursive: true })
  fs.writeFileSync(path.join(npm, 'package.json'), JSON.stringify({ name: 'host', version: '1.0.0' }))
  assert.equal(run(['init', npm, '--name', 'Npm', '--mode', 'embedded', '--force']).status, 0)
  assert.equal(fs.existsSync(path.join(npm, '.ops', 'engine')), false, 'el motor no se copia')
  const manifest = JSON.parse(fs.readFileSync(path.join(npm, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'host', 'el manifiesto del repo anfitrión se conserva')
  assert.ok(manifest.devDependencies['@ingeniomaps/cauce'], 'la versión queda fijada por el lockfile')

  // upgrade no debe resucitar la copia en una instancia que usa la dependencia.
  assert.equal(run(['upgrade', npm]).status, 0)
  assert.equal(fs.existsSync(path.join(npm, '.ops', 'engine')), false)

  // El modo se puede forzar en cualquier dirección.
  const forced = path.join(base, 'forzado')
  assert.equal(run(['init', forced, '--name', 'F', '--mode', 'sidecar', '--engine', 'dependency']).status, 0)
  assert.equal(fs.existsSync(path.join(forced, '.ops', 'engine')), false)
  assert.ok(JSON.parse(fs.readFileSync(path.join(forced, 'package.json'), 'utf8')).devDependencies)
})

test('el shim falla con instrucciones cuando no encuentra el motor', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-shim-'))
  const target = path.join(base, 'huerfano')
  assert.equal(run(['init', target, '--name', 'H', '--mode', 'sidecar']).status, 0)
  fs.rmSync(path.join(target, '.ops'), { recursive: true, force: true })

  const orphan = spawnSync(process.execPath, [path.join(target, 'tools', 'ops.js'), 'check'], {
    cwd: target, encoding: 'utf8',
  })
  assert.equal(orphan.status, 2, 'no puede continuar sin motor')
  assert.match(orphan.stderr, /No se encontró el motor/)
  assert.match(orphan.stderr, /npm install/)
})
