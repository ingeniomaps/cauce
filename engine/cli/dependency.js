'use strict'

// Cómo una instancia declara el motor en su `package.json`: ponerlo, reponerlo y sacarlo. Vive aparte
// del ciclo de vida porque su reloj es otro —npm y el versionado, no crear/actualizar/borrar— y porque
// sus tres consumidores no se solapan: `scaffold` declara, `upgrade` repone y `destroy` saca.

const fs = require('node:fs')
const path = require('node:path')
const F = require('../core/files')
const { fail } = require('./io')

// Declara el motor como dependencia exacta: el lockfile decide qué versión corre, no una copia.
// Conserva el manifiesto existente porque el repo anfitrión puede tener el suyo.
function declareEngine(manifest, version) {
  let pkg = { name: path.basename(path.dirname(manifest)), private: true, version: '0.0.0' }
  if (fs.existsSync(manifest)) {
    try { pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) } catch (error) {
      fail(`package.json inválido en ${manifest}: ${error.message}`)
    }
  }
  pkg.devDependencies = { ...pkg.devDependencies, '@ingeniomaps/cauce': version }
  F.atomicWriteJson(manifest, pkg)
}

// Repone la versión exacta que `declareEngine` había dejado, y devuelve la que había si cambió algo.
//
// El pin no sobrevive por sí solo: npm guarda con caret, así que el `npm install @latest` del primer
// paso del upgrade lo convierte en un rango, y con eso deja de valer la razón que el README da para no
// saltear ese paso —«init fija la versión exacta, así que npm update no la mueve»—. Repararlo acá y no
// sólo documentar el comando es lo que vuelve la propiedad independiente de cómo se haya instalado.
//
// Sin manifiesto no hay nada que reponer: una instancia que no lo tiene resuelve el motor de otra
// forma, y crearle uno sería otra operación que nadie pidió en un upgrade.
function pinEngine(root, version) {
  const manifest = path.join(root, 'package.json')
  if (!fs.existsSync(manifest)) return null
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) } catch { return 'ilegible' }
  const current = (pkg.devDependencies || {})['@ingeniomaps/cauce']
  if (!current || current === version) return null
  declareEngine(manifest, version)
  return current
}

// La inversa exacta de `declareEngine`: saca la clave que puso y nada más. El resto del manifiesto es
// del repo anfitrión aunque hoy no tenga otra cosa —un `package.json` vacío puede ser lo que alguien
// escribió para tener scripts— así que el archivo se borra sólo si es idéntico al que `declareEngine`
// habría creado desde cero, sin dependencias, sin scripts y con su `version: 0.0.0`.
//
// Lo que no se toca nunca es `node_modules/` ni el lockfile: los escribe npm, pueden tener dependencias
// del proyecto y borrarlos por nuestra cuenta destruye trabajo ajeno. Se nombran en la salida, que es
// la mitad que faltaba: `destroy` decía «tu repositorio queda donde está» y dejaba un `package.json`
// cuya única dependencia era Cauce. En un repo Rust eso es basura conspicua y nadie avisaba.
function undeclareEngine(manifest) {
  if (!fs.existsSync(manifest)) return []
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) } catch { return [] }
  const dev = pkg.devDependencies || {}
  if (!('@ingeniomaps/cauce' in dev)) return []
  delete dev['@ingeniomaps/cauce']
  pkg.devDependencies = dev
  const ours = !Object.keys(dev).length && !Object.keys(pkg.dependencies || {}).length
    && !Object.keys(pkg.scripts || {}).length && pkg.private === true && pkg.version === '0.0.0'
  if (ours) {
    fs.rmSync(manifest, { force: true })
    return ['package.json (lo había creado init: sin dependencias ni scripts propios)']
  }
  if (!Object.keys(dev).length) delete pkg.devDependencies
  F.atomicWriteJson(manifest, pkg)
  return ['package.json: se quitó la dependencia del motor y el resto queda como estaba']
}

module.exports = { declareEngine, pinEngine, undeclareEngine }
