'use strict'

// El wiring que un runner o una integración dejan instalado en una instancia: `automation` e
// `integration` corridos por el CLI. Es la familia de comandos de `engine/cli/wiring.js`.
//
// Dos vecinos cubren las otras alturas del mismo tema: `runners.test.js` prueba los adaptadores como
// unidades, y `hooks.test.js` qué decide cada guard una vez invocado.

const { tempRoot, CLI, run, linkEngine } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hookMetadata } = require('../engine/hooks/run')

test('automation list-hooks explica los guards disponibles', () => {
  const result = run(['automation', 'list-hooks', path.resolve(__dirname, '..')])
  assert.equal(result.status, 0, result.stderr)
  assert.ok(hookMetadata.some((hook) => hook.name === 'workspace-boundary'))
  assert.ok(hookMetadata.some((hook) => hook.name === 'migrations'))
  assert.ok(hookMetadata.some((hook) => hook.name === 'planning-drift'))
  assert.ok(hookMetadata.some((hook) => hook.name === 'engine'))

  // Cuántos guards hay se deriva del registro, no se escribe a mano. Estuvo hardcodeado como `11` en
  // el mensaje de `automation check` y quedó viejo al agregar uno: informaba once mientras el motor
  // registraba doce. Un número de auditoría que no sale de lo que describe envejece sin avisar, y
  // quien lo compare contra `list-hooks` no sabe cuál de los dos miente.
  const { guards } = require('../engine/hooks/run')
  const A = require('../engine/automation')
  assert.equal(A.GUARD_NAMES.length, Object.keys(guards).length, 'el conteo sale del registro')
  assert.equal(hookMetadata.length, Object.keys(guards).length, 'y cada guard está documentado')
  assert.deepEqual(
    hookMetadata.map((hook) => hook.name).sort(),
    Object.keys(guards).sort(),
    'sin guards sin documentar ni documentación de guards que no existen',
  )
  const report = run(['automation', 'check', path.resolve(__dirname, '..')])
  assert.match(report.stdout, new RegExp(`${Object.keys(guards).length} guards`), 'y es lo que informa')
})

// La lista de scripts que `check` exige se deriva del registro de guards, no se copia a mano: una
// copia comprueba lo que nombra y un guard nuevo del motor no entra en la cuenta. Y se mira en una
// sola dirección a propósito — un `.sh` de más es cómo una empresa agrega el suyo, que es justo lo
// que `upgrade` le recomienda hacer.
test('automation check exige los guards del motor y respeta los de la empresa', () => {
  const base = tempRoot('cauce-hooks-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'check', target]).status, 0)

  const own = path.join(target, 'automatization', 'hooks', 'guard-acme.sh')
  fs.writeFileSync(own, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 })
  assert.equal(run(['automation', 'check', target]).status, 0, 'un guard de la empresa no es un error')

  const verify = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  fs.rmSync(verify)
  const missing = run(['automation', 'check', target])
  assert.notEqual(missing.status, 0, 'uno del motor que falta sí lo es')
  assert.match(missing.stderr, /falta automatization\/hooks\/guard-verify\.sh/)

  // Y la lista sale del registro: cada guard del motor tiene su script exigido, sin repetir.
  const A = require('../engine/automation')
  const { guards, hookGroups } = require('../engine/hooks/run')
  const groups = Object.values(hookGroups).filter((names) => names.length > 1).length
  assert.equal(A.GUARD_NAMES.length + groups + 1, fs.readdirSync(
    path.resolve(__dirname, '..', 'automatization', 'hooks'),
  ).filter((name) => name.endsWith('.sh')).length, 'guards + wrappers de grupo + run-hook.sh')
  assert.equal(A.GUARD_NAMES.length, Object.keys(guards).length)
})

test('en embebido las instrucciones del runner conviven con las de la empresa', () => {
  const base = tempRoot('cauce-embebido-')
  const repo = path.join(base, 'app')
  fs.mkdirSync(repo)
  fs.writeFileSync(path.join(repo, 'package.json'), '{"scripts":{"test":"x"}}')
  assert.equal(run(['init', repo, '--mode', 'embedded', '--force', '--name', 'App', '--no-install']).status, 0)
  linkEngine(repo)
  assert.equal(run(['automation', 'install', repo, 'codex']).status, 0)

  const agents = path.join(repo, 'AGENTS.md')
  const withBlock = fs.readFileSync(agents, 'utf8')
  assert.match(withBlock, /## Mapa real/, 'lo de la empresa sigue')
  assert.match(withBlock, /## El arranque/, 'y lo del runner llegó')

  // Reinstalar no duplica, y lo que la empresa escriba sobrevive.
  fs.appendFileSync(agents, '\n## Nuestra sección\n\nAlgo nuestro.\n')
  assert.equal(run(['automation', 'install', repo, 'codex']).status, 0)
  const again = fs.readFileSync(agents, 'utf8')
  assert.equal(again.split('## El arranque').length - 1, 1, 'una sola copia del bloque')
  assert.match(again, /Nuestra sección/)

  // Borrarlo a mano es un error, no un silencio: el runner queda sin instrucciones y nada lo decía. Se
  // saca el bloque y nada más, que es lo que haría alguien limpiando lo que no reconoce.
  const from = again.indexOf('<!-- cauce:codex inicio')
  const end = '<!-- cauce:codex fin -->'
  fs.writeFileSync(agents, again.slice(0, from) + again.slice(again.indexOf(end) + end.length))
  const broken = run(['automation', 'doctor', repo, 'codex'])
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /no tiene las instrucciones de Cauce/)

  // Y el desinstalador saca el bloque sin llevarse el archivo.
  assert.equal(run(['automation', 'install', repo, 'codex']).status, 0)
  assert.equal(run(['automation', 'uninstall', repo, 'codex']).status, 0)
  const after = fs.readFileSync(agents, 'utf8')
  assert.doesNotMatch(after, /## El arranque/)
  assert.match(after, /## Mapa real/)
  assert.match(after, /Nuestra sección/)
})

test('automation uninstall saca lo del toolkit y deja lo del usuario', () => {
  const base = tempRoot('cauce-uninst-')
  const workspace = path.join(base, 'mono')
  const target = path.join(workspace, 'ops')
  fs.mkdirSync(workspace)
  assert.equal(run(['init', target, '--name', 'Mono', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)

  // Lo del usuario, en los mismos lugares que usa el toolkit.
  const settingsFile = path.join(workspace, '.claude', 'settings.json')
  const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  settings.env = { MI_VAR: '1' }
  settings.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mio' }] })
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
  fs.writeFileSync(path.join(workspace, '.claude', 'workflows', 'mio.js'), '// mío\n')
  fs.mkdirSync(path.join(workspace, '.claude', 'skills', 'mi-cargo'), { recursive: true })
  fs.writeFileSync(path.join(workspace, '.claude', 'skills', 'mi-cargo', 'SKILL.md'), 'propio\n')
  fs.appendFileSync(path.join(workspace, 'CLAUDE.md'), '\n# mi contexto\n')

  const result = run(['automation', 'uninstall', target, 'claude'])
  assert.equal(result.status, 0, result.stderr)

  assert.equal(fs.existsSync(path.join(workspace, '.claude', 'workflows', 'autobuild.js')), false)
  assert.equal(fs.existsSync(path.join(workspace, '.claude', 'skills', 'product-manager')), false)
  assert.equal(fs.readFileSync(path.join(workspace, '.claude', 'workflows', 'mio.js'), 'utf8'), '// mío\n')
  assert.equal(fs.readFileSync(path.join(workspace, '.claude', 'skills', 'mi-cargo', 'SKILL.md'), 'utf8'), 'propio\n')

  // Un archivo con cambios propios se conserva y se nombra: decidir sobre él es de la persona.
  assert.match(result.stdout, /conservado CLAUDE\.md/)
  assert.match(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8'), /# mi contexto/)

  const left = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  assert.deepEqual(left.env, { MI_VAR: '1' }, 'lo suyo intacto')
  assert.deepEqual(left.hooks.PreToolUse, [
    { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mio' }] },
  ], 'y de los hooks sólo queda el suyo')

  // La instancia no se toca: borrarla es otra decisión.
  assert.equal(fs.existsSync(path.join(target, 'planning', 'PROTOCOL.md')), true)
  // Y desinstalar dos veces no es un error ni deja rastro.
  assert.equal(run(['automation', 'uninstall', target, 'claude']).status, 0)
})

test('install reemplaza el wiring por guard suelto y conserva lo que no es suyo', () => {
  const base = tempRoot('cauce-migrate-')
  const target = path.join(base, 'project')
  assert.equal(run(['init', target, '--name', 'Migrate', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  const workspace = base
  const settings = path.join(workspace, '.claude', 'settings.json')
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
  // `doctor` también comprueba que el CLI del runner esté en PATH, que es un hecho de la máquina y no
  // del wiring: acá pasaba porque el dev tiene `claude` instalado y fallaba en el runner de CI, que no.
  // Lo que este test mide es que la instalación no dejara nada que reportar.
  const warnings = run(['automation', 'doctor', target, 'claude']).stderr
    .split('\n')
    .filter((line) => line.trim() && !/CLI no encontrado en PATH/.test(line))
  assert.deepEqual(warnings, [], 'doctor no reporta nada del wiring')

  const second = run(['automation', 'install', target, 'claude'])
  assert.equal(second.status, 0, second.stderr)
  assert.equal(/reemplazado/.test(second.stdout), false, 'la segunda instalación no tiene nada que podar')
})

test('Jira sincroniza ADF, preserva curación y promueve sin escribir remoto', () => {
  const base = tempRoot('cauce-jira-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Jira demo', '--mode', 'sidecar']).status, 0)
  fs.mkdirSync(path.join(base, 'app'))

  const registryFile = path.join(target, 'integrations', 'config.json')
  const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'))
  registry.providers.jira.enabled = true
  fs.writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`)
  assert.equal(run(['integration', 'enable', target, 'jira']).status, 0)
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

  // Las tres reconciliaciones y el plan de escritura comparten este staging y no tenían prueba por
  // CLI: el despachador las declara en una tabla, y una entrada mal escrita ahí no se nota hasta que
  // alguien la usa. `reset` va último porque reescribe el draft desde el snapshot.
  const plan = run(['integration', 'writeback-plan', target, 'jira'])
  assert.equal(plan.status, 0, plan.stderr)
  assert.equal(JSON.parse(plan.stdout).writeBack, false, 'no hay ejecutor remoto aprobado')

  for (const operation of ['reconcile', 'rebase', 'reset']) {
    const result = run(['integration', operation, target, 'jira', 'DEMO-42'])
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, new RegExp(`${operation} aplicado a DEMO-42`))
  }
  assert.notEqual(run(['integration', 'reset', target, 'jira', 'NO-EXISTE']).status, 0)

  // Un item que desaparece del remoto cambia el staging, y `sync` lo contaba sin decirlo. Con
  // curación queda marcado; sin ella se borra. Las dos cosas se avisan porque las dos son pérdidas
  // potenciales de trabajo, y la única señal era mirar el directorio.
  const blank = path.join(base, 'vacio.json')
  fs.writeFileSync(blank, '{"issues":[]}')
  // El `reset` de arriba dejó el draft igual al snapshot, o sea sin curar. Se le vuelve a poner algo
  // propio para probar la rama que conserva.
  fs.writeFileSync(draftFile, `${fs.readFileSync(draftFile, 'utf8')}\n- Nota local.\n`)
  const curated = run(['integration', 'sync', target, 'jira', '--fixture', blank])
  assert.equal(curated.status, 0, curated.stderr)
  assert.match(curated.stdout, /1 con curación ya no están en el remoto/)

  assert.equal(run(['integration', 'reset', target, 'jira', 'DEMO-42']).status, 0)
  const deleted = run(['integration', 'sync', target, 'jira', '--fixture', blank])
  assert.equal(deleted.status, 0, deleted.stderr)
  assert.match(deleted.stdout, /1 sin curar se fueron del remoto y se borraron/)
  assert.equal(fs.existsSync(staged), false, 'y el directorio efectivamente ya no está')
})
