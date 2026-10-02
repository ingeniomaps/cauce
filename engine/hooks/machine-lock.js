'use strict'

// Un gate por vez en la máquina (caso 240, R26). Dos sesiones que commitean a la vez lanzaban dos suites
// completas en paralelo, y ninguna sabía de la otra: en una instancia real eso terminó con `systemd-oomd`
// matando la sesión. El candado es un archivo con el pid de quien lo tiene; si ese proceso ya no existe, el
// candado quedó de una corrida que murió y se toma.
//
// Esperar es sincrónico porque un hook lo es: `Atomics.wait` duerme sin ocupar la CPU, que es lo que un
// bucle de reintentos no haría.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { block } = require('./input')

const LOCK = path.join(os.tmpdir(), 'cauce-verify.lock')
const POLL_MS = 250

// Suelta sólo el propio: si el archivo ya es de otro —el nuestro se dio por muerto y alguien lo tomó—,
// borrarlo le sacaría el candado a una corrida viva.
function release(file) {
  try { if (fs.readFileSync(file, 'utf8') === String(process.pid)) fs.rmSync(file) } catch { /* ya no está */ }
}

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

// Devuelve cómo soltarlo. Espera lo que puede durar la corrida de quien lo tiene: más que eso, ya debería
// haberla cortado su propio tope, y lo que queda es decirlo en vez de colgar la sesión.
function holdMachine(waitMs, file = LOCK) {
  const started = Date.now()
  for (;;) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' })
      return () => release(file)
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    let holder
    // Entre el `wx` que falló y esta lectura el otro pudo soltarlo: se vuelve a intentar.
    try { holder = Number(fs.readFileSync(file, 'utf8').trim()) } catch { continue }
    // Vacío es el instante entre que el otro lo creó y escribió su pid: se espera, no se roba.
    if (holder && !alive(holder)) {
      fs.rmSync(file, { force: true })
      continue
    }
    if (Date.now() - started >= waitMs) {
      block(`otro verify corre en esta máquina (pid ${holder}) y no terminó en ${Math.round(waitMs / 1000)} s. `
        + 'Uno por vez es a propósito: dos suites en paralelo son las que tiran la máquina. Esperá a que '
        + `termine y volvé a commitear; si ese proceso ya no es un verify, borrá ${file}.`)
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_MS)
  }
}

module.exports = { holdMachine }
