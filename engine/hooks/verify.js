'use strict'

// Correr los gates que un commit tiene que pasar, y sobre qué versión del trabajo correrlos.
//
// Salió de `shell.js` —donde estaban los seis guards del grupo `pre-shell`— porque no comparte nada con
// el juicio del texto de un comando: ni una regla, ni el léxico del shell. Lo único que cruza es `run`.
// Y cambia por otra causa: acá mueven las herramientas —qué prefijo de entorno lee pnpm, cómo marca cada
// runner una prueba roja—, allá mueven las evasiones que alguien encuentra.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { commandOf, cwdOf, block, isCommit, stagedForCommit, opsRoot, configOf } = require('./input')
const AP = require('./approval')
const EV = require('../core/evidence')
const SC = require('../core/scope')
const { run } = require('./shell')

// Salidas de build y cachés que cualquier gate rehace solo. Se comparan contra el nombre entero de la
// entrada para que valga también anidado —`packages/app/dist`—, y con el separador de `git status`, que
// siempre usa `/`.
const RECREABLE = new RegExp('(^|/)(?:dist|build|out|coverage|__pycache__'
  + '|\\.next|\\.nuxt|\\.svelte-kit|\\.turbo|\\.output|\\.parcel-cache|\\.pytest_cache)$')

// Dónde tiene que correr un gate: sobre lo que el commit va a grabar, que es el índice y no el árbol.
// El árbol se le parece casi siempre y por eso el error no se veía — puede tener encima otra versión de
// un archivo staged, y puede tener uno sin trackear que el commit no lleva, que es el olvido de
// `git add` de toda la vida. En los dos casos el verde se calcula sobre un código que nadie va a
// commitear, y queda escrito como si fuera el del commit.
//
// Cuando árbol e índice coinciden, el árbol **es** el próximo commit y correr donde está no cuesta nada.
// Sólo cuando difieren se materializa el índice: `checkout-index` sobre un temporal, medido en 157 ms
// para las mil quinientas rutas de este repositorio, contra los segundos que tarda cualquier gate.
//
// Lo ignorado viaja por enlace y lo sin trackear no, y esa distinción es la mitad del arreglo:
// `node_modules` o `.venv` son entorno que el commit no lleva y sin ellos no corre ningún gate, mientras
// que un fuente sin agregar es justamente lo que hay que ver fallar. `git status --ignored` ya los
// separa en `!!` y `??`, así que no hay que adivinar cuál es cuál.
//
// No se usa `git stash --keep-index`, que sería más corto: toca el árbol de quien está trabajando, y un
// gate que muere a la mitad le deja el stash puesto.
function commitTree(dir, input) {
  const status = run('git', ['-C', dir, 'status', '--porcelain', '--ignored'], dir)
  if (!status.ok) {
    block(`no se pudo leer el estado de ${dir}, así que no hay cómo saber qué va a grabar el commit.`)
  }
  const lines = status.output.split('\n').filter(Boolean)
  const delta = lines.filter((line) => !line.startsWith('!!') && line[1] !== ' ')
  if (!delta.length) {
    return { root: dir, temp: null, env: {} }
  }
  // La de arriba pregunta *si hay* delta; ésta, *qué* delta: lo que ninguna puerta lee no puede cambiar
  // su veredicto, y ahí el árbol vuelve a servir. Las reglas y el porqué viven en `core/scope.js`; sin
  // una raíz que declare su alcance esto no cambia nada (caso 156).
  //
  // La raíz ops no es `dir` —una instancia sidecar las tiene separadas—, así que se resuelve como en el
  // resto de los guards en vez de suponer un `ops.config.json` colgando del repositorio: deducir el
  // layout en lugar de leer el declarado es lo que costó el caso 158.
  const ops = opsRoot(input)
  if (SC.staysInTree(ops ? configOf(ops).workspaceRoots : [], dir, delta)) {
    return { root: dir, temp: null, env: {} }
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-verify-'))
  const written = run('git', ['-C', dir, 'checkout-index', '-a', `--prefix=${temp}${path.sep}`], dir)
  if (!written.ok) {
    fs.rmSync(temp, { recursive: true, force: true })
    block(`no se pudo materializar el índice de ${dir} para correr los gates: ${written.output}`)
  }
  const linked = []
  for (const line of lines) {
    if (!line.startsWith('!! ')) continue
    const name = line.slice(3).trim().replace(/\/$/, '')
    // Lo que el gate puede fabricar no se le enlaza: lo construye adentro de la copia y se descarta con
    // ella. Enlazarlo hacía dos daños a la vez. Uno es del usuario: el gate corre sobre el índice, así
    // que le dejaba la salida de build con la versión **staged** mientras su fuente en disco tenía otra,
    // y nada lo decía —medido con un `dist/` que pasó de «lo-que-estoy-editando» a «staged» (caso 069)—.
    // El otro es del propio gate: construía sobre restos de la corrida anterior del usuario, así que su
    // veredicto dependía de un estado que nadie declaró.
    //
    // La lista envejece y eso pesa menos de lo que parece, porque sólo se aplica a rutas que git ya
    // marcó como ignoradas: un `dist/` ignorado es generado por definición. Errarle por defecto —que
    // falte un nombre— deja el comportamiento de antes; errarle por exceso hace que un gate reconstruya,
    // que es más lento y no incorrecto. Lo que **sí** se enlaza es lo que un gate no puede fabricar:
    // `node_modules`, un `.env`, las credenciales de una herramienta.
    if (RECREABLE.test(name)) continue
    const link = path.join(temp, name)
    if (fs.existsSync(link)) continue
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync(path.join(dir, name), link, 'junction')
    linked.push(name)
  }
  // Un índice materializado no trae `.git`, y un gate que llama a git —listar lo trackeado— falla ahí
  // por no encontrarlo: el guard frenaría un commit correcto por su propia mecánica. La copia se vuelve
  // un repositorio propio, con su índice cargado desde lo que se acaba de materializar, así que `git`
  // contesta sobre lo que el commit va a grabar.
  //
  // Antes esto se resolvía exportando `GIT_DIR` del repositorio de verdad, y ahí el gate que **escribe**
  // con git escribía en él: la suite de un proyecto levanta repositorios de prueba y les commitea, y
  // esos commits caían en la rama del usuario junto con un `core.worktree` apuntando a un temporal ya
  // borrado. Nada lo anunciaba (caso 045).
  //
  // Lo que se pierde a cambio, y son dos cosas. La copia no tiene historia, así que un gate que lea una
  // etiqueta o un `git log` no la encuentra: falla y se ve. Y un gate cuyo efecto ES una escritura de
  // git —taggear, commitear un lockfile regenerado— la hace sobre la copia, que se borra: ese efecto se
  // pierde en silencio. Se elige el silencio de acá sobre el de antes, que era escribir en la rama de
  // quien commitea; un proyecto con un gate así tiene que sacar esa escritura del gate.
  const started = run('git', ['init', '--quiet'], temp)
  // Lo enlazado es entorno y no entra al índice de la copia, y el `.gitignore` no alcanza para eso: un
  // patrón con barra final sólo cubre directorios, y un enlace no lo es para git. `add --all` lo agregaba
  // y un gate que recorre lo trackeado lo leía como archivo del commit (caso 095).
  if (started.ok) {
    fs.mkdirSync(path.join(temp, '.git', 'info'), { recursive: true })
    fs.appendFileSync(path.join(temp, '.git', 'info', 'exclude'),
      linked.map((name) => `/${name.replace(/[\\*?[\]]/g, '\\$&')}\n`).join(''))
    run('git', ['add', '--all'], temp)
  }
  // Un gate no sólo lee su entorno: escribe en él. Lo ignorado se enlaza al original —eso es a propósito
  // y está arriba—, así que lo que el gate escriba cae en el árbol de quien commitea. Un gestor que se
  // sincroniza antes de correr un script lo lleva al extremo: ve que el árbol enlazado no coincide con
  // el lockfile de la copia y reinstala, lo que **empieza borrando** el `node_modules` del proyecto.
  //
  // Lo que se apaga es esa comprobación previa, que es el motivo por el que quiere tocar nada.
  // `verify-deps-before-run` la gobierna y tiene cinco valores —`install`, `warn`, `prompt`, `error` y
  // `false`—. El que hace el daño es `install`, que reinstala solo y es el default desde pnpm 11. `error`
  // tampoco serviría: frena el gate cuando el lockfile de la copia difiere de lo instalado, que es justo
  // lo que pasa al commitear un cambio de lockfile por partes. La copia no tiene que sincronizar nada:
  // tiene que medir el código.
  //
  // El prefijo es `pnpm_config_` y no `npm_config_`, y esa sola palabra es la diferencia entre apagar la
  // comprobación y no apagar nada: pnpm lee sus ajustes del entorno con su propio prefijo, así que con el
  // de npm la variable llega igual y se ignora en silencio. Acá estuvo `npm_config_` desde el arreglo del
  // 070 y no surtió efecto nunca (caso 151), con lo cual la protección que ese arreglo creyó poner no
  // estuvo puesta. Medido sobre pnpm 10.30.2 y 11.20.0, iguales las dos.
  //
  // Acá estuvo `CI: 'true'` y fue una regresión (caso 070). Resolvía el síntoma del 068 —pnpm dejaba de
  // preguntar antes de purgar— desarmando la confirmación en vez de quitarle el motivo, y esa
  // confirmación era lo único que protegía al `node_modules` del proyecto: sin ella la reinstalación
  // avanza y borra por el enlace. Además encendía `frozen-lockfile`, que el propio pnpm anuncia al
  // fallar, así que la variable armaba y desarmaba guardas distintas a la vez.
  //
  // La regla que queda: no se desarma la confirmación de una herramienta, se le quita el motivo de
  // preguntar. Una confirmación que estorba casi siempre está cuidando algo.
  return { root: temp, temp, env: { pnpm_config_verify_deps_before_run: 'false' } }
}

// Dónde viven la consulta de sqlc y su generado lo declara cada proyecto en su config (`queries:` y
// `gen.go.out`), y acá no se lee: no hay parser de YAML y no se agrega uno para un guard. Lo que se usa
// en su lugar son dos hechos que no dependen del layout.
//
// La consulta se busca en `queries/` a cualquier profundidad —un monorepo la tiene en `api/db/queries/`
// (caso 192)—, y sólo cuenta si el repositorio tiene un `sqlc.yaml`, `sqlc.yml` o `sqlc.json`, los tres
// nombres que sqlc busca: sin esa condición, desanclar el patrón frenaría consultas de un reporte o
// fixtures que nadie genera, y cada freno falso se resuelve aprobándolo. Un `queries:` con otro nombre de
// carpeta sigue sin verse.
//
// El generado se reconoce por el nombre del archivo, no por su carpeta: sqlc escribe `<consulta>.sql.go`
// donde diga `out`, y esperar una carpeta `sqlc/` frenaba al que la llamó de otro modo (caso 187). La
// carpeta queda como respaldo. `.ts` o `.py` no: esos generadores son plugins y su nombre no se comprobó.
const SQL_SOURCE = /(?:^|\/)queries\/.*\.sql$/i
const SQL_GENERATED = /\.sql\.go$|(?:^|\/)(?:sqlc|generated)(?:\/|.*\.(?:go|ts|js|py)$)/i
function usesSqlc(dir) {
  // `top` porque `dir` puede ser un subdirectorio y el índice se pregunta entero; `glob` para que `**/`
  // alcance también la raíz. Se lee el índice y no el disco: una config sin trackear no es del proyecto.
  // Si git no contesta se asume que sí: un guard que no pudo mirar no afloja.
  const listed = run('git', ['-C', dir, 'ls-files', '--',
    ...['yaml', 'yml', 'json'].map((ext) => `:(top,glob)**/sqlc.${ext}`)], dir)
  return !listed.ok || Boolean(listed.output.trim())
}

// Una especificación OpenAPI se reconoce por lo que declara y no por la carpeta: `api/` guarda también la
// config de sqlc, un compose o fixtures, y cada uno pedía regenerar un cliente que no existe (caso 197). La
// carpeta queda como filtro barato antes de leer nada. Un fragmento de una especificación partida con `$ref`
// no declara nada, así que cuenta si su carpeta de primer nivel tiene en el índice una raíz que sí lo haga.
// Se lee el índice y no el disco, que es lo que el commit graba. Si git no contesta, dispara: un guard que
// no pudo mirar no afloja.
const OPENAPI_CANDIDATE = /^(?:(?:openapi|api|spec)\/(?:.*\/)?[^/]+|openapi|swagger)\.ya?ml$/i
const OPENAPI_ROOT = /^(?:openapi|swagger)\s*:/m

function declaresOpenApi(dir, file) {
  // Un archivo borrado figura como cambio y ya no está en el índice: lo que era se lee en `HEAD`.
  for (const revision of ['', 'HEAD']) {
    const shown = run('git', ['-C', dir, 'show', `${revision}:${file}`], dir)
    if (shown.ok) return OPENAPI_ROOT.test(shown.output.slice(0, 4096))
  }
  return true
}

function changedOpenApiSpec(dir, staged) {
  const candidates = staged.filter((file) => OPENAPI_CANDIDATE.test(file))
  if (candidates.some((file) => declaresOpenApi(dir, file))) return true
  for (const folder of new Set(candidates.filter((file) => file.includes('/')).map((file) => file.split('/')[0]))) {
    const listed = run('git', ['-C', dir, 'ls-files', '--', `:(top,glob)${folder}/**/*.yaml`,
      `:(top,glob)${folder}/**/*.yml`], dir)
    if (!listed.ok) return true
    if (listed.output.split('\n').filter(Boolean).some((file) => declaresOpenApi(dir, file))) return true
  }
  return false
}

function verify(input) {
  if (process.env.OPS_SKIP_VERIFY === '1') return
  const command = commandOf(input)
  if (!isCommit(command)) return
  const { dir, staged } = stagedForCommit(command, cwdOf(input))
  const changedOpenApi = changedOpenApiSpec(dir, staged)
  const changedSqlSource = staged.some((file) => SQL_SOURCE.test(file)) && usesSqlc(dir)
  const hasApiGenerated = staged.some((file) => /(?:^|\/)[^/]*(?:generated|\.gen)\.(?:go|ts|js|py)$/i.test(file))
  const hasSqlGenerated = staged.some((file) => SQL_GENERATED.test(file))
  // Acá lo aprobado es el conjunto staged entero: decir «autorizo commitear exactamente estas rutas»
  // es lo que un gate en rojo necesita, y cambia en cuanto se stagea una más. La lista sale del índice
  // y no de una regla, que es lo que la vuelve una operación y no un permiso.
  const unapproved = AP.pendingNow(opsRoot(input), staged, input)
  const approved = !unapproved.length
  if (changedOpenApi && !hasApiGenerated && !approved) {
    block('Cambió una fuente OpenAPI/Swagger sin incluir código regenerado. Ejecuta el generador y '
      + `stagea su salida.\n${AP.HOW('OPS_SKIP_VERIFY', unapproved, input)}`)
  }
  if (changedSqlSource && !hasSqlGenerated && !approved) {
    block('Cambió una consulta SQL fuente sin artefactos regenerados: busqué en el índice un `*.sql.go`, '
      + 'o algo bajo una carpeta `sqlc/` o `generated/`, y no hay ninguno. Si corriste `sqlc generate`, '
      + 'stageá lo que escribió; si su `output_files_suffix` le cambia el nombre, esto no lo reconoce.\n'
      + AP.HOW('OPS_SKIP_VERIFY', unapproved, input))
  }
  if (!staged.some((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs|go|py|html|css|scss|prisma)$/.test(file))) return
  const { root, temp, env } = commitTree(dir, input)
  try {
    verifyGates(root, dir, unapproved, env, input)
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true })
  }
}

// Corre lo que el stack declare y bloquea si algo sale en rojo. `root` es dónde corre —el índice
// materializado o el árbol, que ahí son lo mismo— y `dir` es el repositorio, que es el nombre que le
// dice algo a quien lee el mensaje.
//
// Cada gate deja su rastro en `ops`; para qué sirve ese registro lo dice `core/evidence.js`. Lo que se
// decide acá es que el rojo se anota igual que el verde: un gate que falló y se commiteó con
// aprobación es exactamente lo que alguien va a querer ver después.
// Lo que se sabe de un gate que falló, en la forma en que se va a leer. El mensaje decía sólo
// `test (exit 1)` y tiraba la salida de la herramienta: cualquier causa —una suite en rojo, un gestor
// que se negó a arrancar el script, un binario que no está— llegaba con el mismo texto. Es la misma
// forma de fallar que el caso 066 encontró en una prueba, acá en el mensaje que lee una persona.
//
// Se muestra **una** línea y acotada: la salida de un gate puede traer cualquier cosa del entorno, y lo
// que hace falta para diagnosticar es la primera línea de error, no el volcado.
const ERROR_LINE = /error|err[_!]|fail|abort|not found|cannot|no such/i
// Cómo marca un reporte de pruebas cada resultado. Van sólo las comprobadas contra la herramienta (caso
// 094): el nombre de una prueba verde puede decir «error», y sin mirar la marca la búsqueda por palabra se
// quedaba con ella y el mensaje escondía la roja. Comprobadas con la salida entubada, como la ve un gate:
// `node --test` en spec y en TAP (Node 24.18.0), `go test` (go 1.26.3), jest 30.5.1 (`● nombre`, y
// `● Test suite failed to run`), vitest 5.0.0 (`× nombre`), mocha 12.0.1 (`1) nombre`; la verde es `✔`) y
// pytest 9.1.1 (`FAILED archivo::prueba` en el resumen; `::prueba PASSED` la verde con `-v`). Jest y vitest
// no imprimen las verdes sin `--verbose`, así que de ellos no hay marca de éxito.
const FAILED_TEST = /^(?:✖|not ok\b|--- FAIL:|● |× |\d+\) |FAILED )/
const PASSED_TEST = /^(?:✔|ok\b|--- PASS:)|::\S+ PASSED\b/
const MAX_LINE = 160
function failure(gate, result) {
  // La línea que empieza con `>` es el eco del script que npm y pnpm imprimen antes de correrlo, así
  // que lleva el comando entero y no dice nada de qué falló. Descartarla es lo que hace que la primera
  // coincidencia sea el error y no el comando — con el eco adentro, un script que **menciona** una
  // palabra de error gana siempre.
  const lines = (result.output || '').split('\n').map((one) => one.trim())
    .filter((one) => one && !one.startsWith('>'))
  const line = lines.find((one) => FAILED_TEST.test(one))
    || lines.find((one) => !PASSED_TEST.test(one) && ERROR_LINE.test(one)) || lines[0] || ''
  return { gate, status: result.status, ms: result.ms, line: line.slice(0, MAX_LINE) }
}

// Un gate que vuelve en menos de esto no corrió una suite. No se afirma que **no** haya corrido —un
// lint puede fallar rápido y de verdad— y por eso lo que se agrega es el número, no un veredicto: los
// tres gates del caso 068 volvieron a un segundo uno de otro contra los trece de la corrida real.
const TOO_FAST = 2000
function howItReads(failures) {
  const summary = failures
    .map((one) => `${one.gate} (exit ${one.status}, ${(one.ms / 1000).toFixed(1)} s)`
      + `${one.line ? `: ${one.line}` : ''}`)
    .join('; ')
  if (!failures.every((one) => one.ms < TOO_FAST)) return summary
  const lead = failures.length === 1 ? 'Volvió' : `Los ${failures.length} volvieron`
  return `${summary}\n${lead} en menos de ${TOO_FAST / 1000} s: eso no alcanza para correr `
    + 'una suite, así que mirá si llegaron a ejecutarse antes de aprobar esto como un rojo conocido.'
}

function verifyGates(root, dir, unapproved, env, input) {
  const ops = opsRoot(input)
  const failures = []
  if (fs.existsSync(path.join(root, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const usesPnpm = fs.existsSync(path.join(root, 'pnpm-lock.yaml'))
      && !fs.existsSync(path.join(root, 'package-lock.json'))
    const pm = usesPnpm ? 'pnpm' : 'npm'
    for (const script of ['test', 'lint', 'typecheck', 'build']) {
      if (!pkg.scripts || !pkg.scripts[script]) continue
      const result = run(pm, ['run', script], root, env)
      EV.record(ops, script, result.status, result.ms)
      if (!result.ok) failures.push(failure(script, result))
    }
  } else if (fs.existsSync(path.join(root, 'go.mod'))) {
    const makefile = path.join(root, 'Makefile')
    if (fs.existsSync(makefile) && /^ci:/m.test(fs.readFileSync(makefile, 'utf8'))) {
      const result = run('make', ['ci'], root, env)
      EV.record(ops, 'make ci', result.status, result.ms)
      if (!result.ok) failures.push(failure('make ci', result))
    } else {
      for (const args of [['test', './...'], ['build', './...']]) {
        const result = run('go', args, root, env)
        EV.record(ops, `go ${args[0]}`, result.status, result.ms)
        if (!result.ok) failures.push(failure(`go ${args[0]}`, result))
      }
    }
  } else if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'))) {
    const makefile = path.join(root, 'Makefile')
    if (fs.existsSync(makefile) && /^test:/m.test(fs.readFileSync(makefile, 'utf8'))) {
      const result = run('make', ['test'], root, env)
      EV.record(ops, 'make test', result.status, result.ms)
      if (!result.ok) failures.push(failure('make test', result))
    }
  }
  if (!failures.length || !unapproved.length) return
  // Se dice sobre qué corrió cuando no fue el árbol: un fallo que no se reproduce escribiendo el mismo
  // comando a mano se lee como que el guard miente, y lo que pasó es que midió lo que se va a grabar.
  const where = root === dir ? '' : '\nCorrió sobre el índice, que es lo que el commit graba: si en tu '
    + 'directorio pasa, es que en disco tenés algo que no está staged.'
  block(`Verify falló en ${path.basename(dir)}: ${howItReads(failures)}\nNo se commitea en rojo.${where}\n`
    + AP.HOW('OPS_SKIP_VERIFY', unapproved, input))
}

module.exports = { verify }
