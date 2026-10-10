'use strict'

// Caso 370. Los dos guards de límites sólo ofrecían declarar la ruta en la configuración; lo que una persona
// pide por una vez —liberar disco, limpiar una caché— se frenaba igual. La salida que entra es angosta, y
// cada condición tiene acá su aserción: el ítem lleva el verbo y la ruta resuelta; vale la confirmación del
// bloqueo o la línea en el archivo, nunca una orden del chat; y no se hereda al mensaje siguiente.
//
// Nada de acá ejecuta un comando; por qué la carpeta de afuera es un nombre que no existe está en
// `removal-boundary.test.js`.

const { tempRoot } = require('../support/environment')
const { blocked, chatSession, messageOf, pasteApproval } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { execute, executeAll } = require('../../engine/hooks/run')

const OUT = path.join(os.homedir(), 'fuera-de-las-raices')

function project(name) {
  const root = path.join(tempRoot(name), 'repo')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'service', 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'service', path: 'service' }] }))
  fs.symlinkSync(OUT, path.join(root, 'service', 'enlace'))
  const shell = (command) => ({ cwd: root, tool_input: { command } })
  const write = (file) => ({ cwd: root, tool_name: 'Write', tool_input: { file_path: file, content: 'x' } })
  return { root, shell, write }
}

const CONFIRM = /pedile que lo confirme con sus palabras/

test('la confirmación del bloqueo abre exactamente la ruta y el verbo que el bloqueo mostró, por un turno', () => {
  const { root, shell, write } = project('ops-hook-limite-confirma-')
  const chat = chatSession()
  try {
    const asked = chat.says('liberá espacio en disco')
    const message = messageOf('shell-boundary', asked(shell(`rm -rf ${OUT}/cache`)))
    assert.match(message, /fuera de las raíces declaradas/)
    assert.match(message, CONFIRM)
    assert.match(message, /vale para este turno/, 'y dice cuánto dura, que no es la sesión')
    assert.doesNotMatch(message, /sigue valiendo en los mensajes siguientes/)
    assert.match(message, new RegExp(`\\n {2}borra ${OUT}/cache\\n`), 'la línea que se pega lleva el verbo')
    assert.doesNotMatch(message, /\n {2}escribe /, 'y no el otro verbo')

    const yes = chat.says('dale')
    assert.doesNotThrow(() => execute('shell-boundary', yes(shell(`rm -rf ${OUT}/cache`))))
    // Lo mismo escrito distinto cae en el mismo lugar, y es el mismo ítem.
    assert.doesNotThrow(() => execute('shell-boundary', yes(shell('rm -rf ~/fuera-de-las-raices/cache'))))
    // Otra ruta, u otro verbo sobre la misma, no quedaron aprobados.
    blocked('shell-boundary', yes(shell(`rm -rf ${OUT}/otra`)), /fuera de las raíces declaradas/)
    blocked('shell-boundary', yes(shell(`echo x > ${OUT}/cache`)), /fuera de las raíces declaradas/)
    blocked('workspace-boundary', yes(write(`${OUT}/cache`)), /fuera de las raíces declaradas/)
    // Un subagente que reintenta después de la confirmación pasa, como en los demás guards.
    assert.doesNotThrow(() => execute('shell-boundary', { ...yes(shell(`rm -rf ${OUT}/cache`)), agent_id: 'sub' }))

    // Y no se hereda: en el mensaje siguiente vuelve a frenar.
    const later = chat.says('ahora arreglá el login')
    blocked('shell-boundary', later(shell(`rm -rf ${OUT}/cache`)), CONFIRM)
  } finally {
    chat.close()
  }
})

// Cada orden va en una sesión propia: el bloqueo anterior deja el ítem esperando, y el mensaje siguiente
// que no niegue lo confirmaría —que es el canal, no este guard—.
test('una orden del chat no abre nada, ni con la ruta entera: la lista de verbos no dice qué se pide', () => {
  const { shell } = project('ops-hook-limite-orden-')
  for (const text of [`borrá ${OUT}/cache`, `mirá ${OUT}/cache y decime cuánto pesa`, 'borrá cache',
    'borrá ~/fuera-de-las-raices/cache']) {
    const chat = chatSession()
    try {
      blocked('shell-boundary', chat.says(text)(shell(`rm -rf ${OUT}/cache`)), CONFIRM)
    } finally {
      chat.close()
    }
  }
})

test('escribir afuera se confirma igual, con su verbo, y el ítem es donde cae y no cómo está escrito', () => {
  const { root, shell, write } = project('ops-hook-limite-escribe-')
  const chat = chatSession()
  try {
    const asked = chat.says('guardá la nota ahí')
    const message = messageOf('workspace-boundary', asked(write(`${OUT}/nota.md`)))
    assert.match(message, new RegExp(`\\n {2}escribe ${OUT}/nota.md\\n`))
    assert.doesNotThrow(() => execute('workspace-boundary', chat.says('sí')(write(`${OUT}/nota.md`))))
    // Un parche que borra afuera lleva su verbo, no el de escribir.
    const patch = { cwd: root, tool_input: {
      patch: `*** Begin Patch\n*** Delete File: ${OUT}/viejo.md\n*** End Patch`,
    } }
    assert.match(messageOf('workspace-boundary', chat.says('sacá el viejo')(patch)),
      new RegExp(`\\n {2}borra ${OUT}/viejo.md\\n`))

    // Por el enlace de adentro se llega al mismo lugar: el bloqueo dice a dónde lleva, y eso es el ítem.
    const viaLink = chat.says('borrá eso')
    const linked = messageOf('shell-boundary', viaLink(shell('rm -rf service/enlace/sub')))
    assert.match(linked, /a donde lleva/)
    assert.match(linked, new RegExp(`\\n {2}borra ${OUT}/sub\\n`))
    const yes = chat.says('dale')
    assert.doesNotThrow(() => execute('shell-boundary', yes(shell(`rm -rf ${OUT}/sub`))))
    assert.doesNotThrow(() => execute('shell-boundary', yes(shell('rm -rf service/enlace/sub'))))
  } finally {
    chat.close()
  }
})

test('varias rutas afuera en un comando se frenan juntas, y una sola respuesta las cubre', () => {
  const { shell } = project('ops-hook-limite-varias-')
  const chat = chatSession()
  try {
    const asked = chat.says('limpiá las dos')
    const message = messageOf('shell-boundary', asked(shell(`rm -rf ${OUT}/a; mkdir ${OUT}/b`)))
    assert.match(message, new RegExp(`\\n {2}borra ${OUT}/a\\n`))
    assert.match(message, new RegExp(`\\n {2}escribe ${OUT}/b\\n`))
    assert.doesNotThrow(() => execute('shell-boundary', chat.says('dale')(shell(`rm -rf ${OUT}/a; mkdir ${OUT}/b`))))
  } finally {
    chat.close()
  }
})

test('la línea en el archivo de aprobación es la vía sin chat, y es la misma línea que el bloqueo muestra', () => {
  const { root, shell } = project('ops-hook-limite-archivo-')
  const message = messageOf('shell-boundary', shell(`rm -rf ${OUT}/cache`))
  assert.match(message, /Esto lo aprueba una persona/)
  assert.deepEqual(pasteApproval(root, message), [`borra ${OUT}/cache`])
  assert.doesNotThrow(() => execute('shell-boundary', shell(`rm -rf ${OUT}/cache`)))
  blocked('shell-boundary', shell(`echo x > ${OUT}/cache`), /fuera de las raíces declaradas/)
  // Declarar la ruta en la configuración sigue siendo la salida permanente, y el bloqueo la sigue diciendo.
  assert.match(message, /writableOutsideRoots/)
})

test('lo que destructive cuida no se abre confirmando el límite, y el canal de aprobación tampoco', () => {
  const { root, shell, write } = project('ops-hook-limite-cerrado-')
  const chat = chatSession()
  try {
    const asked = chat.says('borrá todo')
    const home = os.homedir()
    const message = messageOf('shell-boundary', asked(shell(`rm -rf ${home}`)))
    assert.match(message, new RegExp(`\\n {2}borra ${home}\\n`))
    const yes = chat.says('dale')
    assert.doesNotThrow(() => execute('shell-boundary', yes(shell(`rm -rf ${home}`))), 'el límite ya no frena')
    assert.throws(() => executeAll(['pre-shell'], yes(shell(`rm -rf ${home}`))),
      /catastrófico|carpeta personal/, 'y destructive sigue frenando, sin salida')
    // Confirmar «escribe <la aprobación>» no la deja escribir: eso lo juzga self-approval, antes y aparte.
    const approval = path.join(root, 'planning', '.ops-approval')
    blocked('workspace-boundary', yes(write(approval)), /aprobarse solo/)
  } finally {
    chat.close()
  }
})

test('con el diálogo del runner a mano, el límite pregunta en vez de bloquear', () => {
  const { shell } = project('ops-hook-limite-dialogo-')
  const native = { ...shell(`rm -rf ${OUT}/cache`), hook_event_name: 'PreToolUse', prompt_id: 'p1',
    session_id: `dialogo-${process.pid}`, permission_mode: 'default' }
  assert.throws(() => executeAll(['shell-boundary'], native), (error) => error.ask === true)
})
