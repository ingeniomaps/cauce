'use strict'

// Los workflows propios de una instancia (caso 223). Una empresa escribe los suyos al lado de los de Cauce, y
// sin esto no tenía cómo resolver los marcadores que los de Cauce sí reciben —`{{OPS_ROOT}}`, `{{OPS_DIR}}`,
// `{{INCLUDE:…}}`—: una instancia los reemplazaba con `sed` después de cada instalación.
//
// La fuente vive en `workflows/` de la instancia y no en `automatization/workflows/`, que es una ruta que Cauce
// retiró: `upgrade` la trata como un resto y `check` la avisa para siempre. `install` la renderiza al mismo
// lugar que los de Cauce, con los mismos marcadores, y se niega a instalar uno que se llame como uno de Cauce.

const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const F = require('../core/files')
const { render, opsPrefix, packagedAutomation } = require('./runners')

const SOURCE = 'workflows'
// Marca lo generado, para poder retirarlo cuando su fuente se borra sin tocar un archivo que escribió otro.
const header = (file) => `// Generado por \`automation install\` desde ${SOURCE}/${file}: se edita allá, no acá.\n`

// Dónde quedan: junto a los de Cauce, en la carpeta de recorridos del runner. Sin ella, el runner no tiene.
function ownTargetDir(runner, paths) {
  const artifact = (runner.artifacts || []).find((one) => /(^|\/)workflows\//.test(one.target))
  return artifact ? path.join(paths.install, path.dirname(artifact.target)) : ''
}

// Lo que quedó escrito por `installOwnWorkflows`, con la fuente de cada uno.
function ownGenerated(root, runner, paths) {
  const targetDir = ownTargetDir(runner, paths)
  if (!targetDir || !fs.existsSync(targetDir)) return []
  const mine = (file) => {
    try { return fs.readFileSync(path.join(targetDir, file), 'utf8').startsWith(header(file)) } catch { return false }
  }
  return fs.readdirSync(targetDir).filter(mine)
    .map((file) => ({ target: path.join(targetDir, file), source: path.join(root, SOURCE, file) }))
}

function installOwnWorkflows(root, name, runner, paths, output) {
  const targetDir = ownTargetDir(runner, paths)
  if (!targetDir) return
  const theirs = new Set(runner.artifacts.map((one) => path.basename(one.target)))
  const sourceDir = path.join(root, SOURCE)
  const files = fs.existsSync(sourceDir)
    ? fs.readdirSync(sourceDir).filter((file) => file.endsWith('.js')).sort()
    : []
  for (const file of files) {
    if (theirs.has(file)) {
      output.log(`✗ ${name}: ${SOURCE}/${file} se llama como un workflow de Cauce y no se instaló: renombralo`)
      continue
    }
    fs.mkdirSync(targetDir, { recursive: true })
    const rendered = render(path.join(sourceDir, file), opsPrefix(root), paths.automationRoot, root)
    F.atomicWrite(path.join(targetDir, file), header(file) + rendered)
    output.log(`✓ ${name}: workflow propio ${SOURCE}/${file} → ${path.relative(paths.install, targetDir)}/${file}`)
  }
  // Lo generado cuya fuente ya no está se retira: seguiría invocable, con una versión que nadie mantiene.
  const generated = fs.existsSync(targetDir) ? fs.readdirSync(targetDir) : []
  for (const file of generated.filter((one) => !theirs.has(one) && !files.includes(one))) {
    const target = path.join(targetDir, file)
    if (!fs.readFileSync(target, 'utf8').startsWith(header(file))) continue
    fs.rmSync(target)
    output.log(`− ${name}: retirado ${file}, que ya no está en ${SOURCE}/`)
  }
}

// Un workflow con un error de sintaxis se instala igual y recién falla al invocarlo, en la sesión de quien lo
// necesitaba (caso 231). Se compila ya renderizado, porque la fuente con un `{{INCLUDE:…}}` sin resolver no es
// JavaScript, y como lo corre el runtime: el cuerpo de una función async, sin el `export` de `meta`. Sólo se
// compila; nada se ejecuta.
function ownWorkflowErrors(root, automationRoot = packagedAutomation(root)) {
  const sourceDir = path.join(root, SOURCE)
  if (!fs.existsSync(sourceDir)) return []
  const errors = []
  for (const file of fs.readdirSync(sourceDir).filter((one) => one.endsWith('.js')).sort()) {
    try {
      const rendered = render(path.join(sourceDir, file), opsPrefix(root), automationRoot, root)
      new vm.Script(`(async () => {\n${rendered.replace(/^export\s+/gm, '')}\n})`, { filename: file })
    } catch (error) {
      errors.push(`${SOURCE}/${file}: ${error.message}`)
    }
  }
  return errors
}

module.exports = { installOwnWorkflows, ownGenerated, ownWorkflowErrors }
