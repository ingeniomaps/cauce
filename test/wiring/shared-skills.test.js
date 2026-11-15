'use strict'

// Caso 371 (el porqué, en `retireRoleSkills`). Los dos runners escriben el mismo puntero en la misma carpeta; lo
// que eso obliga a cuidar es que desinstalar uno no deje al otro sin cargos, y que una instalación vieja no conserve
// la copia que sobra.

const { installedProject, tempRoot, discard } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { roleCatalog, roleSkill } = require('../../engine/automation/roles')

const pointer = (workspace, folder, slug) => path.join(workspace, folder, slug, 'SKILL.md')

test('Codex y Gemini comparten los punteros, y desinstalar uno no deja al otro sin cargos', () => {
  const { workspace, target, runCli } = installedProject('cauce-skills-compartidas-', 'codex')
  const roles = roleCatalog(target)
  const [first, second] = roles
  assert.ok(second, 'el catálogo tiene al menos dos cargos')

  // Una instalación vieja de Gemini dejó sus punteros en `.gemini/skills`: uno nuestro, uno editado, y uno
  // nuestro de un cargo que ya no está en el catálogo.
  fs.mkdirSync(path.dirname(pointer(workspace, '.gemini/skills', first.slug)), { recursive: true })
  fs.writeFileSync(pointer(workspace, '.gemini/skills', first.slug), roleSkill(first))
  // La descripción termina en comilla a propósito (el porqué, en `generated`).
  const gone = { slug: 'cargo-que-ya-no-esta', description: 'Un cargo que dice "no"',
    reference: 'ops/agents/roles/cargo-que-ya-no-esta' }
  fs.mkdirSync(path.dirname(pointer(workspace, '.gemini/skills', gone.slug)), { recursive: true })
  fs.writeFileSync(pointer(workspace, '.gemini/skills', gone.slug), roleSkill(gone))
  // Y un enlace en la carpeta hacia un puntero nuestro que vive afuera: no es un puntero, y lo de afuera queda.
  const elsewhere = path.join(tempRoot('cauce-skills-afuera-'), 'enlazado')
  fs.mkdirSync(elsewhere, { recursive: true })
  fs.writeFileSync(path.join(elsewhere, 'SKILL.md'), roleSkill(gone))
  fs.symlinkSync(elsewhere, path.join(workspace, '.gemini', 'skills', 'enlazado'))
  fs.mkdirSync(path.dirname(pointer(workspace, '.gemini/skills', second.slug)), { recursive: true })
  fs.writeFileSync(pointer(workspace, '.gemini/skills', second.slug), `${roleSkill(second)}\nnota mía\n`)

  const gemini = runCli(['automation', 'install', target, 'gemini'])
  assert.equal(gemini.status, 0, gemini.stderr)
  assert.match(gemini.stdout, /\.agents\/skills/)
  for (const role of roles) {
    assert.ok(fs.existsSync(pointer(workspace, '.agents/skills', role.slug)), `${role.slug} en la carpeta compartida`)
  }
  // Lo nuestro que sobraba se fue; lo editado se queda, y se dice.
  assert.equal(fs.existsSync(pointer(workspace, '.gemini/skills', first.slug)), false, 'el puntero viejo sobraba')
  assert.equal(fs.existsSync(pointer(workspace, '.gemini/skills', gone.slug)), false, 'el del cargo borrado también')
  assert.ok(fs.existsSync(path.join(elsewhere, 'SKILL.md')), 'lo que hay detrás de un enlace no se toca')
  assert.ok(fs.existsSync(path.join(workspace, '.agents', 'skills', 'autobuild', 'SKILL.md')),
    'la habilidad de Codex en la carpeta compartida no es un puntero y se queda')
  assert.ok(fs.existsSync(pointer(workspace, '.gemini/skills', second.slug)), 'el editado no es nuestro')
  assert.match(gemini.stdout, new RegExp(`conservado .*\\.gemini/skills/${second.slug}`))

  // Para `doctor` los cargos de Gemini están donde Gemini los lee.
  const doctor = runCli(['automation', 'doctor', target, 'gemini'])
  assert.equal(doctor.status, 0, doctor.stderr)
  assert.doesNotMatch(doctor.stdout + doctor.stderr, /cargo\(s\) sin instalar/)

  // Desinstalar Codex conserva lo que Gemini sigue usando, y lo dice; desinstalar Gemini después lo quita.
  const codexOut = runCli(['automation', 'uninstall', target, 'codex'])
  assert.equal(codexOut.status, 0, codexOut.stderr)
  assert.ok(fs.existsSync(pointer(workspace, '.agents/skills', first.slug)), 'Gemini sigue con sus cargos')
  assert.match(codexOut.stdout, /punteros .*los usa también gemini/)
  assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills', 'autobuild')), false,
    'lo que era sólo de Codex sí se va')
  // Un puntero editado en la carpeta compartida se conserva al desinstalar, y se nombra, como siempre.
  fs.appendFileSync(pointer(workspace, '.agents/skills', second.slug), '\nnota mía\n')
  const geminiOut = runCli(['automation', 'uninstall', target, 'gemini'])
  assert.equal(geminiOut.status, 0, geminiOut.stderr)
  assert.equal(fs.existsSync(pointer(workspace, '.agents/skills', first.slug)), false, 'ya nadie los usa')
  assert.ok(fs.existsSync(pointer(workspace, '.agents/skills', second.slug)), 'el editado se queda')
  assert.doesNotMatch(geminiOut.stdout, /conservado .*autobuild/, 'lo que no es un cargo no se nombra')
  assert.match(geminiOut.stdout, new RegExp(`conservado \\.agents/skills/${second.slug}`))
})

test('Gemini solo instala y desinstala sus punteros en la carpeta compartida como siempre', () => {
  const { workspace, target, runCli } = installedProject('cauce-skills-gemini-solo-')
  const [first] = roleCatalog(target)
  // La carpeta vieja entera es un enlace hacia afuera: lo que hay detrás no se toca al retirarla.
  const elsewhere = path.join(tempRoot('cauce-skills-carpeta-afuera-'), 'skills')
  fs.mkdirSync(path.join(elsewhere, first.slug), { recursive: true })
  fs.writeFileSync(path.join(elsewhere, first.slug, 'SKILL.md'), roleSkill(first))
  fs.mkdirSync(path.join(workspace, '.gemini'), { recursive: true })
  fs.symlinkSync(elsewhere, path.join(workspace, '.gemini', 'skills'))
  const install = runCli(['automation', 'install', target, 'gemini'])
  assert.equal(install.status, 0, install.stderr)
  assert.ok(fs.existsSync(path.join(elsewhere, first.slug, 'SKILL.md')), 'detrás del enlace queda todo')
  fs.unlinkSync(path.join(workspace, '.gemini', 'skills'))
  assert.ok(fs.existsSync(pointer(workspace, '.agents/skills', first.slug)))
  assert.equal(fs.existsSync(path.join(workspace, '.gemini', 'skills')), false, 'no escribe la carpeta vieja')
  assert.ok(fs.existsSync(path.join(workspace, '.gemini', 'settings.json')), 'y lo suyo sí está')
  const out = runCli(['automation', 'uninstall', target, 'gemini'])
  assert.equal(out.status, 0, out.stderr)
  assert.doesNotMatch(out.stdout, /los usa también/)
  assert.equal(fs.existsSync(pointer(workspace, '.agents/skills', first.slug)), false)
})

// Caso 512: Gemini no lee nada bajo `node_modules`, y ahí apuntaba el puntero de cada cargo del catálogo. En la carpeta
// que lee Gemini, el cargo del catálogo va copiado —contrato y referencias, sin una sola ruta al paquete—, y el propio
// sigue siendo puntero. Codex instalado después no la vuelve a punteros, y desinstalar se lleva las copias.
test('en la carpeta que lee Gemini los cargos del catálogo van copiados, y los propios como puntero', () => {
  const { workspace, target, runCli } = installedProject('cauce-skills-copia-')
  const roles = roleCatalog(target)
  const system = roles.find((role) => role.system && fs.existsSync(path.join(role.dir, 'references')))
  assert.ok(system, 'hay un cargo del catálogo con referencias')
  assert.equal(runCli(['agents', 'fork', 'qa-engineer', target]).status, 0)
  assert.equal(runCli(['automation', 'install', target, 'gemini']).status, 0)

  const copy = pointer(workspace, '.agents/skills', system.slug)
  assert.equal(fs.readFileSync(copy, 'utf8'), fs.readFileSync(path.join(system.dir, 'SKILL.md'), 'utf8'))
  const references = fs.readdirSync(path.join(system.dir, 'references'))
  for (const name of references) {
    assert.ok(fs.existsSync(path.join(path.dirname(copy), 'references', name)), `${name} copiada`)
  }
  assert.doesNotMatch(fs.readFileSync(copy, 'utf8'), /node_modules/, 'nada lleva al paquete')
  assert.match(fs.readFileSync(pointer(workspace, '.agents/skills', 'qa-engineer'), 'utf8'),
    /Leé `ops\/agents\/roles\/qa-engineer\/SKILL\.md`/, 'el propio sigue como puntero a la instancia')
  // `doctor` compara contra lo que se instaló, no contra el puntero: con la copia no hay nada desactualizado.
  const doctor = runCli(['automation', 'doctor', target, 'gemini'])
  assert.doesNotMatch(doctor.stdout + doctor.stderr, /desactualizados/)

  // Codex comparte la carpeta: instalado después, no la vuelve a punteros mientras Gemini esté.
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  assert.equal(fs.readFileSync(copy, 'utf8'), fs.readFileSync(path.join(system.dir, 'SKILL.md'), 'utf8'))

  // Desinstalar los dos se lleva las copias enteras, y la editada se queda.
  const [other] = roles.filter((role) => role.system && role.slug !== system.slug)
  fs.appendFileSync(pointer(workspace, '.agents/skills', other.slug), '\nnota mía\n')
  assert.equal(runCli(['automation', 'uninstall', target, 'codex']).status, 0)
  const out = runCli(['automation', 'uninstall', target, 'gemini'])
  assert.equal(out.status, 0, out.stderr)
  assert.equal(fs.existsSync(path.dirname(copy)), false, 'la copia se fue con sus referencias')
  assert.ok(fs.existsSync(pointer(workspace, '.agents/skills', other.slug)), 'la editada se queda')
  assert.match(out.stdout, new RegExp(`conservado \\.agents/skills/${other.slug}`))
})

// De la revisión del 512: una referencia que el catálogo ya no trae no deja la copia pareciendo editada, y desinstalar
// Gemini antes que Codex deja a Codex con punteros limpios al reinstalar, sin referencias huérfanas.
test('la copia se rehace entera, y al volver a punteros no quedan referencias de la copia', () => {
  const { workspace, target, runCli } = installedProject('cauce-skills-copia-orden-')
  const system = roleCatalog(target).find((role) => role.system && fs.existsSync(path.join(role.dir, 'references')))
  const folder = path.dirname(pointer(workspace, '.agents/skills', system.slug))
  assert.equal(runCli(['automation', 'install', target, 'gemini']).status, 0)
  fs.writeFileSync(path.join(folder, 'references', 'retirada.md'), '# De una versión anterior\n')
  const extra = runCli(['automation', 'doctor', target, 'gemini'])
  assert.match(extra.stdout + extra.stderr, /desactualizados/, 'doctor la ve')
  assert.equal(runCli(['automation', 'install', target, 'gemini']).status, 0)
  assert.equal(fs.existsSync(path.join(folder, 'references', 'retirada.md')), false, 'reinstalar la retira')
  // Y una que falta en la copia también la deja desactualizada.
  const [first] = fs.readdirSync(path.join(folder, 'references'))
  fs.rmSync(path.join(folder, 'references', first))
  const missing = runCli(['automation', 'doctor', target, 'gemini'])
  assert.match(missing.stdout + missing.stderr, /desactualizados/, 'doctor ve la que falta')
  assert.equal(runCli(['automation', 'install', target, 'gemini']).status, 0)
  // Una `references/` que es un enlace no se recorre para borrar lo que sobra: lo de detrás no es nuestro.
  const behind = path.join(tempRoot('cauce-skills-referencias-afuera-'), 'refs')
  fs.mkdirSync(behind, { recursive: true })
  fs.writeFileSync(path.join(behind, 'ajena.md'), '# Ajena\n')
  discard(path.join(folder, 'references'))
  fs.symlinkSync(behind, path.join(folder, 'references'))
  assert.notEqual(runCli(['automation', 'install', target, 'gemini']).status, 0, 'se niega')
  assert.ok(fs.existsSync(path.join(behind, 'ajena.md')), 'y lo de detrás del enlace queda')
  fs.unlinkSync(path.join(folder, 'references'))
  assert.equal(runCli(['automation', 'install', target, 'gemini']).status, 0)

  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  assert.equal(runCli(['automation', 'uninstall', target, 'gemini']).status, 0)
  assert.equal(runCli(['automation', 'install', target, 'codex']).status, 0)
  assert.equal(fs.readFileSync(path.join(folder, 'SKILL.md'), 'utf8'), roleSkill(system), 'Codex vuelve al puntero')
  assert.equal(fs.existsSync(path.join(folder, 'references')), false, 'sin las referencias de la copia')
  const doctor = runCli(['automation', 'doctor', target, 'codex'])
  assert.doesNotMatch(doctor.stdout + doctor.stderr, /desactualizados/)
})
