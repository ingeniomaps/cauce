'use strict'

// Los punteros a cargos que el runner indexa para elegir a quién invocar. Cambian cuando cambia el
// catálogo —una profesión nueva, una descripción reescrita—, que es otro reloj que el de los comandos
// y otro que el del adaptador: por eso viven acá y no en `index.js`.

const path = require('node:path')
const fs = require('node:fs')
const F = require('../core/files')
const P = require('../planning/parser')
const catalog = require('../agents/catalog')
const { installRoot } = require('./runners')

// Cargos del catálogo, con el frontmatter que el runner indexa para elegir a quién invocar.
function roleCatalog(root) {
  return catalog.list(root)
    .map((role) => {
      const field = P.frontmatter(fs.readFileSync(path.join(role.dir, 'SKILL.md'), 'utf8'))
      const reference = path.relative(installRoot(root), role.dir).split(path.sep).join('/')
      return { ...role, reference, description: field('description') }
    })
    .filter((role) => role.description)
}

// Puntero fino: conserva nombre y descripción —lo único que el runner lee hasta invocar— y remite
// al contrato completo. Evita duplicar el catálogo entero dentro de la configuración del runner.
function roleSkill(role) {
  return `---
name: ${role.slug}
description: ${role.description}
---

# ${role.slug}

Leé \`${role.reference}/SKILL.md\` para el contrato completo del cargo: cuándo actuar,
qué decide, qué no le corresponde y cuál es su entrega mínima. Sus métodos y formatos de output están
en \`${role.reference}/references/\`.

Esas rutas se resuelven desde este directorio raíz, no desde el repositorio de operaciones: en modo
sidecar el wiring vive acá y el repo ops es uno de sus hijos.

Respetá los límites de ese contrato y las reglas de \`AGENTS.md\`. Generado por
\`cauce automation install\`: no lo edites acá.
`
}

function installRoleSkills(root, runner, output) {
  if (!runner.capabilities.nativeSkills || !runner.roleSkills) return
  const install = installRoot(root)
  const base = F.assertWithin(install, path.resolve(install, runner.roleSkills), `${runner.name}: roleSkills`)
  const roles = roleCatalog(root)
  // Los cargos y los recorridos comparten el espacio de nombres de skills del runner, así que un cargo
  // que se llame como un recorrido lo pisa. Hoy no pasa, y por eso mismo hay que detenerlo acá: el
  // catálogo de una empresa es suyo, nadie le prohíbe un cargo `flow`, y el daño sería que `/cauce:flow`
  // deje de existir sin que nada falle. Renombrar el cargo es la salida, y sólo la puede tomar alguien.
  const commandNames = new Set((runner.commands && runner.commands.names) || [])
  const collide = roles.filter((role) => commandNames.has(role.slug)).map((role) => role.slug)
  if (collide.length) {
    throw new Error(
      `${runner.name}: ${collide.join(', ')} es a la vez un cargo y un recorrido, y comparten `
      + `${runner.roleSkills}. Renombrá el cargo en agents/roles/ antes de instalar.`,
    )
  }
  for (const role of roles) {
    const file = path.join(base, role.slug, 'SKILL.md')
    F.assertNoSymlinkPath(install, file)
    F.atomicWrite(file, roleSkill(role))
  }
  if (roles.length) output.log(`✓ ${runner.name}: ${roles.length} cargo(s) disponibles en ${runner.roleSkills}`)
}

module.exports = { roleCatalog, roleSkill, installRoleSkills }
