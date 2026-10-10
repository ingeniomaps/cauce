'use strict'

// Caso 371. Gemini CLI lee `.agents/skills/` como alias de `.gemini/skills/`, con precedencia, así que con
// Codex y Gemini instalados cada cargo estaba dos veces y Gemini lo avisaba uno por uno al abrir la sesión.
// Los dos runners escriben ahora el mismo puntero en la misma carpeta; lo que eso obliga a cuidar es que
// desinstalar uno no deje al otro sin cargos, y que una instalación vieja no conserve la copia que sobra.

const { installedProject, tempRoot } = require('../support/environment')

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
  // La descripción termina en comilla a propósito: el parser de frontmatter la quitaba y el puntero dejaba de
  // reconocerse como nuestro (segunda revisión).
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
