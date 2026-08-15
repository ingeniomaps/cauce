'use strict'

// Recorrido completo tal como lo vive una empresa: instalar el paquete publicado, materializar la
// instancia, trabajar en ella, recibir una versión nueva y actualizarse.
//
// Los demás tests corren contra el repositorio; éste corre contra el tarball, que es lo único que
// un consumidor ve. Es donde se detecta un `files` incompleto o una ruta que sólo existe acá.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const REPO = path.resolve(__dirname, '..')

function npm(args, cwd) {
  const result = spawnSync('npm', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, `npm ${args.join(' ')}\n${result.stderr}`)
  return result.stdout
}

function cauce(consumer, args) {
  const cli = path.join(consumer, 'node_modules', '@ingeniomaps', 'cauce', 'engine', 'cli', 'ops.js')
  return spawnSync(process.execPath, [cli, ...args], { cwd: consumer, encoding: 'utf8' })
}

test('el paquete publicado sostiene el ciclo completo de una empresa', { timeout: 120000 }, (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cauce-lifecycle-'))
  const consumer = path.join(base, 'acme-ops')
  fs.mkdirSync(consumer, { recursive: true })
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'acme-ops', version: '1.0.0', private: true }, null, 2)}\n`,
  )

  // 1. Instalar el paquete tal como sale a npm.
  npm(['pack', '--pack-destination', base], REPO)
  const tarball = fs.readdirSync(base).find((file) => file.endsWith('.tgz'))
  assert.ok(tarball, 'npm pack produjo el tarball')
  npm(['install', path.join(base, tarball), '--no-save'], consumer)

  const bin = path.join(consumer, 'node_modules', '.bin', 'cauce')
  assert.equal(fs.existsSync(bin), true, 'el binario queda disponible')

  // 2. Materializar la instancia. Con package.json presente, el motor va como dependencia.
  const created = cauce(consumer, ['init', consumer, '--name', 'Acme', '--mode', 'sidecar', '--force'])
  assert.equal(created.status, 0, created.stderr)
  assert.equal(fs.existsSync(path.join(consumer, '.ops', 'engine')), false, 'no duplica el motor')
  const version = () => JSON.parse(fs.readFileSync(path.join(consumer, 'ops.config.json'), 'utf8')).cauceVersion
  const born = version()
  assert.ok(born, 'la instancia recuerda de qué versión salió')

  // 3. Conectar un runner y comprobar que el catálogo queda invocable.
  assert.equal(cauce(consumer, ['automation', 'install', consumer, 'claude']).status, 0)
  const skills = fs.readdirSync(path.join(consumer, '.claude', 'skills'))
  assert.ok(skills.length >= 40, 'los cargos llegan como skills del runner')
  assert.equal(cauce(consumer, ['automation', 'doctor', consumer, 'claude']).status, 0)

  // 4. La empresa trabaja: contexto propio, regla propia, override y un cargo suyo.
  const planning = path.join(consumer, 'planning')
  fs.writeFileSync(path.join(consumer, 'organization', 'company.md'), '# Acme S.A.\n')
  fs.writeFileSync(path.join(planning, 'rules', 'acme-naming.md'), '# convención propia\n')
  fs.writeFileSync(path.join(planning, 'rules', 'commits.md'), '# override de acme\n')
  fs.writeFileSync(path.join(planning, 'INBOX.md'), '# Inbox sin promover\n\n## Ideas\n- **propia** — de Acme\n')
  const ownRole = path.join(consumer, 'agents', 'roles', 'product-manager')
  fs.mkdirSync(ownRole, { recursive: true })
  fs.writeFileSync(path.join(ownRole, 'SKILL.md'), '---\nname: product-manager\ndescription: PM de Acme.\n---\n')
  const ownGuard = path.join(consumer, 'automatization', 'hooks', 'guard-acme.sh')
  fs.writeFileSync(ownGuard, '#!/usr/bin/env bash\necho propio\n')
  // Y arrastra lo que una versión anterior sí materializaba: adaptadores y workflows copiados.
  const legacy = path.join(consumer, 'automatization', 'workflows')
  fs.mkdirSync(legacy, { recursive: true })
  fs.writeFileSync(path.join(legacy, 'autobuild.js'), '// copia vieja\n')
  assert.equal(cauce(consumer, ['check', planning]).status, 0, 'la instancia sigue válida')

  // El runner debe seguir al cargo del proyecto, no al del sistema.
  assert.equal(cauce(consumer, ['automation', 'install', consumer, 'claude']).status, 0)
  const installed = fs.readFileSync(path.join(consumer, '.claude', 'skills', 'product-manager', 'SKILL.md'), 'utf8')
  assert.match(installed, /PM de Acme/)
  assert.match(installed, /agents\/roles\/product-manager\/SKILL\.md/)

  // 5. Sale una versión nueva del toolkit, con un cambio en system/ y su entrada de changelog.
  const upstream = path.join(base, 'upstream')
  fs.cpSync(path.join(consumer, 'node_modules', '@ingeniomaps', 'cauce'), upstream, { recursive: true })
  const manifest = JSON.parse(fs.readFileSync(path.join(upstream, 'package.json'), 'utf8'))
  manifest.version = '99.0.0'
  fs.writeFileSync(path.join(upstream, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const systemRule = path.join(upstream, 'template', 'planning', 'rules', 'system', 'process.md')
  fs.appendFileSync(systemRule, '\n- Regla incorporada río arriba.\n')
  // La prosa que el toolkit escribe también envejece: si no se refresca, la instancia termina
  // describiendo carpetas que el propio upgrade acaba de retirar.
  fs.appendFileSync(path.join(upstream, 'template', 'automatization', 'README.md'), '\n- Nota nueva.\n')
  fs.writeFileSync(
    path.join(upstream, 'CHANGELOG.md'),
    '# Changelog\n\n## [99.0.0] - hoy\n\n- Una regla nueva del sistema.\n',
  )
  const upstreamCli = (args) => spawnSync(
    process.execPath, [path.join(upstream, 'engine', 'cli', 'ops.js'), ...args],
    { cwd: consumer, encoding: 'utf8' },
  )

  // 6. La instancia se entera antes de aplicar nada.
  const pending = upstreamCli(['upgrade', consumer, '--check'])
  assert.equal(pending.status, 1, 'hay algo pendiente')
  assert.match(pending.stdout, /99\.0\.0/)
  assert.match(pending.stdout, /Una regla nueva del sistema/, 'el changelog se lee antes de reemplazar')

  // 7. Y al aplicar, lo del sistema avanza y lo del proyecto queda intacto.
  const upgraded = upstreamCli(['upgrade', consumer])
  assert.equal(upgraded.status, 0, upgraded.stderr)
  assert.equal(version(), '99.0.0')

  assert.match(fs.readFileSync(path.join(planning, 'rules', 'system', 'process.md'), 'utf8'), /río arriba/)
  assert.equal(fs.readFileSync(path.join(planning, 'rules', 'acme-naming.md'), 'utf8'), '# convención propia\n')
  assert.equal(fs.readFileSync(path.join(planning, 'rules', 'commits.md'), 'utf8'), '# override de acme\n')
  assert.equal(fs.readFileSync(path.join(consumer, 'organization', 'company.md'), 'utf8'), '# Acme S.A.\n')
  assert.match(fs.readFileSync(path.join(planning, 'INBOX.md'), 'utf8'), /propia/)
  assert.match(fs.readFileSync(path.join(ownRole, 'SKILL.md'), 'utf8'), /PM de Acme/)
  assert.equal(fs.existsSync(ownGuard), true, 'el guard propio sobrevive al refresco del runtime')
  assert.equal(fs.existsSync(legacy), false, 'la copia vieja de workflows se retira')
  assert.match(upgraded.stdout, /retirado automatization\/workflows/)
  const automationReadme = path.join(consumer, 'automatization', 'README.md')
  assert.match(fs.readFileSync(automationReadme, 'utf8'), /Nota nueva/, 'y la prosa se pone al día')
  // El registro de entrega olvida lo retirado en vez de acumularlo.
  const registro = JSON.parse(fs.readFileSync(path.join(consumer, '.cauce', 'manifest.json'), 'utf8'))
  const huerfanas = Object.keys(registro.files).filter((file) => !fs.existsSync(path.join(consumer, file)))
  assert.deepEqual(huerfanas, [], 'ninguna entrada apunta a un archivo que ya no está')

  // 8. Y la instancia sigue siendo válida y operable después de todo.
  assert.equal(cauce(consumer, ['check', planning]).status, 0)
  assert.equal(cauce(consumer, ['automation', 'check', consumer]).status, 0)
  assert.match(cauce(consumer, ['context', planning]).stdout, /TASK/)
})
