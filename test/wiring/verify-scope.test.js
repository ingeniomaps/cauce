'use strict'

// Dónde corre el gate cuando la raíz declara su alcance. Vive aparte de `hooks.test.js` porque lo que
// monta es distinto: aquellos casos prueban qué bloquea cada guard, y éstos no miran el bloqueo sino el
// **lugar** —árbol o copia del índice—, lo que pide una instancia con `ops.config.json` y raíces
// declaradas en vez del repositorio pelado que alcanza allá.
//
// El discriminador es el propio gate registrando su `cwd` en un archivo fuera del repositorio, y no el
// mensaje del bloqueo. Medirlo por el mensaje falla en silencio: `verifyGates` vuelve sin bloquear
// cuando lo staged está aprobado, así que la ausencia de la línea «Corrió sobre el índice» significa
// «no bloqueó» y no «corrió sobre el árbol». Costó una medición entera leerla al revés.

const { tempRoot } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { execute } = require('../../engine/hooks/run')

// `GIT_DIR` heredada le gana a `-C` y a `cwd`, así que sin limpiarla cada comando de acá operaría sobre
// el repositorio que la haya exportado (caso 045).
function git(args, cwd) {
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env })
  assert.equal(result.status, 0, result.stderr)
}

// Una instancia con su raíz declarada y un gate que deja dicho dónde corrió. El gate sale en verde: lo
// que se mide es el lugar, y un rojo traería además el bloqueo y su aprobación, que son otra pregunta.
function instancia(scope) {
  const root = tempRoot('ops-verify-scope-')
  const marca = path.join(root, '..', `${path.basename(root)}-donde.txt`)
  const raiz = { name: 'main', path: '.', ...(scope ? { scope } : {}) }
  fs.mkdirSync(path.join(root, 'planning', 'wip'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    project: 'x', mode: 'embedded', workspaceRoots: [raiz],
  }))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    scripts: { test: `node -e "require('node:fs').writeFileSync(process.env.OPS_DONDE, process.cwd())"` },
  }))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'module.exports = 1\n')
  git(['init', '-q'], root)
  git(['config', 'user.email', 'prueba@ejemplo'], root)
  git(['config', 'user.name', 'Prueba'], root)
  git(['add', 'ops.config.json', 'package.json', 'src/app.js'], root)
  git(['commit', '-qm', 'base'], root)
  // El commit que se quiere hacer: un cambio staged, que por sí solo no fuerza nada.
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'module.exports = 2\n')
  git(['add', 'src/app.js'], root)
  return { root, marca }
}

function donde({ root, marca }) {
  const previo = process.env.OPS_DONDE
  process.env.OPS_DONDE = marca
  try {
    fs.rmSync(marca, { force: true })
    execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } })
  } finally {
    if (previo === undefined) delete process.env.OPS_DONDE
    else process.env.OPS_DONDE = previo
  }
  assert.ok(fs.existsSync(marca), 'el gate no llegó a correr, así que no se midió nada')
  const corrio = fs.readFileSync(marca, 'utf8').trim()
  assert.ok(corrio, 'el gate corrió pero no dejó dónde')
  // Se comparan las cadenas tal cual, sin resolver la ruta contra el disco: la copia **ya no existe**
  // cuando se lee esto —se borra al terminar, pase o falle el gate— así que resolverla lanza `ENOENT`.
  // Ese error no se leía como un arnés roto sino como la aserción fallando, y mandó a buscar el defecto
  // al motor durante una tanda entera.
  return corrio === root ? 'árbol' : 'copia'
}

// La misma compatibilidad que fija `test/repo/scope.test.js`, acá de punta a punta: aquélla mira la
// decisión, ésta mira dónde terminó corriendo el gate. Son los dos lados de la misma promesa, y hace
// falta el de acá porque una decisión correcta mal cableada se ve igual de verde.
test('sin scope declarado, un archivo ajeno sigue forzando la copia', () => {
  const caso = instancia(null)
  assert.equal(donde(caso), 'árbol', 'sin delta, el árbol es el próximo commit')
  fs.writeFileSync(path.join(caso.root, 'NOTAS.md'), 'apuntes\n')
  assert.equal(donde(caso), 'copia', 'como siempre: cualquier delta materializa')
})

// El caso 156 entero: lo que el gate no va a abrir no puede cambiar su veredicto.
test('con scope declarado, un archivo fuera del alcance deja correr sobre el árbol', () => {
  const caso = instancia(['src/**', 'package.json'])
  fs.writeFileSync(path.join(caso.root, 'NOTAS.md'), 'apuntes\n')
  assert.equal(donde(caso), 'árbol')
})

test('y uno dentro del alcance la fuerza igual que antes', () => {
  const caso = instancia(['src/**', 'package.json'])
  fs.writeFileSync(path.join(caso.root, 'src', 'suelto.js'), 'module.exports = 3\n')
  assert.equal(donde(caso), 'copia', 'lo que el gate lee sigue midiéndose sobre el índice')
})

// El bucle que este caso destraba, y la razón por la que el 153 no tiene salida hoy: el archivo que el
// propio bloqueo manda crear para aprobar unas rutas queda sin trackear, y con él cada commit siguiente
// corre sobre la copia — que en un proyecto Next es un gate que no puede pasar.
test('el archivo de aprobación que el guard manda crear ya no fuerza la copia', () => {
  const caso = instancia(['src/**', 'package.json'])
  fs.writeFileSync(path.join(caso.root, 'planning', '.ops-approval'), 'src/app.js\n')
  assert.equal(donde(caso), 'árbol')
})

// Un directorio sin trackear llega colapsado —git reporta `?? extra/` y **no dice qué hay adentro**, ni
// siquiera cuando lo nuevo está varios niveles abajo—. Se materializa igual: dejar de hacerlo sería
// decidir sobre un contenido que nadie miró.
//
// El directorio va fuera de `src/`, que está trackeado: adentro git reportaría el archivo y no el
// directorio, y el caso pasaría por el camino común sin ejercer nunca la rama que dice ejercer.
test('un directorio sin trackear al que el alcance apunta adentro fuerza la copia', () => {
  const caso = instancia(['extra/**/*.js'])
  fs.mkdirSync(path.join(caso.root, 'extra', 'hondo'), { recursive: true })
  fs.writeFileSync(path.join(caso.root, 'extra', 'hondo', 'x.js'), 'module.exports = 4\n')
  const estado = spawnSync('git', ['status', '--porcelain'], { cwd: caso.root, encoding: 'utf8' })
  assert.match(estado.stdout, /\?\? extra\/$/m, 'el escenario tiene que entregar un directorio, no un archivo')
  assert.equal(donde(caso), 'copia')
})
