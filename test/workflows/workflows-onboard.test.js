'use strict'

// El arranque y las integraciones: cuánto puede gastar `onboard` antes de tener con qué decidir, y
// que los recorridos de integración pasen por el registro general en vez de escribir en el remoto.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const onboardWorkflow = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'automatization', 'workflows', 'onboard.js'), 'utf8',
)

// Medido: la fase que escribe gastó veinte vueltas —seis lecturas y tres ediciones— para producir cuatro
// archivos, y cada vuelta arrastra el contexto entero del subagente. El techo de agentes no alcanza si
// adentro de cada uno el trabajo se hace en veinte pasos.
test('onboard acota las vueltas dentro de cada fase, no sólo la cantidad de fases', () => {
  assert.match(onboardWorkflow, /las vueltas que das/)
  assert.match(onboardWorkflow, /Leé un archivo una sola vez/)
  assert.match(onboardWorkflow, /sin ` \+\n  `editarlo después/)
  assert.match(onboardWorkflow, /Una sola corrida de check/)
  assert.match(onboardWorkflow, /leé esa sección y no el archivo ` \+\n  `entero/)
})

test('onboard tiene techo de llamadas y no sale a explorar', () => {
  // Tres agentes como máximo, y ninguno recorre nada: un arranque que hace esperar diez minutos deja de
  // serlo. Escribir el contexto y registrar lo que le toca a una persona salen de la misma evidencia.
  assert.equal(onboardWorkflow.split('await agent(').length - 1, 3)
  assert.match(onboardWorkflow, /No ` \+\n  `recorras directorios/)
  assert.match(onboardWorkflow, /no leas código fuente/)
  assert.match(onboardWorkflow, /no una auditoría/)
})

test('onboard no gasta un modelo en recorrer un árbol de directorios', () => {
  // Se afirma sobre el fuente porque lo que se fija es el orden: que el comando determinista aparezca
  // antes que cualquier llamada a un agente. En una corrida sólo se vería el tiempo que costó.
  assert.match(onboardWorkflow, /tools\/ops\.js onboard --json/, 'una llamada, a un comando determinista')
  assert.match(onboardWorkflow, /Explore nothing/, 'y tiene prohibido salir a explorar')
  assert.equal(/phase\('Verify'\)/.test(onboardWorkflow), false, 'ya no corre las suites del proyecto')
  assert.match(onboardWorkflow, /No corras comandos del proyecto/, 'este recorrido lee, no ejecuta')
  // El mapa dice lo que el proyecto declara y de dónde salió; verificarlo corriendo es una historia.
  assert.match(onboardWorkflow, /tal como los declara/)
  assert.match(onboardWorkflow, /No afirmes que/, 'nadie los corrió, así que no se declara que corran')
  assert.match(onboardWorkflow, /Verificar los comandos es una historia/)
})

test('onboard devuelve preguntas en vez de mandar a averiguar', () => {
  // Un mensaje que dice «volvé a correrlo con contexto» no guía a quien no sabe qué hace la herramienta.
  // Las preguntas salen del motor —una sola lista— y el recorrido las devuelve para que el runner las haga.
  assert.match(onboardWorkflow, /tools\/ops\.js onboard --json/)
  assert.match(onboardWorkflow, /needsContext: true/)
  assert.match(onboardWorkflow, /state\.opening/)
  assert.match(onboardWorkflow, /no como formulario/)
  assert.match(onboardWorkflow, /No des ` \+\n  `por sentado que el proyecto vende algo/)
  assert.equal(/const QUESTIONS/.test(onboardWorkflow), false, 'sin una segunda lista que envejezca sola')
  assert.match(onboardWorkflow, /ya-arrancado/, 'y no pisa una instancia ya completada')
  assert.match(onboardWorkflow, /force/, 'reescribir es explícito')
  // Con contexto y sin código sí hay algo que escribir: traer los repos es la primera historia.
  assert.match(onboardWorkflow, /La primera historia es traer los repos/)
})

test('onboard escribe borradores y deja a una persona lo que es suyo', () => {
  assert.match(onboardWorkflow, /\(supuesto\)/, 'lo deducido queda marcado')
  assert.match(onboardWorkflow, /No leas archivos de/, 'y las credenciales no se leen')
  assert.match(onboardWorkflow, /\.env\.example sí/, 'salvo el ejemplo, que es público')
  // Credenciales, MCP y permiso de push: tres filas, no tres decisiones del runner.
  assert.match(onboardWorkflow, /HUMAN/)
  assert.match(onboardWorkflow, /allowPush=false/)
  assert.match(onboardWorkflow, /ningún ` \+\n  `valor se propone acá/, 'la fila dice qué falta, no un valor')
  // Y no le pide a nadie declarar lo que el repositorio ya declara: eso es negar la evidencia que se
  // le entregó, y fue lo que produjo filas pidiendo un .env.example que ya existía.
  assert.match(onboardWorkflow, /no pidas declararlo de nuevo/)
  assert.match(onboardWorkflow, /is a claim the repository contradicts/)
  assert.match(onboardWorkflow, /No toques ` \+\n  `BACKLOG\.md/, 'y la épica no se promueve')
  assert.match(onboardWorkflow, /promoted: false/)
})

test('workflows de integración usan el registro general y no escriben remoto', () => {
  for (const name of ['sync.js', 'promote.js']) {
    const file = path.resolve(__dirname, '..', '..', 'automatization', 'workflows', 'integrations', name)
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /provider/)
    assert.match(source, /integration check/)
    assert.match(source, /Nunca|never|Never/)
  }
})
