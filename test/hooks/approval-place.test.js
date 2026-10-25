'use strict'

// Un comando aprobado vale donde se aprobó y en ningún otro lado (caso 446): por archivo, por el chat y en `check`.
// Qué lugar lleva cada clase de comando lo decide `delivery.js`; cómo viaja junto al ítem, `chat.js`.

const { tempRoot } = require('../support/environment')
const { blocked, chatSession, git, initRepo, messageOf, pasteApproval, sidecar } = require('../support/hooks-harness')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { execute } = require('../../engine/hooks/run')

const runs = (cwd, command, extra = {}) => ({ cwd, tool_input: { command }, ...extra })

test('una limpieza aprobada en un repositorio no se aprueba en el de al lado', () => {
  const ws = sidecar('ops-approval-place-clean-')
  try {
    const pasted = pasteApproval(ws.ops, messageOf('destructive', runs(ws.repos.api, 'git clean -fd')))
    assert.deepEqual(pasted, [`git clean -fd @ ${ws.repos.api}`])
    assert.doesNotThrow(() => execute('destructive', runs(ws.repos.api, 'git clean -fd')))
    // Desde una subcarpeta es el mismo repositorio, y no vuelve a preguntar.
    fs.mkdirSync(path.join(ws.repos.api, 'src'))
    assert.doesNotThrow(() => execute('destructive', runs(path.join(ws.repos.api, 'src'), 'git clean -fd')))
    blocked('destructive', runs(ws.repos.web, 'git clean -fd'), /borra archivos sin seguimiento/)

    // La línea sin lugar es la de antes, y ya no aprueba en ninguno.
    ws.approve('git clean -fd')
    blocked('destructive', runs(ws.repos.api, 'git clean -fd'), /borra archivos sin seguimiento/)
  } finally { ws.restore() }
})

test('un push aprobado para un repositorio no publica el del repositorio de al lado', () => {
  const ws = sidecar('ops-approval-place-push-')
  try {
    for (const repo of Object.values(ws.repos)) {
      git(['commit', '-q', '--allow-empty', '-m', 'i'], repo)
      git(['checkout', '-q', '-b', 'feat/x'], repo)
      git(['remote', 'add', 'origin', `https://example.invalid/${path.basename(repo)}.git`], repo)
    }
    const push = (repo) => runs(repo, 'git push origin feat/x')
    const pasted = pasteApproval(ws.ops, messageOf('destructive', push(ws.repos.api)))
    assert.deepEqual(pasted, [`push origin feat/x @ ${ws.repos.api}`])
    assert.doesNotThrow(() => execute('destructive', push(ws.repos.api)))
    blocked('destructive', push(ws.repos.web), /publica cambios/)

    ws.approve('push origin feat/x')
    blocked('destructive', push(ws.repos.api), /publica cambios/)
  } finally { ws.restore() }
})

test('un deploy aprobado en una carpeta no se aprueba en otra del mismo repositorio', () => {
  const root = fs.realpathSync(tempRoot('ops-approval-place-deploy-'))
  initRepo(root)
  fs.mkdirSync(path.join(root, 'planning'))
  fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'x', mode: 'embedded' }))
  for (const env of ['staging', 'prod']) fs.mkdirSync(path.join(root, 'infra', env), { recursive: true })
  const staging = path.join(root, 'infra', 'staging')
  const pasted = pasteApproval(root, messageOf('destructive', runs(staging, 'terraform apply')))
  assert.deepEqual(pasted, [`terraform apply @ ${staging}`])
  assert.doesNotThrow(() => execute('destructive', runs(staging, 'terraform apply')))
  blocked('destructive', runs(path.join(root, 'infra', 'prod'), 'terraform apply'), /es un deploy/)
})

test('gh sin --repo no se aprueba por archivo, y con --repo vale para ese repositorio', () => {
  const ws = sidecar('ops-approval-place-gh-')
  try {
    const message = messageOf('destructive', runs(ws.repos.api, 'gh pr merge 12'))
    assert.doesNotMatch(message, /estas líneas:/, 'sin --repo no hay línea que pegar')
    assert.match(message, /--repo/, 'dice cómo nombrar el destino')
    // Ni siquiera la línea exacta lo aprueba: `gh` resuelve el repositorio solo, y en un fork elige el original.
    ws.approve('gh pr merge 12')
    blocked('destructive', runs(ws.repos.api, 'gh pr merge 12'), /pull request/)

    const named = 'gh pr merge 12 --repo acme/api'
    fs.rmSync(path.join(ws.ops, 'planning', '.ops-approval'))
    assert.deepEqual(pasteApproval(ws.ops, messageOf('destructive', runs(ws.repos.api, named))),
      ['gh pr merge 12 --repo acme/api'])
    assert.doesNotThrow(() => execute('destructive', runs(ws.repos.web, named)), 'el mismo PR, desde donde sea')

    const workflow = 'gh workflow run deploy.yml'
    ws.approve(workflow)
    blocked('destructive', runs(ws.repos.api, workflow), /dispara o publica/)
  } finally { ws.restore() }
})

test('lo concedido en el chat para un repositorio no pasa en el de al lado', () => {
  const ws = sidecar('ops-approval-place-chat-')
  const chat = chatSession()
  try {
    const first = chat.says('limpiá los restos del build en api')
    blocked('destructive', first(runs(ws.repos.api, 'git clean -fd')), /borra archivos sin seguimiento/)
    const yes = chat.says('dale')
    assert.doesNotThrow(() => execute('destructive', yes(runs(ws.repos.api, 'git clean -fd'))))
    const next = chat.says('ahora revisá web')
    blocked('destructive', next(runs(ws.repos.web, 'git clean -fd')), /borra archivos sin seguimiento/)
    assert.doesNotThrow(() => execute('destructive', next(runs(ws.repos.api, 'git clean -fd'))),
      'en el repositorio que se concedió sigue valiendo')
  } finally {
    chat.close()
    ws.restore()
  }
})

test('nombrar el repositorio en el chat no ordena el comando', () => {
  // El lugar va junto al ítem pero no se lee como palabras: si `api` contara, «arreglá la api» lo pediría.
  const ws = sidecar('ops-approval-place-words-')
  const chat = chatSession()
  try {
    const said = chat.says(`arreglá la ${path.basename(ws.repos.api)} y avisame`)
    blocked('destructive', said(runs(ws.repos.api, 'git clean -fd')), /borra archivos sin seguimiento/)
  } finally {
    chat.close()
    ws.restore()
  }
})

test('un «dale» a un push o a un gh sin --repo vale en el repositorio donde se frenó', () => {
  const ws = sidecar('ops-approval-place-chat-repo-')
  const chat = chatSession()
  try {
    for (const repo of Object.values(ws.repos)) {
      git(['commit', '-q', '--allow-empty', '-m', 'i'], repo)
      git(['checkout', '-q', '-b', 'feat/x'], repo)
      git(['remote', 'add', 'origin', `https://example.invalid/${path.basename(repo)}.git`], repo)
    }
    const push = (call, repo) => call(runs(repo, 'git push origin feat/x'))
    blocked('destructive', push(chat.says('subí la rama'), ws.repos.api), /publica cambios/)
    const yes = chat.says('dale')
    blocked('destructive', push(yes, ws.repos.web), /publica cambios/)
    assert.doesNotThrow(() => execute('destructive', push(yes, ws.repos.api)))

    const workflow = 'gh workflow run deploy.yml'
    blocked('destructive', chat.says('revisá el deploy')(runs(ws.repos.api, workflow)), /dispara o publica/)
    assert.doesNotThrow(() => execute('destructive', chat.says('dale')(runs(ws.repos.api, workflow))))
    blocked('destructive', chat.says('ahora web')(runs(ws.repos.web, workflow)), /dispara o publica/)
  } finally {
    chat.close()
    ws.restore()
  }
})

test('cada gh de un comando se juzga por si nombra su repositorio', () => {
  const ws = sidecar('ops-approval-place-gh-calls-')
  try {
    // El `--repo` de una llamada no nombra el de la otra: la línea sin él no aprueba aunque el comando lo traiga.
    ws.approve('gh pr merge 1')
    blocked('destructive', runs(ws.repos.api, 'gh pr merge 1 && gh pr merge 2 --repo acme/api'), /pull request/)
    // Fuera de un merge el ítem es el comando entero, y ahí también cuenta cada llamada.
    const two = 'gh workflow run a.yml && gh workflow run b.yml --repo acme/api'
    ws.approve(two)
    blocked('destructive', runs(ws.repos.api, two), /dispara o publica/)
    // Un PR por URL nombra su repositorio aunque no traiga la bandera.
    const url = 'gh pr merge https://github.com/acme/api/pull/12'
    assert.deepEqual(pasteApproval(ws.ops, messageOf('destructive', runs(ws.repos.api, url))),
      ['gh pr merge 12 --repo acme/api'])
    assert.doesNotThrow(() => execute('destructive', runs(ws.repos.api, url)))
    // Los marcadores que `gh` completa desde la carpeta no nombran nada.
    const api = 'gh api -X PUT repos/:owner/:repo/pulls/3/merge'
    ws.approve(api)
    blocked('destructive', runs(ws.repos.api, api), /pull request/)
    // Lo que va entre comillas es un valor, y una llamada separada con `&` es otra llamada.
    for (const loose of ['gh pr comment 5 --body "pasá --repo la próxima"',
      'gh pr view 1 --repo o/r & gh api -X PUT repos/{owner}/{repo}/pulls/2/merge',
      'bash -c "gh pr merge 5"']) {
      ws.approve(loose)
      assert.doesNotMatch(messageOf('destructive', runs(ws.repos.api, loose)), /estas líneas:/, loose)
    }
  } finally { ws.restore() }
})

test('sin un lugar que se pueda saber no hay línea que pegar', () => {
  const ws = sidecar('ops-approval-place-unsure-')
  const chat = chatSession()
  try {
    for (const repo of Object.values(ws.repos)) {
      git(['commit', '-q', '--allow-empty', '-m', 'i'], repo)
      git(['checkout', '-q', '-b', 'feat/x'], repo)
      git(['remote', 'add', 'origin', `https://example.invalid/${path.basename(repo)}.git`], repo)
    }
    // El `-C` decide el repositorio aunque la sesión esté en otro.
    const there = `git -C ${ws.repos.api} push origin feat/x`
    assert.deepEqual(pasteApproval(ws.ops, messageOf('destructive', runs(ws.repos.web, there))),
      [`push origin feat/x @ ${ws.repos.api}`])
    assert.doesNotThrow(() => execute('destructive', runs(ws.repos.web, there)))

    // Dos destinos, o uno que el shell expande: no hay lugar que nombrar, y la línea de uno no vale para el otro.
    const both = `git -C ${ws.repos.api} push origin feat/x && git -C ${ws.repos.web} push origin feat/x`
    const said = messageOf('destructive', runs(ws.workspace, both))
    assert.doesNotMatch(said, /estas líneas:/)
    assert.match(said, /no deja saber de qué repositorio sale/)
    blocked('destructive', runs(ws.workspace, both), /publica cambios/)
    const unset = 'cd $REPO && git clean -fd'
    assert.doesNotMatch(messageOf('destructive', runs(ws.workspace, unset)), /estas líneas:/)

    // `gh` corre en la carpeta del shell: el `-C` de un `git` del mismo comando no le cambia el repositorio.
    const mixed = `git -C ${ws.repos.api} fetch && gh workflow run deploy.yml`
    blocked('destructive', chat.says('revisá el deploy')(runs(ws.repos.web, mixed)), /dispara o publica/)
    assert.doesNotThrow(() => execute('destructive', chat.says('dale')(runs(ws.repos.web, mixed))))
    blocked('destructive', chat.says('seguí')(runs(ws.repos.api, mixed)), /dispara o publica/)
  } finally {
    chat.close()
    ws.restore()
  }
})


// Cada clase de la tabla del caso, herramienta por herramienta: compartir código no prueba que cada regla declare
// su lugar, y una que lo perdiera volvería a valer en cualquier repositorio sin que nada fallara.
test('cada herramienta lleva el lugar de su clase, y las que no dependen de dónde corren no llevan ninguno', () => {
  const ws = sidecar('ops-approval-place-classes-')
  try {
    const config = path.join(ws.ops, 'ops.config.json')
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')),
      deployCommands: ['make deploy'] }))
    const infra = path.join(ws.repos.api, 'infra')
    fs.mkdirSync(infra)
    const lineOf = (cwd, command) => {
      fs.rmSync(path.join(ws.ops, 'planning', '.ops-approval'), { force: true })
      return pasteApproval(ws.ops, messageOf('destructive', runs(cwd, command)))[0]
    }
    // Por repositorio: desde una subcarpeta, la línea nombra la raíz.
    for (const command of ['git reset --hard', 'git checkout -- .', 'git restore .', 'git clean -fdx']) {
      assert.equal(lineOf(infra, command), `${command} @ ${ws.repos.api}`, command)
    }
    // Por carpeta: la línea nombra la carpeta donde corre.
    for (const command of ['terraform apply', 'tofu destroy', 'pulumi up --yes', 'npx cdk deploy',
      'docker compose down', 'make deploy']) {
      assert.equal(lineOf(infra, command), `${command} @ ${infra}`, command)
    }
    // Sin lugar: el destino de `kubectl` y `helm` es el contexto de kubeconfig, y una limpieza de Docker es global.
    for (const command of ['kubectl -n prod apply -f k8s/', 'helm upgrade api ./chart', 'docker system prune']) {
      assert.equal(lineOf(infra, command), command, command)
    }
  } finally { ws.restore() }
})

// Medido en una sesión real de Gemini 0.63.0: la línea salía con la raíz del banco y el commit no hallaba repositorio.
test('la carpeta que Gemini manda en dir_path es donde corre el comando', () => {
  const ws = sidecar('ops-approval-place-gemini-')
  const gemini = (command, dir) => ({ hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', cwd: ws.workspace,
    tool_input: { command, dir_path: dir } })
  try {
    const pasted = pasteApproval(ws.ops, messageOf('destructive', gemini('git clean -fd', 'api')))
    assert.deepEqual(pasted, [`git clean -fd @ ${ws.repos.api}`])
    assert.doesNotThrow(() => execute('destructive', gemini('git clean -fd', 'api')))
    blocked('destructive', gemini('git clean -fd', 'web'), /borra archivos sin seguimiento/)

    fs.writeFileSync(path.join(ws.repos.api, 'package.json'), '{"name":"x"}\n')
    fs.writeFileSync(path.join(ws.repos.api, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
    git(['add', 'package.json', 'pnpm-lock.yaml'], ws.repos.api)
    git(['commit', '-qm', 'init'], ws.repos.api)
    fs.writeFileSync(path.join(ws.repos.api, 'package.json'), '{"name":"x","dependencies":{"y":"1"}}\n')
    git(['add', 'package.json'], ws.repos.api)
    blocked('dependencies', gemini('git commit -m x', 'api'),
      new RegExp(`${ws.repos.api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: cambió package\\.json`))
  } finally { ws.restore() }
})

// Caso 451. El ítem era el comando entero, y un agente que reintenta con un `cd` adelante o un `echo` atrás ya pedía
// otra cosa: el «dale» de la persona no lo cubría. El ítem es el tramo que la regla reconoce; dónde corre lo dice
// el lugar.
test('lo que rodea al comando no cambia lo que se aprueba: un cd adelante o un echo atrás', () => {
  const ws = sidecar('ops-approval-place-stretch-')
  const chat = chatSession()
  try {
    const pasted = pasteApproval(ws.ops, messageOf('destructive',
      runs(ws.workspace, `cd ${ws.repos.api} && git clean -fd; echo "exit=$?"`)))
    assert.deepEqual(pasted, [`git clean -fd @ ${ws.repos.api}`])
    assert.doesNotThrow(() => execute('destructive', runs(ws.repos.api, 'git clean -fd 2>&1 | tail -3')))
    assert.doesNotThrow(() => execute('destructive', runs(ws.repos.api, 'git clean -fd && git status --short')))
    blocked('destructive', runs(ws.workspace, `cd ${ws.repos.web} && git clean -fd`), /borra archivos sin seguimiento/)
    // Lo que cambia la carpeta de una forma que el lugar no lee no reduce el ítem: la línea de api pasaba en web.
    for (const command of ['(cd ../web; git clean -fd)', 'pushd ../web && git clean -fd',
      'for d in ../web; do cd $d; git clean -fd; done', 'builtin cd ../web && git clean -fd',
      'eval "cd ../web" && git clean -fd', 'source ./a.sh && git clean -fd']) {
      blocked('destructive', runs(ws.repos.api, command), /borra archivos sin seguimiento/)
    }
    ws.approve(`git clean -fd; git status @ ${ws.repos.web}`)
    assert.doesNotThrow(() => execute('destructive', runs(ws.repos.web, 'git clean -fd; git status')))
    // Dos tramos que la regla reconoce no se parten: el ítem sigue siendo el comando entero.
    blocked('destructive', runs(ws.repos.web, 'git clean -fd && git clean -fdx'),
      new RegExp(`git clean -fd && git clean -fdx @ ${ws.repos.web}`))
    fs.rmSync(path.join(ws.ops, 'planning', '.ops-approval'))

    const first = chat.says('corré el paso 1')
    blocked('destructive', first(runs(ws.repos.api, 'git clean -fd; echo "exit=$?"')), /borra archivos sin seguimiento/)
    const yes = chat.says('dale')
    assert.doesNotThrow(() => execute('destructive', yes(runs(ws.workspace, `cd ${ws.repos.api} && git clean -fd`))))
    blocked('destructive', yes(runs(ws.workspace, `cd ${ws.repos.web} && git clean -fd`)), /borra archivos/)
  } finally {
    chat.close()
    ws.restore()
  }
})
