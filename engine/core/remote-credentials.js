'use strict'

// Una credencial escrita en la URL de un remoto (caso 530): `https://usuario:<token>@host/org/repo.git`. git la
// muestra entera con `remote -v`, `remote get-url` o `config --get remote.origin.url`, y en el error de cada push que
// falla. Ningún guard la veía, porque lo que miran es el nombre de un archivo y esos comandos no nombran ninguno.
//
// Acá se decide por el hecho y no por el comando: se leen las URLs del repositorio y se dice cuál trae credencial, sin
// mostrarla. Lo usan el guard que frena el comando que la imprimiría y el aviso de `check`, que no depende de que
// alguien lo teclee.

const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { shellWord } = require('./files')

const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })

// Lo que va entre `//` y `@`. Es credencial si trae contraseña (`usuario:clave`) o si es un token suelto, que es como
// GitHub y GitLab aceptan uno (`https://<token>@github.com/…`). Un usuario solo (`https://ana@host/…`) no lo es: git
// pide la clave aparte.
// Hasta la última `@` antes de la ruta: una clave con una `@` sin escapar dejaba un trozo a la vista.
const USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)([^/\s]+)@/i
const TOKEN = /^(?:gh[pousr]_|github_pat_|glpat-)|^[A-Za-z0-9_-]{30,}$/
function credentialed(url) {
  const info = USERINFO.exec(String(url || ''))
  if (!info) return false
  const user = info[2]
  return user.includes(':') || TOKEN.test(user)
}

// La URL sin lo que va antes de la `@`: es la que se deja, y la credencial pasa al helper de git.
const stripped = (url) => String(url).replace(USERINFO, '$1')

// Los remotos de un repositorio cuya URL trae credencial, con la URL limpia para el comando que la saca.
function credentialedRemotes(dir) {
  const out = git(dir, 'config', '--get-regexp', '^remote\\..*\\.(push)?url$')
  if (out.status !== 0) return []
  const found = new Map()
  for (const line of out.stdout.split('\n').filter(Boolean)) {
    const match = /^remote\.(.+)\.(url|pushurl)\s+(.*)$/.exec(line)
    if (match && credentialed(match[3])) found.set(match[1], { name: match[1], key: match[2], url: stripped(match[3]) })
  }
  return [...found.values()]
}

// Cómo sacarla, por remoto, con la URL ya limpia.
const fixOf = (dir, one) => `git -C ${shellWord(dir)} remote set-url ${one.key === 'pushurl' ? '--push ' : ''}`
  + `${shellWord(one.name)} ${shellWord(one.url)}`

// Para `check`: la instancia y cada raíz del workspace, una vez por repositorio.
function remoteWarnings(opsRoot) {
  const R = require('./repos')
  const tops = [opsRoot, ...R.declaredRoots(opsRoot).map((root) => root.dir)]
    .map((dir) => git(dir, 'rev-parse', '--show-toplevel'))
    .filter((out) => out.status === 0).map((out) => out.stdout.trim())
  return [...new Set(tops)].flatMap((top) => credentialedRemotes(top).map((one) =>
    `${path.basename(top)}: el remoto ${one.name} lleva una credencial en la URL, y git la imprime con \`remote -v\` y `
      + `en el error de cada push que falla. Pasala al helper de git: ${fixOf(top, one)}`))
}

module.exports = { credentialed, stripped, credentialedRemotes, fixOf, remoteWarnings }
