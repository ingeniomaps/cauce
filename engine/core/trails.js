'use strict'

// Los rastros que Cauce escribe **dentro** de la instancia y que no viajan: son evidencia de una corrida
// local, de la máquina donde ocurrió, y committearlos sería historia que nadie lee y un conflicto por
// commit. Cada uno nace con su razón escrita en `template/gitignore`, al lado de su línea.
//
// Viven declarados acá y no en el módulo que escribe cada uno porque son tres —`verify`, `push` y el
// chat— y hacían falta en un cuarto lugar: el aviso de abajo. Escribir la lista ahí habría dejado una
// cuarta copia de la misma ruta, que es la que se pudre cuando alguien renombra un archivo (caso 128).
const VERIFY = 'planning/.verify-log'
const PUSH = 'planning/.push-log'
const GRANT = 'planning/.grant-log'

const LOCAL = [VERIFY, PUSH, GRANT]

const { spawnSync } = require('node:child_process')

// Cuáles de esos rastros **git no está ignorando** en esta instancia.
//
// La línea que los cubre la trae `template/gitignore`, y ese archivo se escribe al **crear** la
// instancia: `upgrade` no lo toca, porque es de la empresa y puede llevar líneas propias que un
// reemplazo se llevaría puestas. Así que una instancia anterior a cada rastro nuevo se queda sin su
// línea para siempre, y el archivo aparece en `git status` listo para commitearse por descuido.
//
// Se pregunta por el **efecto** y no por el texto del molde, y la diferencia importa en los dos
// sentidos: la empresa puede cubrirlo con una regla propia —y comparar líneas daría un falso positivo—,
// y en sidecar el `.gitignore` vive en la instancia mientras el repositorio es el workspace de arriba.
// Medido en las dos topologías: `check-ignore` contesta igual.
//
// Sin repositorio no hay a quién preguntarle —`check-ignore` sale 128— y ahí se calla: un aviso sobre
// lo que git haría en un repositorio que no existe sería inventado. Es la misma degradación que el 086
// eligió para las migraciones y el 121 para las filas resueltas: antes callar de más que avisar de más.
function unignored(root) {
  const asked = spawnSync('git', ['check-ignore', '--', ...LOCAL], { cwd: root, encoding: 'utf8' })
  // 0 = ignoró alguno, 1 = ninguno de los que preguntó; cualquier otro código es que no hay repositorio
  // o que git no pudo contestar, y entonces no hay nada que reportar.
  if (asked.status !== 0 && asked.status !== 1) return []
  const covered = new Set(asked.stdout.split('\n').map((one) => one.trim()).filter(Boolean))
  return LOCAL.filter((one) => !covered.has(one))
}

// El aviso, en la forma que `check` publica el resto: cuenta, nombra y no falla. Lleva las rutas porque
// son exactamente lo que hay que pegar, que es lo único accionable — el archivo es de la empresa y Cauce
// no lo edita.
function warnings(root) {
  const missing = unignored(root)
  if (!missing.length) return []
  return [`${missing.length} rastro(s) local(es) que git no ignora (${missing.join(', ')}); `
    + 'agregá esas líneas a tu .gitignore o van a entrar al repositorio']
}

module.exports = { VERIFY, PUSH, GRANT, warnings }
