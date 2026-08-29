'use strict'

// A quién le toca y cuándo: qué cron cubre cada cadencia, cómo se arma la cohorte de cada corrida,
// y qué pasa el día del ensamblaje, cuando la lista de quien investiga está vacía a propósito y la
// de quien se consolida no.

const { tempRoot, CLI, workflow, workflowStep } = require('./environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execFileSync } = require('node:child_process')

function staging(source, variable) {
  const lines = source.split('\n')
  const at = lines.findIndex((line) => /^\s*changed="\$\(git ls-files/.test(line) && line.includes(variable))
  assert.ok(at >= 0, `el workflow no calcula qué cambió para ${variable}`)
  const resto = lines.slice(at + 1)
  // `proposal=` va aunque no se stagee: es lo que el paso stageaba antes, así que sin definirla el
  // regreso al defecto fallaría por variable vacía en vez de por haber stageado de menos.
  const proposal = resto.find((line) => /^\s*proposal="\$\(/.test(line))
  const add = resto.find((line) => line.includes('git add'))
  assert.ok(proposal && add, `el workflow no resuelve y stagea la propuesta de ${variable}`)
  return [lines[at], proposal, add].map((line) => line.trim()).join('\n')
}

test('el workflow de aprendizaje corre en el toolkit y nombra un solo CLI', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /^ {2}OPS: engine\/cli\/ops\.js$/m, 'el CLI se declara una vez para todo el workflow')
  assert.equal(/tools\/ops\.js/.test(source), false, 'no queda el CLI de una instancia')
  assert.equal(/\.ops\//.test(source), false, 'no queda el motor vendorizado que Cauce ya no distribuye')
  assert.match(source, /fromJSON\(needs\.discover\.outputs\.agents\)/, 'la matriz sale del árbol de agentes')
  assert.match(source, /roles\.filter\(\(role\) => role\.slug === only\)/, 'el input se valida contra slugs reales')

  // Los recorridos no salen de `agents list --json` —no son cargos—, así que el cron no los veía y
  // ninguno aprendió nunca pese a que el ciclo existía y funcionaba a mano. Su disparador tampoco es
  // el calendario: un cargo investiga porque su profesión cambia sola afuera, y un recorrido sólo
  // aprende cuando le fue mal. Sin el filtro por `pending` el día 1 abriría una propuesta por
  // recorrido diciendo «no hay qué corregir», y cada una cuesta una firma humana.
  assert.match(source, /node "\$OPS" flow list --json/, 'los recorridos salen de su propia lista')
  assert.match(source, /fromJSON\(needs\.discover\.outputs\.flows\)/, 'y arman su propia matriz')
  assert.match(source, /one\.pending > 0/, 'sólo entra el que tiene corridas sin consolidar')
  assert.match(source, /learn "\$FLOW" --flow --proposal/, 'y se consolida con el CLI, sin modelo')
})

// La primera corrida real con credencial duró tres minutos y devolvió el informe vacío: «every tool
// this task needs is currently denied in this session». `claude -p` corre sin permisos declarados, así
// que no puede correr un comando ni salir a la web — que es todo lo que una investigación hace. El
// cargo se portó bien y lo dijo («I won't fabricate sources, dates, or command output»), y el workflow
// publicó el vacío igual.
// Lanzarlo a mano disparaba también el ensamblaje mensual: probar `research` abría una propuesta de
// regalo, y una propuesta cuesta una firma humana. Peor, consolidar sella los informes que consume, así
// que un dispatch de prueba movía estado real del ciclo.
test('un dispatch elige su fase y no arrastra el ensamblaje', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  // Sobre el texto y no con un parser de YAML: el repositorio no tiene dependencias, ni de desarrollo.
  const source = fs.readFileSync(file, 'utf8')

  assert.match(source, /^ {6}phase:$/m, 'el dispatch declara qué fase correr')
  assert.match(source, /options: \[research, propose, both\]/)
  assert.match(source, /description: 'Qué correr: research \(default\)[\s\S]{0,120}default: 'research'/,
    'y por defecto corre lo que uno lanza a mano')

  // Cada job mira la fase. Se lee el bloque de cada uno, no el archivo entero: una condición puesta en
  // el job equivocado dejaría pasar una aserción sobre el texto completo.
  const bloque = (job) => source.split(new RegExp(`^  ${job}:$`, 'm'))[1].split(/^  [a-z-]+:$/m)[0]
  assert.match(bloque('research'), /inputs\.phase != 'propose'/)
  assert.match(bloque('propose'), /inputs\.phase != 'research'/)
  assert.match(bloque('propose-flows'), /inputs\.phase != 'research'/)
  for (const job of ['propose', 'propose-flows']) {
    assert.match(bloque(job), /schedule == '17 7 1 \* \*'/, `${job} sigue corriendo por su cron`)
  }
})

test('cada cron investiga su cadencia, y el del ensamblaje no investiga', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')
  const crones = [...source.matchAll(/^ {4}- cron: '([^']+)'/gm)].map((hit) => hit[1])
  assert.deepEqual(crones, ['17 13 * * 1', '17 13 24 * *', '17 13 23 3,6,9,12 *', '17 7 1 * *'])

  // Ninguno comparte minuto con otro: el día 1 cae lunes cuatro veces cada dos años y antes los dos
  // disparaban a la misma hora, con el orden librado a la cola.
  assert.equal(new Set(crones.map((one) => one.split(' ').slice(0, 2).join(' '))).size > 1,
    true, 'el ensamblaje no compite con la investigación')

  // Los tres de investigación tienen cadencia declarada; el del ensamblaje no está en la tabla, y por
  // eso ese día la lista sale vacía y `research` no arranca.
  const tabla = source.slice(source.indexOf('const POR_CRON'), source.indexOf('const cadence'))
  for (const cron of crones.slice(0, 3)) assert.ok(tabla.includes(cron), `${cron} elige a quién correr`)
  assert.equal(tabla.includes('17 7 1 * *'), false, 'el del ensamblaje no investiga a nadie')
  assert.match(source, /needs\.discover\.outputs\.agents != '\[\]'/, 'y research no arranca con lista vacía')
  assert.match(source, /github\.event\.schedule == '17 7 1 \* \*'/, 'propose corre el día del ensamblaje')

  // Sin `SCHEDULE` la corrida es a mano: ahí no se filtra, porque quien la lanza quiere lo que pidió.
  assert.match(source, /const porCron = Boolean\(\(process\.env\.SCHEDULE \|\| ""\)\.trim\(\)\)/)
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

test('un solo workflow cubre a todos los agentes', () => {
  const dir = path.resolve(__dirname, '..', '.github', 'workflows')
  const files = fs.readdirSync(dir).sort()
  assert.deepEqual(
    files,
    ['agent-learning.yml', 'ci.yml', 'release-pr.yml', 'release.yml'],
    'no vuelve a haber un workflow por agente',
  )
})

// Que el workflow no calcule meses: se lee el paso y se comprueba que no le pase `--period` al CLI.
// La mitad de al lado —qué hace el CLI con eso— la mide `agents.test.js`.
test('la consolidación mensual no le nombra un período al CLI', () => {
  const source = workflow('agent-learning')
  assert.match(source, /learn "\$AGENT" --proposal$/m, 'consolida el mes en que corre')
  assert.equal(/--proposal --period/.test(source), false, 'y no le nombra un mes pasado')
  assert.equal(/1 day ago/.test(source), false, 'no queda aritmética de fechas en el workflow')
})

// Cada cron elige su cohorte, y el del ensamblaje no elige ninguna: ese día no se investiga, se
// consolida. Su cadena no está en `POR_CRON` justo por eso, así que `cadence` queda vacía — y la
// condición de corte la leía como «no encontré ningún agente» y abortaba `discover`. Los tres jobs
// dependen de él, así que el ensamblaje entero habría quedado salteado el día 1: sin una sola
// propuesta, sin un PR y sin decir por qué. No se vio nunca porque toda corrida a mano o nombra un
// slug o no trae `schedule`, y el cron del ensamblaje todavía no había corrido.
//
// Lo que decide es si vino de un cron, no si hay cadencia.
test('cada cron elige su cohorte, y el del ensamblaje no aborta por no tener ninguna', () => {
  const source = workflow('agent-learning')
  const dir = tempRoot('cauce-cron-')
  const salida = path.join(dir, 'github-output')
  const roles = JSON.stringify([
    { slug: 'un-semanal', cadence: 'semanal' },
    { slug: 'un-mensual', cadence: 'mensual' },
    { slug: 'un-trimestral', cadence: 'trimestral' },
  ])
  const correr = (env) => {
    const cuerpo = workflowStep(source, 'id: list').replace(/^all=\$\(node .*\)$/m, `all=${JSON.stringify(roles)}`)
    fs.writeFileSync(salida, '')
    const hecho = spawnSync('bash', ['-c', cuerpo], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, ONLY: '', ...env, GITHUB_OUTPUT: salida },
    })
    return { ...hecho, escrito: fs.readFileSync(salida, 'utf8') }
  }

  // Los tres crones que investigan, cada uno con su cohorte y ninguna otra.
  for (const [cron, slug] of [
    ['17 13 * * 1', 'un-semanal'],
    ['17 13 24 * *', 'un-mensual'],
    ['17 13 23 3,6,9,12 *', 'un-trimestral'],
  ]) {
    const hecho = correr({ SCHEDULE: cron })
    assert.equal(hecho.status, 0, `${cron} abortó: ${hecho.stderr}`)
    assert.match(hecho.escrito, new RegExp(`^agents=\\["${slug}"\\]$`, 'm'), `${cron} elige sólo su cadencia`)
  }

  // Y el del ensamblaje, que es el que rompía: lista vacía, sin abortar.
  const ensamblaje = correr({ SCHEDULE: '17 7 1 * *' })
  assert.equal(ensamblaje.status, 0,
    `el cron del ensamblaje abortó discover, y con él los tres jobs que dependen: ${ensamblaje.stderr}`)
  assert.match(ensamblaje.escrito, /^agents=\[\]$/m, 'ese día no se investiga, y eso no es un error')

  // A mano sin slug sigue siendo un error si de verdad no hay cargos: es la única corrida que lo es.
  const vacio = { ...correr({ SCHEDULE: '' }) }
  assert.match(vacio.escrito, /^agents=\["un-mensual","un-semanal","un-trimestral"\]$/m,
    'a mano sin slug van todos, sin mirar cadencia')
})

// La mitad que faltaba. La suite ya afirmaba las dos por separado —que el día del ensamblaje la lista
// sale vacía, y que `propose` gatea por ese cron— y nunca las cruzaba, así que el defecto vivía
// justo en el medio: `propose` iteraba sobre esa misma lista vacía. Una matriz sin valores no corre
// —«Matrix vector 'agent' does not contain any values»—, o sea que el único job que consolida cargos
// no arrancaba el único día que existe para eso. `research` y `propose-flows` ya llevaban la guarda
// `!= '[]'`; `propose` no.
//
// Y no era sólo el día 1: un dispatch con el slug de un recorrido deja la lista de cargos vacía
// igual, que es exactamente para lo que existe el paso `List flows`.
test('el día del ensamblaje propose tiene a quién consolidar, que es cuando agents está vacía', () => {
  const source = workflow('agent-learning')
  const dir = tempRoot('cauce-consolidar-')
  const salida = path.join(dir, 'github-output')
  const roles = JSON.stringify([
    { slug: 'un-semanal', cadence: 'semanal' },
    { slug: 'un-mensual', cadence: 'mensual' },
    { slug: 'un-trimestral', cadence: 'trimestral' },
  ])
  const correr = (env) => {
    const cuerpo = workflowStep(source, 'id: list').replace(/^all=\$\(node .*\)$/m, `all=${JSON.stringify(roles)}`)
    fs.writeFileSync(salida, '')
    const hecho = spawnSync('bash', ['-c', cuerpo], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, ONLY: '', ...env, GITHUB_OUTPUT: salida },
    })
    return { ...hecho, escrito: fs.readFileSync(salida, 'utf8') }
  }

  // Las dos salidas del mismo paso y en la misma corrida: nadie investiga, todos se consolidan.
  const ensamblaje = correr({ SCHEDULE: '17 7 1 * *' })
  assert.match(ensamblaje.escrito, /^agents=\[\]$/m, 'ese día no se investiga')
  assert.match(ensamblaje.escrito, /^consolidate=\["un-mensual","un-semanal","un-trimestral"\]$/m,
    'y consolidar los quiere a todos: con la lista vacía, propose se queda sin matriz')

  // Consolidar no sigue el calendario de nadie, así que un cron de investigación tampoco lo recorta.
  const semanal = correr({ SCHEDULE: '17 13 * * 1' })
  assert.match(semanal.escrito, /^agents=\["un-semanal"\]$/m)
  assert.match(semanal.escrito, /^consolidate=\["un-mensual","un-semanal","un-trimestral"\]$/m,
    'la cadencia elige quién investiga, no quién se consolida')

  // Un slug a mano sí manda, en los dos sentidos.
  const uno = correr({ SCHEDULE: '', ONLY: 'un-mensual' })
  assert.match(uno.escrito, /^consolidate=\["un-mensual"\]$/m, 'un dispatch con slug consolida ése y no los 53')
  const recorrido = correr({ SCHEDULE: '', ONLY: 'change-review' })
  assert.match(recorrido.escrito, /^consolidate=\[\]$/m,
    'un slug que es de recorrido no le da cargos a propose, y ahí no tiene que arrancar')

  // Y el job la usa: la guarda contra el vacío **y** la matriz, que es donde entraba el defecto.
  const bloque = source.split(/^  propose:$/m)[1].split(/^  [a-z-]+:$/m)[0]
  assert.match(bloque, /needs\.discover\.outputs\.consolidate != '\[\]'/,
    'propose no arranca con lista vacía, como research y propose-flows')
  assert.match(bloque, /agent: \$\{\{ fromJSON\(needs\.discover\.outputs\.consolidate\) \}\}/,
    'y su matriz sale de consolidate, no de quién investigó esta semana')
  assert.match(source, /^      consolidate: \$\{\{ steps\.list\.outputs\.consolidate \}\}$/m,
    'discover la declara como salida')
})

// El input `agent` de un dispatch nombra un cargo **o** un recorrido, y los dos pasos que arman las
// matrices corren en orden. El de cargos abortaba con «No existe el agente» apenas su lista quedaba
// vacía, así que un slug de recorrido tiraba el job entero antes de que el paso de recorridos pudiera
// mirarlo: no había forma de disparar uno solo, y la única alternativa era lanzar sin slug, que
// enciende los 53 cargos. Quién decide que un slug no existe es el segundo paso, que es el único punto
// donde se conocen las dos listas.
test('un dispatch puede nombrar un recorrido, y sólo miente un slug que no es ninguno', () => {
  const source = workflow('agent-learning')
  const dir = tempRoot('cauce-dispatch-')
  const salida = path.join(dir, 'github-output')

  // Los dos pasos reales, con la consulta al CLI reemplazada por datos fijos: lo que se mide es el
  // filtro y el corte, no el catálogo, que avanza por su cuenta.
  const correr = (anchor, datos, env) => {
    const cuerpo = workflowStep(source, anchor).replace(/^all=\$\(node .*\)$/m, `all=${JSON.stringify(datos)}`)
    fs.writeFileSync(salida, '')
    const hecho = spawnSync('bash', ['-c', cuerpo], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, ...env, GITHUB_OUTPUT: salida },
    })
    return { ...hecho, salida: fs.readFileSync(salida, 'utf8') }
  }
  const roles = JSON.stringify([{ slug: 'un-cargo', cadence: 'mensual' }])
  const flows = JSON.stringify([{ slug: 'un-recorrido', pending: 2 }])

  // Un slug de recorrido: el paso de cargos ya no aborta, y devuelve la lista vacía que corresponde.
  const cargos = correr('id: list', roles, { ONLY: 'un-recorrido', SCHEDULE: '' })
  assert.equal(cargos.status, 0, `el paso de cargos abortó: ${cargos.stderr}`)
  assert.match(cargos.salida, /^agents=\[\]$/m, 'ningún cargo se llama así, y eso no es un error')

  const recorridos = correr('id: flows', flows, { ONLY: 'un-recorrido', AGENTS: '[]' })
  assert.equal(recorridos.status, 0, `el paso de recorridos abortó: ${recorridos.stderr}`)
  assert.match(recorridos.salida, /^flows=\["un-recorrido"\]$/m, 'y el recorrido sí entra a su matriz')

  // Y un slug que no es ninguno de los dos sigue siendo un error, que es lo que el corte protege.
  const ninguno = correr('id: flows', flows, { ONLY: 'no-existe', AGENTS: '[]' })
  assert.notEqual(ninguno.status, 0, 'un slug inventado tiene que frenar la corrida')
  assert.match(ninguno.stderr, /No existe el agente ni el recorrido "no-existe"/)

  // Un cargo real no se frena por tener la lista de recorridos vacía: es el caso de todos los días.
  const soloCargo = correr('id: flows', flows, { ONLY: 'un-cargo', AGENTS: '["un-cargo"]' })
  assert.equal(soloCargo.status, 0, 'nombrar un cargo no exige que exista un recorrido igual')
  assert.match(soloCargo.salida, /^flows=\[\]$/m)
})

// Consolidar produce dos cosas y el PR tiene que llevar las dos: la propuesta, y el sello sobre lo que
// consumió. Dos fallas distintas se juntaban acá y ninguna tenía prueba.
//
// El pathspec con barra final y comodín —`flows/*/$FLOW/`— no matchea nada, así que los siete
// recorridos morían en «cambió archivos fuera de su propuesta» y ninguno abrió un PR nunca. Y el paso
// de cargos stageaba sólo la propuesta, así que el sello se quedaba en el runner: el informe seguía en
// `draft` en la rama base y el mes siguiente entraba de nuevo, que es contra lo que el sello existe.
test('el PR de una propuesta lleva también el sello de lo que consumió', () => {
  const source = workflow('agent-learning')
  const repo = tempRoot('cauce-staging-')
  const bash = (script) => execFileSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8' }).trim()

  const casos = [
    {
      variable: '$AGENT', env: 'AGENT=probe', dir: 'agents/roles/system/probe',
      consumido: 'learning/reports/2099-01-07.md',
    },
    {
      variable: '$FLOW', env: 'FLOW=probe', dir: 'flows/system/probe',
      consumido: 'evaluations/results/2099-01-07.md',
    },
  ]
  for (const caso of casos) {
    for (const rel of [caso.consumido, 'marca.md']) {
      fs.mkdirSync(path.dirname(path.join(repo, caso.dir, rel)), { recursive: true })
      fs.writeFileSync(path.join(repo, caso.dir, rel), '---\nstatus: draft\n---\n')
    }
  }
  bash('git init -q . && git add -A && git -c user.email=t@t -c user.name=t commit -qm base')

  for (const caso of casos) {
    // El estado que deja `learn --proposal`: la propuesta sin trackear y lo consumido ya sellado.
    const propuesta = path.join(caso.dir, 'learning', 'proposals', '2099-01.md')
    fs.mkdirSync(path.dirname(path.join(repo, propuesta)), { recursive: true })
    fs.writeFileSync(path.join(repo, propuesta), '---\nstatus: proposed\n---\n')
    const sellado = path.join(caso.dir, caso.consumido)
    fs.writeFileSync(path.join(repo, sellado), '---\nstatus: consolidated\n---\n')

    bash(`${caso.env}; period=2099-01\n${staging(source, caso.variable)}`)
    const staged = bash('git diff --cached --name-only').split('\n').filter(Boolean).sort()
    assert.deepEqual(staged, [propuesta, sellado].sort(),
      `${caso.env}: la propuesta y el sello van juntos, y nada ajeno se cuela`)
    bash('git -c user.email=t@t -c user.name=t commit -qm paso')
  }
})
