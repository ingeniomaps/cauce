'use strict'

// Caso 368. `destructive` cuidaba el directorio actual, la raíz ops y las raíces declaradas. La carpeta
// personal quedaba cuidada sólo por contenerlos: con el proyecto fuera de ella, un `cd ~ && rm -rf .` pasaba.
//
// El guard sólo lee el texto del comando: acá no se ejecuta ningún borrado.

const { tempRoot } = require('../support/environment')
const { blocked } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')

test('un rm recursivo que cae sobre la carpeta personal frena aunque el proyecto no viva adentro', () => {
  // El proyecto va en el temporal, fuera de la carpeta personal: es justo el caso que pasaba.
  const root = path.join(tempRoot('ops-hook-casa-'), 'repo')
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.mkdirSync(path.join(root, 'service'))
  fs.writeFileSync(path.join(root, 'ops.config.json'),
    JSON.stringify({ workspaceRoots: [{ name: 'service', path: 'service' }] }))
  assert.ok(!root.startsWith(os.homedir() + path.sep), 'la precondición: el proyecto no está en la carpeta personal')
  const run = (command) => execute('destructive', { cwd: root, tool_input: { command } })
  const up = path.relative(root, path.dirname(os.homedir())) || '.'
  for (const command of ['cd ~ && rm -rf .', 'cd ~ && rm -rf *', 'cd ~ && rm -rf ./*', `cd ${os.homedir()} && rm -rf .`,
    `rm -rf ${path.dirname(os.homedir())}`, `rm -rf ${up}`]) {
    blocked('destructive', { cwd: root, tool_input: { command } }, /se lleva la carpeta personal/)
  }
  // Una carpeta de adentro no es la carpeta personal.
  for (const command of ['cd ~ && rm -rf proyecto-viejo', 'cd ~/Documentos && rm -rf .', 'rm -rf ~/.cache/algo',
    `rm -rf ${os.homedir()}/algo`]) assert.doesNotThrow(() => run(command), command)
})
