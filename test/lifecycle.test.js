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
  // En sidecar el runner aterriza en la carpeta de la compañía, no dentro del repo ops: es la
  // única que contiene además el código, y es donde el dev abre la herramienta.
  const workspace = base
  assert.equal(fs.existsSync(path.join(consumer, '.claude')), false, 'no queda encerrado en el sidecar')
  const skills = fs.readdirSync(path.join(workspace, '.claude', 'skills'))
  assert.ok(skills.length >= 40, 'los cargos llegan como skills del runner')
  assert.equal(cauce(consumer, ['automation', 'doctor', consumer, 'claude']).status, 0)
  // Y los guards se nombran desde ahí, no desde la raíz ops.
  const wiring = fs.readFileSync(path.join(workspace, '.claude', 'settings.json'), 'utf8')
  assert.match(wiring, /\$CLAUDE_PROJECT_DIR\/acme-ops\/automatization\/hooks\/guard-shell\.sh/)

  // El guard tiene que morder desde ahí. La raíz ops es un hermano de los repos de producto, y
  // ninguna búsqueda hacia arriba la encuentra: si el guard no la resuelve por su cuenta, no
  // bloquea nada y el silencio se lee como permiso.
  const guard = (file) => spawnSync(
    path.join(consumer, 'automatization', 'hooks', 'guard-files.sh'),
    { cwd: workspace, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: workspace },
      input: JSON.stringify({ tool_input: { file_path: file }, cwd: workspace }) },
  )
  assert.match(guard('/tmp/fuera-de-todo.txt').stderr, /BLOQUEADO/, 'lo de afuera no pasa')
  assert.equal(guard(path.join(workspace, 'service-a', 'main.go')).stderr, '', 'lo de adentro sí')

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
  const installed = fs.readFileSync(path.join(workspace, '.claude', 'skills', 'product-manager', 'SKILL.md'), 'utf8')
  assert.match(installed, /PM de Acme/)
  assert.match(installed, /acme-ops\/agents\/roles\/product-manager\/SKILL\.md/)

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

  // 9. Una mejora del toolkit en el wiring tiene que llegar al runner ya instalado. Es la mitad de
  // la cadena que nadie recorre hasta que hace falta: `npm install` trae el archivo nuevo, pero
  // quien lo copia a `.claude/` es otro comando, y antes conservaba siempre y no llegaba nunca.
  const packaged = path.join(consumer, 'node_modules', '@ingeniomaps', 'cauce', 'automatization')
  fs.appendFileSync(path.join(packaged, 'workflows', 'team.js'), '\n// mejora río arriba\n')
  const stale = cauce(consumer, ['automation', 'doctor', consumer, 'claude'])
  assert.match(stale.stderr, /hay una versión más nueva en Cauce/, 'doctor lo dice antes')
  assert.equal(cauce(consumer, ['automation', 'install', consumer, 'claude']).status, 0)
  const refreshed = fs.readFileSync(path.join(workspace, '.claude', 'workflows', 'team.js'), 'utf8')
  assert.match(refreshed, /mejora río arriba/, 'y reinstalar la trae')

  // Un guard que quedó atrás del paquete no falla: deja de proteger en silencio, y hasta acá
  // `check`, `doctor` y `upgrade` daban verde igual porque sólo miraban el número de versión.
  const shippedHook = path.join(packaged, 'hooks', 'run-hook.sh')
  fs.appendFileSync(shippedHook, '\n# guard mejorado río arriba\n')
  const stalled = cauce(consumer, ['automation', 'check', consumer])
  assert.notEqual(stalled.status, 0, 'un guard viejo no pasa por bueno')
  assert.match(stalled.stderr, /run-hook\.sh: quedó atrás del paquete/)
  assert.notEqual(cauce(consumer, ['automation', 'install', consumer, 'claude']).status, 0,
    'y no se instala wiring sobre un guard muerto')
  assert.equal(cauce(consumer, ['upgrade', consumer]).status, 0)
  assert.equal(cauce(consumer, ['automation', 'check', consumer]).status, 0, 'upgrade lo repone')

  // Lo que la empresa escribió en ese mismo archivo, en cambio, detiene la instalación antes de
  // pisarlo. Es del toolkit: se agrega al lado, no se edita.
  fs.appendFileSync(path.join(workspace, '.claude', 'workflows', 'team.js'), '\n// hack propio\n')
  const blocked = cauce(consumer, ['automation', 'install', consumer, 'claude'])
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /fueron editados y se perderían/)
  assert.equal(cauce(consumer, ['automation', 'install', consumer, 'claude', '--force']).status, 0)

  // El CLAUDE.md sí es del proyecto: se conserva aunque el toolkit traiga otro.
  const instructions = path.join(workspace, 'CLAUDE.md')
  fs.appendFileSync(instructions, '\n- Regla propia de Acme.\n')
  fs.appendFileSync(path.join(packaged, 'runners', 'claude', 'CLAUDE.md'), '\n- Regla del toolkit.\n')
  assert.equal(cauce(consumer, ['automation', 'install', consumer, 'claude']).status, 0)
  assert.match(fs.readFileSync(instructions, 'utf8'), /Regla propia de Acme/, 'lo tuyo no se pierde')
})
