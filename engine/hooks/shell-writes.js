'use strict'

// Qué escribe un comando de shell y desde qué directorio se resuelve cada destino, leído sólo del texto: no
// ejecuta nada ni mira el disco. Lo usan los guards que juzgan una escritura por la terminal —`shell-boundary`,
// `secrets-shell`, `ops-config-shell`— y los que leen un `cd` para saber dónde cae un borrado o una creación.
// Vive aparte de `shell.js` porque es una lectura que comparten y no un guard (caso 407): desde acá se la
// importa sin cargar los guards, y por eso `removal.js` y `shell-changes.js` ya no la piden dentro de una
// función para esquivar el ciclo.

const os = require('node:os')
const path = require('node:path')
const { unquoted, expandAssigned } = require('./input')

// **Esto no puede ser completo y no se presenta como si lo fuera.** `eval`, una variable armada dos
// líneas antes, un heredoc dentro de `bash -c`, un `python -c "open(...)"` o un script propio escriben
// igual y ningún patrón los ve. Frena la forma habitual, como el resto de `destructive`; quien quiera
// pasar, pasa. Presentarlo como un límite invitaría a confiar en él más de lo que aguanta.
// Tres familias, porque los comandos no nombran su destino igual: `tee` y `truncate` escriben en cada
// argumento, `cp` y sus hermanos en el último, y `sed` sólo escribe con `-i` —sin él lee y manda a
// stdout, y esa redirección la ve REDIRECT—.
//
// El salto de línea termina una lista de argumentos igual que `;`. Sin excluirlo, la de un `cp` seguía
// leyendo la línea de abajo y el destino terminaba siendo el comando siguiente: un bloqueo que nombraba
// `…/python3`, una ruta que no aparecía en el comando. Se veía con un heredoc debajo, pero el heredoc no
// era la causa —sólo hacía que la lectura frenara en un token que sobrevive—: sin él la lista cruzaba
// igual y el último token era la marca de lo entrecomillado, que el filtro final descarta. O sea que
// pasaba de casualidad, y aserciar que pasa no fijaba nada.
// Y el `|` después de `>` es el override de `noclobber`, no una tubería: `>| destino` escribe igual que
// `> destino` aunque el shell esté configurado para no pisar. Sin admitirlo acá el guard no veía ese
// destino —el `|` está fuera de la clase que captura la ruta, así que la coincidencia moría—, y con él
// se perdían los tres guards que salen de `writesWithBase` a la vez. Lo que un agente se escribía por
// ese hueco era su propia `.ops-approval` (caso 164).
const REDIRECT = /(?:^|[\s(])&?\d*>>?\|?\s*(?![&(])([^\s;|&<>()]+)/g
const EVERY_ARG = /(?:^|[\s;|&(])(tee|truncate)\s+([^;|&<>()\n]+)/g
const LAST_ARG = /(?:^|[\s;|&(])(cp|mv|install|rsync)\s+([^;|&<>()\n]+)/g
const SED = /(?:^|[\s;|&(])sed\s+([^;|&<>()\n]+)/g
const IN_PLACE = /(?:^|\s)-{1,2}i/

// Los argumentos que no son flags. El valor de un flag se cuela —`truncate -s 0 log` trae el `0`— y no
// hace falta sacarlo: un token así resuelve contra el cwd, que está adentro de la raíz, así que nunca
// decide un bloqueo. Filtrarlo sería una rama que ninguna prueba puede ver caer.
const positional = (text) => text.trim().split(/\s+/).filter((one) => one && !one.startsWith('-'))

// Un `>` adentro de una cadena no redirige nada. Pierde el destino entrecomillado, que es un falso
// negativo — el error barato en un guard que ya es incompleto, porque el caro es frenar un comando
// legítimo y que alguien apague el guard entero.
//
// `$HOME` y `~` se expanden porque son como se escribe el destino que esto vino a ver; el incidente que
// lo originó decía `> $HOME/.claude/...`. Cualquier otra variable queda sin resolver y no se juzga:
// adivinar su valor sería inventarlo, y un límite inventado frena lo que nadie pidió frenar.
function writeTargets(command) {
  const clean = unquoted(command)
  const found = new Set()
  for (const match of clean.matchAll(REDIRECT)) found.add(match[1])
  for (const match of clean.matchAll(EVERY_ARG)) for (const one of positional(match[2])) found.add(one)
  for (const match of clean.matchAll(LAST_ARG)) {
    const args = positional(match[2])
    // Con un solo argumento no hay destino: `cp solo` está a medio escribir, no escribe en `solo`.
    if (args.length > 1) found.add(args[args.length - 1])
  }
  for (const match of clean.matchAll(SED)) {
    const args = positional(match[1])
    if (IN_PLACE.test(match[1]) && args.length) found.add(args[args.length - 1])
  }
  return [...found]
    .map((one) => one.replace(/^~(?=$|\/)/, os.homedir()).replace(/^\$\{?HOME\}?(?=$|\/)/, os.homedir()))
    .filter((one) => !/[$`\u0000]/.test(one))
}

// A dónde deja parado un `cd`. `null` significa que no se sabe, que no es lo mismo que la raíz: un
// destino con variable o un `cd -` dependen de un estado que este proceso no tiene.
function cdTarget(argument, base) {
  if (argument === undefined) return os.homedir()
  if (argument === '-' || /[$`\u0000]/.test(argument)) return null
  if (/^~(?=$|\/)/.test(argument)) return argument.replace(/^~/, os.homedir())
  return path.resolve(base, argument)
}

// El destino de un `cd` entre comillas se lee antes de vaciarlas. Vaciado quedaba como destino desconocido
// y frenaba toda escritura relativa que viniera después, aunque la ruta estuviera escrita entera:
// `cd "/ruta/copia" && sed -i … src/x.js` (caso 298). Queda afuera lo que sin comillas se leería distinto:
// un espacio o un `;` partirían el tramo, y `~` entre comillas es un nombre y no la casa de nadie.
const QUOTED_CD = /((?:^|[;&|\n(])\s*cd\s+)(["'])([^"'\s;|&<>()~]+)\2/g

// Las escrituras de un comando, cada una con el directorio contra el que hay que resolverla. El `cd`
// del propio comando cambia eso para todo lo que viene después y es lo primero que el shell ejecuta;
// sin mirarlo, el guard juzgaba una ruta que nadie iba a escribir, y fallaba en los dos sentidos.
//
// Se recorre por tramos y se lleva la cuenta, en vez de mirar sólo el primero como hace `gitDirectory`.
// Ahí alcanza porque un comando elige un repositorio; acá cada escritura puede caer bajo un `cd`
// distinto, y juzgar la primera contra el último sería cambiar un error de lugar en vez de arreglarlo.
//
// Los tramos salen del texto ya sin comillas, así que un `;` adentro de una cadena no parte nada.
function writesWithBase(command, cwd) {
  const found = []
  let base = cwd
  // El `|` que sigue a un `>` no parte nada: es el override de `noclobber`, no una tubería. Partir ahí
  // separaba la redirección de su destino —`echo x >| ruta` quedaba como `echo x >` y ` ruta`— y el
  // destino no lo veía nadie, que es por donde se colaba escribir la propia `.ops-approval` (caso 164).
  for (const segment of unquoted(expandAssigned(command).replace(QUOTED_CD, '$1$3')).split(/[;&\n]+|(?<!>)\|+/)) {
    const cd = segment.match(/^\s*cd(?:\s+(\S+))?\s*$/)
    if (cd) { base = base === null ? null : cdTarget(cd[1], base); continue }
    for (const raw of writeTargets(segment)) found.push({ raw, base })
  }
  return found
}

module.exports = { writesWithBase, cdTarget, positional, QUOTED_CD }
