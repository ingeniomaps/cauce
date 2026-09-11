---
caso: 115
titulo: Una entrada del INBOX no dice qué recorrido la escribió ni cuándo, y el motor tampoco lo guarda
estado: abierto
prioridad: baja
version-detectada: 0.82.0
---

# 115 — Del INBOX se sabe qué dice cada entrada y no de dónde salió

**🔴 abierto** · detectado en 0.82.0 · prioridad **baja** — no rompe nada; convierte cada recorrido del INBOX
en una decisión sin datos, y ya impidió cerrar una pregunta del 101

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
banco recién creado:

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
