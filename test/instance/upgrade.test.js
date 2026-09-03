'use strict'

// Recibir una versión nueva sin perder lo propio: qué reemplaza el toolkit, qué reconoce como
// edición de la empresa y qué se niega a pisar. La propiedad que lo decide vive en `core.test.js`;
// acá se mide lo que queda en el disco después.

const { MIN_ROLES, tempRoot, run, linkEngine } = require('../support/environment')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// La guía es lo único que le dice a alguien qué hacer con lo que acaba de crear, así que no puede
// depender de que la instalación haya corrido: la resuelve el mismo motor que está corriendo init.
// El motor viene fijado en una versión exacta, así que no se mueve solo: sin decirlo, «al día» se lee
// como «no hay nada nuevo» durante todas las versiones siguientes, y el usuario se queda atrás en
// silencio. La instrucción concreta vale más que la advertencia.
test('upgrade --check dice contra qué compara y cómo traer lo nuevo', () => {
  const base = tempRoot('cauce-aldia-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  const check = run(['upgrade', target, '--check'])
  assert.equal(check.status, 0, check.stderr)
  assert.match(check.stdout, /al día con el motor instalado/)
  assert.match(check.stdout, /npm install --save-dev @ingeniomaps\/cauce@latest/)

  // Y el atajo de la instancia hace los dos pasos, porque `npm update` no mueve una versión exacta.
  const makefile = fs.readFileSync(path.join(target, 'Makefile'), 'utf8')
  const upgrade = makefile.split('\nupgrade:')[1].split('\n\n')[0]
  assert.match(upgrade, /npm install --save-dev @ingeniomaps\/cauce@latest/)
  assert.match(upgrade, /tools\/ops\.js upgrade \./)
})

test('upgrade reemplaza lo del sistema y no toca nada del proyecto', () => {
  const base = tempRoot('cauce-upgrade-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)

  const version = () => JSON.parse(fs.readFileSync(path.join(target, 'ops.config.json'), 'utf8')).cauceVersion
  assert.ok(version(), 'init registra de qué versión salió la instancia')

  // El proyecto trabaja: agrega lo suyo, sobrescribe una regla y suma un guard propio.
  const rules = path.join(target, 'planning', 'rules')
  fs.writeFileSync(path.join(rules, 'acme-naming.md'), '# convención propia\n')
  fs.writeFileSync(path.join(rules, 'commits.md'), '# el override de acme\n')
  fs.writeFileSync(path.join(target, 'organization', 'company.md'), '# Acme S.A.\n')
  const ownGuard = path.join(target, 'automatization', 'hooks', 'guard-acme.sh')
  fs.writeFileSync(ownGuard, '#!/usr/bin/env bash\necho propio\n')

  // Nada que actualizar mientras la versión coincida.
  const current = run(['upgrade', target, '--check'])
  assert.equal(current.status, 0)
  assert.match(current.stdout, /está al día/)

  const upgraded = run(['upgrade', target])
  assert.equal(upgraded.status, 0, upgraded.stderr)
  assert.match(upgraded.stdout, /conservado planning\/rules\/commits\.md/, 'el override se reporta')

  assert.equal(fs.readFileSync(path.join(rules, 'acme-naming.md'), 'utf8'), '# convención propia\n')
  assert.equal(fs.readFileSync(path.join(rules, 'commits.md'), 'utf8'), '# el override de acme\n')
  assert.equal(fs.readFileSync(path.join(target, 'organization', 'company.md'), 'utf8'), '# Acme S.A.\n')
  assert.equal(fs.existsSync(ownGuard), true, 'un guard propio no se borra al refrescar el runtime')
  assert.ok(fs.existsSync(path.join(rules, 'system', 'commits.md')), 'system/ sigue completo')
  assert.equal(run(['check', path.join(target, 'planning')]).status, 0)
})

test('upgrade se niega a pisar una edición del runtime sin --force', () => {
  const base = tempRoot('cauce-upgrade-edit-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)

  const guard = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  fs.writeFileSync(guard, '#!/usr/bin/env bash\n# lo edité a mano\n')

  const refused = run(['upgrade', target])
  assert.notEqual(refused.status, 0, 'no puede perder el cambio en silencio')
  assert.match(refused.stderr, /guard-verify\.sh/)
  assert.match(refused.stderr, /--force/)
  assert.match(fs.readFileSync(guard, 'utf8'), /lo edité a mano/, 'el archivo sigue intacto')

  const forced = run(['upgrade', target, '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.equal(/lo edité a mano/.test(fs.readFileSync(guard, 'utf8')), false, '--force sí lo reemplaza')
})

test('upgrade explica cómo personalizar el runtime sin editarlo, y deja rastro al descartar', () => {
  const base = tempRoot('cauce-runtime-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)

  // Un guard propio no necesita ningún mecanismo extra: el toolkit no lo conoce y no lo toca.
  const own = path.join(target, 'automatization', 'hooks', 'guard-acme.sh')
  fs.writeFileSync(own, '#!/usr/bin/env bash\necho propio\n')
  assert.equal(run(['upgrade', target]).status, 0)
  assert.equal(fs.existsSync(own), true)

  // Editar uno del toolkit sí se detiene, y la salida tiene que decir algo que realmente funcione.
  const guard = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  fs.writeFileSync(guard, '#!/usr/bin/env bash\n# editado\n')
  const refused = run(['upgrade', target])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /agregá lo tuyo al lado con otro nombre/)
  assert.equal(/junto a system\//.test(refused.stderr), false, 'hooks no tiene system/: no puede sugerirlo')

  // Descartar es legítimo; hacerlo en silencio no.
  const forced = run(['upgrade', target, '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.match(forced.stdout, /descartado tu cambio en automatization\/hooks\/guard-verify\.sh/)
})

test('el catálogo llega con la dependencia y el proyecto sólo lleva lo suyo', () => {
  const catalog = require('../../engine/agents/catalog')
  const base = tempRoot('cauce-catalogo-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'Acme', '--mode', 'sidecar']).status, 0)
  linkEngine(target)
  const total = catalog.list(target).length
  assert.ok(total >= MIN_ROLES)

  // El catálogo se resuelve desde la dependencia: el proyecto no lleva una copia.
  assert.equal(fs.existsSync(path.join(target, 'agents', 'roles', 'system')), false)

  // Un cargo propio convive y gana sobre el del sistema con el mismo slug.
  const own = path.join(target, 'agents', 'roles', 'product-manager')
  fs.mkdirSync(own, { recursive: true })
  fs.writeFileSync(path.join(own, 'SKILL.md'), '---\nname: product-manager\ndescription: PM propio.\n---\n')
  assert.equal(catalog.list(target).length, total, 'sobrescribir no duplica el slug')
  assert.equal(catalog.resolve(target, 'product-manager'), own)

  // Y actualizar no toca lo del proyecto: el catálogo del sistema ni siquiera está acá para tocarlo.
  assert.equal(run(['upgrade', target]).status, 0)
  assert.equal(catalog.list(target).length, total)
  assert.match(fs.readFileSync(path.join(own, 'SKILL.md'), 'utf8'), /PM propio/)
})

test('nada se vendoriza, ni al crear ni al actualizar', () => {
  const base = tempRoot('cauce-vendor-')
  const target = path.join(base, 'acme')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'acme', version: '1.0.0' }))
  assert.equal(run(['init', target, '--name', 'A', '--mode', 'sidecar', '--force']).status, 0)
  assert.equal(fs.existsSync(path.join(target, '.ops')), false, 'init no copia nada a .ops')
  assert.equal(run(['upgrade', target]).status, 0)
  // Duplicar el paquete adentro del repo de la empresa sería versionar dos veces lo mismo, y la copia
  // quedaría vieja sin que nadie se entere.
  assert.equal(fs.existsSync(path.join(target, '.ops')), false, 'upgrade tampoco lo crea')

  // Una instancia que arrastra la copia de una versión anterior no se rompe en silencio: se le dice.
  fs.mkdirSync(path.join(target, '.ops', 'engine'), { recursive: true })
  const warned = run(['upgrade', target])
  assert.equal(warned.status, 0)
  assert.match(warned.stdout, /\.ops\/, que Cauce ya no distribuye/)
  assert.equal(fs.existsSync(path.join(target, '.ops')), true, 'y no se lo borra por su cuenta')
})

test('upgrade distingue una edición local de una mejora del toolkit', () => {
  const M = require('../../engine/core/manifest')
  const base = tempRoot('cauce-manifiesto-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'A', '--mode', 'sidecar']).status, 0)

  const guard = path.join(target, 'automatization', 'hooks', 'guard-verify.sh')
  const rule = path.join(target, 'planning', 'business-rules', 'system', 'BR-OPS-001-una-sola-tarea-activa.md')
  const record = M.read(target)
  assert.ok(Object.keys(record).length > 10, 'init deja constancia de lo entregado')
  assert.ok(record['automatization/hooks/guard-verify.sh'], 'incluye el runtime')
  assert.ok(record['planning/business-rules/system/BR-OPS-001-una-sola-tarea-activa.md'], 'y las reglas')

  // Nada editado: el upgrade pasa aunque el paquete traiga cambios.
  assert.equal(run(['upgrade', target]).status, 0)

  // Editado por la empresa: se detiene, y distingue de qué naturaleza es cada cosa.
  fs.appendFileSync(guard, '# mío\n')
  fs.appendFileSync(rule, '\nmía\n')
  const refused = run(['upgrade', target])
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /guard-verify\.sh/)
  assert.match(refused.stderr, /BR-OPS-001/)
  assert.match(refused.stderr, /mismo ID/, 'la guía para una regla es el override')
  assert.match(refused.stderr, /guard propio sobrevive/, 'y para el runtime, agregar al lado')

  // Con --force se reemplazan y el registro vuelve a reflejar lo entregado.
  assert.equal(run(['upgrade', target, '--force']).status, 0)
  assert.equal(/# mío/.test(fs.readFileSync(guard, 'utf8')), false)
  assert.deepEqual(require('../../engine/core/ownership').localChanges(target), [], 'sin ediciones pendientes')

  // `AGENTS.md` es de los que el toolkit posee de a uno y no de una colección: la clase que quedaba
  // afuera del registro. Por qué entra por la misma puerta, en `localChanges`.
  const contract = path.join(target, 'AGENTS.md')
  assert.ok(M.read(target)['AGENTS.md'], 'el archivo suelto queda registrado')
  fs.appendFileSync(contract, '\nlínea de la empresa\n')
  const stopped = run(['upgrade', target])
  assert.notEqual(stopped.status, 0, 'editar un archivo del sistema detiene la actualización')
  assert.match(stopped.stderr, /AGENTS\.md/)
  assert.equal(run(['upgrade', target, '--force']).status, 0)
  assert.equal(/línea de la empresa/.test(fs.readFileSync(contract, 'utf8')), false)
})

// El README de ADR pedía actualizar un índice del proyecto dentro de un archivo que Cauce mantiene:
// seguir el paso garantizaba perder la fila, y con el registro nuevo además dejaría la instancia sin
// poder actualizarse. Las decisiones del proyecto son los archivos del directorio.
test('ningún archivo del sistema pide que el proyecto lo edite', () => {
  const adr = fs.readFileSync(path.resolve(__dirname, '..', '..', 'template', 'planning', 'adr', 'README.md'), 'utf8')
  assert.equal(/Decisiones del proyecto/.test(adr), false, 'sin tabla que el proyecto deba mantener')
  assert.equal(/Actualizar el índice/.test(adr), false, 'ni paso que lo mande a editar')
  assert.match(adr, /No hay índice que mantener/, 'y dice por qué no lo hay')
})

test('la instancia recibe cómo escribir lo que sí es suyo', () => {
  const base = tempRoot('cauce-plantillas-')
  const target = path.join(base, 'acme')
  assert.equal(run(['init', target, '--name', 'A', '--mode', 'sidecar']).status, 0)

  // Mover una colección al paquete no puede llevarse la documentación que le habla a la empresa:
  // sin ella no tiene cómo saber qué escribir ni con qué contrato.
  for (const guide of [
    ['flows', '000-template.md'],
    ['flows', 'README.md'],
    ['organization', 'roles', 'README.md'],
    ['planning', 'business-rules', '000-template.md'],
    ['planning', 'adr', '000-template.md'],
    ['planning', 'roadmap', 'epic-000-template.md'],
  ]) {
    assert.equal(fs.existsSync(path.join(target, ...guide)), true, `falta ${guide.join('/')}`)
  }
  // Y las definiciones que consume el motor siguen sin copiarse.
  assert.equal(fs.existsSync(path.join(target, 'flows', 'system')), false)
  assert.equal(fs.existsSync(path.join(target, 'agents')), false)
})

// Los dos archivos de `delivery/` en la misma instancia: el que el toolkit reemplaza y el que es de la
// empresa. Separados no se distingue una declaración correcta de la que se olvidó del segundo.
test('la guía de entrega llega a una instancia y su project.md no', () => {
  const O = require('../../engine/core/ownership')
  for (const guia of ['README.md', 'branches.md', 'release.md', 'environments.md', 'flags.md',
    'multi-repo.md']) {
    assert.ok(O.SYSTEM_FILES.includes(`planning/delivery/${guia}`), `${guia} es del toolkit`)
  }
  assert.equal(O.SYSTEM_FILES.includes('planning/delivery/project.md'), false,
    'lo que el proyecto declara sobre su entrega es suyo')

  // Y cada clase de archivo editado recibe su salida, no la de otra: antes, todo lo que no vivía bajo
  // `system/` respondía con cómo desactivar un guard, incluido el protocolo.
  const fuente = fs.readFileSync(path.resolve(__dirname, '..', '..', 'engine', 'cli', 'instance.js'), 'utf8')
  for (const clase of ['const ruleFiles = changed.filter', 'const runtime = changed.filter',
    'const docs = changed.filter']) {
    assert.ok(fuente.includes(clase), `upgrade distingue ${clase}`)
  }
})

// El `AGENTS.md` de una instancia describe qué se puede editar y qué no, y envejecido miente: decía que
// todo `planning/` salvo cinco directorios era del proyecto justo cuando la guía de entrega pasó a ser
// del toolkit. Se contrasta contra la lista que manda de verdad.
test('el AGENTS.md de una instancia dice la propiedad que el motor aplica', () => {
  const O = require('../../engine/core/ownership')
  const agents = fs.readFileSync(path.resolve(__dirname, '..', '..', 'template', 'AGENTS.md'), 'utf8')
  const delivery = O.SYSTEM_FILES.filter((file) => file.startsWith('planning/delivery/'))

  assert.ok(delivery.length, 'el motor declara guías de entrega como suyas')
  assert.ok(agents.includes('planning/delivery/'), 'y el AGENTS.md las nombra')
  assert.ok(agents.includes('delivery/project.md'), 'junto a lo que sigue siendo del proyecto')

  // El README del paquete es lo primero que alguien lee antes de instalar, y decía que `upgrade`
  // reemplaza `system/` «y nada más se toca» — falso para todos los archivos del toolkit que no viven
  // bajo ningún `system/`, que son la mayoría.
  const readme = fs.readFileSync(path.resolve(__dirname, '..', '..', 'README.md'), 'utf8')
  assert.ok(readme.includes('planning/delivery/'), 'el README nombra la guía que también se reemplaza')
  assert.equal(readme.includes('se reemplaza `system/` entero y nada más se toca'), false,
    'y no promete que sólo se toque system/')
  assert.equal(O.SYSTEM_FILES.includes('planning/delivery/project.md'), false)
})

// `teams/` pasó a llamarse `flows/`, y una empresa instalada tiene ahí sus recorridos propios. Sin
// migración `upgrade` copiaría `flows/` nuevo y dejaría `teams/<slug>/` en una ruta que el motor ya no
// mira: presente en disco e invisible para el catálogo, que es la peor de las dos pérdidas posibles
// —no avisa—. Y no alcanza con mover la carpeta: adentro los archivos también cambiaron de nombre.
test('upgrade mueve los recorridos propios de teams/ a flows/', () => {
  const base = tempRoot('cauce-rename-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  linkEngine(target)

  // La instancia como la dejó una versión anterior: la carpeta vieja, con un recorrido propio adentro.
  fs.rmSync(path.join(target, 'flows'), { recursive: true, force: true })
  const mio = path.join(target, 'teams', 'mi-recorrido')
  fs.mkdirSync(mio, { recursive: true })
  fs.writeFileSync(path.join(mio, 'team.json'), '{"slug":"mi-recorrido"}')
  fs.writeFileSync(path.join(mio, 'WORKFLOW.md'), '# Mío\n')
  fs.writeFileSync(path.join(target, 'teams', 'README.md'), 'viejo\n')

  const salida = run(['upgrade', target, '--force'])
  assert.equal(salida.status, 0, salida.stderr)

  assert.equal(fs.existsSync(path.join(target, 'teams')), false, 'la carpeta vieja no queda al lado')
  assert.equal(fs.readFileSync(path.join(target, 'flows', 'mi-recorrido', 'flow.json'), 'utf8'),
    '{"slug":"mi-recorrido"}', 'el recorrido propio llega entero y con el nombre nuevo')
  assert.ok(fs.existsSync(path.join(target, 'flows', 'mi-recorrido', 'FLOW.md')))
  assert.equal(fs.existsSync(path.join(target, 'flows', 'mi-recorrido', 'team.json')), false)
  // Y el README del molde se reemplaza por el nuevo, como cualquier archivo del toolkit.
  assert.match(fs.readFileSync(path.join(target, 'flows', 'README.md'), 'utf8'), /^# Recorridos/)
  assert.match(salida.stdout, /teams\/ → flows\//, 'y la migración se dice, no ocurre en silencio')
})

// Adoptar Cauce en un repositorio que ya tiene contenido es `init --force`: los archivos propios que
// chocan con una ruta del toolkit se conservan, y eso funciona. Lo que no funcionaba era el registro:
// el manifiesto se grababa hasheando el disco, así que un archivo conservado quedaba anotado como
// entregado por Cauce con el contenido de la empresa. `upgrade` comparaba, no veía ninguna diferencia
// y lo reemplazaba, informando que no había tocado nada propio. La protección existía y era ciega
// justo en el caso que `--force` está para cubrir.
test('upgrade no pisa lo que init --force conservó', () => {
  const base = tempRoot('cauce-adopcion-')
  const target = path.join(base, 'acme-ops')
  fs.mkdirSync(path.join(target, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(target, 'AGENTS.md'), '# Reglas de Acme\n')
  fs.writeFileSync(path.join(target, 'planning', 'PROTOCOL.md'), '# Protocolo propio de Acme\n')

  const init = run(['init', target, '--name', 'Acme', '--mode', 'sidecar', '--force', '--no-install'])
  assert.equal(init.status, 0, init.stderr)
  assert.match(fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8'), /Reglas de Acme/, 'init conserva')

  // El paso siguiente que documenta el README, sobre lo que init acaba de conservar.
  const upgraded = run(['upgrade', target])
  assert.notEqual(upgraded.status, 0, 'upgrade se detiene en vez de reemplazar lo conservado')
  assert.match(upgraded.stderr, /AGENTS\.md/)
  assert.match(upgraded.stderr, /planning\/PROTOCOL\.md/)
  assert.equal(fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8'), '# Reglas de Acme\n')
  assert.equal(fs.readFileSync(path.join(target, 'planning', 'PROTOCOL.md'), 'utf8'),
    '# Protocolo propio de Acme\n')

  // Y con --force se aplica, que es la salida: lo descartado queda en la salida del comando y la
  // frase que afirma que no se tocó nada propio no aparece cuando sí se tocó.
  const forced = run(['upgrade', target, '--force'])
  assert.equal(forced.status, 0, forced.stderr)
  assert.match(forced.stdout, /descartado tu cambio en AGENTS\.md/)
  assert.doesNotMatch(forced.stdout, /todo lo propio quedaron intactos/)
  assert.match(fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8'), /Reglas de construcción/)
})

// `--check` existe para mirar antes de aplicar, y salía por un camino corto cuando la versión
// coincidía: informaba «al día» sin llegar a listar lo editado localmente. Es el estado normal entre
// actualizaciones —`init` fija la versión exacta—, así que el único modo que no toca nada era también
// el único que no podía avisar del conflicto: había que correr el que sí toca para enterarse.
test('upgrade --check reporta lo editado localmente aunque la versión coincida', () => {
  const base = tempRoot('cauce-check-editado-')
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  fs.appendFileSync(path.join(target, 'planning', 'PROTOCOL.md'), '\nmi edición local\n')

  const check = run(['upgrade', target, '--check'])
  assert.match(check.stdout, /al día con el motor instalado/, 'sigue diciendo contra qué compara')
  assert.match(check.stdout, /editado localmente: planning\/PROTOCOL\.md/)
  assert.equal(check.status, 1, 'hay algo que resolver antes de la próxima actualización')
})
