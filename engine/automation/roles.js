'use strict'

// Los punteros a cargos que el runner indexa para elegir a quién invocar. Cambian cuando cambia el
// catálogo —una profesión nueva, una descripción reescrita—, que es otro reloj que el de los comandos
// y otro que el del adaptador: por eso viven acá y no en `index.js`.

const path = require('node:path')
const fs = require('node:fs')
const F = require('../core/files')
const P = require('../planning/parser')
const catalog = require('../agents/catalog')
const { installRoot, runnerManifest, RUNNER_NAMES } = require('./runners')

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
  retireRoleSkills(install, runner, roles, output)
}

// La carpeta donde un adaptador dejaba sus punteros antes de mudarse. Gemini los escribía en
// `.gemini/skills` y Gemini CLI lee también `.agents/skills`, la de Codex, con precedencia: con los dos
// instalados cada cargo estaba dos veces y lo avisaba uno por uno al abrir la sesión (caso 371). Ahora los
// dos escriben el mismo puntero en la misma carpeta, y lo que una instalación vieja dejó en la otra sobra.
// Se quita sólo lo que sigue siendo lo que generamos, como en `uninstall`: lo editado es de alguien.
function retireRoleSkills(install, runner, roles, output) {
  for (const folder of runner.retiredRoleSkills || []) {
    const base = F.assertWithin(install, path.resolve(install, folder), `${runner.name}: retiredRoleSkills`)
    const { removed, kept } = prunePointers(base, roles, install)
    for (const file of kept) output.log(`= ${runner.name}: conservado ${file} (tiene cambios tuyos; ya no se usa)`)
    if (removed) output.log(`✓ ${runner.name}: ${removed} puntero(s) viejos quitados de ${folder}`)
  }
}

// Si un `SKILL.md` es un puntero que generamos, tal cual. Se reconoce por su propio contenido —nombre,
// descripción y referencia, regenerados y comparados enteros— y no contra el catálogo: el puntero de un cargo
// que ya no existe en `agents/roles/` también es nuestro y también sobra, y contra el catálogo quedaba para
// siempre cargado como un cargo vigente con un contrato que ya no está.
//
// Los campos se leen crudos, con una regex sobre la línea y no con el parser de frontmatter: el parser quita
// comillas de los bordes, así que una descripción que termina en comilla volvía distinta, el puntero dejaba de
// ser nuestro y se conservaba para siempre como editado.
function generated(text) {
  const raw = (name) => (text.match(new RegExp(`^${name}: (.*)$`, 'm')) || [])[1]
  const reference = (text.match(/^Leé `(.+?)\/SKILL\.md` para el contrato completo/m) || [])[1]
  if (!raw('name') || !reference) return false
  return roleSkill({ slug: raw('name'), description: raw('description') || '', reference }) === text
}

// Un enlace simbólico en el camino a un puntero lo vuelve ajeno: lo que hay detrás es de alguien, y borrarlo a
// través del enlace borra afuera. Se miran todos los tramos desde la raíz de instalación —la carpeta entera, o
// una de arriba, puede ser el enlace—, con la misma comprobación que usa `install` para escribirlos.
const plain = (install, file) => { try { F.assertNoSymlinkPath(install, file); return true } catch { return false } }

// Quita de una carpeta de punteros lo que sigue siendo lo que generamos y conserva el resto. Lo que se nombra
// como conservado es sólo el puntero de un cargo del catálogo con cambios de alguien; una habilidad que no es
// un cargo —las de Codex en la misma carpeta, una propia— no es nuestra y no se menciona.
function prunePointers(base, roles, install) {
  const known = new Set(roles.map((role) => role.slug))
  const kept = []
  let removed = 0
  let names = []
  try { names = fs.readdirSync(base) } catch { return { removed, kept } }
  for (const slug of names) {
    const file = path.join(base, slug, 'SKILL.md')
    // Desde la raíz de instalación hasta el archivo: cubre también la carpeta, o una de arriba, como enlace.
    if (!plain(install, file)) continue
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    if (generated(text)) {
      F.removeFile(file, install)
      removed += 1
    } else if (known.has(slug)) kept.push(path.relative(install, file))
  }
  return { removed, kept }
}

// Los punteros a cargos no se registran uno por uno —son todo el catálogo y se regeneran enteros—, así que
// se reconocen por contenido: sólo se va el que sigue siendo el que generamos; el editado se conserva y se
// nombra.
//
// Y sólo si ningún otro adaptador instalado escribe en la misma carpeta: Codex y Gemini comparten
// `.agents/skills` (caso 371), y el mismo puntero lo lee el que queda. «Instalado» lo dice el manifiesto de
// entregas: un adaptador que entregó algo tiene al menos una entrada con su nombre.
function uninstallRoleSkills(root, name, runner, install, recorded, output) {
  const kept = []
  let removed = 0
  if (!runner.capabilities.nativeSkills || !runner.roleSkills) return { removed, kept }
  const sharing = RUNNER_NAMES.filter((other) => other !== name
    && runnerManifest(root, other).roleSkills === runner.roleSkills
    && Object.keys(recorded).some((key) => key.startsWith(`${other}/`)))
  if (sharing.length) {
    output.log(`= ${name}: punteros de ${runner.roleSkills} conservados: los usa también ${sharing.join(', ')}`)
    return { removed, kept }
  }
  return prunePointers(path.resolve(install, runner.roleSkills), roleCatalog(root), install)
}

module.exports = { roleCatalog, roleSkill, installRoleSkills, uninstallRoleSkills }
