'use strict'

// La copia que el runner ejecuta, cuando no es la del workspace. `agy` corre la que registra
// `agy plugin install`, una por usuario y no por proyecto, así que el plugin del workspace puede estar
// perfecto mientras el runner ejecuta el de otro proyecto, de otra versión o roto. `doctor` sondeaba sólo
// el del workspace y decía «operativo» con cada llamada del runner fallando (caso 201).
//
// El runner declara dónde vive esa copia —`activation.registered` en su manifiesto—, y sin esa
// declaración esto no dice nada: no hay copia aparte que mirar.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function registeredCopy(runner) {
  const declared = runner.activation && runner.activation.registered
  return declared ? declared.replace(/^~(?=\/|$)/, os.homedir()) : ''
}

// Los archivos del plugin, relativos a su carpeta: los que el adaptador entrega bajo ella, más su
// configuración de hooks.
function pluginFiles(paths, runner, pluginDir) {
  const targets = [...(runner.artifacts || []).map((item) => path.resolve(paths.install, item.target)),
    paths.configTarget]
  return [...new Set(targets)]
    .filter((file) => file.startsWith(`${pluginDir}${path.sep}`))
    .map((file) => path.relative(pluginDir, file))
}

// Lanza cada comando de la configuración registrada como lo lanza el runner: el texto literal, desde la
// carpeta del plugin. Así se ve el wiring que no resuelve, que ejecutando el puente directo no aparece.
// Con tope: la copia registrada puede ser vieja o estar rota, y una que no contesta colgaba a `doctor`. Diez
// segundos sobran para una copia sana —arranca y contesta en menos de uno— y con una que no contesta ya
// alcanza para el diagnóstico, así que el sondeo corta ahí en vez de esperar el tope una vez por evento.
const LAUNCH_LIMIT_MS = 10000

function launch(dir, event, command) {
  const payload = event === 'pre-shell' ? { toolCall: { args: { CommandLine: 'ls' } } } : {}
  const input = JSON.stringify(payload)
  const result = spawnSync('sh', ['-c', command],
    { cwd: dir, input, encoding: 'utf8', timeout: LAUNCH_LIMIT_MS, killSignal: 'SIGKILL' })
  if (result.error && result.error.code === 'ETIMEDOUT') return `no respondió en ${LAUNCH_LIMIT_MS / 1000} s`
  let response = {}
  try { response = JSON.parse((result.stdout || '').trim()) } catch { response = {} }
  const healthy = event === 'stop' ? 'stop' : 'allow'
  if (response.decision === healthy && !response.reason) return ''
  const stderr = (result.stderr || '').split('\n').find((line) => /Error|error/.test(line)) || ''
  return response.reason || (response.decision ? `respondió ${response.decision}` : stderr.trim() || 'sin respuesta')
}

// Qué impide que la copia registrada sea esta instalación funcionando. Vacío si el runner no declara una
// copia aparte o si todavía no hay ninguna registrada —eso lo dice `activated`—.
function registrationProblems(paths, runner) {
  const dir = registeredCopy(runner)
  if (!dir || !fs.existsSync(dir)) return []
  const bridge = (runner.artifacts || []).find((item) => item.target.endsWith('hook.js'))
  if (!bridge) return []
  const pluginDir = path.dirname(path.resolve(paths.install, bridge.target))
  const differ = pluginFiles(paths, runner, pluginDir).filter((file) => {
    const ours = path.join(pluginDir, file)
    const theirs = path.join(dir, file)
    if (!fs.existsSync(ours)) return false
    return !fs.existsSync(theirs) || !fs.readFileSync(ours).equals(fs.readFileSync(theirs))
  })
  const problems = []
  if (differ.length) {
    const shown = differ.length > 5 ? [...differ.slice(0, 5), `y ${differ.length - 5} más`] : differ
    problems.push(`${runner.command} ejecuta ${dir}, que no es esta instalación: difiere(n) ${shown.join(', ')}. `
      + `Corré desde ${paths.install}: ${runner.activation.hint}`)
  }
  let config = {}
  try { config = JSON.parse(fs.readFileSync(path.join(dir, path.basename(paths.configTarget)), 'utf8')) } catch {
    return problems
  }
  const commands = [...new Set(JSON.stringify(config).match(/"command":"([^"]*hook\.js [a-z-]+)"/g) || [])]
    .map((entry) => entry.slice(11, -1))
  for (const command of commands) {
    const event = command.split(' ').pop()
    const failure = launch(dir, event, command)
    if (failure) {
      problems.push(`la copia registrada no responde a ${event} lanzada como la lanza ${runner.command}: ${failure}`)
    }
    if (/^no respondió/.test(failure)) break
  }
  return problems
}

module.exports = { registrationProblems }
