'use strict'

// Lo que `init` hace después de copiar el molde: dejar la instancia usable en la misma corrida, en vez
// de devolver una lista de pasos que el usuario tiene que ejecutar a mano. Vive fuera de `cli/ops.js`
// porque depende de tres cosas que una prueba no puede ejecutar —npm, un runner que escribe en el repo
// del usuario y una terminal que responde—, y recibirlas como argumento es lo que permite probar el
// recorrido completo sin ninguna de las tres.

const readline = require('node:readline/promises')

const NO_RUNNER = 'ninguno'
const NO_PROVIDER = 'ninguna'

// Cuántas veces se repregunta antes de tomar el default. Insistir para siempre cuelga una corrida no
// interactiva que igual llegó hasta acá; rendirse a la primera convierte un dedazo en una decisión.
const ATTEMPTS = 3

// Una terminal de verdad, aislada acá para que el resto del módulo no sepa que existe.
function terminal() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return { ask: (pregunta) => rl.question(pregunta), close: () => rl.close() }
}

// Un Ctrl+D o un Ctrl+C en mitad de la pregunta valen como «no elijo»: readline rechaza la promesa, y
// dejar que ese rechazo suba terminaba la corrida con «Aborted with Ctrl+D» y la instancia recién creada
// sin una línea que dijera cómo seguir. El default no hace nada, así que tomarlo no decide nada.
async function choose(deps, texto, opciones, fallback) {
  // Una opción por línea y el default señalado donde se mira: apretar Enter es la respuesta más común, y
  // en una sola línea apretada el `[ninguno]` del final no se lee como «esto pasa si no elegís nada».
  const options = opciones
    .map((opcion, indice) => `  ${indice + 1}) ${opcion}${opcion === fallback ? '   ← Enter' : ''}`)
    .join('\n')
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    let typed
    try { typed = await deps.ask(`\n${texto}\n\n${options}\n\n> `) } catch {
      deps.log(`\n  sin respuesta: sigo con ${fallback}.`)
      return fallback
    }
    const answer = typed.trim()
    if (!answer) return fallback
    const index = Number(answer)
    if (Number.isInteger(index) && index >= 1 && index <= opciones.length) return opciones[index - 1]
    if (opciones.includes(answer)) return answer
    deps.log(`  «${answer}» no está en la lista.`)
  }
  return fallback
}

// El default de las dos preguntas es no hacer nada, y es a propósito: instalar un runner escribe en el
// repositorio del usuario y habilitar un proveedor deja andamiaje que después hay que completar. Un
// Enter apurado no debería dejar archivos que nadie pidió.
//
// La terminal se abre acá y no en el CLI, y sólo si hay algo que preguntar: quien llama no tiene por
// qué saber que readline existe, y una prueba reemplaza `deps.ask` sin que se abra ninguna.
async function askMissing(opciones, deps) {
  const missing = !opciones.runner || !opciones.integration
  if (!opciones.interactive || !missing) {
    return { runner: opciones.runner || NO_RUNNER, provider: opciones.integration || NO_PROVIDER }
  }
  const tty = deps.ask ? null : terminal()
  const io = { ...deps, ask: deps.ask || tty.ask }
  const runners = [...opciones.runners, NO_RUNNER]
  const providers = [...opciones.providers, NO_PROVIDER]
  try {
    const runner = opciones.runner
      || await choose(io, '¿Con qué runner vas a trabajar?', runners, NO_RUNNER)
    const provider = opciones.integration
      || await choose(io, '¿Habilitar alguna integración?', providers, NO_PROVIDER)
    return { runner, provider }
  } finally { if (tty) tty.close() }
}

function validate(opciones) {
  const runners = [...opciones.runners, NO_RUNNER]
  const providers = [...opciones.providers, NO_PROVIDER]
  if (opciones.runner && !runners.includes(opciones.runner)) {
    throw new Error(`--runner debe ser ${runners.join(', ')}.`)
  }
  if (opciones.integration && !providers.includes(opciones.integration)) {
    throw new Error(`--integration debe ser ${providers.join(', ')}.`)
  }
}

// Deja la instancia lista o dice exactamente qué falta. El orden no es negociable: el proveedor se
// habilita con el motor que corre `init` —su plantilla viaja en el paquete—, pero el runner necesita
// la dependencia ya instalada, porque sus adaptadores y workflows se resuelven desde `node_modules`.
async function run(root, opciones, deps) {
  validate(opciones)
  const { runner, provider } = await askMissing(opciones, deps)
  if (provider !== NO_PROVIDER) deps.enableProvider(provider)
  if (!opciones.install) return { runner, provider, installed: false, pending: 'npm install' }
  deps.log('\n· npm install (el motor viene de la dependencia)')
  if (deps.npm(root) !== 0) {
    return { runner, provider, installed: false, error: 'npm install falló', pending: 'npm install' }
  }
  if (runner !== NO_RUNNER) deps.installRunner(runner)
  return { runner, provider, installed: true }
}

module.exports = { run, NO_RUNNER, NO_PROVIDER }
