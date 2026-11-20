'use strict'

// Las órdenes de publicar que la persona da en el chat: un push y un merge. Lo que comparten con el resto del chat —qué
// corta una frase, qué niega, qué frena— vive en `chat.js`, que pide este archivo recién al usarlo: cargarlo al
// arrancar cerraría el ciclo con uno de los dos a medio exportar.

const { CLAUSE, ENCLITIC, HALT, NEGATION, spokenOf } = require('./chat')

// Una orden de publicar se lee aparte, porque `mentions` compara también el basename: para el ítem
// `push origin feat/login` eso es `login`, y «arreglá el login y no subas nada» publicaba (caso 103). Acá
// el remoto y la rama tienen que aparecer tal cual, como palabras enteras, en una frase que pida publicar
// —un verbo de publicar, no cualquiera: «revisá feat/x en origin» no pide un push— y sin una negación
// antes del último de los dos.
// Con las formas de una prohibición —«no subas», «no publiques»—, que es como se niega un push.
const PUSHES = new Set(('subi sube subir subas pushea pushear pushees push publica publicar publiques publish '
  + 'empuja empujar empujes').split(' '))
const pushVerb = (clause) => (clause.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .match(/[a-z]+/g) || []).some((word) => PUSHES.has(word) || PUSHES.has(word.replace(ENCLITIC, '')))

// Un push no se nombra como un archivo: «no hagas push todavía» lo prohíbe sin decir remoto ni rama. Basta una
// cláusula con un verbo de publicar y una negación.
const refusesPush = (text) => String(text).split(CLAUSE)
  .some((clause) => pushVerb(clause) && NEGATION.test(clause))
function ordersPush(text, item) {
  const [verb, remote, branch] = item.split(' ')
  if (verb !== 'push' || !remote || !branch) return false
  return String(text).split(CLAUSE).some((clause) => {
    // La comilla simple se saca de los bordes y no se corta en ella: partida, «don't» dejaba de ser una
    // negación.
    const words = clause.split(/[\s"`()]+/)
      .map((word) => word.replace(/^'+/, '').replace(/\.$/, '').replace(/'+$/, ''))
    const last = Math.max(words.indexOf(remote), words.indexOf(branch))
    if (words.indexOf(remote) < 0 || words.indexOf(branch) < 0) return false
    return pushVerb(clause) && !NEGATION.test(words.slice(0, last + 1).join(' '))
  })
}

// Un merge tampoco se nombra como un archivo: su ítem es `gh pr merge <PR> --repo <repo>` (`delivery.js`), y
// nadie lo escribe así al pedirlo (caso 280). Si la persona lo pidió lo juzga el agente, que es quien lee
// intención; acá no hay lista de verbos que lo ordenen. La primera versión la tenía y frenaba «hacé el merge
// del #12», «integralo» y «dale con todos»: nueve de doce formas de pedir lo mismo.
//
// El guard decide sólo la dirección segura, como con la confirmación. No pasa si el mensaje pregunta,
// arranca frenando o trae una negación que no dice sobre qué PR; ni el PR que niega o exceptúa —«no el #3»,
// «todos menos el #3»—. Y si el mensaje nombra PRs —`#12`, «PR 12»—, pasan ésos y ningún otro. Un número
// suelto no cuenta: «corré los e2e» nombraría el 2.
const EXCEPT = /(?<![\p{L}])(?:menos|excepto|salvo|except)(?![\p{L}])/iu
const pullsIn = (clause) => [...clause.matchAll(/#(\d+)|(?<![\p{L}\p{N}])prs?\s+(\d+)/giu)]
  .map((one) => one[1] || one[2])
//
// Después de un aviso del runner pasa sólo lo nombrado. «Los merges de este turno» es una lectura del turno en
// que la persona habló, y lo que el agente hace tras el aviso puede venir de lo que el aviso decía (caso 281).
function ordersMerge(text, item, { relayed = false } = {}) {
  const found = /^gh pr merge(?: (?!--)(\S+))?/.exec(spokenOf(item))
  if (!found || /[?¿]/.test(text) || HALT.test(text)) return false
  const named = []
  const denied = []
  for (const clause of String(text).split(CLAUSE)) {
    if (NEGATION.test(clause)) {
      if (!pullsIn(clause).length) return false
      denied.push(...pullsIn(clause))
      continue
    }
    const cut = clause.search(EXCEPT)
    named.push(...pullsIn(cut < 0 ? clause : clause.slice(0, cut)))
    if (cut >= 0) denied.push(...pullsIn(clause.slice(cut)))
  }
  if (denied.includes(found[1])) return false
  return named.length ? named.includes(found[1]) : !relayed
}

module.exports = { ordersMerge, ordersPush, refusesPush }
