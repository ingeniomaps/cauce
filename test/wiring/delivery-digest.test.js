'use strict'

// Con qué se anota lo que un runner entregó (caso 275). El manifiesto viaja por git, así que lo que guarda
// no puede depender de la carpeta donde está la instancia; y una instancia instalada con el motor anterior
// trae el registro viejo, que tiene que seguir reconociéndose.

const { tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const M = require('../../engine/core/manifest')

function instance(name, folder = 'ops') {
  const base = tempRoot(name)
  const target = path.join(base, folder)
  assert.equal(run(['init', target, '--name', 'Entrega', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  assert.equal(run(['automation', 'install', target, 'claude']).status, 0)
  return { base, target }
}
const WORKFLOW = 'claude/.claude/workflows/autobuild.js'

test('lo que se anota de una entrega no depende de la carpeta de la instancia', () => {
  const one = instance('cauce-entrega-uno-')
  const two = instance('cauce-entrega-dos-en-otra-ruta-', 'ops')
  const first = M.readRunners(one.target)
  const second = M.readRunners(two.target)
  assert.ok(first[WORKFLOW], `el recorrido quedó anotado: ${Object.keys(first).slice(0, 4)}`)
  assert.deepEqual(second, first, 'el mismo motor en dos carpetas anota lo mismo')
  // Y los archivos sí difieren, que es lo que hace que la igualdad de arriba diga algo: cada recorrido
  // lleva escrita su propia raíz.
  const file = (base) => fs.readFileSync(path.join(base, '.claude', 'workflows', 'autobuild.js'), 'utf8')
  assert.notEqual(file(one.base), file(two.base))
  assert.ok(file(one.base).includes(one.target))
})

// `uninstall` saca lo que el runner entregó y conserva lo que la empresa editó, y lo decide contra lo
// anotado. Las tres mitades: el registro de ahora, el de un motor anterior —el hash del archivo tal cual—
// y uno que no coincide con nada.
test('un registro escrito por el motor anterior sigue reconociendo lo entregado', () => {
  const stale = (kind) => {
    const { base, target } = instance(`cauce-entrega-${kind}-`)
    const file = path.join(base, '.claude', 'workflows', 'autobuild.js')
    // Una versión vieja del recorrido: no es la que el motor trae hoy, y lleva la raíz escrita.
    fs.writeFileSync(file, `// versión anterior\nconst ROOT = '${target}'\n`)
    const recorded = M.readRunners(target)
    recorded[WORKFLOW] = {
      nuevo: M.digestRelocatable({ target: file, opsRoot: target }, '{{OPS_ROOT}}'),
      viejo: M.digest(file),
      ajeno: '0000000000000000',
    }[kind]
    M.write(target, undefined, recorded)
    assert.equal(run(['automation', 'uninstall', target, 'claude']).status, 0)
    return fs.existsSync(file)
  }
  assert.equal(stale('nuevo'), false, 'lo anotado sin la ruta se reconoce y se saca')
  assert.equal(stale('viejo'), false, 'lo anotado con la ruta, también')
  assert.equal(stale('ajeno'), true, 'lo que no coincide con nada es de la empresa y se conserva')
})

// Caso 295. El agente de oficina llega con la instalación, como los recorridos que lo nombran: un recorrido
// que pide un tipo de agente que la sesión no tiene no puede lanzar ese paso. Y sus dos propiedades son lo
// que lo vuelve liviano y lo que lo mantiene contenido: sin las instrucciones del proyecto, y sólo con Bash.
test('instalar Claude entrega el agente de oficina que el recorrido nombra, y desinstalar lo retira', () => {
  const { base, target } = instance('cauce-entrega-oficina-')
  const file = path.join(base, '.claude', 'agents', 'cauce-clerk.md')
  const text = fs.readFileSync(file, 'utf8')
  const front = text.split('---')[1]
  assert.match(front, /^name: cauce-clerk$/m)
  assert.match(front, /^omitClaudeMd: true$/m)
  assert.match(front, /^tools: Bash$/m, 'sin herramientas de archivo: lo que escribe lo escribe el comando')
  const workflow = fs.readFileSync(path.join(base, '.claude', 'workflows', 'autobuild.js'), 'utf8')
  assert.match(workflow, /agentType: 'cauce-clerk'/, 'el nombre que pide el recorrido es el que se instala')

  // El de escritura llega igual, con herramientas de archivo. Carga las instrucciones del proyecto, al revés
  // que el de oficina: redacta, y lo que redacta sigue las reglas de la empresa (casos 301 y 302).
  const scribe = path.join(base, '.claude', 'agents', 'cauce-scribe.md')
  const scribeFront = fs.readFileSync(scribe, 'utf8').split('---')[1]
  assert.match(scribeFront, /^name: cauce-scribe$/m)
  assert.doesNotMatch(scribeFront, /omitClaudeMd/)
  // Con `Skill`: una empresa puede mandar commitear con un skill propio, y quien no lo tiene no puede cumplirla.
  assert.match(scribeFront, /^tools: Bash, Read, Edit, Write, Skill$/m)
  assert.match(workflow, /agentType: 'cauce-scribe'/)

  assert.equal(run(['automation', 'uninstall', target, 'claude']).status, 0)
  assert.equal(fs.existsSync(file), false)
  assert.equal(fs.existsSync(scribe), false)
})

// Caso 308. Después de `upgrade` y antes de reinstalar el runner, lo instalado es de la versión anterior. El
// contrato lo dice con el nombre del archivo, que es lo que el recorrido necesita para negarse a seguir.
test('el contrato nombra lo instalado que quedó atrás del motor, y nada cuando está al día', () => {
  const { base, target } = instance('cauce-entrega-atras-')
  const contract = () => JSON.parse(run(['contract', target, '--json']).stdout)
  assert.deepEqual(contract().staleAdapter, [], 'recién instalado no hay nada atrás')

  // Una copia vieja es la que coincide con lo que se anotó al entregarla y ya no con lo que Cauce trae.
  const file = path.join(base, '.claude', 'workflows', 'autobuild.js')
  fs.appendFileSync(file, '\n// de la versión anterior\n')
  const manifest = path.join(target, '.cauce', 'manifest.json')
  const data = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  data.runners[WORKFLOW] = M.digest(file)
  fs.writeFileSync(manifest, JSON.stringify(data, null, 2))
  assert.deepEqual(contract().staleAdapter, ['.claude/workflows/autobuild.js'])

  // Y una que la empresa editó no es vieja: es suya, y `doctor` lo dice de otra forma.
  fs.appendFileSync(file, '\n// editado a mano\n')
  assert.deepEqual(contract().staleAdapter, [])
})
