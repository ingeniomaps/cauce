'use strict'

// Se asercia la **forma** de cada campo y no sólo que haya algo, y ésa es la decisión de esta suite. Lo
// que el comando devuelve no lo lee una persona: el recorrido lo interpola en el preámbulo que reenvía a
// cada subagente, así que un campo con la forma cambiada —una ruta sin su nombre, un límite con el
// encabezado pegado— no rompe nada visible y altera lo que decenas de agentes leen como sus límites.
//
// Qué deriva y de dónde lo explica el módulo; acá no se repite.

const { tempRoot, run } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Una instancia de verdad y no un directorio a mano: lo que este comando promete es leer lo que `init`
// deja, así que fabricar el fixture le sacaría al verde justamente lo que tiene que sostener.
function instance(prefijo, mode = 'sidecar') {
  const base = tempRoot(prefijo)
  const target = path.join(base, 'demo-ops')
  const created = run(['init', target, '--name', 'Demo', '--mode', mode])
  assert.equal(created.status, 0, created.stderr)
  return target
}

const contractOf = (root, extra = []) => {
  const result = run(['contract', root, '--json', ...extra])
  return { result, value: result.status === 0 ? JSON.parse(result.stdout) : null }
}

test('contract deriva del disco los diez campos que el recorrido pedía a un modelo', () => {
  const root = instance('cauce-contract-')
  const { result, value } = contractOf(root)
  assert.equal(result.status, 0, result.stderr)

  assert.equal(value.rootOk, true, 'los cuatro archivos están: init los deja')
  assert.equal(typeof value.project, 'string')
  assert.ok(value.project, 'el nombre del proyecto sale de ops.config.json')
  // La forma la fija el preámbulo que las consume —`workspaceRoots es el límite completo de escritura`—,
  // así que se asercia la forma y no sólo que haya algo.
  assert.ok(Array.isArray(value.workspaceRoots) && value.workspaceRoots.length >= 1)
  for (const entry of value.workspaceRoots) assert.match(entry, /^.+ → .+$/, entry)
  assert.equal(typeof value.maxTaskHours, 'number')
  assert.equal(typeof value.commitPerTask, 'boolean')
  assert.equal(typeof value.humanCheckpoint, 'boolean')
  // Sin `verify` declarado no hay gate que nombrar, y la lista vacía significa eso y no «no lo miré».
  assert.deepEqual(value.gates, [], 'el molde no declara verify en ninguna raíz')
  assert.ok(value.contracts.includes('Contratos'), 'la sección de PROTOCOL.md viaja entera')
  assert.ok(Array.isArray(value.boundaries))
})

// Un límite es lo que el runner puede, debe o nunca hace. La sección trae además tres párrafos que
// **explican** —por qué una recurrencia vencida no es una excepción, dónde se decide publicar, que todo
// eso rige sin escribir nada—: prosa dirigida a una persona, que ningún agente puede obedecer.
//
// La diferencia importa porque `SCOPE()` une esta lista con `; ` y la reenvía a **cada** subagente. Partir
// por oración metía los seis y los conectores sueltos, y el preámbulo pasaba de una enumeración a dos mil
// caracteres de markdown. Se corta por el sujeto y no por la posición: los tres que enuncian empiezan
// nombrando al runner o su deber, que es vocabulario cerrado como el de `lane` (caso 154).
test('contract separa el límite que se obedece de la prosa que lo explica', () => {
  const root = instance('cauce-contract-limites-')
  const { result, value } = contractOf(root)
  assert.equal(result.status, 0, result.stderr)

  assert.equal(value.boundaries.length, 3,
    `enuncian tres; llegaron ${value.boundaries.length}:\n  ${value.boundaries.join('\n  ')}`)
  for (const one of value.boundaries) assert.match(one, /^(El runner|Debe|Nunca)/, one)
  const junto = value.boundaries.join(' ')
  assert.doesNotMatch(junto, /Eso rige sin que nadie/, 'un conector no es un límite')
  assert.doesNotMatch(junto, /^Autonomía/, 'el encabezado tampoco, y se pegaba al primero')
  assert.doesNotMatch(junto, /BR-OPS-002/, 'razonar sobre una regla no es enunciarla')
  // El tamaño es la mitad del punto: esto se reenvía por subagente, no se lee una vez.
  assert.ok(junto.length < 800, `tiene que caber en el preámbulo, y mide ${junto.length} B`)
})

// El molde no declara excepciones —su sección explica cómo escribirlas—, así que ninguna es el resultado
// correcto y no un vacío que haya que rellenar. El prompt que esto reemplaza lo decía igual: «si su
// sección sigue como la trae el molde, no inventes ninguna».
test('contract no toma por excepción del proyecto la instrucción del molde', () => {
  const root = instance('cauce-contract-molde-')
  const { value } = contractOf(root)
  const junto = value.boundaries.join(' ')
  assert.doesNotMatch(junto, /Acá va lo que este proyecto amplía/, 'eso le habla a quien escribe')
  assert.doesNotMatch(junto, /Eso no depende del proyecto/)
})

test('contract no inventa un gate ni lo omite: sale de las raíces que declaran verify', () => {
  const root = instance('cauce-contract-gates-')
  const config = path.join(root, 'ops.config.json')
  const value = JSON.parse(fs.readFileSync(config, 'utf8'))
  value.workspaceRoots = [
    { name: 'api', path: '../api', verify: 'npm test' },
    { name: 'web', path: '../web' },
  ]
  fs.writeFileSync(config, JSON.stringify(value, null, 2))

  const { result, value: contract } = contractOf(root)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(contract.gates, ['../api → npm test'], 'sólo la raíz que lo declara')
  assert.deepEqual(contract.workspaceRoots, ['api → ../api', 'web → ../web'], 'las dos, declaren o no')
})

// Las dos mitades del criterio de falla, que el módulo justifica: acá se fija que sean dos y no una. Se
// asercia el texto del error y no sólo el código de salida, porque lo que vuelve accionable a este bloqueo
// es que nombre la sección — un «no se pudo derivar el contrato» manda a mirar los cuatro archivos.
test('contract falla nombrando la sección que falta, y sólo en lo que el motor garantiza', () => {
  const root = instance('cauce-contract-roto-')
  const agents = path.join(root, 'AGENTS.md')
  fs.writeFileSync(agents, fs.readFileSync(agents, 'utf8').replace(/^## Autonomía$/m, '## Otra cosa'))

  const { result } = contractOf(root)
  assert.notEqual(result.status, 0, 'entregar límites vacíos a cada subagente es peor que parar')
  assert.match(result.stderr, /Autonomía/, 'nombra la sección, que es lo que hace falta para arreglarlo')
  assert.match(result.stderr, /AGENTS\.md/, 'y en qué archivo')
})

test('contract tolera que el proyecto no declare excepciones, que es un estado legítimo', () => {
  const root = instance('cauce-contract-sin-excepciones-')
  const workspace = path.join(root, 'organization', 'workspace.md')
  fs.writeFileSync(workspace, '# Workspace\n\nSin excepciones declaradas.\n')

  const { result, value } = contractOf(root)
  assert.equal(result.status, 0, result.stderr)
  assert.ok(value.boundaries.length, 'los del toolkit siguen viajando: son los que rigen sin escribir nada')
})

test('contract dice qué archivo falta en vez de contestar un contrato a medias', () => {
  const root = instance('cauce-contract-sin-protocolo-')
  fs.unlinkSync(path.join(root, 'planning', 'PROTOCOL.md'))

  const { result } = contractOf(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /PROTOCOL\.md/)
})

// Leer el contrato no puede cambiarlo: el comando lo corre un recorrido en cada arranque.
test('contract no escribe nada', () => {
  const root = instance('cauce-contract-solo-lectura-')
  const antes = run(['contract', root, '--json'])
  assert.equal(antes.status, 0, antes.stderr)
  const huella = fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8')
  const despues = run(['contract', root, '--json'])
  assert.equal(despues.stdout, antes.stdout, 'dos lecturas seguidas dan lo mismo')
  assert.equal(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'), huella)
})
