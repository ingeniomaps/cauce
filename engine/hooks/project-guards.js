'use strict'

// Los guards que declara el proyecto (caso 428), corridos por el motor dentro de su evento en cualquier runner.
//
// Registrados en `.claude/settings.json`, un guard propio sólo corría en Claude: Antigravity no tiene dónde
// registrarlos —Cauce escribe su `hooks.json` entero— y en Codex o Gemini había que repetirlos en otro formato. Los
// cuatro runners ya llaman al motor por cada evento, así que la lista vive una vez, en `guards` de `ops.config.json`, y
// el motor la corre después de los suyos.
//
// El contrato es el de un hook de Claude Code: la llamada entra por stdin como JSON —la misma que reciben los guards de
// Cauce, ya normalizada en Antigravity—, 0 deja pasar y 2 frena con lo que el guard escribió en stderr. Un 0 que trae
// en stdout la decisión en JSON de un hook de Claude Code —`decision: block`, `continue: false`, o
// `permissionDecision` en `deny` o `ask`— también frena: un guard traído así desde `.claude/settings.json` dejaba
// pasar todo. El `ask` frena porque acá no hay diálogo que abrir en los cuatro runners, y dejarlo pasar sería tomar la
// pregunta por un sí. Lo demás frena también: un guard que no está, que no se puede ejecutar, que sale con otro código
// o que no termina a tiempo no dijo que sí, y dejarlo pasar apagaría la defensa sin que nadie se entere (R27). Claude
// Code, en cambio, sigue de largo ante un error que no es 2; un guard que dependía de eso cambia de conducta al pasar
// acá, y es a propósito.

const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { block, configOf, cwdOf, filesOf, opsRoot } = require('./input')
const { GUARD_EVENTS, validateGuards } = require('../config/validate')

// Cuánto esperan, entre todos, los guards de un evento. Es un plazo del evento y no de cada guard: el tope del hook de
// Antigravity es de 30 s en `pre-files` y `pre-read` (`automatization/runners/antigravity/hooks.json`) y cubre también
// a los del motor, así que tres guards de 20 s cada uno lo pasaban, y qué hace `agy` con un hook vencido no está
// medido. Es un objeto y no una constante para que la prueba mida el corte sin esperar los 20 s.
const limits = { timeoutMs: 20000 }

// El evento que corre una invocación. Antigravity llama al motor con el nombre del grupo; Claude, Codex y Gemini
// llaman `pre-read`, `pre-mcp` y `stop` por su único guard (`secrets-read`, `jira-adf`, `planning-drift`), así que un
// nombre que es todo su grupo cuenta como el grupo. Un guard suelto de un grupo más grande no: correr los del proyecto
// en cada uno los repetiría tantas veces como guards tenga el evento.
function eventsOf(names, groups) {
  const events = names.map((name) => (groups[name] ? name
    : Object.keys(groups).find((group) => groups[group].length === 1 && groups[group][0] === name)))
  return [...new Set(events.filter((event) => GUARD_EVENTS.includes(event)))]
}

// Las rutas declaradas para un evento, resueltas contra la raíz ops.
//
// La forma se comprueba al correrla, no sólo en `check`, y con la misma regla (`validateGuards`): escrita como texto,
// `.map` tiraba un error que no era un bloqueo, el hook salía con 1 —que Claude Code trata como error que no frena— y
// la herramienta corría; con un evento mal escrito, su guard no corría nunca. Rota, no corre ningún guard del proyecto,
// así que la única escritura que no frena es la que arregla `ops.config.json`, que siguen juzgando los guards de Cauce:
// frenarla también dejaba la sesión sin salida.
function declaredFor(root, event, input) {
  const { guards } = configOf(root)
  const errors = []
  validateGuards(guards, errors)
  if (errors.length) {
    const config = path.join(root, 'ops.config.json')
    const files = filesOf(input).map((one) => path.resolve(cwdOf(input), one))
    if (event === 'pre-files' && files.length && files.every((one) => one === config)) return []
    block(`${errors[0]}, así que no corre ningún guard del proyecto. Arreglalo en ops.config.json; \`ops check\` `
      + 'dice qué tiene.')
  }
  return ((guards || {})[event] || []).map((one) => path.resolve(root, one))
}

function judge(file, event, input, root, deadline) {
  const name = path.relative(root, file)
  // Al que llega con el plazo vencido le queda un milisegundo, y su corte es el mismo que el de cualquier otro.
  const left = Math.max(deadline - Date.now(), 1)
  const result = spawnSync(file, [], {
    input: JSON.stringify(input), cwd: cwdOf(input), encoding: 'utf8', timeout: left,
    env: { ...process.env, OPS_ROOT: root, CAUCE_HOOK_EVENT: event },
  })
  const said = (result.stderr || '').trim()
  if (result.status === 0) {
    const decided = decisionOf(result.stdout)
    if (decided) block(`[${name}] ${decided}`)
    return
  }
  if (result.status === 2) block(`[${name}] ${said || 'el guard del proyecto frenó sin decir por qué'}`)
  block(`[${name}] el guard que declara guards.${event} en ops.config.json ${failureOf(result, said)}, y un guard `
    + 'que no contesta frena. Arreglalo o sacalo de la lista.')
}

// Lo que frena en el JSON de un hook de Claude Code que salió en 0, o '' si no trae nada que frene. Lo que no es JSON
// es salida suelta y no decide nada.
function decisionOf(stdout) {
  let said
  try { said = JSON.parse(String(stdout || '').trim()) } catch { return '' }
  if (!said || typeof said !== 'object') return ''
  const specific = said.hookSpecificOutput || {}
  if (said.decision === 'block') return said.reason || 'el guard del proyecto frenó sin decir por qué'
  if (said.continue === false) return said.stopReason || 'el guard del proyecto frenó sin decir por qué'
  if (specific.permissionDecision === 'deny') {
    return specific.permissionDecisionReason || 'el guard del proyecto frenó sin decir por qué'
  }
  if (specific.permissionDecision === 'ask') {
    return `${specific.permissionDecisionReason || 'el guard del proyecto pide confirmar'} — pide confirmación, y acá `
      + 'frena: los guards del proyecto no abren diálogo. Si alcanza con avisar, que salga en 0 sin JSON.'
  }
  return ''
}

// Por qué no contestó un guard que no salió ni en 0 ni en 2. EPIPE es el guard que salió sin leer la llamada: corrió,
// y lo que hizo lo dicen su código y su señal. Sin ninguno de los dos, el EPIPE es lo único que hay para decir.
function failureOf(result, said = '') {
  const ran = result.status !== null || Boolean(result.signal)
  if (result.error && !(result.error.code === 'EPIPE' && ran)) {
    return result.error.code === 'ETIMEDOUT'
      ? `no terminó dentro de los ${limits.timeoutMs / 1000} s que tienen entre todos los guards del evento`
      : `no se pudo ejecutar (${result.error.code})`
  }
  return result.signal ? `lo cortó ${result.signal}` : `salió con ${result.status}${said ? `: ${said}` : ''}`
}

// Corre los guards del proyecto de los eventos de esta invocación. Sin raíz ops no hay configuración que los declare.
//
// En `stop`, `stop_hook_active` dice que la sesión ya está siguiendo porque un hook de cierre la frenó: volver a frenar
// ahí la encierra en un bucle, y con un guard roto —que frena siempre— ese bucle no termina por nada que el guard
// juzgue. Claude Code manda el campo para eso, y lo que ya se frenó una vez no se vuelve a preguntar.
function runProjectGuards(names, input, groups) {
  const events = eventsOf(names, groups).filter((event) => event !== 'stop' || !input.stop_hook_active)
  if (!events.length) return
  const root = opsRoot(input)
  if (!root) return
  for (const event of events) {
    const deadline = Date.now() + limits.timeoutMs
    for (const file of declaredFor(root, event, input)) judge(file, event, input, root, deadline)
  }
}

module.exports = { limits, eventsOf, failureOf, runProjectGuards }
