'use strict'

// `guards` de `ops.config.json` (caso 428). Qué garantiza y por qué, en el encabezado de
// `engine/hooks/project-guards.js`.

const { installedProject } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { executeAll, hookGroups } = require('../../engine/hooks/run')
const PG = require('../../engine/hooks/project-guards')
const { validateOpsConfig, GUARD_EVENTS } = require('../../engine/config/validate')

// Una instancia con los guards dados, escritos como scripts ejecutables bajo `guards/`, y `OPS_ROOT` apuntando a ella
// mientras corre `fn`: es lo que exporta `run-hook.sh` y lo que pone el puente de Antigravity.
function withGuards(name, scripts, declared, fn, runner) {
  const project = installedProject(name, runner)
  fs.mkdirSync(path.join(project.target, 'guards'))
  for (const [file, body] of Object.entries(scripts)) {
    fs.writeFileSync(path.join(project.target, 'guards', file), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 })
  }
  const config = path.join(project.target, 'ops.config.json')
  fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), guards: declared }))
  const previous = process.env.OPS_ROOT
  process.env.OPS_ROOT = project.target
  try { return fn(project) } finally {
    if (previous === undefined) delete process.env.OPS_ROOT
    else process.env.OPS_ROOT = previous
  }
}

const shell = (cwd, command) => ({ cwd, tool_input: { command } })
const blockedBy = (fn, pattern) => assert.throws(fn, (error) => error.blocked === true && pattern.test(error.message))

// Lee la llamada de stdin como un hook de Claude Code y anota lo que recibió, para que la prueba mire el contrato.
const NO_NPX = 'input=$(cat)\nprintf \'%s\\n%s\\n%s\\n\' "$OPS_ROOT" "$CAUCE_HOOK_EVENT" "$input" > "$OPS_ROOT/seen"\n'
  + 'case "$input" in *npx*) echo "npx no corre en el host" >&2; exit 2;; esac\nexit 0'

test('un guard del proyecto frena con su mensaje y deja pasar lo demás, con la llamada por stdin', () => {
  withGuards('cauce-guards-frena-', { 'no-npx.sh': NO_NPX }, { 'pre-shell': ['guards/no-npx.sh'] }, ({ target }) => {
    blockedBy(() => executeAll(['pre-shell'], shell(target, 'npx husky')),
      /\[guards\/no-npx\.sh\] npx no corre en el host/)
    const [root, event, input] = fs.readFileSync(path.join(target, 'seen'), 'utf8').split('\n')
    assert.equal(root, target)
    assert.equal(event, 'pre-shell')
    assert.equal(JSON.parse(input).tool_input.command, 'npx husky')
    assert.doesNotThrow(() => executeAll(['pre-shell'], shell(target, 'ls')))
  })
})

// Por qué un nombre suelto cuenta como su grupo, y uno de un grupo más grande no, en `eventsOf`.
test('los guards del proyecto corren una vez por evento, lo llame el runner por el grupo o por su único guard', () => {
  assert.deepEqual(PG.eventsOf(['secrets-read'], hookGroups), ['pre-read'])
  assert.deepEqual(PG.eventsOf(['pre-read'], hookGroups), ['pre-read'])
  assert.deepEqual(PG.eventsOf(['jira-adf'], hookGroups), ['pre-mcp'])
  assert.deepEqual(PG.eventsOf(['planning-drift'], hookGroups), ['stop'])
  assert.deepEqual(PG.eventsOf(['pre-shell', 'pre-shell'], hookGroups), ['pre-shell'])
  assert.deepEqual(PG.eventsOf(['destructive'], hookGroups), [])
  assert.deepEqual(PG.eventsOf(['prompt'], hookGroups), [])
  const deny = { 'deny.sh': 'echo "frenado por el proyecto" >&2; exit 2' }
  withGuards('cauce-guards-evento-', deny, { 'pre-shell': ['guards/deny.sh'], 'pre-read': ['guards/deny.sh'] },
    ({ target }) => {
      assert.doesNotThrow(() => executeAll(['destructive'], shell(target, 'ls')), 'un guard suelto no es el evento')
      const read = { cwd: target, tool_input: { file_path: path.join(target, 'README.md') } }
      blockedBy(() => executeAll(['secrets-read'], read), /frenado por el proyecto/)
      blockedBy(() => executeAll(['pre-read'], read), /frenado por el proyecto/)
    })
})

// Con `stop_hook_active` la sesión ya está siguiendo por un cierre frenado: frenarla otra vez es el bucle.
test('en stop, un guard del proyecto no vuelve a frenar a la sesión que ya sigue por un cierre frenado', () => {
  withGuards('cauce-guards-stop-', {}, { stop: ['guards/no-esta.sh'] }, ({ target }) => {
    blockedBy(() => executeAll(['planning-drift'], { cwd: target }), /no-esta\.sh/)
    assert.doesNotThrow(() => executeAll(['planning-drift'], { cwd: target, stop_hook_active: true }))
  })
})

test('un guard del proyecto que no contesta frena, y dice por qué', () => {
  const scripts = { 'falla.sh': 'echo roto >&2; exit 1', 'muere.sh': 'kill -KILL $$', 'tarda.sh': 'sleep 5' }
  // El plazo corto es sólo para el que tarda a propósito: con la suite entera corriendo, lanzar un script puede llevar
  // más de unos cientos de milisegundos, y el que tenía que salir con 1 salía por el plazo.
  const cases = [
    ['guards/no-esta.sh', /\[guards\/no-esta\.sh\] .* no se pudo ejecutar \(ENOENT\)/, 20000],
    ['guards/falla.sh', /salió con 1: roto/, 20000],
    ['guards/muere.sh', /lo cortó SIGKILL/, 20000],
    ['guards/tarda.sh', /no terminó dentro de los 0\.3 s que tienen entre todos los guards del evento/, 300],
    ['guards/sin-permiso.sh', /no se pudo ejecutar \(EACCES\)/, 20000],
  ]
  const previous = PG.limits.timeoutMs
  try {
    for (const [file, pattern, limit] of cases) {
      PG.limits.timeoutMs = limit
      withGuards('cauce-guards-roto-', scripts, { 'pre-shell': [file] }, ({ target }) => {
        const locked = path.join(target, 'guards', 'sin-permiso.sh')
        fs.writeFileSync(locked, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o644 })
        blockedBy(() => executeAll(['pre-shell'], shell(target, 'ls')), pattern)
        blockedBy(() => executeAll(['pre-shell'], shell(target, 'ls')), /un guard que no contesta frena/)
      })
    }
  } finally {
    PG.limits.timeoutMs = previous
  }
})

// Un guard que no lee stdin y sale antes de que la llamada termine de entrar deja a `spawnSync` con EPIPE, y además
// con el código y la señal del guard. Con una llamada más grande que el buffer del pipe pasa siempre; con una chica,
// a veces.
test('un guard que sale sin leer la llamada frena por lo que hizo, no por el EPIPE', () => {
  const scripts = { 'falla.sh': 'echo roto >&2; exit 1', 'muere.sh': 'kill -KILL $$', 'pasa.sh': 'exit 0' }
  const big = shell('', `echo ${'x'.repeat(1024 * 1024)}`)
  const cases = [['guards/falla.sh', /salió con 1: roto/], ['guards/muere.sh', /lo cortó SIGKILL/]]
  for (const [file, pattern] of cases) {
    withGuards('cauce-guards-epipe-', scripts, { 'pre-shell': [file] }, ({ target }) => {
      blockedBy(() => executeAll(['pre-shell'], { ...big, cwd: target }), pattern)
    })
  }
  withGuards('cauce-guards-epipe-', scripts, { 'pre-shell': ['guards/pasa.sh'] }, ({ target }) => {
    assert.doesNotThrow(() => executeAll(['pre-shell'], { ...big, cwd: target }))
  })
})

// Un EPIPE sin código ni señal no se reproduce con un proceso de verdad, así que el resultado va escrito a mano: es la
// forma en que `spawnSync` lo devolvería. Sin código ni señal, el EPIPE es lo único que queda para decir.
test('un EPIPE sin código ni señal se dice como EPIPE', () => {
  const pipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
  assert.equal(PG.failureOf({ error: pipe, status: null, signal: null }), 'no se pudo ejecutar (EPIPE)')
  assert.equal(PG.failureOf({ error: pipe, status: 1, signal: null }, 'roto'), 'salió con 1: roto')
  assert.equal(PG.failureOf({ error: pipe, status: null, signal: 'SIGKILL' }), 'lo cortó SIGKILL')
  // Y las otras salidas, en la misma tabla: un error que no es EPIPE manda aunque haya código, y sin error lo dice el
  // código, con lo que escribió o sin nada.
  const timeout = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' })
  assert.match(PG.failureOf({ error: timeout, status: null, signal: 'SIGTERM' }), /no terminó dentro de los/)
  const missing = Object.assign(new Error('spawnSync ENOENT'), { code: 'ENOENT' })
  assert.equal(PG.failureOf({ error: missing, status: 1, signal: null }), 'no se pudo ejecutar (ENOENT)')
  assert.equal(PG.failureOf({ status: 3, signal: null }), 'salió con 3')
})

// Por qué se comprueba al correrla y no sólo en `check`, en `declaredFor`.
test('una lista de guards mal escrita frena, en vez de dejar correr la herramienta', () => {
  const cases = [
    [{ 'pre-shell': 'guards/no-esta.sh' }, /guards\.pre-shell debe ser una lista de rutas relativas/],
    [{ 'pre-shell': [3] }, /guards\.pre-shell debe ser una lista de rutas relativas/],
    [{ pre_shell: ['guards/no-esta.sh'] }, /guards\.pre_shell no es un evento con guards/],
    [['guards/no-esta.sh'], /guards debe ser un objeto/],
    ['guards/no-esta.sh', /guards debe ser un objeto/],
  ]
  for (const [declared, pattern] of cases) {
    withGuards('cauce-guards-forma-', {}, declared, ({ target }) => {
      blockedBy(() => executeAll(['pre-shell'], shell(target, 'ls')), pattern)
    })
  }
})

// Con `guards` roto no corre ningún guard del proyecto, así que frenar también la escritura que lo arregla dejaba la
// sesión sin salida: la de `ops.config.json` pasa, y la siguen juzgando los guards de Cauce. Cualquier otra, no.
test('con guards roto, la escritura que arregla ops.config.json no la frena la forma rota', () => {
  withGuards('cauce-guards-arreglo-', {}, { pre_shell: ['guards/no-esta.sh'] }, ({ target }) => {
    const writing = (file) => ({ cwd: target, tool_input: { file_path: path.join(target, file), content: '{}' } })
    assert.doesNotThrow(() => PG.runProjectGuards(['pre-files'], writing('ops.config.json'), hookGroups))
    blockedBy(() => PG.runProjectGuards(['pre-files'], writing('README.md'), hookGroups), /no es un evento con guards/)
    blockedBy(() => PG.runProjectGuards(['pre-shell'], shell(target, 'ls'), hookGroups), /no es un evento con guards/)
  })
})

// Las decisiones que frenan, según el encabezado de `project-guards.js`, con su motivo y sin él, y lo que sale en 0
// sin decidir nada.
test('un guard que sale en 0 con una decisión de frenar en JSON frena', () => {
  const scripts = {
    'niega.sh': `echo '${JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny',
      permissionDecisionReason: 'npx no corre acá' } })}'`,
    'bloquea.sh': `echo '${JSON.stringify({ decision: 'block', reason: 'falta el ticket' })}'`,
    'pregunta.sh': `echo '${JSON.stringify({ hookSpecificOutput: { permissionDecision: 'ask',
      permissionDecisionReason: 'confirmá el borrado' } })}'`,
    'permite.sh': `echo '${JSON.stringify({ hookSpecificOutput: { permissionDecision: 'allow' } })}'`,
    'habla.sh': 'echo "todo en orden"',
    'numero.sh': 'echo 3',
    'bloquea-mudo.sh': `echo '${JSON.stringify({ decision: 'block' })}'`,
    'niega-mudo.sh': `echo '${JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny' } })}'`,
    'pregunta-mudo.sh': `echo '${JSON.stringify({ hookSpecificOutput: { permissionDecision: 'ask' } })}'`,
    'corta.sh': `echo '${JSON.stringify({ continue: false, stopReason: 'ventana congelada' })}'`,
    'corta-mudo.sh': `echo '${JSON.stringify({ continue: false })}'`,
  }
  const cases = [['guards/niega.sh', /\[guards\/niega\.sh\] npx no corre acá/],
    ['guards/bloquea.sh', /\[guards\/bloquea\.sh\] falta el ticket/],
    ['guards/pregunta.sh', /\[guards\/pregunta\.sh\] confirmá el borrado .*pide confirmación/],
    ['guards/bloquea-mudo.sh', /\[guards\/bloquea-mudo\.sh\] el guard del proyecto frenó sin decir por qué/],
    ['guards/niega-mudo.sh', /\[guards\/niega-mudo\.sh\] el guard del proyecto frenó sin decir por qué/],
    ['guards/pregunta-mudo.sh', /\[guards\/pregunta-mudo\.sh\] el guard del proyecto pide confirmar/],
    ['guards/corta.sh', /\[guards\/corta\.sh\] ventana congelada/],
    ['guards/corta-mudo.sh', /\[guards\/corta-mudo\.sh\] el guard del proyecto frenó sin decir por qué/]]
  for (const [file, pattern] of cases) {
    withGuards('cauce-guards-json-', scripts, { 'pre-shell': [file] }, ({ target }) => {
      blockedBy(() => executeAll(['pre-shell'], shell(target, 'ls')), pattern)
    })
  }
  for (const file of ['guards/permite.sh', 'guards/habla.sh', 'guards/numero.sh']) {
    withGuards('cauce-guards-json-', scripts, { 'pre-shell': [file] }, ({ target }) => {
      assert.doesNotThrow(() => executeAll(['pre-shell'], shell(target, 'ls')), file)
    })
  }
})

// El plazo es del evento y no de cada guard: el tope del runner los cubre a todos juntos.
test('los guards de un evento comparten el plazo', () => {
  const previous = PG.limits.timeoutMs
  PG.limits.timeoutMs = 3000
  try {
    const slow = { 'lento.sh': 'sleep 2' }
    withGuards('cauce-guards-plazo-', slow, { 'pre-shell': ['guards/lento.sh'] }, ({ target }) => {
      assert.doesNotThrow(() => executeAll(['pre-shell'], shell(target, 'ls')), 'uno solo entra en el plazo')
    })
    withGuards('cauce-guards-plazo-dos-', slow,
      { 'pre-shell': ['guards/lento.sh', 'guards/lento.sh'] }, ({ target }) => {
        blockedBy(() => executeAll(['pre-shell'], shell(target, 'ls')), /no terminó dentro de los 3 s/)
      })
  } finally {
    PG.limits.timeoutMs = previous
  }
})

test('guards sólo acepta eventos que juzgan y rutas relativas a la raíz ops', () => {
  const base = { project: 'P', mode: 'sidecar', workspaceRoots: [{ name: 'app', path: '../app' }] }
  const errors = (guards) => validateOpsConfig({ ...base, guards }).filter((one) => one.includes('guards'))
  assert.deepEqual(errors({ 'pre-shell': ['guards/a.sh'], stop: ['../app/scripts/b.sh'] }), [])
  assert.match(errors(['guards/a.sh']).join('\n'), /guards debe ser un objeto/)
  assert.match(errors({ prompt: ['guards/a.sh'] }).join('\n'), /guards\.prompt no es un evento con guards/)
  for (const bad of ['guards/a.sh', [''], ['/abs/a.sh'], [3]]) {
    assert.match(errors({ 'pre-shell': bad }).join('\n'), /guards\.pre-shell debe ser una lista de rutas relativas/)
  }
})

test('cada grupo del motor está clasificado: admite guards del proyecto o está exento con su razón', () => {
  // Los dos de `prompt` registran el mensaje y le nombran las reglas a la sesión: ninguno frena nunca.
  const exempt = ['prompt', 'prompt-notice']
  assert.deepEqual([...GUARD_EVENTS, ...exempt].sort(), Object.keys(hookGroups).sort())
  const schema = require('../../engine/schemas/ops-config.schema.json')
  assert.deepEqual(Object.keys(schema.properties.guards.properties).sort(), [...GUARD_EVENTS].sort())
})

// El puente de Antigravity, lanzado como lo lanza `agy`: es el runner que no tenía dónde registrar un guard propio.
test('en Antigravity el guard del proyecto frena por el puente', () => {
  withGuards('cauce-guards-agy-', { 'no-npx.sh': NO_NPX }, { 'pre-shell': ['guards/no-npx.sh'] },
    ({ workspace, env }) => {
      const answer = (command) => JSON.parse(spawnSync(process.execPath,
        [path.join(workspace, '.agents', 'plugins', 'cauce', 'hook.js'), 'pre-shell'],
        { cwd: workspace, encoding: 'utf8', env,
          input: JSON.stringify({ toolCall: { args: { CommandLine: command, Cwd: workspace } } }) }).stdout.trim())
      const npx = answer('npx husky')
      assert.equal(npx.decision, 'deny')
      assert.match(npx.reason, /npx no corre en el host/)
      assert.deepEqual(answer('ls'), { decision: 'allow' })
    }, 'antigravity')
})

test('doctor avisa el guard que no está y el que el runner también registra', () => {
  withGuards('cauce-guards-doctor-', { 'no-npx.sh': NO_NPX },
    { 'pre-shell': ['guards/no-npx.sh'], 'pre-files': ['guards/no-esta.sh'] }, ({ workspace, target, runCli }) => {
      const settings = path.join(workspace, '.claude', 'settings.json')
      const installed = JSON.parse(fs.readFileSync(settings, 'utf8'))
      const registered = JSON.stringify(installed)
      // Las formas en que se registra un comando: suelto, la variable entre comillas, detrás de un intérprete, de `env`
      // o de una bandera.
      const forms = ['$CLAUDE_PROJECT_DIR/ops/guards/no-npx.sh', '"$CLAUDE_PROJECT_DIR"/ops/guards/no-npx.sh',
        'bash ops/guards/no-npx.sh', '/usr/bin/env bash "$CLAUDE_PROJECT_DIR"/ops/guards/no-npx.sh',
        'bash -e ops/guards/no-npx.sh']
      for (const command of forms) {
        const copy = JSON.parse(registered)
        copy.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command }] })
        fs.writeFileSync(settings, JSON.stringify(copy))
        const doctor = runCli(['automation', 'doctor', target, 'claude'])
        const said = `${doctor.stdout}${doctor.stderr}`
        assert.match(said, /guards\.pre-files: guards\/no-esta\.sh no existe o no es ejecutable/, command)
        assert.match(said, /guards\/no-npx\.sh también está registrado acá, y con guards\.pre-shell .* corre dos veces/,
          command)
        assert.notEqual(doctor.status, 0, 'un guard que no está es un error, no una advertencia')
      }
      // Un intérprete sin script no es el guard de nadie: no se confunde con uno registrado dos veces.
      const bare = JSON.parse(registered)
      bare.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'bash' }] })
      fs.writeFileSync(settings, JSON.stringify(bare))
      const alone = runCli(['automation', 'doctor', target, 'claude'])
      assert.doesNotMatch(`${alone.stdout}${alone.stderr}`, /también está registrado acá/)
    }, 'claude')
})
