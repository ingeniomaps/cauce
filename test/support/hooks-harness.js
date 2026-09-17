'use strict'

// Lo que comparten las suites de `test/hooks/`: cómo se afirma un bloqueo y cómo se monta el repositorio
// sobre el que se lo provoca.
//
// Vive acá y no copiado en cada una de las once suites, por la razón que explica `autobuild-harness.js`.
//
// Cómo se reparten: cada archivo es un guard o una decisión, y se lleva **los dos lados** —qué frena y qué
// deja pasar—, porque un guard que bloqueara todo pasaría entero un archivo que sólo probara frenos. Dónde
// aterriza el wiring que los invoca es de `wiring/runners.test.js`, y no de acá.

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execute } = require('../../engine/hooks/run')
const { tempRoot, writeWip } = require('./environment')

// Un nombre de sesión por llamada, y no el pid solo: dos suites del mismo proceso se pisarían el archivo
// de concesiones y la segunda leería lo que concedió la primera.
let sesiones = 0

// Que un guard frene no alcanza: tiene que frenar por lo que corresponde, y el motivo es lo único que
// el usuario recibe. Sin exigirlo, cambiarle a un bloqueo el mensaje de otra regla dejaba la suite entera
// en verde — medido mutando los 22 bloqueos del motor, 17 no tenían nada que los comprobara. El motivo es
// obligatorio para que un sitio nuevo no pueda saltearlo por olvido.
function blocked(name, input, motivo) {
  if (!(motivo instanceof RegExp)) throw new Error(`blocked(${name}) exige el motivo esperado`)
  assert.throws(() => execute(name, input), (error) => {
    assert.equal(error.blocked, true, `${name} lanzó algo que no es un bloqueo: ${error.message}`)
    assert.match(error.message, motivo, `${name} bloqueó, pero por otro motivo`)
    return true
  })
}

// Este ayudante escribe —`init`, `config`, y sus llamadores `add` y `commit`—, y `-C`/`cwd` no le ganan
// a `GIT_DIR`: heredada, cada uno de esos comandos opera sobre el repositorio que la haya exportado. El
// motor ya no la exporta (caso 045), así que esto es el segundo cierre y no el único.
function git(args, cwd) {
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env })
  assert.equal(result.status, 0, result.stderr)
}

// Un repositorio de prueba en el que además se commitea. La identidad es lo que lo separa de un `init`
// a secas: `git commit` la exige, acá la toma de la configuración global de quien corre las pruebas y
// en CI no hay ninguna, así que sin esto la prueba pasa en la máquina y falla en la puerta — que es la
// peor forma de fallar, porque el veredicto local dice lo contrario del que decide.
function initRepo(root) {
  git(['init', '-q'], root)
  git(['config', 'user.email', 'prueba@ejemplo'], root)
  git(['config', 'user.name', 'Prueba'], root)
}

function chatSession() {
  const { DIR } = require('../../engine/hooks/chat')
  const session = `prueba-${process.pid}-${sesiones += 1}`
  const ci = process.env.CI
  delete process.env.CI
  let turno = 0
  return {
    // La persona manda un mensaje; devuelve cómo se ve una llamada originada por él, con el campo que
    // mande el runner —cuál es cuál lo dice chat.js—.
    says(prompt, field = 'prompt_id') {
      const id = field ? { [field]: `m${turno += 1}` } : {}
      execute('chat', { session_id: session, ...id, prompt })
      return (extra) => ({ session_id: session, ...id, ...extra })
    },
    close() {
      fs.rmSync(path.join(DIR, `${session}.json`), { force: true })
      if (ci !== undefined) process.env.CI = ci
    },
  }
}

function messageOf(name, input) {
  try { execute(name, input) } catch (error) {
    if (error.blocked) return error.message
    throw error
  }
  return assert.fail(`${name} no bloqueó`)
}

function planFirstRoot(prefijo, wip, backlog = BACKLOG_CON_TAREA) {
  const root = tempRoot(prefijo)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }] }))
  writeWip(path.join(root, 'planning'), wip)
  fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), backlog)
  return root
}

// Lo que un bloqueo dice pegar se pega tal cual, y de ahí lo saca la prueba: una ruta armada aparte
// mediría la forma que eligió la prueba, no la que el guard coteja (caso 089). Se agrega al archivo en vez
// de pisarlo, porque `verify` aprueba el conjunto entero y lo que ya aprobaron los otros sigue contando.
function pasteApproval(root, message) {
  const lines = message.split('\n')
  const start = lines.findIndex((line) => line.startsWith('Aprobalo pegando tal cual'))
  assert.ok(start >= 0, `el bloqueo no dice qué pegar:\n${message}`)
  const paste = []
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('  ')) break
    paste.push(line.slice(2))
  }
  assert.ok(paste.length, `el bloqueo no nombra ninguna línea:\n${message}`)
  assert.doesNotMatch(message, /esa\(s\) ruta\(s\)/, 'nombra las rutas en vez de aludirlas')
  fs.appendFileSync(path.join(root, 'planning', '.ops-approval'), `${paste.join('\n')}\n`)
  return paste
}

// Publicar (casos 103 y 108). Una raíz sin git, así que las ramas vivas son `main` y `master`; la rama por
// defecto de un remoto se prueba aparte, con un repositorio de verdad.
function pushRoot(prefijo, runner = {}) {
  const root = tempRoot(prefijo)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ mode: 'embedded', runner: { allowPush: false, ...runner } }))
  return root
}

// Qué entorno recibe un gate según dónde corra. Se mide por lo que el gate **recibe** y no por lo que
// devuelve `commitTree`, porque lo que importa es que llegue: entre una cosa y la otra está `run`, que
// mezcla el objeto sobre el entorno del proceso.
//
// Las dos mitades importan y la segunda es de ausencia. Acá estuvo `CI=true` y fue la regresión del caso
// 070: desarmaba la confirmación de cualquier herramienta en vez de quitarle a pnpm el motivo de
// preguntar. Comprobar que llega la palanca nueva no comprueba que la vieja se fue —las dos podrían
// convivir, y ahí el verde diría que ocurrió la mitad del cambio—.
// El error que produjo el 070 no fue elegir mal una variable: fue no ver que ponerla era una **quita**.
// `CI=true` no agregaba una conducta, sacaba la confirmación con la que pnpm frena antes de purgar — y
// una confirmación que estorba casi siempre está cuidando algo. R9 pide que una quita se pruebe por
// ausencia, y esa prueba no se escribió porque nadie extrañaba lo que se estaba sacando.
//
// La lista atrapa lo que conocemos y nada más, que es el límite honesto de una lista. Lo que agrega es
// que la próxima vez la decisión se tome a la vista y no dentro de un comentario.
const DESARMAN = {
  CI: 'pnpm deja de confirmar antes de purgar el node_modules, y npm y yarn cambian de modo (caso 070)',
  CONTINUOUS_INTEGRATION: 'el mismo efecto que CI en varias herramientas',
  npm_config_yes: 'npx deja de preguntar antes de bajar y ejecutar un paquete',
  npm_config_confirm_modules_purge: 'apaga exactamente la confirmación que protegía al proyecto',
}

const WIP_IDLE = 'status: IDLE\n'

const WIP_CON_PLAN = '---\ntask: alta-de-cliente\nphase: Build\nservice: api\n---\n\n'
  + '## Plan aprobado\n1. [ ] Escribir el handler\n'

const WIP_SIN_PLAN = '---\ntask: alta-de-cliente\nphase: Build\nservice: api\n---\n\n## Plan aprobado\n'

// Las dos mitades de `plan-first`: qué frena —el cambio de producto sin plan— y, sobre todo, qué deja
// pasar. La segunda es la que decide si el guard sirve: si frenara la escritura del propio WIP sería un
// candado con la llave adentro, y si frenara a `onboard` o a una evaluación, quien lo sufra lo apaga.
const BACKLOG_CON_TAREA = '# Backlog promovido\n\n## Hito primero — Primer resultado\n\n'
  + '- [ ] **alta-de-cliente** [lite] — Alta. _Aceptación: responde 201._ (service: api)\n'

const BACKLOG_VACIO = '# Backlog promovido\n'

const WORK = /publica cambios y requiere una acción humana/

const LIVE = /la rama viva/

// Un repositorio cuyo HEAD alcanza un remoto: es lo que distingue «reescribir historia que otro leyó» de
// corregir algo que no salió de la máquina. El remoto es un bare local — nada habla con la red.
function repoPublicado(prefijo) {
  const root = tempRoot(prefijo)
  initRepo(root)
  fs.writeFileSync(path.join(root, 'a.txt'), 'uno\n')
  git(['add', 'a.txt'], root)
  git(['commit', '-qm', 'uno'], root)
  const remoto = tempRoot(`${prefijo}remoto-`)
  git(['init', '-q', '--bare'], remoto)
  git(['remote', 'add', 'origin', remoto], root)
  git(['push', '-q', 'origin', 'HEAD'], root)
  git(['fetch', '-q', 'origin'], root)
  return root
}

module.exports = {
  blocked, git, initRepo, repoPublicado, chatSession, messageOf,
  planFirstRoot, pasteApproval, pushRoot,
  DESARMAN, WIP_IDLE, WIP_CON_PLAN, WIP_SIN_PLAN,
  BACKLOG_CON_TAREA, BACKLOG_VACIO, WORK, LIVE,
}
