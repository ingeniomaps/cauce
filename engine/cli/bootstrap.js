'use strict'

// Lo que `init` hace después de copiar el molde: dejar la instancia usable en la misma corrida, en vez
// de devolver una lista de pasos que el usuario tiene que ejecutar a mano. Vive fuera de `cli/ops.js`
// porque depende de tres cosas que una prueba no puede ejecutar —npm, un runner que escribe en el repo
// del usuario y una terminal que responde—, y recibirlas como argumento es lo que permite probar el
// recorrido completo sin ninguna de las tres.

const readline = require('node:readline/promises')

const SIN_RUNNER = 'ninguno'
const SIN_PROVEEDOR = 'ninguna'

// Cuántas veces se repregunta antes de tomar el default. Insistir para siempre cuelga una corrida no
// interactiva que igual llegó hasta acá; rendirse a la primera convierte un dedazo en una decisión.
const INTENTOS = 3

// Una terminal de verdad, aislada acá para que el resto del módulo no sepa que existe.
function terminal() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return { ask: (pregunta) => rl.question(pregunta), close: () => rl.close() }
}

// Un Ctrl+D o un Ctrl+C en mitad de la pregunta valen como «no elijo»: readline rechaza la promesa, y
// dejar que ese rechazo suba terminaba la corrida con «Aborted with Ctrl+D» y la instancia recién creada
// sin una línea que dijera cómo seguir. El default no hace nada, así que tomarlo no decide nada.
async function elegir(deps, texto, opciones, fallback) {
  // Una opción por línea y el default señalado donde se mira: apretar Enter es la respuesta más común, y
  // en una sola línea apretada el `[ninguno]` del final no se lee como «esto pasa si no elegís nada».
  const listado = opciones
    .map((opcion, indice) => `  ${indice + 1}) ${opcion}${opcion === fallback ? '   ← Enter' : ''}`)
    .join('\n')
  for (let intento = 0; intento < INTENTOS; intento += 1) {
    let dicho
    try { dicho = await deps.ask(`\n${texto}\n\n${listado}\n\n> `) } catch {
      deps.log(`\n  sin respuesta: sigo con ${fallback}.`)
      return fallback
    }
    const respuesta = dicho.trim()
    if (!respuesta) return fallback
    const numero = Number(respuesta)
    if (Number.isInteger(numero) && numero >= 1 && numero <= opciones.length) return opciones[numero - 1]
    if (opciones.includes(respuesta)) return respuesta
    deps.log(`  «${respuesta}» no está en la lista.`)
  }
  return fallback
}

// El default de las dos preguntas es no hacer nada, y es a propósito: instalar un runner escribe en el
// repositorio del usuario y habilitar un proveedor deja andamiaje que después hay que completar. Un
// Enter apurado no debería dejar archivos que nadie pidió.
//
// La terminal se abre acá y no en el CLI, y sólo si hay algo que preguntar: quien llama no tiene por
// qué saber que readline existe, y una prueba reemplaza `deps.ask` sin que se abra ninguna.
async function preguntas(opciones, deps) {
  const falta = !opciones.runner || !opciones.integration
  if (!opciones.interactive || !falta) {
    return { runner: opciones.runner || SIN_RUNNER, proveedor: opciones.integration || SIN_PROVEEDOR }
  }
  const tty = deps.ask ? null : terminal()
  const con = { ...deps, ask: deps.ask || tty.ask }
  const runners = [...opciones.runners, SIN_RUNNER]
  const proveedores = [...opciones.providers, SIN_PROVEEDOR]
  try {
    const runner = opciones.runner
      || await elegir(con, '¿Con qué runner vas a trabajar?', runners, SIN_RUNNER)
    const proveedor = opciones.integration
      || await elegir(con, '¿Habilitar alguna integración?', proveedores, SIN_PROVEEDOR)
    return { runner, proveedor }
  } finally { if (tty) tty.close() }
}

function validar(opciones) {
  const runners = [...opciones.runners, SIN_RUNNER]
  const proveedores = [...opciones.providers, SIN_PROVEEDOR]
  if (opciones.runner && !runners.includes(opciones.runner)) {
    throw new Error(`--runner debe ser ${runners.join(', ')}.`)
  }
  if (opciones.integration && !proveedores.includes(opciones.integration)) {
    throw new Error(`--integration debe ser ${proveedores.join(', ')}.`)
  }
}

// Deja la instancia lista o dice exactamente qué falta. El orden no es negociable: el proveedor se
// habilita con el motor que corre `init` —su plantilla viaja en el paquete—, pero el runner necesita
// la dependencia ya instalada, porque sus adaptadores y workflows se resuelven desde `node_modules`.
async function run(root, opciones, deps) {
  validar(opciones)
  const { runner, proveedor } = await preguntas(opciones, deps)
  if (proveedor !== SIN_PROVEEDOR) deps.enableProvider(proveedor)
  if (!opciones.install) return { runner, proveedor, instalado: false, pendiente: 'npm install' }
  deps.log('\n· npm install (el motor viene de la dependencia)')
  if (deps.npm(root) !== 0) {
    return { runner, proveedor, instalado: false, error: 'npm install falló', pendiente: 'npm install' }
  }
  if (runner !== SIN_RUNNER) deps.installRunner(runner)
  return { runner, proveedor, instalado: true }
}

module.exports = { run, SIN_RUNNER, SIN_PROVEEDOR }
