'use strict'

// Qué se lee como texto al buscar una prueba, y qué no: lo binario y lo enorme no pueden ser una prueba, y
// cargarlos agotaba la memoria (caso 361). Lo comparten la lectura del disco y la de un commit, que son la
// misma pregunta hecha en dos lugares.
//
// Binario se decide por contenido —un byte nulo en el arranque— y no por extensión: una lista de extensiones
// queda corta el día que aparece una nueva, y nada lo avisa (R27). El tope de tamaño es el respaldo para el
// texto enorme, y quien llama lo mira **antes** de cargar. Medido sobre una instancia real, el tope solo
// dejaba 824 MB por leer —imágenes de uno o dos megas— y saltear lo binario, 70.

const TOO_LARGE = 5 * 1024 * 1024
const SNIFFED = 8192

// El texto de lo ya cargado, o vacío si es binario. `skipped` lleva la cuenta de lo que se dejó sin leer.
function textOf(raw, skipped) {
  if (raw.subarray(0, SNIFFED).includes(0)) {
    skipped.binary += 1
    return ''
  }
  return raw.toString('utf8')
}

// Si pasa del tope, lo cuenta y contesta que no se lee.
function tooLarge(size, skipped) {
  if (!(size > TOO_LARGE)) return false
  skipped.large += 1
  return true
}

module.exports = { textOf, tooLarge, TOO_LARGE }
