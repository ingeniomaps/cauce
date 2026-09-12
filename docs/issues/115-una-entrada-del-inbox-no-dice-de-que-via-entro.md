---
caso: 115
titulo: Una entrada del INBOX no dice qué recorrido la escribió ni cuándo, y el motor tampoco lo guarda
estado: resuelto
resuelto-en: 0.83.0
prioridad: baja
version-detectada: 0.82.0
---

# 115 — Del INBOX se sabe qué dice cada entrada y no de dónde salió

**🟢 resuelto en 0.83.0** · detectado en 0.82.0 · prioridad **baja** — no rompía nada; convertía cada
recorrido del INBOX en una decisión sin datos, y ya había impedido cerrar una pregunta del 101

## Resumen

Una entrada del INBOX es un nombre en negrita y una línea. Eso es todo lo que queda escrito: **nada dice qué
la puso ahí** —`autobuild` tras una revisión, `flow` al cerrar un informe, `onboard` al arrancar, o una
persona a mano— ni de qué tarea o corrida salió ni cuándo. El motor tampoco lo guarda en otro lado: lo único
que lee de una entrada es su nombre.

Quien recorre el INBOX tiene que decidir promover, dejar o borrar, y esa decisión depende de cosas que la
entrada no trae: si la escribió un agente o una persona, si la tarea que la originó ya se cerró, si es de
esta semana o de hace tres meses. Desde 0.82.0 ese recorrido es una recurrencia trimestral que viene activa,
así que la primera vez que vence lo normal es tener entradas viejas de las que no se sabe nada.

Es la pregunta que el **101** dejó declarada y no pudo contestar: ~550 líneas de relatos de QA en un INBOX
real, y no se pudo establecer de qué vía entraron.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable. Una entrada escrita exactamente con la forma que el
molde define y que el pedido de los recorridos repite, y después: qué queda de ella.

```bash
BANCO=$(mktemp -d); REPO=$PWD
node engine/cli/ops.js init "$BANCO/acme" --mode embedded --runner claude --no-install >/dev/null
cat > "$BANCO/r115.js" <<'EOF'
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const A = process.argv[2]
const REPO = process.argv[3]
const PLANNING = path.join(A, 'planning')
const INBOX = path.join(PLANNING, 'INBOX.md')

console.log('=== 1. la forma que el molde define para una entrada ===')
const mold = fs.readFileSync(INBOX, 'utf8')
console.log(mold.split('\n').filter((line) => line.includes('slug-del-item')).join('\n'))

console.log('=== 2. una entrada escrita con esa forma, en Propuestas ===')
const entry = '- **reintento-webhook** — El webhook de pagos no reintenta; el fix está en el done/ de t-012.'
fs.writeFileSync(INBOX, mold.replace('## Propuestas\n', `## Propuestas\n\n${entry}\n`))
console.log(entry)

console.log('=== 3. qué guarda el motor sobre esa entrada ===')
const P = require(path.join(REPO, 'engine/planning/parser.js'))
console.log('inboxHeads:', JSON.stringify(P.inboxHeads(PLANNING)))
console.log('readInbox :', JSON.stringify(P.readInbox(PLANNING)))
const ctx = spawnSync('node', [path.join(REPO, 'engine/cli/ops.js'), 'context', '--json', PLANNING],
  { cwd: A, encoding: 'utf8' })
try {
  console.log('context --json → inbox:', JSON.stringify(JSON.parse(ctx.stdout).inbox))
} catch {
  console.log('context --json (crudo):', (ctx.stdout || ctx.stderr).slice(0, 200))
}

console.log('=== 4. el pedido literal que un recorrido le manda al agente que escribe ===')
const frag = fs.readFileSync(path.join(REPO, 'automatization/shared/inbox.js'), 'utf8')
// El fragmento no es un módulo: lo incluyen los recorridos por `{{INCLUDE:...}}`, así que se evalúa igual
// que al renderizarlos.
eval(`${frag}\nconsole.log(inboxAsk(['Propuestas'], { propuestas: ['reintento-webhook'] }))`)
EOF
node "$BANCO/r115.js" "$BANCO/acme" "$REPO"
```

## Síntoma

Salida real, 2026-09-11, sobre `main` 41673984 —con 0.82.0 ya mergeado y `package.json` todavía en 0.81.0—,
banco recién creado. Se volvió a correr literal el 2026-09-12, sobre `main` 2a651ad4 y con 0.82.0 ya
publicada, y devolvió lo mismo línea por línea:

```
=== 1. la forma que el molde define para una entrada ===
- **slug-del-item** — Qué es, y qué se decide o se resuelve con esto.
=== 2. una entrada escrita con esa forma, en Propuestas ===
- **reintento-webhook** — El webhook de pagos no reintenta; el fix está en el done/ de t-012.
=== 3. qué guarda el motor sobre esa entrada ===
inboxHeads: {"deuda":[],"ideas":[],"propuestas":["reintento-webhook"],"lecciones":[]}
readInbox : {"deuda":0,"ideas":0,"propuestas":1,"lecciones":0,"skipped":0}
context --json → inbox: {"deuda":[],"ideas":[],"propuestas":["reintento-webhook"],"lecciones":[]}
=== 4. el pedido literal que un recorrido le manda al agente que escribe ===
Cada entrada con la forma del molde —- **slug-del-item** — Qué es, y qué se decide o se resuelve con esto.—: un nombre y una línea, y la evidencia se cita donde ya vive, no se copia. Por nombre, en Propuestas ya están reintento-webhook: lo que ya esté con uno de esos nombres no se vuelve a escribir.
```

La forma que el molde define y que el pedido repite tiene dos campos —el nombre y la línea— y ninguno es el
origen. Lo que el motor extrae de la entrada, por las tres vías que existen (`inboxHeads`, `readInbox` y el
campo `inbox` de `context --json`), es el nombre y el conteo. Un mes después, esa entrada es cuatro palabras
sin remitente.

## Causa raíz

No es un defecto de una función: es que la procedencia no se escribe en ningún punto del recorrido.

- `template/planning/INBOX.md:10` — la forma de una entrada: `- **slug-del-item** — Qué es, y qué se decide o
  se resuelve con esto.` No tiene dónde ir el origen. Y `:3` dice «El runner puede agregar; solo una persona
  promueve y elimina», que es justamente la decisión que necesita saber quién agregó.
- `automatization/shared/inbox.js:7` (`INBOX_ENTRY`) y `:20-27` (`inboxAsk`) — el pedido que los tres
  recorridos mandan al agente lleva el tope, la forma y los nombres que ya están en la sección. La
  procedencia no está entre lo que pide.
- Los cinco puntos donde un recorrido escribe llevan el dato en el pedido y no en la entrada:
  `automatization/workflows/autobuild.js:808-810` nombra la tarea («lo que la revisión de `${task.id}`
  dejó anotado»), `flow.js:425-427` nombra el informe (`report.file`), y `flow.js:458-459` (Lecciones),
  `flow.js:470` (Ideas) y `onboard.js:200-203` (Ideas) no nombran ninguno. En los cinco, la forma que se
  exige es la del molde: si el agente escribe de dónde salió, es porque lo decidió él.
- `engine/planning/parser.js:419-437` (`inboxSections`) — lo único que el motor extrae de una viñeta es el
  nombre en negrita; una viñeta sin nombre se cuenta en `skipped` y nada más. `readInbox` (`:407-410`) cuenta
  y `inboxHeads` (`:415-417`) devuelve nombres: no hay un tercer lector con más detalle.
- `engine/planning/inbox.js:14-33` — lo que `check` dice sobre el INBOX desde 0.82.0 es su tamaño y si una
  entrada se llama como una tarea de `done/`. Las dos advertencias son sobre el nombre; ninguna sobre de
  dónde vino ni de cuándo es.
- `engine/core/ownership.js:240` — `INBOX.md` es del proyecto (`init`), así que `upgrade` no lo toca y la
  única historia que existe es la del repositorio de la instancia. Es exactamente lo que al 101 le faltó:
  su cierre dice que contestar aquella pregunta pide un `git log -p` sobre ese archivo, allá.

## Fix propuesto

La forma, no el diff: las cuatro opciones cambian cosas distintas y la elección no le toca a este caso.

1. **La procedencia va en la entrada, como convención del molde.** `- **slug** — qué (autobuild · t-012 ·
   2026-09-11)`. Cuesta una línea en el molde y otra en `inboxAsk`, y lo escribe el agente: es una convención,
   no un mecanismo, así que una entrada sin el sufijo no rompe nada ni se nota.
2. **La procedencia la arma el recorrido, no el agente.** El código ya aplica el tope, recorta el `detail` a
   una línea y arma el pedido; podría pasar la entrada ya prefijada con su origen y pedir que se copie tal
   cual. Es lo más determinista que se puede hacer sin escribir el archivo desde el motor, y sigue dependiendo
   de que el agente no la reescriba.
3. **Un campo que el parser lea**, y `check` avisando la entrada que no lo tiene. Es lo único que vuelve la
   procedencia comprobable, y cuesta tocar molde, parser y toda instancia existente —el 101 ya descartó
   cambiar el formato de entrada por ese motivo, y esa razón no cambió—.
4. **No tocar la entrada y leer la historia.** `check` o `ops tree` muestran la antigüedad de cada entrada
   desde el `git log` del `INBOX.md`. No pide formato nuevo y contesta «cuándo» pero no «quién»; y sólo
   funciona donde la instancia está versionada y nadie reescribe el archivo entero —que es la poda a mano que
   el 101 vio en la instancia real—.

Las cuatro dejan afuera lo que ya está escrito: una entrada vieja no gana procedencia retroactiva. Si eso
importa, lo que hay es la opción 4 sobre la historia que exista.

## Tradeoffs

- **Cada carácter de procedencia compite con la línea.** La entrada es de una línea a propósito (101): un
  sufijo de origen le come lugar a lo que la entrada dice, y una lista donde la mitad de cada renglón es
  metadato se recorre peor, que es justo lo que el tope vino a arreglar.
- **La procedencia se puede leer como una firma.** «Lo escribió `autobuild`» puede convertirse en un criterio
  para no leerla, cuando el punto es decidir sobre lo que dice.
- **Las opciones 1 y 2 no son comprobables**, y decirlo es parte de proponerlas: quedan como convención, y
  una convención que nadie mide envejece sin que nada falle. Sólo la 3 se puede validar.
- **La 3 rompe el lector de toda instancia existente** si el campo es obligatorio, y si es opcional sólo se
  cumple en lo nuevo, que es donde menos falta hace.
- **Nada de esto cubre a la persona.** Una entrada escrita a mano por alguien es la que menos procedencia
  tiene y la que más contexto trae, y limitarla no corresponde: el INBOX es de ella.

## Prioridad

**Baja.** No rompe nada y no bloquea ningún recorrido: lo que cuesta es una decisión peor cada vez que alguien
recorre el INBOX, y ese costo no aparece en ninguna salida. Con el tope de 0.82.0 puesto, además, el INBOX
crece mucho más despacio que cuando el 101 midió 3.586 líneas.

Sube a **media** cuando la recurrencia trimestral del INBOX venza por primera vez en una instancia con
entradas de varios meses —tres meses después de `init`, según lo que el molde declara—: ahí el recorrido pasa
de hipotético a agendado, y decidir sobre entradas sin remitente deja de ser un problema futuro.

## Contexto de descubrimiento

2026-09-11, cerrando el 101 y el 106 en 0.82.0. El cierre del 101 dejó declarada una dimensión sin cubrir:
de qué vía habían entrado ~550 líneas de relatos de QA al INBOX de una instancia real —por el `detail` de una
revisión, o por sesiones fuera de los recorridos—. No se pudo establecer desde este repositorio porque haría
falta la historia del `INBOX.md` de esa instancia, que no viaja con el caso.

Este caso es la pregunta general detrás de aquella: no que falte ese dato en particular, sino que el sistema
no registra el origen de ninguna entrada. Lo que el 101 no pudo contestar allá, acá no se puede contestar de
ninguna entrada.

## Relacionados

- **101** — lo que entra al INBOX, y de dónde sale esta pregunta: su cierre la declara abierta y dice qué
  haría falta para contestarla en aquella instancia.
- **106** — lo que sale del INBOX: la recurrencia trimestral y el aviso de entradas que se llaman como una
  tarea cerrada. Es el recorrido que este caso deja sin datos, y el aviso que aquél agregó es el único indicio
  de origen que hoy existe —por nombre, y sólo para lo promovido—.

## Cierre

**🟢 resuelto en 0.83.0** · `automatization/shared/inbox.js`, `automatization/workflows/autobuild.js`,
`flow.js` y `onboard.js`, con las cuatro suites que los miden y el registro de tamaño de
`test/repo/repo.test.js`; en `fix/115-procedencia-del-inbox`

Se tomó la **opción 2**, decidida por el dueño del repositorio: la procedencia la arma el recorrido y el
pedido dice que se copie tal cual, en vez de pedirle al agente que la redacte. La forma es un paréntesis al
final de la línea, con el recorrido, la unidad de la que salió y la fecha —`(autobuild · T-012 ·
2026-09-11)`, `(flow · planning/reports/2026-09-11-alta.md · 2026-09-11)`, `(onboard · 2026-09-11)`—, y las
partes que un recorrido no tiene se caen en vez de rellenarse.

Tres decisiones de forma, con su razón:

- **Va al final y entre paréntesis**, no adelante. La entrada es de una línea y se recorre por lo que dice:
  con el sufijo adelante, las primeras palabras de cada renglón son todas iguales y lo que distingue a una
  entrada de otra empieza en la mitad.
- **Nombra al recorrido y nunca a un cargo.** Es lo que responde al segundo tradeoff: «lo escribió
  `autobuild`» dice por qué vía entró, mientras que un nombre de cargo o de persona invita a decidir por
  quién la escribió en vez de por lo que dice.
- **El tope de 240 pasa a ser de la línea entera, no del detalle.** Lo que se recorta es el hallazgo —que
  sigue entero en el informe o en `done/`— y nunca la procedencia, que es la mitad que no se puede
  reconstruir después.

### Contra lo que el caso enumeró

- **Resumen** — cierto tal como estaba escrito, y se comprobó corriendo: el motor no guarda nada de una
  entrada salvo su nombre, por las tres vías (`inboxHeads`, `readInbox`, `context --json`). Eso no cambió:
  lo que cambió es que ahora la línea trae su origen escrito.
- **Reproducción** — se corrió literal, en un banco desechable bajo el scratchpad, sobre `main` 2a651ad4.
  Corrió entera y sin tocarle una línea. El único retoque fue de invocación mía: pasándole la ruta del banco
  en relativo, el paso 3 resuelve `planning` dos veces y falla con «no existe el planning en …/acme/acme»;
  con la ruta absoluta que el propio caso escribe, da lo que el caso dice.
- **Síntoma** — reproducido línea por línea. La única diferencia con lo registrado es la base, porque pasó
  el tiempo: el caso lo tomó sobre 41673984 con `package.json` en 0.81.0 y la re-corrida fue sobre 2a651ad4
  con 0.82.0 publicada. Las cuatro secciones de la salida son idénticas.
- **Causa raíz** — las siete citas se contrastaron contra el fuente, una por una. Seis daban exactas:
  `template/planning/INBOX.md:10` y `:3`, `shared/inbox.js:7` y `:20-27`, los cinco puntos de escritura
  (`autobuild.js:808-810`, `flow.js:425-427`, `:458-459`, `:470`, `onboard.js:200-203`),
  `engine/planning/inbox.js:14-33` y `engine/core/ownership.js:240`. **Una estaba corrida**: `inboxSections`
  termina en la 433 y no en la 437 —`419-437` incluye el `module.exports` de abajo—; `readInbox` (`407-410`)
  e `inboxHeads` (`415-417`) daban bien.
- **Fix propuesto, opción 1 (convención del molde)** — **descartada.** Es la misma forma que la 2 escrita en
  el otro lado del pedido: la redacta el agente, así que una entrada sin sufijo no se distingue de una que
  nadie decidió marcar. La 2 cuesta lo mismo y deja la línea armada antes de que el modelo la vea.
- **Fix propuesto, opción 2 (la arma el recorrido)** — **tomada**, y es lo que se construyó. `inboxOrigin`
  arma el paréntesis con las partes que el recorrido tenga, `withOrigin` pega detalle y procedencia
  respetando el tope, e `inboxAsk` pide copiarla tal cual. Los cinco puntos de escritura pasaron a mandar la
  línea ya armada.
- **Fix propuesto, opción 3 (un campo que el parser lea)** — **descartada**, por lo que el propio caso
  anticipaba y el 101 ya había decidido: cambia el formato de entrada y con él el lector de toda instancia
  existente. No se tocó ni el molde ni `engine/planning/parser.js`, y por eso esto sigue siendo una
  convención y no algo que `check` pueda exigir.
- **Fix propuesto, opción 4 (leer la historia de git)** — **descartada** para este caso: contesta «cuándo»
  y no «quién», y sólo donde la instancia esté versionada y nadie reescriba el archivo entero, que es la
  poda a mano que el 101 vio en la instancia real. Sigue siendo lo único que sirve para lo ya escrito, y el
  caso ya lo decía.
- **Tradeoff «cada carácter compite con la línea»** — se asume, acotado. El sufijo mide entre 18 y 60
  caracteres según la vía, y el tope de 240 pasó a medir la línea entera: una entrada con procedencia no es
  más larga que una sin ella, es el hallazgo el que cede. Lo fija la prueba del hallazgo largo y la
  mutación M6.
- **Tradeoff «se puede leer como una firma»** — se atiende con la forma, no con una advertencia: lo que va
  es el nombre del recorrido, que es una vía de entrada y no un autor. No se puede medir que nadie lo lea
  como firma; lo que sí queda fijo es que ahí nunca va un cargo.
- **Tradeoff «las opciones 1 y 2 no son comprobables»** — **cierto y sigue siendo cierto, y es el límite de
  lo entregado.** Lo que las pruebas fijan es que el recorrido arma la línea y la manda armada; que el
  agente la copie sin reescribirla no lo comprueba nada, igual que hoy no se comprueba que respete la forma
  del molde. Lo mismo vale para la fecha: si el agente no copia `today` del comando, el paréntesis sale sin
  ella en vez de salir con una inventada.
- **Tradeoff «la 3 rompe el lector de toda instancia existente»** — no aplica: no se tomó la 3. Queda como
  la razón escrita de por qué no.
- **Tradeoff «nada de esto cubre a la persona»** — **se asume tal cual, y es lo que esta decisión deja
  afuera.** Una entrada escrita a mano sigue sin procedencia, y limitarla no corresponde: el INBOX es de
  ella. Tampoco hay nada retroactivo — las entradas que ya existen no la ganan, y para ésas lo único que hay
  sigue siendo la opción 4 sobre la historia que exista.
- **Prioridad** — la condición de escalada («sube a media cuando la recurrencia trimestral venza por primera
  vez en una instancia con entradas de varios meses») queda desactivada para lo que se escriba de acá en
  adelante y **sigue en pie para lo anterior**: cuando esa recurrencia venza por primera vez, las entradas
  que la esperan son justamente las que se escribieron sin sufijo.
- **Contexto de descubrimiento** — la pregunta que el 101 dejó abierta —de qué vía entraron ~550 líneas de
  relatos de QA al INBOX de una instancia real— **sigue sin contestarse y ya no se puede contestar desde
  acá**: son entradas viejas. Lo que cambia es que la próxima vez la pregunta no se abre.
- **Relacionados, 101** — su cierre declara esta dimensión abierta; queda cerrada sólo hacia adelante, con
  el párrafo de arriba.
- **Relacionados, 106** — el aviso de «se llama como una tarea de `done/`» sigue siendo el único indicio de
  origen para lo promovido, y no se tocó. Ahora convive con un origen explícito en lo nuevo.

### Lo que el enunciado no preveía

- **`flow.js` cruzó las 500 líneas** (498 → 510). El umbral disparó la decisión que pide R7 y no se resolvió
  recortando comentarios: `flow.js` quedó registrado en `JUSTIFIED` de `test/repo/repo.test.js` con su
  razón —un recorrido de equipo crece de a una salida y cada una arma su destino al lado del schema que la
  valida—, y partirlo bien es un cambio propio y no la cola de éste.
- **El pedido de `flow` decía «copy only its inbox field»**, así que pedir también la fecha obligaba a
  reescribir esa línea: quedó «copy its inbox field into inbox and its today field into today, both
  verbatim, and nothing else it printed», que conserva el «nada más» que esa palabra estaba cuidando —el
  agente copiando campos de más agota el reintento—.
- **La fecha no la puede poner el recorrido por su cuenta.** Un workflow no tiene reloj: `new Date(` está
  prohibido y lo comprueba `test/workflows/workflows.test.js:118`. Sale de `ops context --json`, que ya la
  emite en `today` y que los tres recorridos ya corrían; `autobuild` ya la pedía, y `flow` y `onboard`
  tuvieron que sumarla a su schema y a su pedido. Esa mitad el arnés no la ve —no valida schemas—, así que
  la fijan dos pruebas de fuente y las mutaciones M7 y M8.
- **El log de lo que no entró al INBOX quedó sin sufijo, a propósito.** En `onboard`, `unlistedQuestions` y
  su línea de log son para quien está mirando esa misma corrida: ahí la procedencia es ruido. Lo fija una
  aserción del caso nuevo.

### Qué se corrió

- **La reproducción del caso, literal**, sobre `main` 2a651ad4 y banco recién creado: devolvió las cuatro
  secciones del Síntoma idénticas, con el paso 4 imprimiendo el pedido sin una palabra sobre el origen.

  Sobre el arreglo, el mismo paso 4 —el fragmento evaluado igual que al renderizar un recorrido— imprime la
  cláusula nueva, y la línea que el recorrido le entrega al agente sale ya armada:

  ```
  … Cada línea que te paso termina con su procedencia —(autobuild · t-012 · 2026-09-12)—: va al final de la
  entrada tal cual, sin reescribirla, resumirla ni completarla. …
  El webhook de pagos no reintenta; el fix está en el done/ de t-012. (autobuild · t-012 · 2026-09-12)
  (autobuild · t-012 · 2026-09-12)
  (flow · planning/reports/2026-09-12-alta.md · 2026-09-12)
  (onboard · 2026-09-12)
  ```

  **Con una salvedad que corresponde decir**: el paso 4 del caso llama a `inboxAsk` con dos argumentos y el
  tercero es ahora la procedencia, así que tal cual está escrito imprime «procedencia —undefined—». No es un
  camino de producción —los cinco puntos de escritura la pasan siempre, y las mutaciones M1 a M4 lo fijan— y
  **no** se le puso un valor por defecto al fragmento para que ese llamado se vea bien: taparía justamente
  al recorrido que se olvidara de pasarla, que es lo que hay que poder ver.
- **Rojo previo.** Las siete pruebas nuevas y la existente que cambió de expectativa, corridas contra un
  `git archive` de 2a651ad4 con los cuatro archivos de prueba copiados encima: **8 rojas de 63**. Las ocho:
  «un seguimiento dice de qué informe salió y de cuándo», «la lección y la idea nombran el equipo que las
  escribió y la fecha», «lo anotado llega con de qué vía salió: recorrido, tarea y fecha», «un hallazgo
  largo se recorta y su procedencia llega entera», «flow pide la fecha del motor, que es la que lleva la
  procedencia», «onboard pide la fecha del motor junto con los nombres del INBOX», «las preguntas que
  onboard deja en el INBOX dicen de qué vía salieron» y «onboard lleva al INBOX tres preguntas abiertas y
  cuenta las demás», que es la única que ya existía. Sobre el arreglo, 63 de 63 en verde.
- **Mutaciones.** Cada parte del arreglo apagada en su propia copia desechable bajo el scratchpad, nunca en
  el árbol de trabajo, y comprobando que el texto a apagar estuviera antes de correr:

  | Mutación | Qué se apagó | Prueba que se puso roja |
  |---|---|---|
  | M1 | `autobuild` no le pone procedencia a lo anotado | «…de qué vía salió: recorrido, tarea y fecha» y «un hallazgo largo…» |
  | M2 | el seguimiento de un informe pierde la suya | «un seguimiento dice de qué informe salió y de cuándo» |
  | M3 | la lección y la idea pierden la suya | «la lección y la idea nombran el equipo que las escribió y la fecha» |
  | M4 | `onboard` no se la pone a las preguntas | «las preguntas que onboard deja…» y «onboard lleva al INBOX tres preguntas…» |
  | M5 | el pedido deja de exigir que se copie tal cual | las tres de procedencia, una por recorrido |
  | M6 | el recorte deja de reservarle lugar al sufijo | «un hallazgo largo se recorta y su procedencia llega entera» |
  | M7 | `flow` deja de declarar la fecha en su manifiesto | «flow pide la fecha del motor…» |
  | M8 | `onboard` deja de pedirle la fecha al comando | «onboard pide la fecha del motor…» |

  Ninguna sobrevivió.
- **La pasada de comentarios de R11**, con la sonda al 0.22 contra la base: la primera corrida sacó **siete
  pares nuevos**, uno de ellos en 1.00 —el comentario de la fecha copiado igual en `flow.js` y
  `onboard.js`—, y el gate del repositorio marcó dos. Cada razón volvió a un solo lugar, el fragmento
  compartido, y la sonda quedó en **0 pares nuevos** (216 contra 217 de la base).
- **Las puertas**: `npm run ci` y `npm test`, las dos con código de salida 0. La cobertura no bajó ningún
  piso: 64 archivos en su piso o por encima.
