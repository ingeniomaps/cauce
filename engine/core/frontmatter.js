'use strict'

// El bloque `---` del encabezado de un markdown, leído una sola vez. Estaba implementado en `planning` y
// en `integrations` con dos comportamientos distintos: uno aceptaba el bloque en cualquier parte del
// archivo y el otro sólo al principio; uno admitía claves con dígito inicial y el otro no. Un mismo
// draft se leía distinto según quién lo abriera.
//
// Se resuelve por el lado estricto: frontmatter es lo que encabeza el documento, y un `---` en el medio
// es una línea horizontal de markdown. La clave admite lo que admite YAML.

function frontmatter(text) {
  const block = (String(text).match(/^---\s*\n([\s\S]*?)\n---/) || [])[1] || ''
  const values = {}
  for (const line of block.split('\n')) {
    const match = line.match(/^([\w-]+):\s*(.*)$/)
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return values
}

module.exports = { frontmatter }
