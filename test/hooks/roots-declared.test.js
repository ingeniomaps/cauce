'use strict'

// Caso 373: ensanchar el límite de raíces desde su propia configuración lo confirma una persona. Qué se
// compara y por qué, en el encabezado de `engine/hooks/ops-config.js`; acá, cada condición con su aserción.
//
// Nada de acá ejecuta un comando ni escribe fuera del banco; la carpeta de afuera es un nombre que no existe.

const { tempRoot } = require('../support/environment')
const { blocked, chatSession, messageOf, pasteApproval } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')

const OUT = path.join(os.homedir(), 'fuera-de-las-raices')
const BASE = { mode: 'sidecar', workspaceRoots: [{ name: 'app', path: '../app' }], runner: { allowPush: false } }

function instance(name, config = BASE, local = null) {
  const root = path.join(tempRoot(name), 'acme-ops')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(path.dirname(root), 'app', 'src'), { recursive: true })
  fs.symlinkSync(OUT, path.join(path.dirname(root), 'app', 'enlace'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(config, null, 2))
  if (local) fs.writeFileSync(path.join(root, 'ops.config.local.json'), JSON.stringify(local, null, 2))
  const file = path.join(root, 'ops.config.json')
  const localFile = path.join(root, 'ops.config.local.json')
  const write = (content, target = file) => ({
    cwd: root, tool_input: { file_path: target, content: JSON.stringify(content, null, 2) },
  })
  const shell = (command) => ({ cwd: root, tool_input: { command } })
  return { root, file, localFile, write, shell }
}

const WIDENS = /ensancha lo que el límite de raíces deja escribir/
const CONFIRM = /pedile que lo confirme con sus palabras/

test('agregar una ruta escribible o una raíz la confirma una persona, con la entrada resuelta a la vista', () => {
  const { root, write } = instance('ops-hook-declara-')
  const chat = chatSession()
  try {
    const asked = chat.says('liberá espacio')
    const outside = { ...BASE, writableOutsideRoots: ['~/fuera-de-las-raices/cache'] }
    const message = messageOf('ops-config', asked(write(outside)))
    assert.match(message, WIDENS)
    assert.match(message, CONFIRM)
    assert.match(message, /vale para este turno/)
    assert.match(message, new RegExp(`\\n {2}declara ${OUT}/cache\\n`), 'la línea lleva la ruta resuelta')
    // Una raíz de producto ensancha lo mismo, y el archivo de la máquina también.
    const asRoot = { ...BASE, workspaceRoots: [...BASE.workspaceRoots, { name: 'x', path: OUT }] }
    assert.match(messageOf('ops-config', asked(write(asRoot))), new RegExp(`\\n {2}declara ${OUT}\\n`))
    const localFile = path.join(root, 'ops.config.local.json')
    assert.match(messageOf('ops-config', asked(write({ writableOutsideRoots: ['~'] }, localFile))),
      new RegExp(`\\n {2}declara ${os.homedir()}\\n`))

    // Confirmado, pasan las entradas que los bloqueos mostraron y ninguna otra; y en el mensaje siguiente
    // vuelve a preguntar.
    const yes = chat.says('dale')
    assert.doesNotThrow(() => execute('ops-config', yes(write(outside))))
    blocked('ops-config', yes(write({ ...BASE, writableOutsideRoots: ['~/fuera-de-las-raices/otra'] })), WIDENS)
    blocked('ops-config', chat.says('ahora el login')(write(outside)), CONFIRM)
  } finally {
    chat.close()
  }
  // Pedirlo nombrando el archivo y la ruta tampoco alcanza: es la misma salida angosta del 370. En una sesión
  // propia (`chatSession`).
  const order = chatSession()
  try {
    const outside = { ...BASE, writableOutsideRoots: [`${OUT}/cache`] }
    blocked('ops-config', order.says(`agregá ${OUT}/cache a writableOutsideRoots de ops.config.json`)(write(outside)),
      CONFIRM)
  } finally {
    order.close()
  }
})

test('lo que no ensancha no se pregunta: angostar, reordenar, reescribir igual o quedar bajo lo declarado', () => {
  const declared = { ...BASE, writableOutsideRoots: ['~/fuera-de-las-raices', '../salidas'] }
  const { root, write, localFile } = instance('ops-hook-declara-igual-', declared)
  const passes = (content, target) => assert.doesNotThrow(() => execute('ops-config', write(content, target)))
  passes(declared)
  passes({ ...declared, writableOutsideRoots: ['../salidas', '~/fuera-de-las-raices'] })
  passes({ ...declared, writableOutsideRoots: [`${OUT}/`, path.resolve(root, '../salidas')] })
  passes({ ...declared, writableOutsideRoots: ['../salidas'] })
  passes({ ...declared, writableOutsideRoots: ['~/fuera-de-las-raices/cache'] })
  passes({ ...declared, workspaceRoots: [{ name: 'app', path: '../app' }, { name: 'src', path: '../app/src' }] })
  passes({ ...declared, workspaceRoots: [], runner: { allowPush: false, maxTaskHours: 2 } })
  // Lo que el archivo compartido ya declara no es nuevo en el de la máquina, y al revés tampoco: lo que
  // cuenta es la unión de los dos en disco, no el archivo que se escribe.
  passes({ writableOutsideRoots: ['~/fuera-de-las-raices/cache'] }, localFile)
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify(BASE))
  fs.writeFileSync(localFile, JSON.stringify({ writableOutsideRoots: [OUT] }))
  passes({ ...BASE, writableOutsideRoots: ['~/fuera-de-las-raices'] })
  passes({ ...BASE, workspaceRoots: [...BASE.workspaceRoots, { name: 'x', path: `${OUT}/sub` }] })
  // Las dos llaves del push se siguen juzgando como antes, aparte.
  blocked('ops-config', write({ ...declared, runner: { allowPush: true } }), /runner\.allowPush/)
})

test('un fragmento o un comando sobre cualquiera de los dos archivos se frena: no hay con qué comparar', () => {
  const { root, file, localFile, shell, write } = instance('ops-hook-declara-shell-')
  const edit = (target, fragment = '"writableOutsideRoots": ["~"]') => ({
    cwd: root, tool_input: { file_path: target, old_string: '[]', new_string: fragment },
  })
  blocked('ops-config', edit(file), /no puede verificar no autoriza/)
  blocked('ops-config', edit(localFile), /no puede verificar no autoriza/)
  // Un fragmento que es JSON válido sigue siendo un fragmento, y un JSON que no es un objeto no es el archivo.
  blocked('ops-config', edit(file, '["/"]'), /no puede verificar no autoriza/)
  blocked('ops-config', edit(file, '{"allowPush": true}'), /no puede verificar no autoriza/)
  blocked('ops-config', write(['~']), /no puede verificar no autoriza/)
  // Por shell nombrar el archivo tampoco abre nada; confirmar el bloqueo sí, por ese turno (revisión del 373).
  // El porqué, en `asked` y `judgeCommand` (`engine/hooks/ops-config.js`).
  const widen = `sed -i 's/"workspaceRoots": \\[/"workspaceRoots": [{"path":"~"},/' ${file}`
  const chat = chatSession()
  try {
    const named = chat.says('abrí ops.config.json y fijate qué raíces hay')
    const stopped = messageOf('ops-config-shell', named(shell(widen)))
    assert.match(stopped, /no dice con qué/)
    assert.match(stopped, /no va a ver con qué queda/)
    assert.match(stopped, /pedile que lo confirme con sus palabras/)
    assert.doesNotMatch(stopped, /tal cual en/, 'no ofrece nada que pegar: la línea quedaría para siempre')
    const yes = chat.says('dale')
    assert.doesNotThrow(() => execute('ops-config-shell', yes(shell(widen))))
    blocked('ops-config-shell', yes(shell(`echo '{}' > ${localFile}`)), /no dice con qué/)
    blocked('ops-config-shell', chat.says('seguí')(shell(widen)), /no dice con qué/)
  } finally {
    chat.close()
  }
  // Y la línea en el archivo de aprobación, pegada igual, no abre nada.
  fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), `escribe ${file}\n`)
  blocked('ops-config-shell', shell(widen), /no dice con qué/)
  fs.rmSync(path.join(root, 'planning', '.ops-approval'))
  // El archivo se reconoce por dónde cae: por un enlace con otro nombre se juzga igual.
  fs.symlinkSync(file, path.join(root, 'cfg.json'))
  blocked('ops-config-shell', shell('sed -i s/x/y/ cfg.json'), /no dice con qué/)
  blocked('ops-config', { cwd: root, tool_input: { file_path: path.join(root, 'cfg.json'), content: '[]' } },
    /no puede verificar no autoriza/)
  blocked('ops-config-shell', shell(`echo '{"writableOutsideRoots":["~"]}' > ${localFile}`), /no dice con qué/)
  blocked('ops-config-shell', shell('sed -i s/x/y/ ops.config.local.json'), /no dice con qué/)
  // El CLI que escribe la configuración no es una escritura que este guard vea, y no tiene por qué.
  for (const command of ['node tools/ops.js upgrade .', 'npx cauce init . --mode sidecar',
    'cat ops.config.local.json']) {
    assert.doesNotThrow(() => execute('ops-config-shell', shell(command)), command)
  }
})

// Revisión del 373: una entrada se juzga por dónde cae, no por cómo está escrita. El porqué, en `opened`
// (`engine/hooks/ops-config.js`).
test('declarar un enlace de adentro que lleva afuera ensancha, y el bloqueo muestra a dónde lleva', () => {
  const { write } = instance('ops-hook-declara-enlace-')
  const viaLink = { ...BASE, writableOutsideRoots: ['../app/enlace'] }
  assert.match(messageOf('ops-config', write(viaLink)), new RegExp(`\\n {2}declara ${OUT}\\n`))
  const asRoot = { ...BASE, workspaceRoots: [...BASE.workspaceRoots, { name: 'x', path: '../app/enlace/sub' }] }
  assert.match(messageOf('ops-config', write(asRoot)), new RegExp(`\\n {2}declara ${OUT}/sub\\n`))
  // Una raíz de producto con `~` se muestra como la resuelve el límite.
  const tilde = { ...BASE, workspaceRoots: [...BASE.workspaceRoots, { name: 'y', path: '~/datos' }] }
  assert.match(messageOf('ops-config', write(tilde)), /\n {2}declara \/.*acme-ops\/~\/datos\n/)
})

test('la línea en el archivo de aprobación declara sin chat, y el límite ya no manda a declararla solo', () => {
  const { root, write, shell } = instance('ops-hook-declara-archivo-')
  const outside = { ...BASE, writableOutsideRoots: [`${OUT}/cache`] }
  const message = messageOf('ops-config', write(outside))
  assert.match(message, /Esto lo aprueba una persona/)
  assert.deepEqual(pasteApproval(root, message), [`declara ${OUT}/cache`])
  assert.doesNotThrow(() => execute('ops-config', write(outside)))
  // Y el límite ya no manda al agente a declararla solo.
  const limit = messageOf('shell-boundary', shell(`rm -rf ${OUT}/otra`))
  assert.match(limit, /lo declara una persona/)
  assert.doesNotMatch(limit, /declaralo/)
})
