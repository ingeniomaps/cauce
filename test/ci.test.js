'use strict'

// Los workflows de GitHub Actions, que comparten la palabra «workflow» con los recorridos de Cauce y
// nada más: acá se prueba la automatización del repositorio —quién puede escribir, qué credencial ve
// cada job, cómo se fijan las acciones—, no lo que un runner ejecuta en una empresa.

const { tempRoot, workflow, workflowStep, workflowCommand } = require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// Los workflows de GitHub Actions, que comparten la palabra «workflow» con los recorridos de Cauce y
// nada más: acá se prueba la automatización del repositorio —quién puede escribir, qué credencial ve
// cada job, cómo se fijan las acciones—, no lo que un runner ejecuta en una empresa.

test('el workflow de aprendizaje corre en el toolkit y nombra un solo CLI', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /^ {2}OPS: engine\/cli\/ops\.js$/m, 'el CLI se declara una vez para todo el workflow')
  assert.equal(/tools\/ops\.js/.test(source), false, 'no queda el CLI de una instancia')
  assert.equal(/\.ops\//.test(source), false, 'no queda el motor vendorizado que Cauce ya no distribuye')
  assert.match(source, /fromJSON\(needs\.discover\.outputs\.agents\)/, 'la matriz sale del árbol de agentes')
  assert.match(source, /slugs\.filter\(\(slug\) => slug === only\)/, 'el input se valida contra slugs reales')
})

// Tres formas de trabajar de más o de menos que tuvo este workflow: la credencial comprobada dentro
// de la matriz encendía cuarenta y siete jobs para saltearse; exigir que la matriz entera saliera
// bien hacía que un cargo roto se llevara los PR de los otros, con sus informes expirando en el
// artifact; y sin `concurrency` dos corridas empujan la misma rama y la segunda no puede publicar.
test('el aprendizaje no enciende de más, aísla el fallo de un cargo y no se pisa', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')

  assert.match(source, /needs\.discover\.outputs\.model == 'true'/, 'la credencial se comprueba una vez')

  assert.equal(/needs\.research\.result == 'success'/.test(source), false, 'un cargo no bloquea a los demás')

  assert.match(source, /^concurrency:$/m, 'una sola corrida a la vez')
  assert.match(source, /cancel-in-progress: false/, 'y no se corta una que ya está abriendo PR')

  for (const block of source.split(/\n  (?=[a-z][a-z-]*:\n)/)) {
    if (!/\n    runs-on:/.test(block)) continue
    assert.match(block, /timeout-minutes:/, `${block.trimStart().split(':')[0]}: sin timeout hereda seis horas`)
  }
})

// El agente de investigación ingiere contenido web que nadie controla. Mientras corría en el mismo
// job que la credencial de escritura, cualquier instrucción que viniera en una página tenía un
// repositorio a mano. Ahora el informe sale por artifact y el commit lo hace otro job sin modelo.
test('quien corre el agente no puede escribir, y quien escribe no tiene la credencial', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')
  const jobs = source.split(/\n  (?=[a-z][a-z-]*:\n)/)
  const find = (name) => jobs.find((block) => block.trimStart().startsWith(`${name}:`)) || ''

  const research = find('research')
  assert.ok(research.includes('ANTHROPIC_API_KEY'), 'research es quien usa el modelo')
  assert.equal(/contents:\s*write/.test(research), false, 'y no puede escribir el repositorio')
  assert.ok(research.includes('upload-artifact'), 'entrega el informe por artifact')

  const pr = find('research-pr')
  assert.match(pr, /contents:\s*write/, 'research-pr es quien commitea')
  assert.equal(pr.includes('ANTHROPIC_API_KEY'), false, 'y no toca ningún modelo')
  assert.ok(pr.includes('agents list --json'), 'el destino se resuelve acá, no viene en el artifact')

  // El default del workflow tiene que ser el mínimo: si fuera `write`, un job nuevo nacería pudiendo
  // escribir sin que nadie lo decidiera.
  assert.match(source.slice(0, source.indexOf('jobs:')), /permissions:\n  contents: read/)
})

// Un tag de acción es mutable: quien controle el repositorio de la acción puede moverlo a otro commit,
// y el workflow que lo usa ejecuta código nuevo sin que cambie una línea acá.
test('las acciones están fijadas por SHA, no por tag', () => {
  const dir = path.resolve(__dirname, '..', '.github', 'workflows')
  for (const name of fs.readdirSync(dir)) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8')
    for (const match of source.matchAll(/uses:\s*([^\s]+)/g)) {
      assert.match(match[1], /@[0-9a-f]{40}$/, `${name}: ${match[1]} no está fijada por SHA`)
    }
  }
})

test('un solo workflow cubre a todos los agentes', () => {
  const dir = path.resolve(__dirname, '..', '.github', 'workflows')
  const files = fs.readdirSync(dir).sort()
  assert.deepEqual(files, ['agent-learning.yml', 'ci.yml'], 'no vuelve a haber un workflow por agente')
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
  assert.equal(
    found('proposal', 'AGENT=probe; period=2099-01'),
    'agents/roles/system/probe/learning/proposals/2099-01-r2.md',
    'y la revisión, que no se llama como el período',
  )
})

// La propuesta se llama por el mes en que se abre y arrastra lo que todavía no entró. Nombrarle el
// mes que cerró parecía más exacto y abría un caso peor: si ese mes ya tiene propuesta aplicada, lo
// que el cron abre es una **revisión** —el documento que corrige un cambio mal calibrado— vacía y
// sin que nadie lo decidiera. El workflow no calcula meses, y eso es la prueba.
test('la consolidación mensual no le nombra un período al CLI', () => {
  const source = workflow('agent-learning')
  assert.match(source, /learn "\$AGENT" --proposal$/m, 'consolida el mes en que corre')
  assert.equal(/--proposal --period/.test(source), false, 'y no le nombra un mes pasado')
  assert.equal(/1 day ago/.test(source), false, 'no queda aritmética de fechas en el workflow')
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
