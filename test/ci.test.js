'use strict'

// Los workflows de GitHub Actions, que comparten la palabra «workflow» con los recorridos de Cauce y
// nada más: acá se prueba la automatización del repositorio —quién puede escribir, qué credencial ve
// cada job, cómo se fijan las acciones—, no lo que un runner ejecuta en una empresa.

const { tempRoot, workflow, workflowStep, workflowCommand } = require('./environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

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

// La cadencia sale de las fuentes de cada cargo y el cron sólo pregunta cuál le toca hoy. Escribirla
// acá como lista de slugs la dejaría mintiendo el día que alguien le cambie las fuentes a un cargo,
// que es el mismo motivo por el que la matriz ya salía del árbol.
// `setup-node` v7 enciende el caché de npm por defecto cuando `package.json` declara `packageManager`,
// y ese caché exige un lock file. Este repo no tiene dependencias —ni una— así que no hay lock, y el
// paso falla entero: el CI se cayó en 16 segundos con el bump. El input ni siquiera existía en v4, así
// que revisar que los inputs que pasábamos siguieran ahí no podía verlo. Lo que se rompe es un default.
test('ningún setup-node deja encendido el caché que este repo no puede alimentar', () => {
  const dir = path.resolve(__dirname, '..', '.github', 'workflows')
  const usos = []
  for (const name of fs.readdirSync(dir).filter((one) => one.endsWith('.yml'))) {
    const lineas = fs.readFileSync(path.join(dir, name), 'utf8').split('\n')
    lineas.forEach((linea, i) => {
      if (!/uses:\s*actions\/setup-node@/.test(linea)) return
      // El bloque `with:` de ese paso: hasta la próxima línea con menos sangría.
      const bloque = []
      for (let j = i + 1; j < lineas.length && (!lineas[j].trim() || lineas[j].startsWith('        ')); j += 1) {
        bloque.push(lineas[j])
      }
      usos.push({
        at: `${name}:${i + 1}`,
        apagado: bloque.some((one) => /package-manager-cache:\s*false/.test(one)),
      })
    })
  }
  assert.ok(usos.length, 'se encontró al menos un setup-node')
  assert.deepEqual(usos.filter((one) => !one.apagado).map((one) => one.at), [],
    'un setup-node sin package-manager-cache: false busca un lock file que no existe')
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

test('la investigación recibe las herramientas que su instrucción nombra, y no más', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
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
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
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
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'agent-learning.yml')
  const source = fs.readFileSync(file, 'utf8')

  // Se mira contenido, y de las secciones que la propuesta mensual consolida.
  assert.match(source, /for seccion in 'Fuentes consultadas' 'Hallazgos'/)
  assert.match(source, /quedó sin contenido en:/, 'y dice cuáles quedaron vacías')
  assert.match(source, /No se abre PR/, 'en vez de publicar un insumo que no existe')
  // El diagnóstico que ahorra la próxima media hora: la causa suele ser un permiso, no el modelo.
  assert.match(source, /una herramienta denegada, no el modelo/)
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

// El número de versión se lee, no se calcula. La regla del repo es «un cambio en el protocolo, en las
// reglas del sistema o en un guard sube minor aunque no toque una sola línea de código», o sea que mide
// qué le cambia a quien recibe el `upgrade` y no qué se tocó acá. Contar `feat:` contra `fix:` se
// equivocaría en las dos direcciones: una regla nueva en `template/` es cero código y sube minor, y tres
// workflows cambiados no mueven nada porque la empresa no los recibe.
test('la versión sale del CHANGELOG y el tag no lo empuja el bot', () => {
  const file = path.resolve(__dirname, '..', '.github', 'workflows', 'release-pr.yml')
  const source = fs.readFileSync(file, 'utf8')

  assert.match(source, /grep -m1 -oE .*CHANGELOG\.md/, 'la versión sale del encabezado más nuevo')
  assert.equal(/npm version|semantic-release|conventional/i.test(source), false,
    'y no de contar commits ni de una herramienta que reescriba el CHANGELOG')

  // El PR toca `package.json` y nada más: si trae otra cosa, alguien empujó a la rama de release.
  assert.match(source, /grep -v -F 'package\.json'/, 'el diff del PR se acota a la versión')

  // El tag lo empuja una persona, y la razón es un mecanismo verificado, no una preferencia: un tag
  // empujado con GITHUB_TOKEN no dispararía `release.yml`, así que automatizarlo pediría un PAT
  // guardado — justo la credencial que `release.yml` evita publicando por OIDC.
  // Se mira lo que se ejecuta, no lo que se escribe: el cuerpo del PR le dice a la persona qué comando
  // correr, así que la cadena `git tag …` aparece en el archivo y no es el bot tagueando. Las líneas del
  // cuerpo empiezan con comilla; las que se ejecutan, no.
  const empuja = source.split('\n').map((one) => one.trim())
    .filter((one) => one.startsWith('git push'))
  assert.deepEqual(empuja, ['git push --force-with-lease origin "$branch"'],
    'lo único que el workflow empuja es la rama del PR')

  // `--force-with-lease` se niega con «stale info» cuando no conoce el estado remoto de la rama, y la
  // rama se crea desde main en cada corrida. Falla justo en la segunda —cuando ya existe allá y no
  // acá—, que es la que importa: la primera pudo haber fallado después de empujarla.
  assert.match(source, /git fetch origin "\$branch"/, 'se trae la referencia antes de empujar con lease')
  // El comentario envuelve, así que se contrasta sobre el texto sin los saltos ni las almohadillas.
  const prosa = source.split('\n').map((one) => one.replace(/^\s*#\s?/, '')).join(' ')
  assert.match(prosa, /will not create a new workflow run/, 'deja escrito por qué, con su cita')
  assert.match(prosa, /docs\.github\.com/, 'y de dónde salió')
  assert.match(source, /Falta el tag/, 'lo que sí hace es avisar cuando la versión quedó sin taguear')

  // Sólo hacia adelante. La condición era «distintas», y con `package.json` por delante del CHANGELOG
  // eso abría un PR que bajaba la versión — proponiendo pisar npm con un número ya publicado.
  assert.match(source, /sort -V \| tail -1/, 'se comparan como versiones, no como cadenas')
  assert.match(source, /va por delante del CHANGELOG/, 'y frena diciendo qué falta')

  // Los tags alcanzan: con `fetch-depth: 0` se traía el repo entero en cada push a main.
  assert.match(source, /fetch-tags: true/)
  // Sobre las líneas que se ejecutan: el comentario nombra `fetch-depth: 0` para decir qué se sacó.
  const opciones = source.split('\n').map((one) => one.trim()).filter((one) => !one.startsWith('#'))
  assert.equal(opciones.some((one) => /^fetch-depth:/.test(one)), false, 'sin clonar la historia completa')
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

// Que el workflow no calcule meses: se lee el paso y se comprueba que no le pase `--period` al CLI.
// La mitad de al lado —qué hace el CLI con eso— la mide `agents.test.js`.
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

// Las dos líneas reales del paso: la que calcula qué cambió y la que lo stagea. Se extraen del
// workflow en vez de reescribirse, porque lo que hay que medir es lo que el job corre — reescribirlas
// mediría la copia, y la copia es justo lo que puede divergir.
// Se ubica por la variable del job y no por el pathspec: buscarlo por su forma correcta haría que
// cambiarla rompiera la búsqueda en vez del resultado, y el rojo diría «no encontré la línea» cuando
// lo que hay que ver es que no se stageó nada.
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

// La release no vuelve a preguntar después del tag, así que sus dos guardas son lo único que separa
// una publicación correcta de una que ya no se puede deshacer: npm no republica una versión. Se
// prueban ejecutándolas, porque lo que falla no es el texto sino lo que el texto hace.
test('la release no publica si el tag y package.json no dicen lo mismo', { skip: process.platform === 'win32' }, () => {
  const step = workflowStep(workflow('release'), 'id: version')
  assert.ok(step.length, 'no se encontró el paso que compara el tag')

  const repo = tempRoot('cauce-release-')
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.2.3' }))
  const run = (ref) => spawnSync('bash', ['-c', step], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REF_NAME: ref, GITHUB_OUTPUT: path.join(repo, 'out') },
  })

  const ok = run('v1.2.3')
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(fs.readFileSync(path.join(repo, 'out'), 'utf8'), /^version=1\.2\.3$/m, 'la versión sale del árbol')

  // El caso que importa: el tag de una versión que el árbol no tiene. Publicarla dejaría npm y la
  // historia contando cosas distintas, y no hay vuelta atrás.
  const wrong = run('v9.9.9')
  assert.notEqual(wrong.status, 0, 'un tag que no coincide detiene la publicación')
  assert.match(wrong.stderr, /no coincide/, 'y dice por qué')
})

// `upgrade` le imprime la entrada del CHANGELOG a quien está por aplicar la versión. Sin entrada, la
// release sale muda y el que actualiza no tiene qué leer antes de que le reemplacen `system/`.
test('la release extrae su entrada del CHANGELOG y se detiene si falta', { skip: process.platform === 'win32' }, () => {
  const step = workflowStep(workflow('release'), 'id: notes')
  assert.ok(step.length, 'no se encontró el paso que extrae la entrada')

  const repo = tempRoot('cauce-notes-')
  fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), [
    '# Changelog', '', '## [1.2.3] - 2099-01-01', '', '### Cambiado', '', '- lo de esta versión', '',
    '## [1.2.2] - 2098-12-31', '', '- lo de la anterior', '',
  ].join('\n'))
  const run = (version) => spawnSync('bash', ['-c', step], {
    cwd: repo, encoding: 'utf8', env: { ...process.env, VERSION: version },
  })

  assert.equal(run('1.2.3').status, 0)
  const notes = fs.readFileSync(path.join(repo, 'notes.md'), 'utf8')
  assert.match(notes, /lo de esta versión/, 'trae su propia entrada')
  assert.equal(notes.includes('lo de la anterior'), false, 'y se corta en la versión siguiente')
  assert.equal(notes.includes('## [1.2.3]'), false, 'sin repetir el encabezado que la release ya pone')

  const missing = run('4.5.6')
  assert.notEqual(missing.status, 0, 'una versión sin entrada no se publica')
  assert.match(missing.stderr, /no tiene entrada/, 'y dice por qué')
})

// Publicar sin NPM_TOKEN es el punto: la credencial es el token OIDC que GitHub emite para esa
// corrida y no sobrevive a ella. Un secreto de npm en este archivo sería volver a lo que se sacó.
test('la release se autentica por OIDC y no guarda un token de npm', () => {
  const source = workflow('release')
  assert.match(source, /^ {6}id-token: write$/m, 'pide el token OIDC del trusted publishing')
  // Sin los comentarios: el archivo explica por qué no hay NPM_TOKEN, y nombrarlo para explicarlo no
  // es usarlo. Lo que la prueba tiene que mirar es lo que el workflow ejecuta.
  const code = source.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n')
  assert.equal(/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./.test(code), false, 'y no hay ningún secreto guardado')
  // El tag es el acto humano que R10 exige. Un `push` a una rama publicaría sin que nadie lo decida.
  assert.match(source, /^ {4}tags: \['v\*'\]$/m, 'sólo un tag dispara la publicación')
  assert.equal(/branches:/.test(source), false, 'ninguna rama publica')
})
