'use strict'

// Qué rutas alcanza la puerta de una raíz, para poder decidir si un delta puede cambiar su veredicto.
//
// Existe porque `verify` declara **el comando** de la puerta y no lo que ese comando lee, así que
// `commitTree` sólo podía preguntarse *si hay* delta y nunca *qué* delta: cualquier archivo sucio
// —un README a medio escribir, la basura de una sonda— forzaba la copia del índice aunque el gate no
// lo fuera a abrir nunca (caso 156). Lo caro no es la copia sino lo que arrastra: adentro
// `node_modules` viaja por enlace y eso rompe cualquier build de Turbopack (caso 153).
//
// Vive en `core/` y recibe las raíces ya leídas: resolver la raíz ops es de `hooks/`, y hacerlo acá
// invertiría la única dirección de dependencia que el repositorio sostiene entera.
//
// El matcher es propio y mínimo, y eso es una decisión: el motor no tiene ninguno reusable —las once
// construcciones de `RegExp` que hay son para comandos de git, para el chat o para nombres de archivo
// generado— y agregar una dependencia para esto contradiría la primera convención del repositorio.

const path = require('node:path')

// Lo que un patrón puede traer y hay que neutralizar para que no signifique otra cosa dentro de la
// expresión regular. `*` y `?` se tratan aparte porque son justamente los que sí significan. Sin esto
// `package.json` aceptaría `packageXjson`, y el alcance sería más ancho que el declarado.
const ESCAPE = /[.+^${}()|[\]\\]/g

// El vocabulario es el mínimo que alguien espera al escribir una ruta, y no el de una shell:
//
//   `**`  cualquier cantidad de segmentos, incluido ninguno
//   `*`   cualquier cosa dentro de **un** segmento — no cruza `/`
//   `?`   un carácter, tampoco `/`
//
// No hay llaves ni clases de caracteres, y eso es a propósito: cada forma que se agrega es una forma
// más de escribir mal un alcance, y un alcance escrito de menos apaga el aislamiento sin que nada lo
// diga. Se agregan cuando alguien las necesite de verdad.
//
// `**/` se consume junto con su barra para que `src/**/x.js` acepte también `src/x.js`: si no, el
// patrón pediría un directorio intermedio obligatorio, que no es lo que nadie quiere decir.
function toRegExp(pattern) {
  let out = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*' && pattern[index + 1] === '*') {
      const slash = pattern[index + 2] === '/'
      out += slash ? '(?:.*/)?' : '.*'
      index += slash ? 2 : 1
      continue
    }
    if (char === '*') { out += '[^/]*'; continue }
    if (char === '?') { out += '[^/]'; continue }
    out += char.replace(ESCAPE, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

// La ruta relativa a la raíz declarada, que es donde vive quien escribió el patrón: en un monorepo el
// `scope` de `apps/web` habla de `src/**`, no de `apps/web/src/**`. Devuelve `null` cuando cae fuera de
// esa raíz, que no es lo mismo que no coincidir con ningún patrón — una es «no es tuya» y la otra «es
// tuya y no la mirás».
//
// `path.relative` normaliza la barra final —`build/` vuelve como `build`—, así que si hace falta saber
// que era un directorio hay que mirarlo antes, en la cadena cruda. Eso costó una prueba en rojo.
function relativeTo(rootDir, repoDir, file) {
  const absolute = path.resolve(repoDir, file)
  const inside = path.relative(rootDir, absolute)
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return null
  return inside.split(path.sep).join('/')
}

// Un directorio sin trackear llega como `build/` y **git no dice qué hay adentro**. Si el alcance
// declara `build/**/*.ts`, ninguna forma del directorio matchea, y quedarse con eso sería dejar de
// materializar sin saber qué contiene. Por eso cuenta también cuando algún patrón **apunta hacia
// adentro** de él: equivocarse hacia materializar de más devuelve el comportamiento de siempre;
// hacia materializar de menos devuelve el defecto que `commitTree` fue a cerrar.
function coversDirectory(relative, patterns, raw) {
  const clean = relative.replace(/\/$/, '')
  const forms = [clean, `${clean}/`]
  if (forms.some((form) => patterns.some((one) => one.test(form)))) return true
  return raw.some((pattern) => pattern.startsWith(`${clean}/`))
}

// La ruta de una línea de `git status --porcelain`: empieza en la columna 4 —`XY ` y después el
// nombre— y un rename llega como `viejo -> nuevo`, del que importa el destino, que es lo que queda en
// disco. Las comillas las pone git cuando el nombre trae caracteres raros.
const fileOf = (line) => line.slice(3).trim().replace(/^.* -> /, '').replace(/^"|"$/g, '')

// Si alguna de las rutas del delta cae dentro del alcance declarado de alguna raíz.
//
// **Sin ninguna raíz que declare `scope`, contesta siempre que sí**, y ahí está la compatibilidad: una
// instancia que no adopta el campo se comporta exactamente como antes de que existiera. Es la única
// respuesta segura, porque lo que se decide es si se puede confiar en el árbol, y el default tiene que
// ser el que no confía.
//
// Una ruta que no cae bajo **ninguna** raíz declarada también cuenta como adentro: puede ser de la
// instancia, de otro servicio sin declarar o de la raíz misma, y decidir que no cuenta sería la clase
// de suposición que este campo existe para no tener que hacer.
function reachesGate(roots, repoDir, files) {
  const declared = roots.filter((one) => one && Array.isArray(one.scope) && one.scope.length)
  if (!declared.length) return true
  const compiled = declared.map((one) => ({
    dir: path.resolve(repoDir, one.path),
    raw: one.scope,
    patterns: one.scope.map(toRegExp),
  }))
  return files.some((file) => {
    const isDir = file.endsWith('/')
    let owned = false
    for (const root of compiled) {
      const relative = relativeTo(root.dir, repoDir, file)
      if (relative === null) continue
      owned = true
      const hit = isDir
        ? coversDirectory(relative, root.patterns, root.raw)
        : root.patterns.some((one) => one.test(relative))
      if (hit) return true
    }
    return !owned
  })
}

// La decisión completa, para que quien la consume sea una línea: ¿alcanza con correr sobre el árbol?
// Recibe las líneas del delta tal como las devuelve `git status --porcelain`, ya sin lo ignorado.
function staysInTree(roots, repoDir, deltaLines) {
  const declared = Array.isArray(roots) ? roots : []
  if (!declared.length) return false
  return !reachesGate(declared, repoDir, deltaLines.map(fileOf))
}

// Sólo lo que otro módulo consume, por lo que dice el cierre de `cli/bench.js`. `toRegExp` se queda
// adentro y no pierde nada: lo que hay que fijar de él son sus respuestas, y se ven igual preguntándole
// a `reachesGate`.
module.exports = { reachesGate, staysInTree }
