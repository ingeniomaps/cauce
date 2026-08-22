'use strict'

// Qué hay en el workspace, resuelto por código y no por un modelo. Existe porque el arranque empezaba
// pidiéndole a un agente que «inventariara el repositorio»: en una carpeta vacía eso gastó doce minutos
// para no encontrar nada. Recorrer directorios y leer manifiestos es determinista, y lo que no lo es
// —qué de todo esto es el producto, qué está muerto— recién vale la pena preguntárselo a un modelo
// cuando esta lista existe.

const fs = require('node:fs')
const path = require('node:path')

// Lo que nunca es un servicio del proyecto. `node_modules` es el que hace la diferencia entre
// milisegundos y minutos: adentro hay un manifiesto por dependencia. Los directorios ocultos se saltean
// enteros —regla, no lista—: ahí viven la configuración del runner, el banco de evaluación y las cachés,
// y un servicio del producto no se esconde detrás de un punto.
const IGNORED = new Set([
  'node_modules', 'vendor', 'dist', 'build', 'target', 'out', 'coverage', 'venv', '__pycache__', 'tmp',
  'bower_components', 'jspm_packages', 'Pods', 'DerivedData', 'elm-stuff', '_build', 'deps', 'obj',
  'site-packages', 'dist-newstyle', 'htmlcov', 'storybook-static', 'logs',
])

// Lo que este proyecto ya declaró que no es suyo. Leer el `.gitignore` de la raíz sale gratis y ahorra
// mantener una lista de basura ajena: cada proyecto tiene la suya, y el nuestro no la puede adivinar.
//
// Se toman sólo los patrones que nombran un directorio sin comodines —`build/`, `/dist`, `.cache`—, y se
// aplican por nombre en cualquier nivel, que es más ancho que la semántica real de git. Para decidir si
// vale la pena entrar a mirar un directorio alcanza; para cualquier otra cosa, no es un parser de
// gitignore y no hay que usarlo como si lo fuera.
function ignoredByGit(root) {
  let text = ''
  try { text = fs.readFileSync(path.join(root, '.gitignore'), 'utf8') } catch { return [] }
  return text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!') && !/[*?[\]]/.test(line))
    .map((line) => line.replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter((line) => line && !line.includes('/'))
}

const skipper = (root) => {
  const declared = new Set(ignoredByGit(root))
  return (name) => name.startsWith('.') || IGNORED.has(name) || declared.has(name)
}

// Un servicio anidado más hondo que esto es una excepción, y recorrer el árbol entero para encontrarlo
// cuesta más que declararlo a mano en `AGENTS.md`.
const DEPTH = 3

const MANIFESTS = [
  { file: 'package.json', runtime: 'node' },
  { file: 'go.mod', runtime: 'go' },
  { file: 'pyproject.toml', runtime: 'python' },
  { file: 'requirements.txt', runtime: 'python' },
  { file: 'Cargo.toml', runtime: 'rust' },
  { file: 'composer.json', runtime: 'php' },
  { file: 'pom.xml', runtime: 'java' },
  { file: 'build.gradle', runtime: 'java' },
  { file: 'Gemfile', runtime: 'ruby' },
  { file: 'Makefile', runtime: 'make' },
  { file: 'docker-compose.yml', runtime: 'compose' },
  { file: 'docker-compose.yaml', runtime: 'compose' },
  { file: 'Dockerfile', runtime: 'docker' },
]

// Sólo lo declarado, con su archivo: un comando inventado se lee igual que uno real, y el primer Verify
// de una tarea es donde se descubre que no existe.
function npmScripts(file) {
  try {
    const scripts = JSON.parse(fs.readFileSync(file, 'utf8')).scripts || {}
    return ['test', 'lint', 'build'].reduce((found, key) => (
      scripts[key] ? { ...found, [key]: { command: `npm run ${key}`, source: 'package.json' } } : found
    ), {})
  } catch { return {} }
}

function makeTargets(file) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return ['test', 'lint', 'build'].reduce((found, key) => (
      new RegExp(`^${key}:`, 'm').test(text)
        ? { ...found, [key]: { command: `make ${key}`, source: 'Makefile' } }
        : found
    ), {})
  } catch { return {} }
}

function commandsOf(dir) {
  const packageJson = path.join(dir, 'package.json')
  const makefile = path.join(dir, 'Makefile')
  return {
    // El Makefile gana sobre los scripts cuando los dos existen: el que envuelve al otro es el que el
    // proyecto quiere que se corra.
    ...(fs.existsSync(packageJson) ? npmScripts(packageJson) : {}),
    ...(fs.existsSync(makefile) ? makeTargets(makefile) : {}),
  }
}

function manifestsOf(dir) {
  return MANIFESTS.filter((entry) => fs.existsSync(path.join(dir, entry.file)))
}

// Qué credenciales espera un servicio, por su nombre y nada más. El ejemplo es público y versionado —el
// `.env` de verdad no se toca nunca—, y los nombres son justo lo que hace falta para dejar una fila que
// diga qué cargar; el valor no le corresponde a nadie más que a una persona.
//
// Se lee por servicio y no sólo en la raíz porque en un multirepo cada repositorio trae el suyo: leyendo
// una sola raíz, las credenciales de tres repos se volvían invisibles y las acciones humanas terminaban
// diciendo «la credencial del proveedor» en vez de nombrarla.
const ENV_EXAMPLES = ['.env.example', '.env.sample', '.env.template', '.env.dist']

// Un ejemplo con cientos de variables es un archivo generado, no un contrato: se corta y se dice.
const ENV_MAX = 40

function expectedEnv(dir) {
  for (const name of ENV_EXAMPLES) {
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) continue
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { return null }
    const names = text.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.replace(/^export\s+/, '').split('=')[0].trim())
      .filter((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
    if (!names.length) return null
    return { file: name, names: names.slice(0, ENV_MAX), truncated: Math.max(0, names.length - ENV_MAX) }
  }
  return null
}

// Servicios candidatos bajo `root`, sin entrar en `skip` —típicamente la raíz ops, que no es un
// servicio del proyecto—. El resultado es una lista, no un veredicto: decidir cuál es el producto y
// cuál quedó muerto sigue siendo trabajo de una persona o de un cargo.
function services(root, skip = '') {
  const found = []
  const excluded = skip ? path.resolve(skip) : ''
  const skippable = skipper(root)
  const walk = (dir, depth) => {
    const manifests = manifestsOf(dir)
    if (manifests.length && path.resolve(dir) !== path.resolve(root)) {
      found.push({
        path: path.relative(root, dir).split(path.sep).join('/'),
        runtimes: manifests.map((entry) => entry.runtime),
        manifests: manifests.map((entry) => entry.file),
        commands: commandsOf(dir),
        env: expectedEnv(dir),
      })
    }
    if (depth >= DEPTH) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory() || skippable(entry.name)) continue
      const child = path.join(dir, entry.name)
      if (excluded && path.resolve(child) === excluded) continue
      walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return found
}

// El primer nivel del workspace también puede ser un solo proyecto sin subcarpetas: se reporta aparte
// para no confundir «un servicio en la raíz» con «no hay nada».
function scan(root, skip = '') {
  return {
    root: path.resolve(root),
    rootManifests: manifestsOf(root).map((entry) => entry.file),
    rootCommands: commandsOf(root),
    rootEnv: expectedEnv(root),
    services: services(root, skip),
  }
}

function workspaceRoots(root) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'ops.config.json'), 'utf8'))
    const declared = (config.workspaceRoots || []).map((entry) => path.resolve(root, entry.path || '.'))
    return declared.length ? declared : [root]
  } catch { return [root] }
}

// Qué hay en las raíces declaradas, antes de que nadie razone sobre ello. La raíz ops se saltea: no es
// un servicio del proyecto, y su `package.json` sólo declara el motor.
// Los candidatos de una raíz, con el proyecto que vive en ella misma primero: un monolito declara sus
// comandos en el nivel de arriba, y dejarlo afuera hacía desaparecer justo al proyecto principal.
function candidates(workspace, skip = '') {
  const result = scan(workspace, skip)
  const found = result.rootManifests.length
    ? [{ path: '.', root: workspace, runtimes: ['raíz'], commands: result.rootCommands, env: result.rootEnv }]
    : []
  return [...found, ...result.services.map((service) => ({ ...service, root: workspace }))]
}

// Con varias raíces, cada repositorio es la raíz de su propio escaneo y su candidato principal se llama
// `.`: tres servicios con el mismo nombre y nada que los distinga. El prefijo los vuelve nombrables, que
// es la única forma de que una credencial pueda atribuirse a un servicio en vez de quedar suelta.
function inventory(root) {
  const roots = workspaceRoots(root)
  if (roots.length === 1) return candidates(roots[0], root)
  return roots.flatMap((workspace) => candidates(workspace, root).map((service) => ({
    ...service,
    path: service.path === '.' ? path.basename(workspace) : `${path.basename(workspace)}/${service.path}`,
  })))
}

function commandsLine(commands) {
  const entries = Object.entries(commands || {})
  if (!entries.length) return ' — sin comandos declarados'
  return ` — ${entries.map(([kind, value]) => `${kind}: ${value.command} (${value.source})`).join(', ')}`
}

// La guía de arranque: qué hay, qué falta y qué preguntar. Determinista y en milisegundos, porque es lo
// primero que ve alguien que acaba de instalar y todavía no sabe qué hace la herramienta.
module.exports = {
  workspaceRoots,
  candidates,
  inventory,
  commandsLine, scan, services, expectedEnv, IGNORED, DEPTH, ENV_MAX }
