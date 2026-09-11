'use strict'

// Qué dice el contrato de secretos compartido (caso 088): qué copia quedó atrás y cuál no, qué
// credencial está donde no debe, y qué referencia no cierra. Los dos lados siempre, porque un chequeo
// que marcara todo pasaría entero una suite que sólo mirara lo que marca.

const { tempRoot, run } = require('../support/environment')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const SE = require('../../engine/secrets')

const CANONICAL = 'def ensure_folder():\n    pass\n'
const STALE = 'def create():\n    pass\n'

// El esqueleto de un proyecto y un derivado de otro, bajo una sola instancia; el esqueleto arranca atrás.
function instance(name, change = () => {}) {
  const base = tempRoot(name)
  const root = path.join(base, 'acme-ops')
  fs.mkdirSync(path.join(root, 'organization', 'secrets'), { recursive: true })
  for (const dir of ['esqueleto/web', 'derivado/landing']) {
    fs.mkdirSync(path.join(base, dir, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(base, dir, '.env.schema'), 'API_URL=requerida\n')
  }
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'acme', mode: 'sidecar',
    workspaceRoots: [{ name: 'web', path: '../esqueleto/web' }, { name: 'landing', path: '../derivado/landing' }] }))
  fs.writeFileSync(path.join(root, 'organization', 'secrets', 'check-schema.py'), CANONICAL)
  fs.writeFileSync(path.join(base, 'esqueleto/web/scripts/check-schema.py'), STALE)
  fs.writeFileSync(path.join(base, 'derivado/landing/scripts/check-schema.py'), CANONICAL)
  // Sin crear: si el temporal de la máquina cae dentro de un repositorio, una credencial escrita en el
  // banco sería «de un repositorio» y el desvío dejaría de ser el único error.
  const identity = path.join(base, 'credenciales', 'local-dev.env')
  const files = { 'scripts/check-schema.py': 'check-schema' }
  const declaration = {
    schemaVersion: 1,
    accounts: { principal: { url: 'https://app.infisical.com' } },
    projects: { acme: { account: 'principal', environments: ['dev', 'prod'] } },
    identities: {
      'local-dev': { account: 'principal', source: 'file', file: identity },
      ci: { account: 'principal', source: 'ci-secret' },
    },
    shared: { 'check-schema': 'organization/secrets/check-schema.py' },
    services: {
      web: { root: 'web', project: 'acme', identity: 'local-dev', files },
      landing: { root: 'landing', project: 'acme', identity: 'local-dev', files },
    },
  }
  change(declaration, base)
  fs.writeFileSync(path.join(root, SE.DECLARATION), JSON.stringify(declaration))
  return { base, root }
}

const errorsOf = (root) => SE.check(root).errors

test('sin declaración no hay nada que comprobar', () => {
  const root = tempRoot('ops-secrets-vacia-')
  assert.deepEqual(SE.check(root), { declared: false, errors: [], warnings: [], current: 0 })
  const result = run(['secrets', 'check', root])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /no hay contrato de secretos/)
})

test('la copia que quedó atrás se nombra con su arreglo, y la que está al día no', () => {
  const { base, root } = instance('ops-secrets-desvio-')
  const errors = errorsOf(root)
  assert.equal(errors.length, 1, errors.join('\n'))
  assert.match(errors[0], /^services\.web: scripts\/check-schema\.py no coincide con organization\/secrets/)
  assert.match(errors[0], /cp .*organization\/secrets\/check-schema\.py .*esqueleto\/web\/scripts\/check-schema\.py/)
  assert.ok(!errors.some((error) => error.includes('landing')), 'la copia al día no se reporta')
  assert.equal(SE.check(root).current, 1, 'sólo landing cuenta como al día')

  const cli = run(['secrets', 'check', root])
  assert.equal(cli.status, 1)
  assert.match(cli.stderr, /services\.web: .* no coincide/)

  fs.copyFileSync(path.join(root, 'organization/secrets/check-schema.py'),
    path.join(base, 'esqueleto/web/scripts/check-schema.py'))
  assert.deepEqual(errorsOf(root), [])
  const fixed = run(['secrets', 'check', root])
  assert.equal(fixed.status, 0, fixed.stderr)
  assert.match(fixed.stdout, /2 servicio\(s\) al día/)
})

test('una copia que falta y un esquema que falta se dicen por servicio', () => {
  const { base, root } = instance('ops-secrets-falta-')
  fs.rmSync(path.join(base, 'esqueleto/web/scripts/check-schema.py'))
  fs.rmSync(path.join(base, 'derivado/landing/.env.schema'))
  const errors = errorsOf(root)
  assert.ok(errors.some((error) => /^services\.web: falta scripts\/check-schema\.py; copiala de/.test(error)))
  assert.ok(errors.some((error) => /^services\.landing: falta \.env\.schema en /.test(error)))
})

test('una credencial vive fuera de todo repositorio', () => {
  const insideRoot = instance('ops-secrets-cred-raiz-', (declaration, base) => {
    declaration.identities['local-dev'].file = path.join(base, 'derivado/landing/.env.infisical')
  })
  assert.ok(errorsOf(insideRoot.root)
    .some((error) => /^identities\.local-dev: .* está dentro de .*landing/.test(error)))

  const insideGit = instance('ops-secrets-cred-git-', (declaration, base) => {
    const repo = path.join(base, 'otro-repo')
    fs.mkdirSync(repo)
    const env = { ...process.env }
    delete env.GIT_DIR
    delete env.GIT_WORK_TREE
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo, env }).status, 0)
    declaration.identities['local-dev'].file = path.join(repo, 'local-dev.env')
  })
  assert.ok(errorsOf(insideGit.root).some((error) => /dentro de un repositorio de git/.test(error)))

  // Un `GIT_DIR` heredado responde por su repositorio y no por el directorio de la credencial. Se compara
  // con y sin él, y no contra un veredicto fijo, porque el temporal de la máquina podría caer en un repo.
  const inherited = instance('ops-secrets-cred-gitdir-', (declaration, base) => {
    fs.mkdirSync(path.join(base, 'fuera'))
    declaration.identities['local-dev'].file = path.join(base, 'fuera', 'local-dev.env')
  })
  const plain = errorsOf(inherited.root)
  const other = path.join(inherited.base, 'otro-repo')
  fs.mkdirSync(other)
  const clean = { ...process.env }
  delete clean.GIT_DIR
  delete clean.GIT_WORK_TREE
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: other, env: clean }).status, 0)
  const before = process.env.GIT_DIR
  process.env.GIT_DIR = path.join(other, '.git')
  try {
    assert.deepEqual(errorsOf(inherited.root), plain, 'el GIT_DIR heredado no cambia el veredicto')
  } finally {
    if (before === undefined) delete process.env.GIT_DIR
    else process.env.GIT_DIR = before
  }

  const absent = instance('ops-secrets-cred-ausente-', (declaration, base) => {
    declaration.identities['local-dev'].file = path.join(base, 'nunca-cargada', 'local-dev.env')
  })
  const result = SE.check(absent.root)
  assert.ok(result.warnings.some((warning) => /no está en esta máquina/.test(warning)))
  assert.ok(!result.errors.some((error) => error.startsWith('identities.')), result.errors.join('\n'))
})

test('la declaración guarda referencias, nunca valores', () => {
  const { root } = instance('ops-secrets-valor-', (declaration) => {
    declaration.accounts.principal.clientSecret = 'no-va-aca'
  })
  assert.ok(errorsOf(root).some((error) => /accounts\.principal\.clientSecret tiene forma de secreto/.test(error)))
})

test('cada referencia de la declaración cierra', () => {
  const { root } = instance('ops-secrets-refs-', (declaration) => {
    declaration.extra = true
    declaration.schemaVersion = 2
    declaration.projects.acme.account = 'otra'
    declaration.identities.ci.file = '/tmp/ci.env'
    declaration.identities.raro = { account: 'principal', source: 'vault' }
    declaration.services.web.project = 'fantasma'
    declaration.services.web.files = { 'scripts/x.py': 'no-compartido' }
    declaration.services.landing.root = 'sin-raiz'
    declaration.shared.fuera = '../afuera.py'
  })
  const errors = errorsOf(root)
  for (const expected of [
    /propiedad desconocida extra/, /schemaVersion debe ser 1/,
    /^projects\.acme: account «otra» no está declarado en accounts/,
    /^identities\.ci: una identidad ci-secret vive en el CI y no lleva file/,
    /^identities\.raro: source debe ser file o ci-secret/,
    /^services\.web: project «fantasma» no está declarado en projects/,
    /^services\.web: files\.scripts\/x\.py apunta a «no-compartido»/,
    /^services\.landing: root «sin-raiz» no es una raíz de ops\.config\.json/,
    /^shared\.fuera: \.\.\/afuera\.py está fuera de la instancia/,
  ]) assert.ok(errors.some((error) => expected.test(error)), `falta ${expected}:\n${errors.join('\n')}`)
})

test('una copia declarada fuera de la raíz de su servicio no se compara', () => {
  const { root } = instance('ops-secrets-escape-', (declaration) => {
    declaration.services.landing.files = { '../../esqueleto/web/scripts/check-schema.py': 'check-schema' }
  })
  assert.ok(errorsOf(root).some((error) => /^services\.landing: .* está fuera de su raíz/.test(error)))
})
