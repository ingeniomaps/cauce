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

// Un límite que el proyecto escribe y ningún agente recibe es el modo de fallo caro de este comando: la
// lista sale más corta y se lee igual de completa, así que nadie lo nota hasta que un agente hace lo que
// ese límite prohibía (caso 157). Se cierra por dos lados —una marca que se lee en vez de deducirse, y un
// aviso para lo que no entre por ninguno— y los dos se prueban acá.
const conExcepcion = (root, texto) => {
  const file = path.join(root, 'organization', 'workspace.md')
  fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}\n${texto}\n`)
}

test('un límite declarado bajo ### Límites llega sin imitar la gramática del molde', () => {
  const root = instance('cauce-contract-marcado-')
  const antes = contractOf(root).value.boundaries.length
  conExcepcion(root, '### Límites\n\n- En `api/` no se tocan migraciones sin aprobación de datos.')
  const { value } = contractOf(root)
  assert.equal(value.boundaries.length, antes + 1, `llegó: ${value.boundaries.join(' | ')}`)
  assert.ok(value.boundaries.some((one) => /migraciones/.test(one)), 'y es el que el proyecto escribió')
})

// Un ejemplo que viaja al preámbulo de cada subagente como límite real es peor que no traer ninguno:
// nadie escribió esa regla y todos la obedecerían. Lo que lo evita es que el molde lo deje comentado, así
// que lo que se fija es eso —que el molde no declare ninguno vivo— y no el filtro que lo implementa.
test('el molde no declara ningún límite vivo, para que su ejemplo no se obedezca', () => {
  const root = instance('cauce-contract-ejemplo-')
  const { value } = contractOf(root)
  assert.equal(value.boundaries.some((one) => /migraciones/.test(one)), false,
    `el ejemplo se filtró: ${value.boundaries.join(' | ')}`)
  assert.equal(value.boundaries.length, 3, 'siguen siendo los tres que enuncia AGENTS.md')
  // Y el archivo del molde lo tiene comentado, que es lo único que lo sostiene: descomentarlo lo
  // convierte en un límite de verdad, y eso tiene que ser una decisión de quien lo escribe.
  const texto = fs.readFileSync(path.join(root, 'organization', 'workspace.md'), 'utf8')
  assert.match(texto, /<!--\s*-\s+En `api\/`/, 'el ejemplo vive comentado en el molde')
})

// La rama que nadie ejercía: un `ops.config.json` ilegible tiene que nombrar el error de JSON en vez de
// contestar un contrato a medias, que es lo que hace el resto del comando cuando algo falta.
test('contract dice qué tiene de malo un ops.config.json ilegible', () => {
  const root = instance('cauce-contract-json-')
  fs.writeFileSync(path.join(root, 'ops.config.json'), '{ "project": ')
  const { result } = contractOf(root)
  assert.notEqual(result.status, 0, 'no contesta un contrato sobre un archivo que no pudo leer')
  assert.match(result.stderr, /ops\.config\.json no se pudo leer como JSON/, result.stderr)
})

// Lo que no entra por ninguno de los dos caminos deja de perderse en silencio. Se asercia el párrafo
// citado y no sólo que haya un aviso: sin la cita, quien lo lee no sabe cuál de sus límites se perdió.
test('check nombra el párrafo del proyecto que no llega a los agentes', () => {
  const root = instance('cauce-contract-aviso-')
  conExcepcion(root, 'En `api/` no se tocan migraciones sin aprobación de datos.')
  // Los avisos de `check` salen por `stderr` —`console.warn`—, no por `stdout`, que lleva el veredicto.
  // Buscarlos en el canal equivocado deja la prueba en rojo sobre un aviso que sí se emitió.
  const hecho = run(['check', path.join(root, 'planning')])
  assert.match(hecho.stderr, /workspace\.md/, hecho.stderr)
  assert.match(hecho.stderr, /migraciones/, 'cita el párrafo perdido, no sólo su cantidad')
})

// Y no avisa del molde intacto, que es lo que lo vuelve un aviso y no ruido: uno que salta siempre se
// termina apagando, y con él se apaga el día que de verdad había algo.
test('check no avisa sobre la prosa que el molde trae', () => {
  const root = instance('cauce-contract-silencio-')
  const hecho = run(['check', path.join(root, 'planning')])
  assert.equal(/no llegan a los agentes/.test(hecho.stderr), false, hecho.stderr)
})

// Hacer lo que el 157 pide subía el aviso en dos en vez de bajarlo; por qué, en `marked()` y en el
// filtro de `warnings` (caso 159). Acá se fija el veredicto que se ve desde afuera.
//
// El orden de las aserciones no es decorativo: la primera es la que impide arreglar esto callando todo,
// y por eso la prosa de afuera se escribe antes del bloque, que es como queda cuando una persona agrega
// el suyo al final del archivo.
test('declarar un límite lo saca del aviso, y la prosa de afuera sigue entrando', () => {
  const root = instance('cauce-contract-declarado-')
  conExcepcion(root, 'Esto lo escribió el proyecto y es un límite que nadie declaró todavía.')
  conExcepcion(root, '### Límites\n\nLo de arriba es la razón, para una persona; esto es lo que viaja.\n\n'
    + '- En `api/` no se tocan migraciones sin aprobación de datos.\n- No se empuja a la rama viva.')
  const hecho = run(['check', path.join(root, 'planning')])

  assert.match(hecho.stderr, /Esto lo escribió el proyecto/, 'la prosa de afuera sigue avisando')
  assert.equal(/migraciones/.test(hecho.stderr), false, 'una viñeta declarada no es un límite perdido')
  assert.equal(/Lo de arriba es la razón/.test(hecho.stderr), false,
    'ni la prosa que presenta el bloque, que es la que sube el número al adoptarlo')
  assert.match(hecho.stderr, /1 párrafo\(s\)/, 'y queda contado el único que de verdad no llega')

  // La otra mitad del caso: el aviso mandaba a imitar la gramática, que es justo lo que el 157 existe
  // para no tener que hacer. Se asercia por ausencia porque cambiar el texto es una quita —el camino
  // viejo deja de recomendarse— y lo nuevo podría aparecer con lo viejo todavía puesto.
  assert.match(hecho.stderr, /va como viñeta bajo `### Límites`/, 'manda al camino declarado')
  assert.equal(/porque no arrancan con «El runner»/.test(hecho.stderr), false,
    'y ya no manda a imitar la gramática, que es el camino que el 157 vino a evitar')
})
