'use strict'

// Qué se valida del informe que devolvió el modelo, y cómo se publica. Se separó de
// `ci-research.test.js` cuando ese archivo cruzó las 500 líneas: son dos propósitos con vidas
// distintas —uno cambia cuando cambia el prompt o el proveedor, éste cuando cambia el formato del
// informe o la forma de publicarlo— y ninguno de los dos se lee mejor dentro del otro.

const { tempRoot, workflow, workflowStep, workflowCommand } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execFileSync } = require('node:child_process')

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

// Lo que el ciclo de aprendizaje produce son archivos NUEVOS —el informe de la semana, la propuesta
// del mes—, y `git diff` no ve lo que no está trackeado. Con él, los dos jobs evaluaban su propio
// paso de publicación como «sin cambios» y terminaban en verde sin haber producido nada: el informe
// moría en el runner y la propuesta nunca salía. Es la falla que no se denuncia sola.
//
// Se prueba ejecutando los comandos contra un repositorio de verdad y no leyendo el YAML: el defecto
// no era el texto sino lo que ese texto hace, y otra redacción igual de ciega volvería a pasar.
// `Download report` tolera no encontrar nada —sin eso un cargo roto se lleva los PR de los demás— y
// esa tolerancia no distingue dos cosas muy distintas: el cargo cuya investigación falló, que ya se ve
// en rojo, y el informe que se hizo, se subió y no llegó, que no se ve en ningún lado y expira a los
// siete días. Lo que separa una de la otra es el agregado de la matriz: `research` no puede salir
// verde sin haber subido —`Prepare report` escribe el informe siempre, así que `Collect report` corre
// siempre y falla ruidoso si quedó vacío—, así que con la investigación entera en verde un download
// que falla es pérdida real.
test('un informe que se hizo y no llegó se anuncia; uno que nunca existió no', () => {
  const source = workflow('agent-learning')
  const bloque = source.split(/^  research-pr:$/m)[1].split(/^  [a-z-]+:$/m)[0]

  // Las dos mitades. Sin la primera avisaría también por cada cargo que ya está en rojo, y un aviso
  // que repite lo que otro job grita se termina ignorando igual que el rojo semanal.
  assert.match(bloque, /needs\.research\.result == 'success'\s*&&\s*steps\.fetch\.outcome == 'failure'/,
    'el aviso mira que la investigación entera haya salido bien, no sólo que este download falle')
  assert.match(bloque, /::warning title=/, 'y sale como anotación, no como una línea más de log')

  // La tolerancia sigue en pie: es lo que impide que un cargo roto bloquee a los otros.
  assert.match(bloque, /continue-on-error: true/, 'un cargo que falla no se lleva los PR de los demás')
  assert.match(bloque, /if: steps\.fetch\.outcome == 'success'/, 'y el PR sigue abriéndose sólo con informe')

  // Lo que vuelve cierta la implicación de arriba, y por eso se afirma acá: si `Prepare report`
  // dependiera de una condición, `research` podría salir verde sin subir nada y el aviso mentiría.
  const research = source.split(/^  research:$/m)[1].split(/^  [a-z-]+:$/m)[0]
  const prepare = research.split('- name: Prepare report')[1].split('- name:')[0]
  assert.equal(/^\s+if:/m.test(prepare), false, 'Prepare report corre siempre, que es lo que ata verde a subido')
})

// `reportSummary` lee «## Recomendación» con un patrón exacto y, cuando no lo encuentra, escribe
// «Sin recomendación registrada». O sea que un título renombrado sale **idéntico** a una ausencia
// genuina: una recomendación de diez líneas se pierde y la propuesta la reporta como un informe que no
// tenía nada que proponer. Entre trescientas líneas nadie lo ve leyendo el PR, y es lo único de un
// informe que ninguna revisión humana caza.
//
// Por eso se exige el título y no su contenido: encontrar cosas y no proponer ningún cambio es un
// resultado legítimo —el informe queda como histórico y nada del contrato del cargo se toca— y exigir
// contenido lo tiraría. Se ejecuta el paso, no se cita: una redacción distinta del mismo chequeo roto
// pasaría igual una aserción sobre el texto.
test('un título renombrado no pasa por una recomendación ausente', { skip: process.platform === 'win32' }, () => {
  const source = workflow('agent-learning')
  const paso = workflowStep(source, 'id: collect')
  assert.ok(paso.includes('Recomendación'), 'no se encontró el paso que valida el informe')

  const repo = tempRoot('cauce-collect-')
  const dir = path.join(repo, 'agents', 'roles', 'system', 'probe', 'learning', 'reports')
  fs.mkdirSync(dir, { recursive: true })
  const bash = (script, env) => spawnSync('bash', ['-c', script], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, AGENT: 'probe', ...env },
  })
  fs.writeFileSync(path.join(repo, 'README.md'), 'base\n')
  bash('git init -q . && git add README.md && git -c user.email=t@t -c user.name=t commit -qm base')

  const stamp = new Date().toISOString().slice(0, 10)
  // El frontmatter va completo porque el mismo paso valida `status` y `propone`; romperlos es lo que
  // mide el test de al lado, que es donde se lee qué se está midiendo.
  const informe = (recomendacion) => ['---', 'agent: probe', 'status: draft', 'propone: si', '---', '',
    '## Fuentes consultadas', '', '1. Una fuente.', '',
    '## Hallazgos', '', 'H1. Algo cambió.', '', recomendacion, '', '## Preguntas abiertas', '', 'Ninguna.',
  ].join('\n')
  const correr = (texto) => {
    fs.writeFileSync(path.join(dir, `${stamp}.md`), texto)
    const salida = path.join(repo, 'github-output')
    fs.writeFileSync(salida, '')
    const hecho = bash(paso, { GITHUB_OUTPUT: salida })
    return { ...hecho, escrito: fs.readFileSync(salida, 'utf8') }
  }

  const bueno = correr(informe('## Recomendación\n\n1. Cambiar algo (cierra H1).'))
  assert.equal(bueno.status, 0, `un informe completo tiene que pasar: ${bueno.stderr}`)
  assert.match(bueno.escrito, /^path=agents\/.*\.md$/m, 'y deja la ruta para el artifact')

  // El caso legítimo, que es la mitad de la decisión: sin nada que proponer, el informe igual entra.
  const sinNada = correr(informe('## Recomendación'))
  assert.equal(sinNada.status, 0,
    `encontrar cosas y no proponer cambios es un resultado, no un error: ${sinNada.stderr}`)
  assert.match(sinNada.escrito, /^path=/m, 'el histórico se guarda igual')

  // Y el defecto, que hoy salía indistinguible del caso de arriba.
  for (const roto of ['## Recomendaciones', '## Recomendación final', '### Recomendación']) {
    const hecho = correr(informe(roto))
    assert.notEqual(hecho.status, 0, `«${roto}» tiene que frenar el PR`)
    assert.match(hecho.stderr, /Recomendación/, `y decir por qué: ${hecho.stderr}`)
  }
})

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

// `reports/` nace con el primer informe del cargo, así que para casi todos no existe en git todavía.
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

// Los dos campos del frontmatter que el ciclo lee después de publicar, y que fallan callados: el informe
// se publica igual, la puerta pasa, y lo que se pierde no deja rastro en ningún lado. `status` pisado
// costó cuatro recomendaciones el 2026-09-07 y no se vio hasta comparar los veinte frontmatters.
test('el frontmatter que vuelve se comprueba, no se supone', { skip: process.platform === 'win32' }, () => {
  const source = workflow('agent-learning')
  const paso = workflowStep(source, 'id: collect')

  const repo = tempRoot('cauce-frontmatter-')
  const dir = path.join(repo, 'agents', 'roles', 'system', 'probe', 'learning', 'reports')
  fs.mkdirSync(dir, { recursive: true })
  const bash = (script, env) => spawnSync('bash', ['-c', script], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, AGENT: 'probe', ...env },
  })
  fs.writeFileSync(path.join(repo, 'README.md'), 'base\n')
  bash('git init -q . && git add README.md && git -c user.email=t@t -c user.name=t commit -qm base')

  const stamp = new Date().toISOString().slice(0, 10)
  const correr = (frente) => {
    fs.writeFileSync(path.join(dir, `${stamp}.md`), ['---', 'agent: probe', ...frente, '---', '',
      '## Fuentes consultadas', '', '1. Una fuente.', '',
      '## Hallazgos', '', 'H1. Algo cambió.', '',
      '## Recomendación', '', 'Nada que tocar.', '', '## Preguntas abiertas', '', 'Ninguna.'].join('\n'))
    const salida = path.join(repo, 'github-output')
    fs.writeFileSync(salida, '')
    return bash(paso, { GITHUB_OUTPUT: salida })
  }

  for (const propone of ['si', 'no']) {
    const hecho = correr(['status: draft', `propone: ${propone}`])
    assert.equal(hecho.status, 0, `«propone: ${propone}» es una respuesta válida: ${hecho.stderr}`)
  }

  // Un informe sellado de entrada no entra a ninguna propuesta: `pendingReports` saltea lo consolidado.
  const sellado = correr(['status: consolidated', 'propone: si'])
  assert.notEqual(sellado.status, 0, 'un informe que vuelve sellado tiene que frenar')
  assert.match(sellado.stderr, /status: draft/, `y decir cuál es el campo: ${sellado.stderr}`)

  // Sin contestar no se puede decidir si el PR se mergea solo, y el default del molde es no contestarlo.
  for (const sin of [['status: draft', 'propone: por-completar'], ['status: draft'],
    ['status: draft', 'propone: quizás']]) {
    const hecho = correr(sin)
    assert.notEqual(hecho.status, 0, `«${sin.join(', ')}» tiene que frenar`)
    assert.match(hecho.stderr, /propone/, `y nombrar el campo: ${hecho.stderr}`)
  }
})

// El ahorro que ese campo compra, y por qué es un PR por cargo y no uno agrupado.
test('un informe que no propone nada se mergea sin revisión humana', () => {
  const paso = workflowStep(workflow('agent-learning'), 'Open research pull request')

  assert.match(paso, /grep -qx 'propone: no'/, 'el auto-merge se decide por el campo, no por el texto')
  assert.match(paso, /gh pr merge .*--auto/, 'y se arma con auto-merge, no con un merge directo')
  // `delete_branch_on_merge` del repositorio no alcanza: el PR #277 se mergeó solo y dejó su rama viva.
  // Quien mergea a mano pasa la opción, así que el hueco sólo aparece por esta vía.
  assert.match(paso, /gh pr merge .*--delete-branch/, 'y borra la rama, que nadie más va a borrar')
  // Lo que no debe pasar: que un informe que sí propone algo se mergee sin que nadie lo mire.
  const rama = paso.slice(paso.indexOf("grep -qx 'propone: no'"))
  assert.equal(/propone: si/.test(rama), false, 'el «si» no dispara ningún merge')
})

// Una fuente que no se pudo abrir y una que no cambió producen el mismo informe —«sin novedades»— y no
// son lo mismo: la primera no se comprobó. La diferencia vivía sólo en la prosa del informe, donde nadie
// la agrega, así que la cadencia seguía siendo la de una fuente rápida que hacía dos meses no se leía.
//
// Se ejecuta el paso con un `curl` falso en vez de salir a la red: lo que se mide es qué hace con los
// códigos que recibe, y depender de internet haría que la prueba fallara por razones ajenas.
test('el ciclo anota qué fuentes declaradas no pudo abrir', { skip: process.platform === 'win32' }, () => {
  const paso = workflowStep(workflow('agent-learning'), 'Check declared sources are reachable')
  assert.ok(paso.includes('sourceUrls'), 'lee las fuentes del motor y no con un grep propio')

  const dir = tempRoot('cauce-fuentes-')
  const repo = path.resolve(__dirname, '..', '..')
  // Devuelve 403 para iso.org y 200 para el resto, que es el reparto real que originó esto.
  fs.writeFileSync(path.join(dir, 'curl'), '#!/usr/bin/env bash\n'
    + 'for arg in "$@"; do url="$arg"; done\n'
    + 'case "$url" in *iso.org*) echo -n 403 ;; *) echo -n 200 ;; esac\n', { mode: 0o755 })

  const summary = path.join(dir, 'summary.txt')
  fs.writeFileSync(summary, '')
  const salida = spawnSync('bash', ['-c', paso], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      OPS: 'engine/cli/ops.js',
      AGENT: 'cloud-architect',
      GITHUB_STEP_SUMMARY: summary,
    },
  })
  assert.equal(salida.status, 0, `avisa y no falla la corrida: ${salida.stderr}`)

  const escrito = fs.readFileSync(summary, 'utf8')
  assert.match(escrito, /\| fuentes declaradas \| [1-9]/, 'cuenta las que el cargo declara')
  assert.match(escrito, /\| no alcanzables \| [1-9]/, 'y cuántas no respondieron')
  assert.match(escrito, /iso\.org.*→ 403/, 'nombrando cuál y con qué código')
  assert.match(salida.stdout, /^::warning title=/m, 'sale como anotación, no como una línea de log')

  // Sin ninguna rota no hay nada que anunciar: un aviso que sale siempre se termina ignorando.
  fs.writeFileSync(path.join(dir, 'curl'), '#!/usr/bin/env bash\necho -n 200\n', { mode: 0o755 })
  fs.writeFileSync(summary, '')
  const limpio = spawnSync('bash', ['-c', paso], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      OPS: 'engine/cli/ops.js',
      AGENT: 'cloud-architect',
      GITHUB_STEP_SUMMARY: summary,
    },
  })
  assert.equal(limpio.status, 0)
  assert.equal(/no alcanzables/.test(fs.readFileSync(summary, 'utf8')), false)
  assert.equal(/::warning/.test(limpio.stdout), false, 'y no se avisa de una falta que no existe')
})
