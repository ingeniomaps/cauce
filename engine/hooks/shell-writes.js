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
// igual y ningún patrón de acá los ve. Lo de adentro de `eval` y `bash -c` lo vuelve a leer `writes`, en
// `shell-changes.js` (caso 455). Lee la forma habitual; presentarlo como un límite invitaría a confiar en él
// más de lo que aguanta.
//
// El `|` después de `>` es el override de `noclobber`, no una tubería: `>| destino` escribe igual que
// `> destino` aunque el shell esté configurado para no pisar. Sin admitirlo acá el guard no veía ese
// destino —el `|` está fuera de la clase que captura la ruta, así que la coincidencia moría—, y con él
// se perdían los tres guards que salen de `writesWithBase` a la vez. Lo que un agente se escribía por
// ese hueco era su propia `.ops-approval` (caso 164).
// Y el `>` redirige pegado a lo de antes: `echo x>.npmrc` escribe igual que con espacio, y exigirlo dejaba pasar la
// forma corta. Se mira lo de antes sin consumirlo, para que `a>b>c` vea los dos destinos; `<>` no es una salida.
// Y `>&` seguido de algo que no es un descriptor ni `-` escribe en un archivo: `echo $T >&.npmrc`. `>&2`, `2>&1` y
// `>&-` siguen sin destino.
// El descriptor delante del `>` es un número suelto: pegado a una palabra (`file2>out`) es parte de ella, y bash lee
// `file2`. Y detrás de `>&` lo es un número de cualquier largo (`>&10`), aunque lo siga otra redirección.
const REDIRECT = new RegExp(String.raw`(?<![<>])(?:(?<=^|[\s(;|&])\d+|&)?>>?\|?(?:&(?!(?:\d+|-)(?:$|[\s;|&)<>])))?`
  + String.raw`\s*(?![&(])([^\s;|&<>()]+)`, 'g')

// Las redirecciones de un tramo, para leer lo que queda: `cd /otra 2>/dev/null` es un `cd`, y sin sacarlas el tramo
// no se leía como uno y la base seguía siendo la de antes. Es la lectura que `shell-changes.js` ya hacía; vive acá
// para que `removal.js` y `writesWithBase` la usen sin copiarla.
const REDIRECTIONS = /(?:^|\s)\d*&?[<>]{1,2}&?\d*\s*\S*/g

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
// adivinar su valor sería inventarlo, y un límite inventado frena lo que nadie pidió frenar. Las llaves van parejas:
// `$HOME}` y `${HOME` no son la casa de nadie.
const HOME_VAR = /^(?:\$HOME|\$\{HOME\})(?=$|\/)/
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
    .map((one) => one.replace(/^~(?=$|\/)/, os.homedir()).replace(HOME_VAR, os.homedir()))
    .filter((one) => !/[$`\u0000]/.test(one))
}

// A dónde deja parado un `cd`. `null` significa que no se sabe, que no es lo mismo que la raíz: un
// destino con variable o un `cd -` dependen de un estado que este proceso no tiene.
//
// Una base que no se sabe no vuelve desconocido lo que no depende de ella: una ruta absoluta, `~`, `$HOME` o un `cd`
// solo dejan en el mismo lugar desde donde sea, igual que en `removal.js` y `shell-changes.js`.
function cdTarget(argument, base) {
  if (argument === undefined) return os.homedir()
  // `$HOME` se expande como en `writeTargets`, que es como se escribe la casa de alguien; otra variable no se sabe.
  const at = argument.replace(HOME_VAR, os.homedir())
  if (at === '-' || /[$`\u0000]/.test(at)) return null
  if (/^~(?=$|\/)/.test(at)) return at.replace(/^~/, os.homedir())
  if (path.isAbsolute(at)) return path.resolve(at)
  return base === null ? null : path.resolve(base, at)
}

// El destino de un `cd` entre comillas se lee antes de vaciarlas. Vaciado quedaba como destino desconocido
// y frenaba toda escritura relativa que viniera después, aunque la ruta estuviera escrita entera:
// `cd "/ruta/copia" && sed -i … src/x.js` (caso 298). Queda afuera lo que sin comillas se leería distinto:
// un espacio o un `;` partirían el tramo, y `~` entre comillas es un nombre y no la casa de nadie. Lo mismo un `$`
// entre comillas simples: `cd '$HOME'` es una carpeta que se llama así.
const QUOTED_CD = /((?:^|[;&|\n(])\s*cd\s+)(["'])(?!(?<=')[^']*\$)([^"'\s;|&<>()~]+)\2/g

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
  // El `|` que sigue a un `>` no parte nada: es el override de `noclobber`, no una tubería. Partir ahí
  // separaba la redirección de su destino —`echo x >| ruta` quedaba como `echo x >` y ` ruta`— y el
  // destino no lo veía nadie, que es por donde se colaba escribir la propia `.ops-approval` (caso 164). Con el `&` que
  // sigue a un `>` pasa lo mismo: `>&.npmrc` es una redirección, no un comando en segundo plano.
  const segments = unquoted(expandAssigned(command).replace(QUOTED_CD, '$1$3')).split(/(?:[;\n]|(?<!>)&)+|(?<!>)\|+/)
  // Un `cd` con una redirección puede fallar a propósito, y entonces lo que sigue escribe donde se estaba: se juzga en
  // las dos carpetas, por lo mismo que en `removal.js`.
  let bases = [cwd]
  for (const segment of segments) {
    const bare = segment.replace(REDIRECTIONS, ' ')
    const cd = bare.match(/^\s*cd(?:\s+(\S+))?\s*$/)
    if (cd) {
      const moved = bases.map((one) => cdTarget(cd[1], one))
      bases = [...new Set(bare === segment ? moved : [...bases, ...moved])]
      continue
    }
    for (const raw of writeTargets(segment)) for (const one of bases) found.push({ raw, base: one })
  }
  return found
}

module.exports = { writesWithBase, REDIRECT, REDIRECTIONS, cdTarget, positional, QUOTED_CD }
