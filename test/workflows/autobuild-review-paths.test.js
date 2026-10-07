'use strict'

// Caso 321. Lo que la revisión declara haber abierto viene con la ruta de la máquina, y `review` va textual a
// `done/`. El prefijo se cambia en el recorrido, que es determinista, y nada más del campo se toca.

const test = require('node:test')
const assert = require('node:assert/strict')
const { KEY, baseScript, ranToEnd, runFlow } = require('../support/autobuild-harness')

const ROOT = '/srv/acme+co/ops'
const SIDECAR = ['servicio → ./api', 'web → ../web']
const RULES = ['planning/rules/system/commits.md']
async function reviewed(workspaceRoots, consulted, { root = ROOT, review = {}, changes = {} } = {}) {
  const { result, prompts } = await runFlow({
    [KEY.contract]: { ...baseScript()[KEY.contract], workspaceRoots },
    [KEY.review]: { verdict: 'aprobado', concerns: [], consulted, ...review },
    ...changes,
  }, { root })
  ranToEnd(result)
  const done = prompts.find((one) => one.key === 'Done|done').prompt
  assert.ok(!root || done.includes(`escribí ${root}/planning/done/`), 'el recorrido corre con esa raíz')
  const fact = done.match(/review=([^;]*);/)[1]
  assert.match(fact, /^aprobado por \S+, sobre /, 'el veredicto y quién revisó quedan como estaban')
  return { fact, seen: fact.split(', sobre ')[1].split(' · ')[0].split(', ') }
}

test('las rutas de lo que Review abrió llegan a DONE relativas a su raíz', async () => {
  // Un servicio adentro de la instancia y otro al lado, con nombres que no son los de su carpeta.
  assert.deepEqual((await reviewed(SIDECAR, [
    `${ROOT}/api/src/alta.go`, `git -C ${ROOT}/api diff HEAD~1`, `${ROOT}/api:12`, '/srv/acme+co/web/src/a.ts',
    '/srv/acme+co/web', `${ROOT}/planning/rules/security.md`, `${ROOT}/AGENTS.md`, ROOT, `cd ${ROOT} && ls`,
    `diff "${ROOT}/api/a.go" (${ROOT}/api/b.go)`, `${ROOT}/api/a.go y ${ROOT}/api/b.go`,
  ])).seen, ['servicio/src/alta.go', 'git -C servicio diff HEAD~1', 'servicio:12', 'web/src/a.ts',
    'web', 'planning/rules/security.md', 'AGENTS.md', '.', 'cd . && ls',
    'diff "servicio/a.go" (servicio/b.go)', 'servicio/a.go y servicio/b.go'])
  // Con el producto en la misma carpeta que la instancia, el código va por el servicio y planning no.
  assert.deepEqual((await reviewed(['main → .'], [`${ROOT}/src/a.js`, `${ROOT}/planning/done/T-0.md`, ROOT])).seen,
    ['main/src/a.js', 'planning/done/T-0.md', 'main'])
  // Una raíz que contiene a la instancia no se lleva sus rutas, y un servicio puede declararse con ruta absoluta.
  assert.deepEqual((await reviewed(['mono → ..', 'ext → /srv/otro/ext'],
    [`${ROOT}/AGENTS.md`, '/srv/acme+co/api/x.go', '/srv/otro/ext/a.go'])).seen,
  ['AGENTS.md', 'mono/api/x.go', 'ext/a.go'])
})

test('lo que no es una ruta entera de una raíz queda como vino', async () => {
  const kept = [
    // Otra carpeta que empieza igual, con cualquier carácter que pueda seguir en un nombre.
    '/srv/acme+co/webs/x.ts', '/srv/acme+co/web-viejo/x.ts', '/srv/acme+co/webñ/x.ts', '/srv/acme+co/web@2/x.ts',
    '/srv/acme+co/web.bak', '/srv/acme+co/opsñ/x', '/srv/acme+co/ops~',
    // La raíz adentro de otra ruta, o de una dirección.
    `/mnt/backup${ROOT}/api/x.go`, `/tmp/copia${ROOT}`, `https://host${ROOT}/api/x`, `file://${ROOT}/api/x.go`,
    // Fuera de las raíces, o ya relativa.
    '/opt/motor/engine/x.js', 'api/alta_test.go',
  ]
  assert.deepEqual((await reviewed(SIDECAR, kept)).seen, kept)
  // Con una raíz relativa no hay prefijo de máquina que sacar.
  const loose = [`${ROOT}/api/src/alta.go`, './api/x.go', '.', '/api/x.go']
  assert.deepEqual((await reviewed(SIDECAR, loose, { root: '' })).seen, loose)
  // Una raíz mal declarada, o que resuelve a la de la máquina, no rompe el cierre ni se lleva nada.
  const odd = ['sin-flecha', 'arriba → ../../..', 'a → b → ./lib']
  assert.deepEqual((await reviewed(odd, [`${ROOT}/lib/x.js`, '/etc/hosts', `${ROOT}/b/y.js`, 'ls /',
    `${ROOT}/n-flecha/x`])).seen, ['a → b/x.js', '/etc/hosts', 'b/y.js', 'ls /', 'n-flecha/x'])
  // Y un nombre de servicio con `$` va tal cual, en las dos formas.
  assert.deepEqual((await reviewed(['a$&b → ./api'], [`${ROOT}/api`, `${ROOT}/api/x`])).seen, ['a$&b', 'a$&b/x'])
})

test('la prosa del revisor no se toca, y el árbol de la tarea sigue llegando como el servicio', async () => {
  // Una ruta en lo que el revisor escribió puede ser justamente de lo que habla.
  const { fact } = await reviewed(SIDECAR, [`${ROOT}/api/a.go`], {
    review: { rules: RULES, critical: `el instalador, que escribe ${ROOT} en cada workflow` },
    changes: { [KEY.context]: { ...baseScript()[KEY.context], rules: RULES,
      surfaces: ['el instalador (engine/automation)'] } },
  })
  assert.ok(fact.includes(`que escribe ${ROOT} en cada workflow`), fact)
  assert.ok(fact.includes('sobre servicio/a.go'), fact)

  // En una línea el trabajo ocurre en un árbol que al cerrar ya no existe, y puede colgar de la raíz: a
  // `done/` llega el servicio como lo nombra la tarea (caso 277), no el árbol con el prefijo cambiado.
  const tree = { ok: true, path: `${ROOT}/api-T-1`, work: `${ROOT}/api-T-1`, branch: 'task/T-1', repo: `${ROOT}/api` }
  const inLine = await reviewed(['api → ./api'], [`${ROOT}/api-T-1/src/alta.go`, `git -C ${ROOT}/api-T-1 diff`], {
    changes: {
      [KEY.context]: { ...baseScript()[KEY.context], line: 'admin' },
      'Worktree|worktree:T-1': tree,
      [KEY.commit]: { committed: true, hash: 'abc123', branch: 'feat/T-1', live: false },
    },
  })
  assert.deepEqual(inLine.seen, ['./api/src/alta.go', 'git -C ./api diff'])
})
