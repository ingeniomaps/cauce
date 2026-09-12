'use strict'

// Lo que una sesión concedió, visto desde `check`. El 116 trajo `granted` —lo que un guard deja pasar queda
// anotado y se hereda mensaje a mensaje— y lo dejó del lado que nadie audita: vive en el temporal del
// sistema y ninguna corrida lo muestra, mientras que por una sola línea en `.ops-approval` `check` sí
// avisa. Una exención que no se ve es un límite que ya no existe (caso 117).

const { tempRoot, outsideTempRoot, run, writeWip } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execute } = require('../../engine/hooks/run')
const CHAT = require('../../engine/hooks/chat')

// Una instancia con una tarea en curso, que es contra lo que caduca un alcance.
function conTarea(prefix, task) {
  const target = path.join(tempRoot(prefix), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const planning = path.join(target, 'planning')
  if (task) writeWip(planning, `---\ntask: ${task}\nphase: Build\n---\n\n1. [ ] hacer algo\n`)
  else writeWip(planning, 'status: IDLE\n')
  return { target, planning }
}

// La persona ya escribe el alcance —«mientras dure la tarea t-014»— y hasta 0.86.0 se tiraba al guardar:
// de esa frase sobrevivía la ruta y nada más, así que la concesión valía la sesión entera (caso 127). Lo
// que se lee es la misma cláusula que ya decide si la ruta fue pedida, no el mensaje entero.
test('una concesión con alcance caduca cuando la tarea que la limitaba deja de ser la del WIP', () => {
  const { target, planning } = conTarea('cauce-alcance-', 't-014')
  const session = `prueba-alcance-${process.pid}`
  const ci = process.env.CI
  delete process.env.CI
  const input = { session_id: session, prompt_id: 'm1', cwd: target }
  try {
    execute('chat', { ...input, prompt: 'escribí planning/rules/process.md mientras dure la tarea t-014' })
    assert.deepEqual(CHAT.unauthorized(input, ['planning/rules/process.md']), [], 'la orden la concede')

    // Se hereda mensaje a mensaje mientras la tarea siga siendo la misma, como cualquier concesión (116).
    const dos = { session_id: session, prompt_id: 'm2', cwd: target }
    execute('chat', { ...dos, prompt: 'gracias, seguí' })
    assert.deepEqual(CHAT.unauthorized(dos, ['planning/rules/process.md']), [], 'la tarea sigue abierta')

    // Y deja de valer cuando esa tarea ya no es la del WIP: es lo que «mientras dure» quería decir.
    writeWip(planning, 'status: IDLE\n')
    const tres = { session_id: session, prompt_id: 'm3', cwd: target }
    execute('chat', { ...tres, prompt: 'seguí' })
    assert.deepEqual(CHAT.unauthorized(tres, ['planning/rules/process.md']),
      ['planning/rules/process.md'], 'cerrada la tarea, la concesión se terminó con ella')
  } finally {
    fs.rmSync(path.join(CHAT.DIR, `${session}.json`), { force: true })
    if (ci !== undefined) process.env.CI = ci
  }
})

// Sin alcance dicho, nada cambia: la concesión vale la sesión, que es lo que el 116 decidió. Sin esta
// mitad, hacer caducar todo daría el mismo verde que hacer caducar sólo lo que la persona acotó.
test('una concesión sin alcance no la toca el WIP', () => {
  const { target, planning } = conTarea('cauce-alcance-sin-', 't-014')
  const session = `prueba-sin-alcance-${process.pid}`
  const ci = process.env.CI
  delete process.env.CI
  const input = { session_id: session, prompt_id: 'm1', cwd: target }
  try {
    execute('chat', { ...input, prompt: 'escribí planning/rules/process.md' })
    assert.deepEqual(CHAT.unauthorized(input, ['planning/rules/process.md']), [])
    writeWip(planning, 'status: IDLE\n')
    const dos = { session_id: session, prompt_id: 'm2', cwd: target }
    execute('chat', { ...dos, prompt: 'seguí' })
    assert.deepEqual(CHAT.unauthorized(dos, ['planning/rules/process.md']), [],
      'nadie la acotó, así que cerrar la tarea no la caduca')
  } finally {
    fs.rmSync(path.join(CHAT.DIR, `${session}.json`), { force: true })
    if (ci !== undefined) process.env.CI = ci
  }
})

// Fuera de una instancia no hay WIP contra el cual comparar —`opsRoot` devuelve vacío—, y ahí el acote se
// respeta en vez de vencer: revocarlo sería castigar a quien trabaja fuera de una instancia por algo que
// nunca dijo. Es la otra mitad de la caducidad, y sin ella «vence cuando no hay WIP» se llevaría puesto
// este caso sin que ninguna prueba lo note.
test('un alcance fuera de toda instancia se respeta, porque no hay WIP contra el cual vencer', () => {
  const fuera = outsideTempRoot('cauce-alcance-sin-raiz-')
  const session = `prueba-sin-raiz-${process.pid}`
  const ci = process.env.CI
  delete process.env.CI
  try {
    const input = { session_id: session, prompt_id: 'm1', cwd: fuera }
    execute('chat', { ...input, prompt: 'escribí notas.md mientras dure la tarea t-014' })
    assert.deepEqual(CHAT.unauthorized(input, ['notas.md']), [], 'la orden la concede igual')

    const dos = { session_id: session, prompt_id: 'm2', cwd: fuera }
    execute('chat', { ...dos, prompt: 'seguí' })
    assert.deepEqual(CHAT.unauthorized(dos, ['notas.md']), [],
      'sin instancia no hay tarea que se cierre, así que el acote no vence solo')
  } finally {
    fs.rmSync(path.join(CHAT.DIR, `${session}.json`), { force: true })
    if (ci !== undefined) process.env.CI = ci
  }
})

// Una concesión se consume sin dejar nada: al mensaje siguiente ya no queda quién la autorizó ni cuándo.
// Es lo mismo que el 112 resolvió para el push, y se anota igual — sólo agrega, y el texto de la persona
// se queda en el temporal, que es donde el 098 lo dejó (caso 127).
test('una concesión deja su línea en el rastro de la instancia, sin el texto de la persona', () => {
  const { target } = conTarea('cauce-rastro-concesion-', 't-014')
  const log = path.join(target, 'planning', '.grant-log')
  const rastro = () => fs.readFileSync(log, 'utf8').trim().split('\n').map((one) => JSON.parse(one))
  const session = `prueba-rastro-${process.pid}`
  const ci = process.env.CI
  delete process.env.CI
  try {
    // Lo que no se concede no se anota: hasta que una pasa, el archivo no existe.
    const nada = { session_id: session, prompt_id: 'm0', cwd: target }
    execute('chat', { ...nada, prompt: '¿qué hace planning/rules/process.md?' })
    CHAT.unauthorized(nada, ['planning/rules/process.md'])
    assert.equal(fs.existsSync(log), false, 'nombrar sin pedir no concede, así que no hay qué anotar')

    const input = { session_id: session, prompt_id: 'm1', cwd: target }
    execute('chat', { ...input, prompt: 'escribí planning/rules/process.md mientras dure la tarea t-014' })
    CHAT.unauthorized(input, ['planning/rules/process.md'])
    const [primera] = rastro()
    assert.deepEqual(Object.keys(primera), ['grantedAt', 'item', 'scope', 'via', 'session'])
    assert.match(primera.grantedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(primera.item, 'planning/rules/process.md')
    assert.equal(primera.scope, 't-014', 'el alcance que la persona dijo queda en el rastro')
    assert.equal(primera.via, 'orden')
    assert.ok(primera.session, 'sin la sesión no se puede volver a la conversación que la autorizó')

    // Sólo agrega, y el texto de la persona no sale del temporal.
    const dos = { session_id: session, prompt_id: 'm2', cwd: target }
    execute('chat', { ...dos, prompt: 'editá planning/rules/commits.md' })
    CHAT.unauthorized(dos, ['planning/rules/commits.md'])
    assert.deepEqual(rastro().map((one) => one.item),
      ['planning/rules/process.md', 'planning/rules/commits.md'])
    assert.equal(/mientras dure la tarea/.test(fs.readFileSync(log, 'utf8')), false,
      'el texto de la persona se queda en el temporal')
  } finally {
    fs.rmSync(path.join(CHAT.DIR, `${session}.json`), { force: true })
    if (ci !== undefined) process.env.CI = ci
  }
})

test('check muestra lo que la sesión concedió, y no lo de otra instancia', () => {
  const target = path.join(tempRoot('cauce-concedido-'), 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const otra = path.join(tempRoot('cauce-concedido-otra-'), 'demo-ops')
  assert.equal(run(['init', otra, '--name', 'Otra', '--mode', 'sidecar', '--no-install']).status, 0)

  const session = `prueba-concedido-${process.pid}`
  const vecina = `prueba-vecina-${process.pid}`
  const ci = process.env.CI
  delete process.env.CI
  const avisos = (root) => JSON.parse(run(['check', path.join(root, 'planning'), '--json']).stdout)
    .warnings.filter((one) => /concedid/i.test(one))
  try {
    // La persona nombra la ruta y el guard la deja pasar: ahí es donde queda concedida (caso 116).
    const input = { session_id: session, prompt_id: 'm1', cwd: target }
    execute('chat', { ...input, prompt: 'escribí planning/rules/process.md' })
    assert.deepEqual(CHAT.unauthorized(input, ['planning/rules/process.md']), [], 'la orden lo autoriza')

    assert.deepEqual(avisos(target),
      ['1 ruta(s) concedidas en el chat de esta sesión: planning/rules/process.md'])

    // Y lo concedido trabajando en otra instancia no se le cuenta a ésta: el registro vive en el temporal,
    // que es uno solo por máquina, así que sin distinguir la raíz una instancia vería las exenciones de la
    // de al lado y el aviso diría algo falso.
    const ajena = { session_id: vecina, prompt_id: 'm1', cwd: otra }
    execute('chat', { ...ajena, prompt: 'escribí planning/rules/commits.md' })
    assert.deepEqual(CHAT.unauthorized(ajena, ['planning/rules/commits.md']), [])
    assert.deepEqual(avisos(target),
      ['1 ruta(s) concedidas en el chat de esta sesión: planning/rules/process.md'],
      'lo de la otra instancia no entra')
  } finally {
    for (const one of [session, vecina]) fs.rmSync(path.join(CHAT.DIR, `${one}.json`), { force: true })
    if (ci !== undefined) process.env.CI = ci
  }
})
