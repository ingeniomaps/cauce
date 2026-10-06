'use strict'

// Borrar una prueba por shell. `test-evidence` mira las herramientas de archivo, y un `rm` o un `git rm`
// no pasan por ellas: el mismo borrado se frenaba con una herramienta y con la otra no (caso 294). Es el
// hueco que `secrets-shell` cerró para las credenciales, del otro lado.
//
// Lo que garantiza:
//
// - Un `rm`, `unlink` o `git rm` cuyo objetivo es una prueba del proyecto —un archivo de prueba, o la
//   carpeta que las contiene— se frena con la misma salida que `test-evidence`: lo aprueba una persona.
// - Sólo dentro de la instancia y de sus raíces de código. Una copia desechable en el temporal o en el
//   scratchpad de la sesión es donde se corre una mutación, y borrar una prueba ahí es el trabajo.
// - Sólo lo que ya está commiteado. La prueba que el agente escribió en esta misma tarea y quiere rehacer
//   todavía no le dice nada a nadie: borrarla no achica ninguna suite que alguien haya visto en verde.
// - Como todo lo que lee un comando, mira la forma habitual, y no un script que borra.
// - Una ruta con una variable que acá no se puede resolver pasa.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { commandOf, cwdOf, block, opsRoot, configOf, assignedValues, outsideRoots } = require('./input')
const { isTestFile } = require('./files')
const AP = require('./approval')

const PREFIXES = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nohup', 'nice', 'xargs'])
const TEST_DIR = /^(?:tests?|specs?|__tests__)$/i
// Lo que el shell iba a expandir y acá no se sabe: una variable sin resolver o un `$(…)`.
const UNRESOLVED = /[$`]/
// Un comodín en el nombre sí se puede resolver, mirando la carpeta: `rm test/*.test.js` borra todas las
// pruebas y nombra una sola palabra. Sólo en el último tramo de la ruta, que es como se escribe.
function expand(file) {
  const name = path.basename(file)
  if (!/[*?]/.test(name)) return [file]
  const shape = new RegExp(`^${name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
  let entries = []
  try { entries = fs.readdirSync(path.dirname(file)) } catch { return [] }
  return entries.filter((entry) => shape.test(entry)).map((entry) => path.join(path.dirname(file), entry))
}

// Los objetivos de cada tramo que borra, ya resueltos: las palabras que no son banderas después de `rm`,
// `unlink` o del `rm` de git, saltando lo que va delante sin ser el verbo. La carpeta se sigue tramo a tramo
// —un `cd` la mueve para los que vienen, y el `-C` de git vale sólo para el suyo—: resuelta una vez para el
// comando entero, un `rm` detrás de un `git -C app commit` se buscaba dentro de `app/app`.
//
// Las variables que el propio comando asigna se resuelven antes: `F="$W/app/test/x.test.js"; rm -- "$F"` es
// como lo escribe un agente, y así borró una prueba en la primera corrida real con este guard puesto. Lo que
// va entre comillas simples no se expande, igual que en el shell.
function removed(command, cwd) {
  const found = []
  const value = assignedValues(command) || ((text) => text)
  let dir = cwd
  for (const segment of command.split(/[;&|\n]+/)) {
    const words = (segment.match(/"[^"]*"|'[^']*'|\S+/g) || [])
      .map((word) => (word.startsWith("'") ? word.slice(1, -1) : value(word.replace(/^"(.*)"$/, '$1'))))
    while (words.length && (/^[A-Za-z_]\w*=/.test(words[0]) || PREFIXES.has(words[0]))) words.shift()
    const verb = path.basename(words[0] || '')
    if (verb === 'cd' && words[1] && !UNRESOLVED.test(words[1])) dir = path.resolve(dir, words[1])
    const from = verb === 'git' ? words.indexOf('rm') : ['rm', 'unlink'].includes(verb) ? 0 : -1
    if (from < 0) continue
    const inside = verb === 'git' && words.indexOf('-C') > 0 && words.indexOf('-C') < from
      ? path.resolve(dir, words[words.indexOf('-C') + 1]) : dir
    found.push(...words.slice(from + 1)
      .filter((word) => word !== '--' && !word.startsWith('-') && !UNRESOLVED.test(word))
      .flatMap((word) => expand(path.resolve(inside, word))))
  }
  return found
}

// Si la ruta —un archivo o una carpeta— tiene algo en el último commit de su repositorio.
function committed(file) {
  const shown = spawnSync('git', ['-C', path.dirname(file), 'ls-tree', '-r', '--name-only', 'HEAD', '--',
    path.basename(file)], { encoding: 'utf8' })
  return shown.status === 0 && shown.stdout.trim() !== ''
}

function testEvidenceShell(input) {
  if (process.env.OPS_TEST_EVIDENCE_OVERRIDE === '1') return
  const raw = commandOf(input)
  const root = opsRoot(input)
  if (!root) return
  // Las raíces del proyecto y nada más: `writableRoots` suma lo desechable, que es justo lo que queda afuera.
  const project = [root, ...(configOf(root).workspaceRoots || []).map((entry) => path.resolve(root, entry.path))]
  // Si es una prueba se decide por su ruta dentro del proyecto, no por la ruta entera: con el proyecto
  // clonado bajo una carpeta `tests/`, todo archivo suyo habría contado como prueba.
  const within = (file) => path.relative(project.filter((base) => !outsideRoots(file, [base]))
    .sort((one, other) => other.length - one.length)[0], file)
  const targets = removed(raw, cwdOf(input))
    .filter((file) => !outsideRoots(file, project))
    .filter((file) => isTestFile(within(file)) || TEST_DIR.test(path.basename(file)))
    .filter(committed)
  const left = AP.pending(root, [...new Set(targets)], input)
  if (!left.length) return
  block(`el comando borra ${left.join(', ')}, que es una prueba.\n`
    + 'Una suite sin ella sale verde igual: el verde deja de decir que el comportamiento está y pasa a decir '
    + 'que nadie lo miró. Si la aserción está mal, corregila; si el comportamiento cambió, cambialo junto con '
    + 'la prueba que lo fija. Si tiene que salir igual, es una decisión con dueño.\n'
    + AP.HOW('OPS_TEST_EVIDENCE_OVERRIDE', left, input))
}

module.exports = { testEvidenceShell }
