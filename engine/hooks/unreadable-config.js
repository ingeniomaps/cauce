'use strict'

// Qué se le dice a una sesión cuando `ops.config.json` no se puede leer, que es cuando todo guard frena (caso 419). La
// salida que nombra es la que `restoresConfig` (`ops-config.js`) deja pasar, y tiene que pasar de verdad: con una ruta
// que lleva algo que el shell expande o que esa excepción rechaza —un paréntesis, una comilla, una barra invertida— el
// comando que se ofrecía se volvía a frenar, y el mensaje prometía una salida que no había. Ahí queda la de la persona.
//
// Y dice que restaurar descarta el cambio local, que puede no ser del agente: la persona pudo estar editando el archivo
// a mano cuando quedó roto.
const UNSAFE = /[$`;|&<>()\\'"\n]/

function unreadableConfig(root, error) {
  const restore = UNSAFE.test(root) ? ''
    : `Lo que pasa es volver al último commit: git -C "${root}" checkout HEAD -- ops.config.json, que descarta el `
      + 'cambio local del archivo —si ese cambio no es tuyo, preguntale antes a la persona—; un `git stash pop` con '
      + 'conflicto deja el stash guardado. '
  return `ops.config.json no se puede leer (${error.message}). Un guard no decide sin él. ${restore}`
    + `${restore ? 'Sin commit al que volver, o' : 'Con esta ruta, o'} si restaurar corre código —un hook `
    + 'post-checkout, un filtro—, lo arregla la persona: en Claude Code, con `!` delante del comando.'
}

module.exports = { unreadableConfig }
