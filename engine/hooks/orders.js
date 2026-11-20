'use strict'

// Las órdenes de publicar que la persona da en el chat: un push y un merge. Lo que comparten con el resto del chat —qué
// corta una frase, qué niega, qué frena— vive en `chat.js`, que pide este archivo recién al usarlo: cargarlo al
// arrancar cerraría el ciclo con uno de los dos a medio exportar.

const { CLAUSE, ENCLITIC, HALT, NEGATION, spokenOf } = require('./chat')
const EXCEPT = /(?<![\p{L}])(?:menos|excepto|salvo|except)(?![\p{L}])/iu

// Una orden de publicar se lee aparte, porque `mentions` comparaba también el basename: para el ítem
// `push origin feat/login` eso es `login`, y «arreglá el login y no subas nada» publicaba (caso 103). Acá
// el remoto y la rama tienen que aparecer tal cual, como palabras enteras, en una misma frase.
//
// Si la persona pidió publicar lo lee el agente: el 103 exigía además un verbo de una lista, y «mandá feat/x a origin»
// frenaba (caso 522). El guard decide sólo la dirección segura: no pasa si el mensaje pregunta, arranca frenando o
// niega algo —en cualquier frase: «feat/x a origin, no lo subas» prohíbe sin nombrar la rama donde niega—, ni si la
// rama va exceptuada —«todo menos feat/x»—. Negar otra cosa frena de más: se repite la orden sin la negación, y un
// «dale» alcanza sólo con la negación en otra frase que el verbo: `hold` descarta lo que `refusesPush` niega.
//
// `publish` pide además el verbo en la frase que ordena. Lo usa la línea que el agente se escribe en `.ops-approval`,
// que llega hasta la rama viva: ahí «revisá main en origin» no alcanza.
//
// La lista de verbos queda para negar y para `publish`, con las formas de una prohibición —«no subas», «no publiques»—.
const PUSHES = new Set(('subi sube subir subas pushea pushear pushees push publica publicar publiques publish '
  + 'empuja empujar empujes').split(' '))
const pushVerb = (clause) => (clause.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .match(/[a-z]+/g) || []).some((word) => PUSHES.has(word) || PUSHES.has(word.replace(ENCLITIC, '')))

// Un push no se nombra como un archivo: «no hagas push todavía» lo prohíbe sin decir remoto ni rama. Basta una
// cláusula con un verbo de publicar y una negación.
const refusesPush = (text) => String(text).split(CLAUSE)
  .some((clause) => pushVerb(clause) && NEGATION.test(clause))
function ordersPush(text, item, { publish = false } = {}) {
  const [verb, remote, branch] = item.split(' ')
  if (verb !== 'push' || !remote || !branch || /[?¿]/.test(text) || HALT.test(text) || NEGATION.test(text)) return false
  let ordered = false
  for (const clause of String(text).split(CLAUSE)) {
    // La comilla de los bordes no es parte del nombre: «subí 'feat/x' a origin» nombra la rama.
    const words = clause.split(/[\s"`()]+/)
      .map((word) => word.replace(/^'+/, '').replace(/\.$/, '').replace(/'+$/, ''))
    const at = words.indexOf(branch)
    if (at < 0) continue
    const cut = words.findIndex((word) => EXCEPT.test(word))
    if (cut >= 0 && cut < at) return false
    if (words.includes(remote) && (!publish || pushVerb(clause))) ordered = true
  }
  return ordered
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
