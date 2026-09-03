'use strict'

// Lo que `upgrade` le dice a quien lo corrió: qué hacer en vez de haber editado, y qué le pasó a la
// instancia. Vive aparte del ciclo de vida porque su reloj es el de lo que hay para decir —la frontera
// de propiedad, la redacción de un consejo, cada versión que agrega o retira algo— y no el del
// procedimiento que lo hace. Y porque así se prueba sin tocar el disco.

const fs = require('node:fs')
const path = require('node:path')
const O = require('../core/ownership')
const M = require('../core/manifest')
const CL = require('../core/changelog')

const PROJECT_ROOT = path.resolve(__dirname, '..', '..')

// Qué hacer en vez de haber editado, según a quién pertenece cada archivo que se perdería.
//
// Tres clases distintas, y antes eran dos: todo lo que no vivía bajo `system/` recibía el consejo del
// runtime, así que editar el protocolo respondía con cómo desactivar un guard. Decirle a alguien la
// salida ajena lo manda a buscar una configuración que no existe.
function adviceFor(changed) {
  const ruleFiles = changed.filter((file) => file.includes('/system/'))
  const runtime = changed.filter((file) => !file.includes('/system/')
    && O.RUNTIME_PATHS.some((base) => file.startsWith(`${base}/`)))
  const docs = changed.filter((file) => !ruleFiles.includes(file) && !runtime.includes(file))
  const advice = []
  if (ruleFiles.length) {
    advice.push(
      'Las ruleFiles y decisiones bajo system/ son del toolkit. Para cambiar una, escribí la tuya al\n'
      + 'lado con el mismo ID: el proyecto manda y `check` lo reporta como override explícito.',
    )
  }
  if (runtime.length) {
    advice.push(
      'El runtime es del toolkit: en vez de editarlo, agregá lo tuyo al lado con otro nombre —un\n'
      + 'guard propio sobrevive a cada actualización— y registralo en la configuración de tu runner,\n'
      + 'que sí es del proyecto. Para desactivar un guard alcanza con quitarlo de esa configuración.',
    )
  }
  if (docs.length) {
    advice.push(
      'Esos docs son del toolkit y no llevan una línea de la empresa: se reemplazan enteros en\n'
      + 'cada actualización para que las mejoras lleguen. Lo que tu proyecto decide distinto va donde sí\n'
      + 'es suyo —una ADR propia, una regla propia, o `planning/delivery/project.md` para la entrega—.',
    )
  }
  // `AGENTS.md` se lo gana aparte porque hasta ahora el README mandaba completarlo, así que el consejo
  // genérico de arriba —«no llevan una línea de la empresa»— le miente justo a quien le hizo caso.
  if (docs.includes('AGENTS.md')) {
    advice.push(
      'En `AGENTS.md` en particular: el mapa real, las integraciones y las excepciones de autonomía\n'
      + 'ahora van en `organization/workspace.md`, que es del proyecto y no se reemplaza. Movelos ahí\n'
      + 'antes de repetir con --force, o los vas a tener que fusionar de nuevo en cada versión.',
    )
  }
  return advice.join('\n\n')
}

// Actualiza sólo lo que el toolkit declara suyo. Todo lo demás —planning, organization, reglas
// propias, agentes editados— queda intacto por construcción, no por comparación.
// Qué le pasó a la instancia en esta actualización, contado a quien la corrió. Recibe el resultado
// entero en vez de recalcular nada: lo que se informa es exactamente lo que ocurrió.
function reportUpgrade({ root, from, to, system, changed, retired, added, overrides, pinned, droppedBlocks }) {
  console.log(`✓ Cauce ${from || '(previa)'} → ${to}`)
  // Descartar con --force es legítimo; hacerlo sin dejar rastro no. Queda en la salida del comando,
  // que es la evidencia que el protocolo pide para cualquier cambio.
  for (const file of changed) console.log(`− descartado tu cambio en ${file}`)
  for (const relative of retired) console.log(`− retirado ${relative}: Cauce ya no lo distribuye`)
  // Nombrarlos importa tanto como crearlos: existen para que los completes, y uno que aparece sin
  // aviso no lo completa nadie.
  for (const relative of added) console.log(`+ ${relative}: lo agrega esta versión, completalo`)
  // Se dice porque explica un diff en un archivo que la empresa versiona, y que si no aparecería sin
  // autor.
  if (pinned === 'ilegible') console.log('  ⚠ package.json no se pudo leer: su versión quedó como estaba')
  else if (pinned) console.log(`  package.json: ${pinned} → ${to}, la versión exacta que acabás de aplicar`)
  printChangelog(from, to)
  console.log(`  ${system.length} ruta(s) del sistema y ${O.RUNTIME_PATHS.length} del runtime actualizadas`)
  for (const override of overrides) {
    console.log(`= conservado ${override.collection}/${override.project}: sobrescribe ${override.system}`)
  }
  // Sólo cuando es cierto: llegar acá con algo en `changed` es haber descartado contenido de la
  // empresa con --force, que las líneas de arriba enumeran.
  if (!changed.length) console.log('  planning, organization y todo lo propio quedaron intactos')
  // No se borra: sin la dependencia declarada, quitarle `.ops/` la dejaría sin motor. Se avisa y
  // decide una persona.
  if (fs.existsSync(path.join(root, '.ops', 'engine'))) {
    console.log('\n⚠ esta instancia tiene el motor vendorizado en .ops/, que Cauce ya no distribuye.')
    console.log('  Corré "npm install" para tenerlo como dependencia y después borrá .ops/ a mano.')
  }
  // El wiring del runner no se actualiza solo: vive fuera de la instancia y lo escribe otro comando.
  // Sin este recordatorio, una mejora en un workflow o en el catálogo se queda en el paquete.
  for (const { runner, relative } of droppedBlocks) {
    console.log(`− ${relative}: se reemplazó entero y con él las instrucciones de ${runner}`)
  }
  const runners = Object.keys(M.readRunners(root))
    .map((key) => key.split('/')[0])
    .filter((name, index, all) => all.indexOf(name) === index)
  for (const name of runners) {
    console.log(`  reinstalá tu runner para que el wiring quede al día: make install-${name}`)
  }
  // Después de aplicar, no antes: recién acá el paquete tiene la versión nueva y la comparación dice
  // algo. Es además el momento en que alguien está mirando qué le trajo la actualización.
  const FK = require('../agents/fork')
  for (const entry of FK.drift(root)) console.log(`  ⚠ ${FK.driftLine(entry)}`)
}

// Qué trae la versión nueva, leído del paquete: sin esto el reemplazo de system/ es a ciegas.
function printChangelog(from, to) {
  const notes = CL.between(CL.read(PROJECT_ROOT), from, to)
  if (!notes.length) return
  for (const note of notes) {
    console.log(`\n  ── ${note.version} ──`)
    for (const line of note.body.split('\n')) if (line.trim()) console.log(`  ${line}`)
  }
  console.log('')
}

// Mirar sin tocar: qué traería la actualización y qué se perdería si se aplicara. Devuelve el código de
// salida en vez de cortar el proceso, para que el corte se vea donde se decide.
//
// Lo editado localmente va antes de mirar versiones, porque son dos preguntas distintas —«¿hay algo más
// nuevo?» y «¿qué tengo editado que se perdería?»— y la segunda tiene respuesta útil aunque la primera
// sea que no. Adentro del `if` de abajo, el único modo que no toca nada era el único que no podía avisar.
function previewUpgrade({ from, to, changed }) {
  for (const file of changed) console.log(`  editado localmente: ${file}`)
  if (from === to) {
    // Contra el motor instalado, no contra lo publicado: la comparación es local y sin red. Decirlo
    // importa porque `init` fija la versión exacta, así que el motor no se mueve solo y esta línea,
    // a secas, se leía como «no hay nada nuevo» durante todas las versiones siguientes.
    console.log(`= ${to}: la instancia está al día con el motor instalado`)
    // Con `--save-exact`, sin el cual el caret de npm vuelve falsa la línea de arriba. Por qué, y por
    // qué no alcanza con documentarlo, en `pinEngine`.
    console.log('  para traer una versión más nueva:'
      + ' npm install --save-exact --save-dev @ingeniomaps/cauce@latest')
    return changed.length ? 1 : 0
  }
  // Hacia atrás también es legítimo —una versión rompió algo y se vuelve—, pero anunciarlo como «hay
  // una versión más nueva» era mentir con el número a la vista. Y lo que corresponde imprimir es lo
  // contrario: no lo que se gana, sino lo que se deja.
  if (CL.compare(to, from) < 0) {
    console.log(`↩ volvés a ${to} desde ${from}. Esto es lo que dejás de tener:`)
    printChangelog(to, from)
  } else {
    console.log(`⚠ hay una versión más nueva: ${to} (la instancia tiene ${from || 'una previa'})`)
    printChangelog(from, to)
  }
  return 1
}

module.exports = { adviceFor, previewUpgrade, reportUpgrade }
