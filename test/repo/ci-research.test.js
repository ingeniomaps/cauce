'use strict'

// El job que investiga: qué herramientas recibe, qué hace cuando no encuentra nada, y qué anuncia
// cuando le falta la credencial en vez de quedar en verde. A quién le toca y cuándo es la pregunta
// de al lado, en `ci-schedule.test.js`.

const { tempRoot, CLI, workflow, workflowStep, workflowCommand } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execFileSync } = require('node:child_process')

test('la investigación recibe las herramientas que su instrucción nombra, y no más', () => {
  const file = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')

  // Se afirma sobre la invocación y no sobre el archivo: declarar los permisos en una variable y no
  // pasársela a `claude` deja todo igual, y buscar sólo la cadena `--allowedTools` no lo nota.
  assert.match(source, /claude -p "\$prompt" "\$\{TOOLS\[@\]\}"/, 'los permisos llegan a la invocación')

  // Un arreglo y no una cadena. Sin comillas el shell parte `Bash(make agent-learn *)` en tres palabras
  // y el CLI descarta la última: «Ignoring --allowedTools rule "*)"». Bash nunca se concedía, y la
  // corrida salía bien igual porque con web y lectura alcanzaba — el defecto vivía en dos líneas del log.
  assert.match(source, /TOOLS=\(--allowedTools /, 'se declaran como arreglo')
  assert.match(source, /'Bash\(make agent-learn \*\)'/, 'y cada regla con espacios va entrecomillada')
  assert.match(source, /'Bash\(make agent-evaluate \*\)'/)
  for (const tool of ['WebSearch', 'WebFetch', 'Read', 'Edit']) {
    assert.match(source, new RegExp(`--allowedTools[^\n]*\\b${tool}\\b`), `puede ${tool}`)
  }
  // Los dos comandos que el `AUTOMATION.md` de los cargos nombra, y sólo ésos.
  assert.match(source, /Bash\(make agent-learn \*\)/)
  assert.match(source, /Bash\(make agent-evaluate \*\)/)

  // Saltear permisos le daría justo lo que su instrucción le prohíbe: dependencias, código, SKILL.md,
  // planificación, commit y push. El guard más barato contra eso es no dárselo.
  assert.equal(/dangerously-skip-permissions/.test(source), false, 'sin saltear permisos')
  assert.equal(/permission-mode\s+bypassPermissions/.test(source), false)
})

// Con `--output-format json` el CLI bufferea hasta el final, así que el log queda mudo los diez
// minutos que dura una investigación y no se distingue de una corrida colgada: la única salida era
// esperar el timeout para saber cuál era. El latido lo emite el shell y no el modelo — si el proceso
// muriera, `kill -0` falla y el bucle corta, así que no puede mentir que sigue vivo.
test('la investigación late mientras corre y deja dicho lo que costó', () => {
  const file = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')

  assert.match(source, /while kill -0 "\$pid"/, 'el latido comprueba el proceso, no un reloj')
  assert.match(source, /investigando, van \$\(\(espera \/ 60\)\) min/, 'y dice cuánto lleva')
  // Poleo corto y voz cada minuto: con `sleep 60` una corrida de dos segundos esperaba el minuto
  // entero, y la prueba que ejecuta este paso con un `claude` falso se colgaba.
  assert.match(source, /sleep 5$/m, 'sin hacer esperar un minuto a lo que ya terminó')
  assert.match(source, /return \$salida/, 'sin tragarse el código de salida del modelo')

  // Lo que vuelve medible una corrida. Sin esto no había forma de saber qué cuesta una investigación,
  // y un permiso mal escrito sólo se veía leyendo dos líneas perdidas del log.
  assert.match(source, /--output-format json/)
  assert.match(source, /total_cost_usd/, 'el costo queda en el resumen del job')
  assert.match(source, /permission_denials/, 'y lo que se le negó, que es como se ve un permiso roto')
})

// Que el informe exista no alcanza: `learn` lo crea vacío y el modelo puede devolverlo tal cual. Así
// salió la primera corrida y `research-pr` lo publicó igual — un lunes eso son 29 PRs en blanco y nada
// lo dice. Es la forma que R15 nombra: se lee entero y no lo está.
test('un informe sin contenido no abre PR', () => {
  const file = path.resolve(__dirname, '..', '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')

  // Se mira contenido, y de las secciones que la propuesta mensual consolida.
  assert.match(source, /for seccion in 'Fuentes consultadas' 'Hallazgos'/)
  assert.match(source, /quedó sin contenido en:/, 'y dice cuáles quedaron vacías')
  assert.match(source, /No se abre PR/, 'en vez de publicar un insumo que no existe')
  // El diagnóstico que ahorra la próxima media hora: la causa suele ser un permiso, no el modelo.
  assert.match(source, /una herramienta denegada, no el modelo/)
})

// Sin credencial la corrida no falla —`research` se saltea— así que termina en verde, y el aviso vivía
// en un `echo` suelto entre miles de líneas de log. El ciclo puede quedar parado semanas sin que nada
// lo diga: el 2026-08-17 la credencial estaba y el 2026-08-24 ya no, y la caída se descubrió cinco días
// después leyendo logs a mano. Lo que se prueba es que el aviso salga como anotación, que es lo único
// que se ve sin abrir la corrida.
test('una semana sin credencial se anuncia, en vez de quedar en verde y en silencio', () => {
  const source = workflow('agent-learning')
  const dir = tempRoot('cauce-creds-aviso-')
  const salida = path.join(dir, 'github-output')
  const correr = (env) => {
    fs.writeFileSync(salida, '')
    const hecho = spawnSync('bash', ['-c', workflowStep(source, 'id: creds')], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, OAUTH: '', KEY: '', ...env, GITHUB_OUTPUT: salida },
    })
    return { ...hecho, escrito: fs.readFileSync(salida, 'utf8') }
  }

  const sin = correr({})
  assert.equal(sin.status, 0, 'no se falla la corrida: un rojo cada lunes se termina ignorando')
  assert.match(sin.escrito, /^ready=false$/m, 'y research no arranca')
  assert.match(sin.stdout, /^::warning title=[^:]+::/m,
    'el aviso sale como anotación; un echo suelto no se ve sin abrir el log')
  assert.match(sin.stdout, /CLAUDE_CODE_OAUTH_TOKEN/,
    'y nombra qué cargar, no sólo que falta algo')

  // Con cualquiera de las dos alcanza, y entonces no hay nada que anunciar.
  for (const env of [{ OAUTH: 'x' }, { KEY: 'x' }]) {
    const con = correr(env)
    assert.match(con.escrito, /^ready=true$/m, `con ${Object.keys(env)[0]} se investiga`)
    assert.equal(/::warning/.test(con.stdout), false, 'y no se avisa de una falta que no existe')
  }
})

// Lo que el ciclo de aprendizaje produce son archivos NUEVOS —el informe de la semana, la propuesta
// del mes—, y `git diff` no ve lo que no está trackeado. Con él, los dos jobs evaluaban su propio
// paso de publicación como «sin cambios» y terminaban en verde sin haber producido nada: el informe
// moría en el runner y la propuesta nunca salía. Es la falla que no se denuncia sola.
//
// Se prueba ejecutando los comandos contra un repositorio de verdad y no leyendo el YAML: el defecto
// no era el texto sino lo que ese texto hace, y otra redacción igual de ciega volvería a pasar.
test('el workflow de aprendizaje ve los archivos que el ciclo crea', { skip: process.platform === 'win32' }, () => {
  const source = workflow('agent-learning')

  // El repositorio donde se ejecuta: un commit, y encima lo que el ciclo acaba de escribir.
  const repo = tempRoot('cauce-ci-')
  const role = path.join(repo, 'agents', 'roles', 'system', 'probe', 'learning')
  fs.mkdirSync(path.join(role, 'reports'), { recursive: true })
  fs.mkdirSync(path.join(role, 'proposals'), { recursive: true })
  const bash = (script) => execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8' })
  fs.writeFileSync(path.join(repo, 'README.md'), 'base\n')
  bash('git init -q . && git add README.md && git -c user.email=t@t -c user.name=t commit -qm base')
  fs.writeFileSync(path.join(role, 'reports', '2099-01-07.md'), 'informe\n')
  // Una revisión, que es el caso que el filtro por período dejaba afuera: una propuesta ya aplicada
  // se corrige abriendo `<período>-rN.md`, y el paso la leía como un archivo ajeno y no abría PR.
  fs.writeFileSync(path.join(role, 'proposals', '2099-01-r2.md'), 'propuesta\n')

  // El paso que decide si hay algo que publicar. Si dice que no, nada de lo que sigue corre.
  const detect = workflowStep(source, 'changes')
  assert.ok(detect.length, 'no se encontró el paso de detección')
  const output = path.join(repo, 'github-output')
  bash(`GITHUB_OUTPUT=${JSON.stringify(output)}\nexport GITHUB_OUTPUT\n${detect}`)
  assert.match(fs.readFileSync(output, 'utf8'), /^changed=true$/m, 'un archivo nuevo es un cambio')

  // Y los dos comandos que después buscan el archivo por su ruta.
  const found = (name, vars) => bash(`${vars}\n${workflowCommand(source, name)}\nprintf '%s' "$${name}"`)
  assert.equal(
    found('report', 'AGENT=probe; stamp=2099-01-07'),
    'agents/roles/system/probe/learning/reports/2099-01-07.md',
    'el informe de la semana',
  )
  // La propuesta ya no se busca con su propio pathspec: sale de filtrar lo que cambió, que es lo que
  // hace que el sello viaje al PR junto con ella. Por eso el caso monta las dos líneas.
  assert.equal(
    found('proposal', `AGENT=probe; period=2099-01\n${workflowCommand(source, 'changed')}`),
    'agents/roles/system/probe/learning/proposals/2099-01-r2.md',
    'y la revisión, que no se llama como el período',
  )
})

// `reports/` nace con el primer informe del cargo, así que en 43 de los 47 no existe en git todavía.
// El chequeo que exige «exactamente el informe y nada más» comparaba contra la salida por defecto de
// `git status`, que colapsa un directorio sin trackear en una sola línea: veía `.../learning/reports/`
// donde esperaba la ruta del archivo, y abortaba la publicación del primer informe de cada cargo.
test('el primer informe de un cargo no aborta su publicación', () => {
  const source = workflow('agent-learning')

  // Un cargo como los del catálogo: `learning/` versionado por sus fuentes, y `reports/` estrenándose.
  const repo = tempRoot('cauce-first-')
  const rol = 'agents/roles/system/probe'
  fs.mkdirSync(path.join(repo, rol, 'learning', 'reports'), { recursive: true })
  fs.writeFileSync(path.join(repo, rol, 'SKILL.md'), 'x\n')
  fs.writeFileSync(path.join(repo, rol, 'learning', 'sources.yaml'), 'version: 1\n')
  const bash = (script) => execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8' })
  bash(`git init -q . && git add ${rol}/SKILL.md ${rol}/learning/sources.yaml`
    + ' && git -c user.email=t@t -c user.name=t commit -qm base')
  const dest = `${rol}/learning/reports/2099-01-07.md`
  fs.writeFileSync(path.join(repo, dest), 'informe\n')

  // La línea real del workflow: lo que sobra además del informe, que tiene que ser nada.
  const sobra = bash(`dest=${JSON.stringify(dest)}\n${workflowCommand(source, 'otros')}\nprintf '%s' "$otros"`)
  assert.equal(sobra, '', 'el informe recién creado es lo único que hay, y el chequeo lo reconoce')

  // Y sigue detectando lo que de verdad sobra: el freno existe para que un agente no cuele otro archivo.
  fs.writeFileSync(path.join(repo, rol, 'SKILL.md'), 'reescrito por el agente\n')
  const conIntruso = bash(`dest=${JSON.stringify(dest)}\n${workflowCommand(source, 'otros')}\nprintf '%s' "$otros"`)
  assert.match(conIntruso, /SKILL\.md/, 'un archivo ajeno sigue abortando la publicación')
})

// La suscripción primero, la API key como respaldo. No alcanza con poner las dos en el entorno: el
// CLI antepone `ANTHROPIC_API_KEY` al token de suscripción y en `-p` la usa siempre que esté, así que
// tenerlas juntas paga API en silencio. Se ejecuta el paso real contra un `claude` de mentira que
// anota qué credencial vio, porque lo que hay que fijar es cuál llega al proceso.
test('la investigación usa la suscripción y cae a la API key sólo si falla',
  { skip: process.platform === 'win32' }, () => {
  const paso = workflowStep(workflow('agent-learning'), 'id: research')
  assert.ok(paso.includes('claude -p'), 'no se encontró el paso que corre el modelo')

  const dir = tempRoot('cauce-creds-')
  const visto = path.join(dir, 'visto.txt')
  // Anota la credencial de cada invocación; falla cuando se le pide desde el entorno de la prueba.
  fs.writeFileSync(path.join(dir, 'claude'), `#!/usr/bin/env bash\n`
    + `echo "oauth=\${CLAUDE_CODE_OAUTH_TOKEN:-} key=\${ANTHROPIC_API_KEY:-}" >> ${JSON.stringify(visto)}\n`
    + `exit "\${FALLA_OAUTH:-0}"\n`, { mode: 0o755 })
  // El respaldo tiene que salir bien aunque el primero falle: la segunda invocación no lleva OAuth.
  fs.writeFileSync(path.join(dir, 'claude-fallible'), '', { mode: 0o755 })

  const correr = (env) => {
    fs.writeFileSync(visto, '')
    const salida = require('node:child_process').spawnSync('bash', ['-c', paso], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, AGENT: 'probe', ...env },
    })
    return { status: salida.status, llamadas: fs.readFileSync(visto, 'utf8').trim().split('\n').filter(Boolean) }
  }

  const conAmbas = correr({ OAUTH: 'tok', APIKEY: 'key' })
  assert.equal(conAmbas.status, 0)
  assert.deepEqual(conAmbas.llamadas, ['oauth=tok key='],
    'una sola corrida, con el token de suscripción y sin la API key en el entorno')

  // El mismo caso, con el primer intento fallando: recién ahí aparece la API key.
  const falla = correr({ OAUTH: 'tok', APIKEY: 'key', FALLA_OAUTH: '3' })
  assert.equal(falla.llamadas.length, 2, 'reintenta una vez')
  assert.equal(falla.llamadas[0], 'oauth=tok key=', 'primero la suscripción')
  assert.equal(falla.llamadas[1], 'oauth= key=key', 'después la API key, y sola')

  const soloKey = correr({ OAUTH: '', APIKEY: 'key' })
  assert.equal(soloKey.status, 0)
  assert.deepEqual(soloKey.llamadas, ['oauth= key=key'], 'sin suscripción va directo a la API key')

  const ninguna = correr({ OAUTH: '', APIKEY: '' })
  assert.notEqual(ninguna.status, 0, 'sin credencial falla en vez de correr sin nada')
  assert.deepEqual(ninguna.llamadas, [], 'y no invoca el modelo')
})
