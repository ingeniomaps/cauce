'use strict'

// El banco desechable: una instancia de verdad que nace limpia, se usa una vez y se borra. Vive acá y no
// en `core/` porque lo arma con `scaffold` y `PROJECT_ROOT`, que son del CLI, y `core/` no importa de
// `cli/` en ningún archivo — invertir esa dirección por una herramienta del CLI sería la primera
// excepción a una regla que el repositorio sostiene entero.
//
// Salió de `catalog.js` cuando dejó de tener un solo consumidor: evaluar un cargo necesita un banco, y
// medir cualquier otra cosa también. Lo que se comparte no es la idea sino lo aprendido a los golpes —el
// borrado que se comprueba, el `GIT_DIR` que se limpia, el mantenimiento de git que se apaga—, y eso
// copiado se pudre en una de las dos copias.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const EV = require('../agents/evaluations')
const CL = require('../planning/claims')
const P = require('../planning/parser')
const IN = require('./instance')
const O = require('../core/ownership')
const { fail, opsRoot, TODAY, USAGE } = require('./io')

// Qué decir cuando el banco sobrevivió a su propio borrado, que es lo único que va a permitir
// establecer la causa. Devuelve el mensaje en vez de escribirlo donde ocurre, y eso es lo que lo hace
// medible sin provocar el fallo; por qué eso importa acá lo dice su prueba.
//
// Tres cosas que el listado anterior no traía, y cada una separa dos diagnósticos distintos:
//
// - **Cuánto**, y no una muestra. Cortaba en cinco, así que «borró casi todo y quedaron cuatro objetos»
//   y «no borró nada» se leían idénticos, y son problemas opuestos.
// - **Si lo que quedó es anterior al borrado o se escribió durante.** Posterior significa que alguien
//   reescribió mientras borrábamos; anterior, que el borrado no lo tocó. Es la pregunta central del
//   caso y la contesta la fecha de modificación.
// - **Qué hace un segundo borrado.** No lo rodea: quien lo llama corta igual.
//   Distingue lo transitorio de lo permanente, que se arreglan distinto.
function benchSurvived(dir, since) {
  let files = 0
  let dirs = 0
  const sample = []
  const walk = (base, relative = '') => {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) { dirs += 1; walk(path.join(base, entry.name), next); continue }
      files += 1
      if (sample.length >= 5) continue
      const stat = fs.statSync(path.join(base, entry.name), { throwIfNoEntry: false })
      sample.push(`${next} (${!stat ? 'ya no está'
        : stat.mtimeMs >= since ? 'escrito durante el borrado' : 'anterior al borrado'})`)
    }
  }
  try { walk(dir) } catch { /* el listado es la explicación, no la comprobación */ }
  let again = 'no se pudo reintentar'
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    again = fs.existsSync(dir) ? 'un segundo borrado tampoco lo sacó' : 'un segundo borrado sí lo sacó'
  } catch (error) { again = `un segundo borrado lanzó ${error.code || error.message}` }
  return `${dir} no se pudo borrar entero y el banco tiene que ser nuevo. Sobrevivieron ${files} `
    + `archivo(s) en ${dirs} directorio(s), con Node ${process.version}: `
    + `${sample.join(', ') || '(sólo directorios)'}. ${again}. Borralo a mano y volvé a correr.`
}

// Borrar el banco y comprobar que se borró, que es una sola decisión: lo que no desapareció contamina la
// medición que viene. Devuelve el motivo en vez de cortar —quien corta es el comando— y así se puede medir.
//
// **El destino se comprueba antes de destruir** (R23). `dir` lo arma este archivo a partir de nombres ya
// validados, así que hoy no puede apuntar afuera; la comprobación existe porque el costo de que algún día
// pueda no es un resultado incorrecto sino trabajo perdido, y porque una ruta peligrosa se construye sola
// a partir de algo vacío. Se niega nombrando la ruta y contra qué la comparó.
//
// `remove` se inyecta porque **la condición que la comprobación de abajo existe para atrapar no se puede
// provocar con el sistema de archivos real**: es el caso 078, y sin ese hueco la línea que decide se
// quedaba sin una sola prueba —comprobado: borrarla no ponía nada en rojo—. Con un borrado que no borra,
// la rama se ejerce en milisegundos y sobre un temporal que la prueba acaba de crear.
function clearBench(dir, scratch, remove = fs.rmSync) {
  const target = path.resolve(dir)
  const benchRoot = path.resolve(scratch)
  if (!target.startsWith(benchRoot + path.sep)) {
    return `no se borra ${target}: no cuelga de ${benchRoot}, así que no es un banco de evaluación.`
  }
  // El instante de arranque, para poder fechar lo que sobreviva: es lo único que separa un archivo que el
  // borrado no tocó de uno que alguien reescribió mientras borrábamos.
  const since = Date.now()
  // Con reintentos. Los puso el `ENOTEMPTY` que aparecía al rehacer un banco recién creado, y hoy se sabe
  // que eso era el mantenimiento de git escribiendo por detrás (caso 073). Se quedan porque son lo único
  // que corre **antes** de la comprobación: cubren a cualquier otro escritor transitorio, no a éste, que
  // está apagado.
  remove(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  return fs.existsSync(target) ? benchSurvived(target, since) : null
}

// Un solo autor para todo banco desechable. Eran tres literales para lo mismo —el de evaluación, el de
// medición y el del producto del sidecar—, ninguna prueba los afirmaba y la distinción no distinguía nada:
// el commit es andamiaje, y quien mira `git log` de un banco busca qué escribió el cargo, no quién firmó.
const AUTHOR = 'banco de cauce'

// Armar el banco, que es lo que el de evaluación y el de medición comparten: de acá vuelve un directorio
// que no existía hace un instante, con una instancia adentro y git listo para versionarla. Lo que cambia
// entre medir un cargo y medir un comando es **qué queda adentro**, no cómo se lo prepara.
//
// Recrear un banco donde alguien ya trabajó borra la evidencia de esa corrida, y el registro de una
// evaluación se escribe **desde** el banco. Pasó de verdad: se rehizo un banco para probar otra cosa y
// con él se fue lo que el cargo había escrito; el juez leyó un directorio vacío y concluyó que la
// respuesta afirmaba algo inexistente. Con el banco versionado, «acá se trabajó» es una pregunta que git
// contesta exacto.
function makeBench(root, dir, force, name) {
  const dirty = spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' })
  if ((dirty.stdout || '').trim() && !force) {
    fail(`${dir} tiene trabajo sin recoger. Guardá lo que esa corrida dejó antes de rehacerlo, `
      + 'o usá --force si ya lo tenés.', USAGE)
  }
  // Rodear un borrado a medias deja la corrida siguiendo sobre un banco que no es nuevo, y lo que falla
  // después no dice nada del borrado: el test que lo destapó reportaba `true !== false` sobre un archivo
  // de la corrida anterior, sin nombrar de dónde salía. Esta guarda es la que estableció la causa —su
  // primer disparo instrumentado nombró al escritor—; lo que cubre ahora es que aparezca otro.
  //
  // **Y de acá para abajo el directorio no existe.** Eso es lo que sostiene que el andamiaje y el enlace
  // se escriban sin defensas: hasta el 073, los dos llevaban una por si algo sobrevivía al borrado.
  const problema = clearBench(dir, path.join(root, '.cauce-eval'))
  if (problema) fail(problema, USAGE)
  // Sin `force`, y eso es lo que hay que poder decir: sólo servía si algún archivo sobrevivía al borrado,
  // y la comprobación de arriba garantiza que no queda ninguno. Lo llevaba porque el mismo test falló tres
  // veces en un día con «El destino contiene …/AGENTS.md», y eso era el escritor de fondo que apagó el 073.
  IN.scaffold(dir, { name, mode: 'sidecar', quiet: true })
  // El motor por symlink: la misma resolución que en una instancia real —`node_modules/@ingeniomaps`—
  // sin pagar un `npm install` por corrida. Quien use el banco llega a un lugar donde el CLI funciona.
  //
  // Y el enlace se crea sin borrarlo antes, por lo mismo que el andamiaje: `scope` acaba de nacer dentro
  // de un directorio que no existía, así que no puede haber un enlace que pisar. El `rm` que había acá era
  // el tercer rodeo del mismo escritor de fondo, y el que falló en CI con `EEXIST`.
  const scope = path.join(dir, 'node_modules', '@ingeniomaps')
  fs.mkdirSync(scope, { recursive: true })
  fs.symlinkSync(IN.PROJECT_ROOT, path.join(scope, 'cauce'), 'dir')
  // El git del banco, sin herencia. `-C` dice dónde mirar y `GIT_DIR` gana igual —comprobado: con `GIT_DIR`
  // puesto, `git -C otro rev-parse --absolute-git-dir` contesta el de la variable—, así que sin limpiarla
  // el banco commitea en el repositorio que la haya exportado. Es lo que hizo el caso 045 antes de
  // arreglarse en `hooks/shell.js`: el banco de una evaluación dejó sus commits en la rama del usuario.
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  return { env, git: (...args) => spawnSync('git', ['-C', dir, ...args], { stdio: 'ignore', env }) }
}

// Versionar el banco desde su estado limpio. Lo que garantiza: todo lo que aparezca después es obra de
// quien usó el banco, y `git status` lo separa del andamiaje sin que nadie tenga que acordarse de qué
// había antes. Por qué eso decide un veredicto lo mide `bench.test.js`, que trae el caso con nombre y
// fecha. Se ignora `node_modules`: es un symlink al toolkit, no obra de nadie.
//
// Y se le apaga el mantenimiento automático, que es el escritor de fondo que rompía el borrado del banco
// siguiente. `git commit` lanza `git maintenance run --auto`, que se detacha y sigue escribiendo en
// `.git/objects` después de que el comando ya volvió; el banco se rehace milisegundos más tarde y el
// `rmSync` corre contra alguien que está escribiendo ahí.
//
// Es lo que produjo los tres síntomas que se venían rodeando por separado —`ENOTEMPTY`, `EEXIST`, y el
// borrado que vuelve sin lanzar y deja archivos—. La guarda lo nombró el 2026-09-10: `maintenance.lock`
// entre los sobrevivientes, y `info/refs` y `objects/info/packs` fechados **durante** el borrado, en un
// árbol que ninguna otra prueba toca (caso 073).
//
// `maintenance.auto=false` y no `gc.auto=0`: medido con `GIT_TRACE=1`, el segundo deja que el commit
// lance el mantenimiento igual —sólo hace que su tarea de `gc` no encuentre trabajo— y el proceso toma su
// lock y escribe lo mismo. Se le quita el motivo de lanzarlo, no lo que hace una vez lanzado.
function seal(dir, git, mensaje) {
  fs.appendFileSync(path.join(dir, '.gitignore'), '\nnode_modules/\n')
  git('init', '-q')
  git('config', 'user.email', 'banco@cauce.local')
  git('config', 'user.name', AUTHOR)
  git('config', 'maintenance.auto', 'false')
  git('add', '-A')
  git('commit', '-q', '-m', mensaje)
}

// Un banco de trabajo desechable donde un cargo del catálogo puede realmente trabajar.
//
// Hace falta porque el toolkit no es una raíz ops: el único `planning/` que vive acá es
// `template/planning`, el molde que se distribuye. Un cargo cuya entrega es una épica no tiene dónde
// escribir, así que se niega —con razón—, y su caso cuenta como fallo: eso midió una configuración.
//
// Uno por caso, y se aprendió corriendo: con un banco compartido los casos se leen entre sí, y uno
// tomó por «una sesión anterior de este mismo cargo» lo que otro acababa de escribir. La
// independencia entre casos es la premisa de medir con ellos.
//
// Se recrea entero en cada corrida —si no, lo que escribió el lunes es contexto del martes— y queda
// en disco, gitignorado: después de un veredicto raro uno quiere mirar qué escribió el cargo.
function evaluationBench(root, agent, caso, force, kind) {
  const safe = (value) => {
    if (!/^[a-z0-9_][a-z0-9._-]*$/i.test(value) || value.includes('..')) {
      fail(`nombre inválido para el banco: ${value}`, USAGE)
    }
    return value
  }
  const dir = path.join(root, '.cauce-eval', safe(agent), safe(caso || '_libre'))
  const { git } = makeBench(root, dir, force, 'Banco de evaluación')

  // El artefacto del caso, si lo tiene: la guía del proveedor que el pedido manda implementar, el CSV
  // con instrucciones adentro. Entra antes del commit limpio a propósito — si entrara después, `status`
  // se lo atribuiría al cargo y el juez leería como obra suya el documento que vino a resistir.
  if (caso) {
    const fixture = EV.fixtures(root, agent, caso, kind)
    if (fixture.files.length) fs.cpSync(fixture.dir, dir, { recursive: true })
  }

  seal(dir, git, 'banco limpio')
  return dir
}

// Los escenarios que una medición necesita montados, y no un banco vacío que cada una vuelva a poblar a
// mano. De cinco bancos improvisados en una sesión, tres no midieron nada: uno con un `BACKLOG.md` cuya
// línea el parser no acepta —`hasTasks` daba `false` y el guard medido salía por la puerta del día uno—,
// otro sin control. Un banco que no enciende se lee igual que uno que mide, y eso no lo dice ninguna
// salida: lo dice la ausencia de lo que se esperaba ver.
//
// Son tres porque son las tres formas en que una medición necesita el mundo, y cada una se agrega cuando
// hace falta, no antes:
//
// - `suelto`: la instancia sola. Para medir un comando que no depende de la cola.
// - `tarea`: con una tarea en cola, reclamada y con plan. Para los guards que miran ese estado.
// - `sidecar`: instancia y producto en repositorios distintos, que es lo que hace falta para medir algo
//  cuyo resultado depende de desde qué árbol se pregunte — ahí `runner()` resuelve un id distinto.
const SCENARIOS = ['suelto', 'tarea', 'sidecar']

// La línea de tarea tal como el parser la acepta, copiada del molde y no inventada: sin la aceptación
// entre guiones bajos no es una tarea para `taskFromLine`, y el banco nacería mudo.
const BACKLOG = `# Backlog promovido

## Hito medicion — Lo que esta medición necesita en cola

- [ ] **tarea-medida** [lite] — Resultado a construir. _Aceptación: conducta observable._ (service: app)
`

// Poblar el banco según el escenario. Devuelve nada: lo que importa queda en disco, y quien lo llama ya
// tiene la ruta.
function populate(dir, scenario, git) {
  if (scenario === 'suelto') return
  const planning = path.join(dir, 'planning')
  fs.writeFileSync(path.join(planning, 'BACKLOG.md'), BACKLOG)
  if (scenario === 'tarea') {
    // Reclamo y WIP escritos acá y no con `ops claim`: el comando resuelve el runner desde el entorno, y
    // un banco tiene que nacer igual lo corra quien lo corra. El id es el del banco, que es lo que
    // `readWip` va a buscar.
    const runner = dir
    fs.mkdirSync(path.join(planning, 'claims'), { recursive: true })
    fs.writeFileSync(path.join(planning, 'claims', 'tarea-medida.md'),
      CL.content({ task: 'tarea-medida', owner: 'banco@cauce.local', runner, started: TODAY(), service: 'app' }))
    fs.mkdirSync(path.join(planning, 'wip'), { recursive: true })
    fs.writeFileSync(path.join(planning, 'wip', `${P.wipName(runner)}.md`),
      '---\ntask: tarea-medida\nphase: Build\nservice: app\nlane: lite\n---\n\n'
      + '## Plan aprobado\n1. [x] Leer lo que hay\n2. [ ] Construir lo medido\n')
    return
  }
  // `sidecar`: el producto es un repositorio aparte, con su propio `.git`. Sin eso los dos lados resuelven
  // el mismo id y el defecto que se quiere medir no aparece — pasó al reproducir el caso 152.
  //
  // Y va **dentro** del banco, no al lado. Afuera quedaba fuera de lo que `clearBench` alcanza, así que la
  // instancia nacía limpia y su producto seguía con la historia de la corrida anterior: un banco a medias,
  // que es peor que ninguno porque se lee como nuevo. Medido rehaciéndolo dos veces — la marca de la
  // primera sobrevivía y el conteo de commits no se movía.
  const app = path.join(dir, 'app')
  fs.mkdirSync(path.join(app, 'src'), { recursive: true })
  fs.writeFileSync(path.join(app, 'src', 'app.js'), 'module.exports = 1\n')
  const config = path.join(dir, 'ops.config.json')
  const declared = JSON.parse(fs.readFileSync(config, 'utf8'))
  declared.workspaceRoots = [{ name: 'app', path: path.relative(dir, app) }]
  fs.writeFileSync(config, `${JSON.stringify(declared, null, 2)}\n`)
  const suyo = (...args) => spawnSync('git', ['-C', app, ...args], { stdio: 'ignore', env: git.env })
  suyo('init', '-q')
  suyo('config', 'user.email', 'banco@cauce.local')
  suyo('config', 'user.name', AUTHOR)
  suyo('config', 'maintenance.auto', 'false')
  suyo('add', 'src/app.js')
  suyo('commit', '-q', '-m', 'producto del banco')
}

// El banco de una medición. Vive junto al de evaluación —un solo lugar desechable, un solo gitignore, y
// `clearBench` ya se niega a borrar fuera de ahí— y se distingue por el escenario, que es lo que lo puebla.
function measurementBench(root, scenario, force) {
  if (!SCENARIOS.includes(scenario)) {
    fail(`escenario desconocido: ${scenario || '(ninguno)'}. Hay ${SCENARIOS.join(', ')}.`, USAGE)
  }
  const dir = path.join(root, '.cauce-eval', '_medicion', scenario)
  const { env, git } = makeBench(root, dir, force, `Banco de medición (${scenario})`)
  populate(dir, scenario, { env })
  seal(dir, git, `banco de medición: ${scenario}`)
  return dir
}

// El comando. Vive acá y no en `catalog.js` porque medir no es evaluar un cargo: comparten el banco y
// nada más.
//
// Se niega fuera del toolkit por la misma razón que `--bench`: en una empresa lo que hay que medir es su
// propia instancia, y fabricar una al lado mediría el molde en vez del proyecto. Y la ruta se imprime
// **relativa** a la raíz por la misma razón que la de `--bench`, que está escrita donde nació, en
// `catalog.js`.
function bench(scenario, cli) {
  const root = opsRoot()
  if (O.mode(root) !== 'toolkit') {
    fail('ops bench es del toolkit: arma un banco desechable para medir a Cauce. En una instancia, lo '
      + 'que se mide es tu propio proyecto — corré el comando que quieras medir sobre tu planning/.', USAGE)
  }
  const dir = measurementBench(root, scenario, cli.has('--force'))
  console.log(path.relative(root, dir))
  // El id con el que el banco escribió su plan, porque quien mida lo necesita y deducirlo es la clase de
  // paso que se hace mal en silencio: sin él, `context` contesta sobre otro runner y la medición mide
  // otra cosa.
  //
  // Va por `stderr` y no por `stdout`, a diferencia de `ops worktree` y `ops claim`: aquéllos le hablan a
  // una persona, y **esta salida es entrada de otra cosa**. Puesto en `stdout` el comando pasó a imprimir
  // dos líneas, y quien resolvía la ruta se quedó con las dos concatenadas — la misma forma del caso 080,
  // donde una salida que no era la ruta se trató como ruta.
  if (scenario === 'tarea') console.error(`  export CAUCE_RUNNER=${dir}`)
}

// Sólo lo que otro módulo consume. `measurementBench`, `populate` y `SCENARIOS` se quedan adentro: los
// ejercita el comando, que es como se los usa de verdad, y exportarlos para poder probarlos por separado
// habría dejado superficie que nadie llama — que es lo que `dead-code` frena.
module.exports = { benchSurvived, clearBench, evaluationBench, bench }
