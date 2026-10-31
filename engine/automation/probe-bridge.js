'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Ejecuta el puente del runner tal como él lo invoca, y desde otra carpeta. Instalado no es lo mismo que
// operativo: un bridge que el runner no puede lanzar —porque su ruta es relativa y el cwd es otro, o
// porque falta node— falla cerrado y niega cada llamada a herramienta. `doctor` veía los archivos en su
// lugar y decía «operativo» mientras nada respondía.
function probeBridge(paths, runner) {
  const bridge = (runner.artifacts || []).find((item) => item.target.endsWith('hook.js'))
  if (!bridge) return []
  const script = path.resolve(paths.install, bridge.target)
  if (!fs.existsSync(script)) return []
  let config = {}
  try { config = JSON.parse(fs.readFileSync(paths.configTarget, 'utf8')) } catch { return [] }
  const hookEvents = [...new Set(
    JSON.stringify(config).match(/hook\.js ([a-z-]+)/g) || [],
  )].map((entrada) => entrada.split(' ')[1])
  if (!hookEvents.length) return []

  const problems = []
  // Desde la raíz y desde una carpeta de adentro: si el runner lanza el hook con otro cwd, la ruta
  // relativa de su configuración deja de resolver y eso hay que verlo acá, no en la primera sesión.
  const launchDirs = [paths.install, path.dirname(script)]
  for (const event of hookEvents) {
    for (const cwd of launchDirs) {
      // Una llamada inocua para el evento que la juzga, y ninguna para los demás: un `pre-files` con un
      // comando no describe ningún archivo, y el puente niega lo que no sabe describir (caso 200). La
      // entrada vacía es la forma legítima de no describir nada, y ejercita igual el arranque y la raíz.
      const payload = JSON.stringify(event === 'pre-shell'
        ? { toolCall: { args: { CommandLine: 'ls', Cwd: paths.install } } }
        : {})
      const result = spawnSync(process.execPath, [script, event], { cwd, input: payload, encoding: 'utf8' })
      let response = {}
      let answered = true
      try { response = JSON.parse((result.stdout || '').trim()) } catch { answered = false }
      // `pre-invocation` no decide nada: sano es contestar un JSON, vacío si no hay aviso que entregar.
      if (event === 'pre-invocation' && answered && !response.decision) continue
      // Cada evento tiene su respuesta sana: `stop` cierra la sesión —eso es funcionar— y el resto deja
      // pasar. El puente falla cerrado, así que `deny` en una llamada inocua es que algo se rompió antes
      // de poder juzgarla, y `continue` es el camino de error del propio `stop`.
      // Y sin `reason`: el puente sólo la manda cuando algo falló, así que un `stop` que la trae es
      // una falla de infraestructura que se dejó cerrar la sesión, no un arranque sano.
      const healthy = event === 'stop' ? 'stop' : 'allow'
      if (response.decision === healthy && !response.reason) continue
      const output = (result.stderr || 'sin respuesta').trim().split('\n')[0]
      const reason = response.reason
        || (response.decision ? `respondió ${response.decision}` : output)
      problems.push(`${bridge.target} ${event} desde ${path.basename(cwd)}/: ${reason}`)
    }
  }
  return problems
}

module.exports = { probeBridge }
