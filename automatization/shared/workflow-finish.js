// Cierre del recorrido. El runtime no trae un helper de cierre —el valor devuelto por el script ya es
// el resultado—, y darlo por sentado hacía reventar el archivo justo al terminar: después de gastar
// cada etapa, en la línea que las cerraba.
function finish(result) {
  log(`Fin: ${JSON.stringify(result)}`)
  return result
}

const stop = (reason, detail = '') => {
  log(`Checkpoint: ${reason}${detail ? ` — ${detail}` : ''}`)
  return finish({ stopped: true, reason, detail })
}
