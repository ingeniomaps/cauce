'use strict'

// Las reglas vigentes que la sesión no tiene cargadas, dichas a la sesión en cada mensaje. Las reglas llegan
// por el bloque que `automation install` escribe en las instrucciones del runner; entre que una empresa
// escribe una regla y alguien reinstala, ese bloque nombra la anterior. Medido en una sesión de chat: con una
// regla de commits propia sin reinstalar, la sesión siguió la del sistema y dijo de qué archivo la había leído
// (caso 315).
//
// Lo que garantiza:
//
// - Con una regla vigente sin cargar, imprime cuáles son y que rigen igual. Con una cargada que dejó de regir,
//   también lo dice. Sin desfase no imprime nada.
// - Nunca frena: avisa. Es el mismo mecanismo con que `autobuild` le nombra a cada agente las reglas vigentes,
//   y ahí alcanzó para que rigieran sin reinstalar.
// - No instala ni escribe nada. Reinstalar sigue siendo de la persona, y el aviso lo dice.
//
// Lo que no garantiza: que la sesión lea lo que se le nombra. Es un aviso, no una carga.

const fs = require('node:fs')
const { opsRoot } = require('./input')

// Dos estados que `drift` reporta no son un desfase que reinstalar cierre, y avisarlos sería repetir en cada
// mensaje algo que el remedio del aviso no apaga. Un archivo de instrucciones propio, sin el bloque, se
// conserva al reinstalar: ése lo dice `check`, con lo que hay que hacer. Y una regla que la empresa importó
// a mano fuera del bloque está cargada, aunque el bloque no la nombre.
function unloaded(root, runner) {
  let found
  try { found = require('../automation/rules').drift(root, runner) } catch { return null }
  const held = found.filter((one) => !one.bare)
  const missing = held.flatMap((one) => {
    const text = fs.readFileSync(one.file, 'utf8')
    return one.missing.filter((rule) => !text.includes(rule))
  })
  const extra = held.flatMap((one) => one.extra)
  return missing.length || extra.length ? { missing, extra } : null
}

function notice(root, runner) {
  const stale = unloaded(root, runner)
  if (!stale) return ''
  const lines = ['[Cauce] Las reglas de este proyecto cambiaron después de instalar el runner, y esta sesión no las '
    + 'tiene al día.']
  if (stale.missing.length) {
    lines.push(`- Rigen y no están cargadas, en ${root}: ${stale.missing.join(', ')}. Leelas antes de actuar `
      + 'sobre lo que regulan: valen igual que las cargadas, y donde contradigan a una de system/ rige la del '
      + 'proyecto.')
  }
  if (stale.extra.length) {
    lines.push(`- Están cargadas y ya no rigen: ${stale.extra.join(', ')}. No las apliques.`)
  }
  lines.push(`- Para que carguen solas hay que correr "make install-${runner}" en ${root} y abrir una sesión `
    + 'nueva. Eso lo hace la persona: no lo corras vos.')
  return lines.join('\n')
}

// El runner lo dice el shim, que es quien sabe para cuál se instaló: sin ese dato no hay contra qué comparar.
function rulesNotice(input) {
  const runner = process.env.CAUCE_NOTICE_RUNNER
  const text = runner ? notice(opsRoot(input), runner) : ''
  if (text) process.stdout.write(`${text}\n`)
}

module.exports = { rulesNotice, notice }
