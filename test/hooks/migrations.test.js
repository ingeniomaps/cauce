'use strict'

// Qué parte de una migración juzga el guard y dónde la busca: el bloque que aplica y no el que revierte
// (caso 185), el borrado que cada herramienta escribe con su propia API (193) y las carpetas que el
// proyecto declara (196). Los dos lados de cada uno, por la razón que da `hooks-harness.js`.

const { tempRoot, run } = require('../support/environment')
const { blocked, git, initRepo } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')

function instance(name, migrations) {
  const root = tempRoot(name)
  fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({
    project: 'x', mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }],
    ...(migrations ? { migrations } : {}),
  }))
  return root
}

const write = (root, file, content) => ({ cwd: root, tool_name: 'Write', tool_input: { file_path: file, content } })
const passes = (input) => assert.doesNotThrow(() => execute('migrations', input), input.tool_input.file_path)

const LANGUAGE = ['sql', 'py', 'rb', 'ts', 'js']

const GOOSE = [
  '-- +goose Up', '-- +goose StatementBegin', 'CREATE TABLE catalog_items (id uuid PRIMARY KEY);',
  '-- +goose StatementEnd', '', '-- +goose Down', '-- +goose StatementBegin', 'DROP TABLE catalog_items;',
  '-- +goose StatementEnd', '',
].join('\n')

test('una migración con marcadores se juzga por el bloque que aplica, no por su reversión', () => {
  const root = instance('ops-hook-mig-bloques-')
  const file = 'db/migrations/20260923120000_catalog_items.sql'

  passes(write(root, file, GOOSE))
  // El parser de goose compara la anotación con `EqualFold` y no exige el espacio después de `--`.
  passes(write(root, file, GOOSE.replace('-- +goose Down', '-- +goose down')))
  passes(write(root, file, GOOSE.replace('-- +goose Down', '--+goose Down')))
  passes(write(root, file, '-- migrate:up\nCREATE TABLE t (id int);\n\n-- migrate:down\nDROP TABLE t;\n'))
  // En golang-migrate la reversión es otro archivo, y ése es reversión entera.
  passes(write(root, 'db/migrations/000001_catalog_items.down.sql', 'DROP TABLE catalog_items;\n'))

  // Lo que aplica se sigue juzgando, y el mensaje dice en qué bloque está.
  blocked('migrations', write(root, file, GOOSE.replace('CREATE TABLE catalog_items (id uuid PRIMARY KEY);',
    'DROP TABLE legacy_items;')), /contiene SQL destructivo en el bloque que aplica.*-- \+goose Down.*DROP TABLE/)
  blocked('migrations', write(root, file, '-- migrate:up\nTRUNCATE t;\n-- migrate:down\nSELECT 1;\n'),
    /en el bloque que aplica.*-- migrate:down.*TRUNCATE/)
  blocked('migrations', write(root, 'db/migrations/000001_catalog_items.up.sql', 'DROP TABLE x;\n'),
    /SQL destructivo/)
  // Una línea que goose no toma por marcador no parte nada: con espacio inicial es un error para goose.
  blocked('migrations', write(root, file, GOOSE.replace('-- +goose Down', ' -- +goose Down')), /SQL destructivo/)
  // Sin marcadores se evalúa entero, que es el comportamiento de antes y el correcto para una migración que
  // no declara su reversión.
  blocked('migrations', write(root, file, 'CREATE TABLE t (id int);\nDROP TABLE t;\n'),
    /contiene SQL destructivo: `DROP TABLE`/)
})

// En un `Edit` el guard no ve el archivo, sólo el fragmento. De qué lado cae lo decide dónde está
// `old_string` en disco; el repositorio es para que un archivo que no viajó no frene por existir.
test('un Edit se juzga según el lado de la migración en disco donde cae', () => {
  const root = instance('ops-hook-mig-edit-', { extensions: LANGUAGE })
  initRepo(root)
  const file = 'db/migrations/20260923120000_catalog_items.sql'
  fs.mkdirSync(path.join(root, 'db', 'migrations'), { recursive: true })
  fs.writeFileSync(path.join(root, file), GOOSE)
  const edit = (old_string, new_string, extra = {}) =>
    ({ cwd: root, tool_name: 'Edit', tool_input: { file_path: file, old_string, new_string, ...extra } })

  passes(edit('DROP TABLE catalog_items;', 'DROP TABLE IF EXISTS catalog_items;'))
  blocked('migrations', edit('CREATE TABLE catalog_items (id uuid PRIMARY KEY);', 'DROP TABLE catalog_items;'),
    /bloque que aplica/)
  // Un fragmento que mueve el marcador se lee desde el lado donde empieza: lo que queda antes del `Down`
  // aplica.
  blocked('migrations', edit('-- +goose Down', 'DROP TABLE other;\n-- +goose Down'), /bloque que aplica/)
  // Con dos apariciones, la primera en la reversión, sólo el reemplazo total alcanza la que aplica.
  const alembic = 'migrations/versions/1_t.py'
  fs.mkdirSync(path.join(root, 'migrations', 'versions'), { recursive: true })
  fs.writeFileSync(path.join(root, alembic),
    'def downgrade():\n    op.drop_table("t")  # x\n\n\ndef upgrade():\n    op.create_table("t")  # x\n')
  const twice = (extra) => ({ cwd: root, tool_name: 'Edit',
    tool_input: { file_path: alembic, old_string: '  # x', new_string: '\n    op.drop_column("t", "c")', ...extra } })
  passes(twice({}))
  blocked('migrations', twice({ replace_all: true }), /borrado destructivo en el bloque que aplica/)
  // Sin dónde ubicarlo, el fragmento se juzga entero, como antes.
  blocked('migrations', edit('no está en el archivo', 'DROP TABLE catalog_items;'), /contiene SQL destructivo: /)
  fs.rmSync(path.join(root, file))
  blocked('migrations', edit('DROP TABLE catalog_items;', 'DROP TABLE IF EXISTS x;'), /contiene SQL destructivo: /)
})


// Las APIs de borrado que la documentación pública de cada herramienta nombra —las fuentes, en el caso
// 193—. Lo que no se comprobó no entra: la lista envejece nombrando, no suponiendo.
test('el borrado con la API de la herramienta frena en la parte que aplica de una migración de lenguaje', () => {
  const root = instance('ops-hook-mig-orm-', { extensions: LANGUAGE })
  const alembic = (body) => `from alembic import op\n\ndef upgrade():\n    ${body}\n\ndef downgrade():\n    pass\n`
  for (const call of ['op.drop_table("t")', 'op.drop_column("t", "c")']) {
    blocked('migrations', write(root, 'migrations/versions/1_drop.py', alembic(call)), /borrado destructivo/)
  }
  const rails = (body) => `class X < ActiveRecord::Migration[8.0]\n  def up\n    ${body}\n  end\nend\n`
  for (const call of ['drop_table :t', 'remove_column :t, :c', 'remove_columns :t, :a, :b', 'drop_join_table :a, :b']) {
    blocked('migrations', write(root, 'db/migrate/1_x.rb', rails(call)), /borrado destructivo/)
  }
  blocked('migrations', write(root, 'db/migrate/1_x.rb',
    'class X < ActiveRecord::Migration[8.0]\n  def change\n    drop_table :t\n  end\nend\n'), /borrado destructivo/)
  const typeorm = (body) => 'export class X implements MigrationInterface {\n'
    + `  public async up(queryRunner: QueryRunner): Promise<void> {\n    ${body}\n  }\n`
    + '  public async down(): Promise<void> {}\n}\n'
  for (const call of ["await queryRunner.dropTable('t')", "await queryRunner.dropColumn('t', 'c')",
    "await queryRunner.dropColumns('t', ['c'])"]) {
    blocked('migrations', write(root, 'src/migrations/1-X.ts', typeorm(call)), /borrado destructivo/)
  }
  for (const call of ["knex.schema.dropTable('t')", "knex.schema.dropTableIfExists('t')",
    "knex.schema.alterTable('t', (table) => table.dropColumn('c'))"]) {
    blocked('migrations', write(root, 'migrations/1_x.js', `exports.up = (knex) => ${call}\nexports.down = () => {}\n`),
      /borrado destructivo/)
  }
  blocked('migrations', write(root, 'app/migrations/0002_x.py',
    'operations = [\n    migrations.DeleteModel(name="T"),\n]\n'), /borrado destructivo/)
  blocked('migrations', write(root, 'app/migrations/0002_x.py',
    'operations = [\n    migrations.RemoveField(model_name="t", name="c"),\n]\n'), /borrado destructivo/)
  // Sin declarar la extensión, la migración de lenguaje sigue fuera del guard: es opt-in (caso 077).
  passes(write(instance('ops-hook-mig-orm-sql-'), 'migrations/versions/1_drop.py', alembic('op.drop_table("t")')))
})

test('la reversión de una migración de lenguaje no frena, y lo que sigue a ella sí', () => {
  const root = instance('ops-hook-mig-down-', { extensions: LANGUAGE })
  passes(write(root, 'migrations/versions/1_t.py', 'from alembic import op\n\ndef upgrade():\n'
    + '    op.create_table("t")\n\n\ndef downgrade():\n    op.drop_table("t")\n'))
  passes(write(root, 'db/migrate/1_t.rb', 'class T < ActiveRecord::Migration[8.0]\n  def up\n    create_table :t\n'
    + '  end\n\n  def down\n    drop_table :t\n  end\nend\n'))
  passes(write(root, 'db/migrate/1_t.rb', 'class T < ActiveRecord::Migration[4.2]\n  def self.down\n'
    + '    drop_table :t\n  end\nend\n'))
  const typeorm = 'export class T implements MigrationInterface {\n'
    + '  public async up(queryRunner: QueryRunner): Promise<void> {\n    await queryRunner.createTable(t)\n  }\n\n'
    + '  public async down(queryRunner: QueryRunner): Promise<void> {\n'
    + "    await queryRunner.query(`DROP TABLE t`)\n    await queryRunner.dropTable('t')\n  }\n}\n"
  passes(write(root, 'src/migrations/1-T.ts', typeorm))
  passes(write(root, 'migrations/1_t.js', "exports.up = (knex) => knex.schema.createTable('t', () => {})\n"
    + "exports.down = function (knex) {\n  return knex.schema.dropTable('t')\n}\n"))
  passes(write(root, 'migrations/1_t.js',
    "export async function down(knex) {\n  await knex.schema.dropTable('t')\n}\n"))

  // El bloque de reversión termina donde la indentación vuelve a la del encabezado: lo que viene después
  // es otra cosa, y se juzga.
  blocked('migrations', write(root, 'migrations/versions/1_t.py', 'def downgrade():\n    pass\n\n'
    + 'def helper():\n    op.drop_table("t")\n'),
  /borrado destructivo en el bloque que aplica.*downgrade\(\).*`drop_table`/)
  blocked('migrations', write(root, 'src/migrations/1-T.ts', typeorm.replace(/\}\n$/,
    "  private async helper(queryRunner: QueryRunner) {\n    await queryRunner.dropTable('x')\n  }\n}\n")),
  /borrado destructivo/)
  // Una llamada a `down` dentro de `up` no es el encabezado de la reversión.
  blocked('migrations', write(root, 'migrations/1_t.js',
    "exports.up = async (knex) => { await knex.schema.dropTable('t'); return down(knex) }\n"), /borrado destructivo/)
})

test('las carpetas de migraciones las puede declarar el proyecto', () => {
  const content = 'from alembic import op\n\ndef upgrade():\n    op.execute("DROP TABLE t")\n'
  // Sin declararlas son las de siempre, y `alembic/versions` queda afuera.
  passes(write(instance('ops-hook-mig-paths-default-', { extensions: ['py'] }), 'alembic/versions/1_d.py', content))

  const root = instance('ops-hook-mig-paths-', { extensions: ['sql', 'py'], paths: ['alembic/versions', 'migrations'] })
  blocked('migrations', write(root, 'alembic/versions/1_d.py', content), /alembic\/versions\/1_d\.py contiene SQL/)
  blocked('migrations', write(root, 'svc/alembic/versions/1_d.py', content), /SQL destructivo/)
  blocked('migrations', write(root, 'migrations/1_d.sql', 'DROP TABLE t;'), /SQL destructivo/)
  // Declararlas reemplaza el default, igual que las extensiones.
  passes(write(root, 'db/migrate/1_d.sql', 'DROP TABLE t;'))
  // Un segmento a medias no es la carpeta.
  passes(write(root, 'notalembic/versions/1_d.py', content))

  // La otra mitad del guard, reescribir una existente, también la alcanza.
  fs.mkdirSync(path.join(root, 'alembic', 'versions'), { recursive: true })
  fs.writeFileSync(path.join(root, 'alembic', 'versions', '0001_init.py'), content)
  blocked('migrations', write(root, 'alembic/versions/0001_init.py', 'def upgrade():\n    pass\n'),
    /no hay repositorio con el que saber/)

  // Un valor que el validador rechaza no llega a la expresión regular.
  const bad = instance('ops-hook-mig-paths-bad-', { paths: ['.*'] })
  passes(write(bad, 'src/x.sql', 'DROP TABLE t;'))
  blocked('migrations', write(bad, 'migrations/1.sql', 'DROP TABLE t;'), /SQL destructivo/)
})

// El aviso nombra cada declaración que no alcanza nada, y sólo ésa: la extensión que sí cubre algo y la
// carpeta que sí existe no aparecen (caso 196).
test('check avisa lo declarado en migrations que no alcanza a ningún archivo', () => {
  const base = tempRoot('cauce-mig-check-')
  initRepo(base)
  const target = path.join(base, 'demo-ops')
  assert.equal(run(['init', target, '--name', 'Demo', '--mode', 'sidecar', '--no-install']).status, 0)
  for (const file of ['alembic/versions/0001_init.py', 'app/main.py', 'migrations/0001_init.sql']) {
    fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true })
    fs.writeFileSync(path.join(base, file), '\n')
  }
  git(['add', 'alembic', 'app', 'migrations'], base)
  const planning = path.join(target, 'planning')
  const configPath = path.join(target, 'ops.config.json')
  const declare = (migrations) => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    config.migrations = migrations
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    const result = run(['check', planning])
    assert.equal(result.status, 0, 'es advertencia, no error')
    return result.stdout + result.stderr
  }
  const quiet = run(['check', planning])
  assert.doesNotMatch(quiet.stdout + quiet.stderr, /migrations\./, 'sin declarar no avisa nada')
  const py = declare({ extensions: ['sql', 'py'] })
  assert.match(py, /migrations\.extensions "py" no alcanza a ningún archivo/)
  assert.doesNotMatch(py, /"sql" no alcanza/)
  const paths = declare({ extensions: ['sql', 'py'], paths: ['migrations', 'alembic/versions', 'db/migrate'] })
  assert.doesNotMatch(paths, /extensions "py"/)
  assert.match(paths, /migrations\.paths "db\/migrate" no alcanza a ningún archivo/)
  assert.doesNotMatch(paths, /paths "alembic\/versions"/)
})

// Caso 199. Un `apply_patch` de Codex trae cada archivo con el prefijo del parche, y el guard juzgaba el sobre
// entero: los marcadores no partían y la reversión volvía a frenar. Cada archivo se juzga por su sección.
test('un parche se juzga archivo por archivo, y cada uno por el bloque que aplica', () => {
  const root = instance('ops-hook-mig-patch-')
  const file = 'db/migrations/20260923120000_catalog_items.sql'
  const patch = (...sections) => ({ cwd: root, tool_name: 'apply_patch',
    tool_input: { command: ['*** Begin Patch', ...sections, '*** End Patch'].join('\n') } })
  const added = (name, text) => [`*** Add File: ${name}`, ...text.split('\n').map((line) => `+${line}`)].join('\n')

  passes(patch(added(file, GOOSE)))
  blocked('migrations', patch(added(file, GOOSE.replace('CREATE TABLE catalog_items (id uuid PRIMARY KEY);',
    'DROP TABLE legacy_items;'))), /en el bloque que aplica.*DROP TABLE/)

  // Lo que otro archivo del mismo parche dice no es de la migración.
  passes(patch(added(file, 'CREATE TABLE t (id int);'), added('docs/notes.md', 'Nunca DROP TABLE en producción.')))

  // Una modificación juzga sólo lo agregado, del lado que aplica según el contexto que trae el hunk.
  const update = (lines) => [`*** Update File: ${file}`, ...lines].join('\n')
  passes(patch(update(['@@', ' -- +goose Down', '-DELETE FROM catalog_items;', '+DROP TABLE catalog_items;'])))
  blocked('migrations', patch(update(['@@', ' -- +goose Up', '+DROP TABLE legacy_items;', ' -- +goose Down'])),
    /en el bloque que aplica.*DROP TABLE/)
  // Sin marcador en el contexto no se sabe de qué lado cae: se juzga lo agregado entero, como antes.
  blocked('migrations', patch(update(['@@', ' SELECT 1;', '+DROP TABLE legacy_items;'])), /SQL destructivo/)
  // Lo que se quita no se juzga: sacar un DROP no destruye nada.
  passes(patch(update(['@@', ' -- +goose Up', '-DROP TABLE legacy_items;', '+SELECT 1;'])))
  // Y no cuenta para partir: sin el `Down` que el hunk quita, lo agregado después cae en lo que aplica.
  blocked('migrations', patch(update(['@@', ' -- +goose Up', '--- +goose Down', '+DROP TABLE t;'])), /DROP TABLE/)

  // `@@` separa hunks y no es una línea del archivo: leído como tal, su sangría cerraría el `downgrade()`.
  const python = instance('ops-hook-mig-patch-py-', { extensions: ['py'] })
  const revision = 'migrations/versions/0001_items.py'
  passes({ cwd: python, tool_name: 'apply_patch', tool_input: { command: ['*** Begin Patch',
    `*** Update File: ${revision}`, '@@', ' def downgrade():', '     op.drop_index("ix")', '@@',
    '     op.execute("SELECT 1")', '+    op.drop_table("items")', '*** End Patch'].join('\n') } })
})
