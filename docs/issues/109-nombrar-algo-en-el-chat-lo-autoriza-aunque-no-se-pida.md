---
caso: 109
titulo: Nombrar algo en el chat lo autoriza aunque la persona no lo haya pedido
estado: abierto
prioridad: media
version-detectada: 0.81.0
---

# 109 — Una pregunta o un comentario al pasar cuentan como pedido, y el guard deja pasar

**🔴 abierto** · detectado en 0.81.0 · prioridad **media**. El 098 abrió una vía para que lo que la persona
pide pase sin archivo, y esa vía acepta cualquier mención: una pregunta sobre las `credentials` autoriza a
leerlas. Contener al agente es justo lo que el 098 dejó en pie, y acá deja de pasar sin que nadie lo decida

## Resumen

Desde 0.81.0, un guard deja pasar lo que el mensaje de la persona nombra (caso 098). «Nombrar» se lee como
cualquier aparición entera de la ruta o de su nombre que no esté negada en su frase. Por eso autorizan
también una pregunta («¿para qué sirven las credentials?») y un comentario al pasar («el deploy falla por
las credentials de AWS, revisá el pipeline»): en los dos casos el agente puede leer el archivo
`credentials` sin que nadie se lo haya pedido.

El riesgo crece con los nombres sin extensión que además son palabras comunes: `credentials`, `config` o
`login` aparecen en cualquier conversación. Y alcanza a todos los guards que cotejan la aprobación, no sólo
al de lectura de credenciales: `approval.pending` pasa por el mismo `unauthorized`.

## Reproducción

Desde la raíz de un checkout de Cauce en 0.81.0, sin runner. El motor de la rama no cambió desde el tag:
`git diff 1930a1ca --stat -- engine/` no devuelve nada. Para cada mensaje, se guarda el mensaje como lo
haría el hook `chat` y después se prueba una lectura con `secrets-read`, en la misma sesión y con el
mismo `prompt_id`:

```bash
T=$(mktemp -d); TMPDIR="$T" env -u CI -u CLAUDE_PROJECT_DIR -u OPS_ROOT node -e '
const fs = require("node:fs"), path = require("node:path"), { execute } = require("./engine/hooks/run.js")
const root = fs.mkdtempSync(path.join(process.env.TMPDIR, "banco-"))
fs.mkdirSync(path.join(root, "planning"))
fs.writeFileSync(path.join(root, "ops.config.json"), JSON.stringify({ mode: "embedded" }))
let n = 0
function probe(file, prompt) {
  const session_id = `s${++n}`
  execute("chat", { session_id, prompt_id: "p", prompt })
  let out = "PASA "
  try { execute("secrets-read", { session_id, prompt_id: "p", cwd: root,
    tool_input: { file_path: path.join(root, file) } }) } catch { out = "frena" }
  console.log(`${out}  ${file.padEnd(11)}  «${prompt}»`)
}
probe("credentials", "el deploy falla por las credentials de AWS, revisá el pipeline")
probe("credentials", "¿para qué sirven las credentials?")
probe("credentials", "leé el archivo credentials")
probe("credentials", "el .env tiene algo raro? no sé")
probe(".env", "el .env tiene algo raro? no sé")
probe(".env", "leé el .env")
probe(".env", "no leas el .env")
const CHAT = require("./engine/hooks/chat.js")
CHAT.record({ session_id: "push", prompt_id: "p", prompt: "Arreglá el login y no subas nada" })
const left = CHAT.unauthorized({ session_id: "push", prompt_id: "p" }, ["push origin feat/login"])
console.log(`${left.length ? "frena" : "PASA "}  push origin feat/login  «Arreglá el login y no subas nada»`)
'
```

Las dos líneas `frena` se comprobaron aparte, imprimiendo el error: las dos son el bloqueo de credencial
(`<banco>/credentials es una credencial: leerla la deja en el contexto de la sesión…`), no otro error que
el `catch` se tragó.

## Síntoma

Salida real, 2026-09-11, Node v24.18.0, motor de 0.81.0:

```
PASA   credentials  «el deploy falla por las credentials de AWS, revisá el pipeline»
PASA   credentials  «¿para qué sirven las credentials?»
PASA   credentials  «leé el archivo credentials»
frena  credentials  «el .env tiene algo raro? no sé»
PASA   .env         «el .env tiene algo raro? no sé»
PASA   .env         «leé el .env»
frena  .env         «no leas el .env»
PASA   push origin feat/login  «Arreglá el login y no subas nada»
```

De las cinco primeras, sólo la tercera es un pedido, y pasan cuatro. La cuarta frena porque el mensaje no
nombra `credentials`, no porque la regla distinga nada, y la quinta pasa con una pregunta que no pide
leer el `.env`. La negación (séptima) funciona como el 098 prometió. La última línea sale del `unauthorized`
directo, con un ítem de push como el que propone el 103: el basename de `push origin feat/login` es
`login`, que aparece en «Arreglá el login» sin negación. El «no subas nada» está en la misma frase, pero
después del nombre, y esa negación no cuenta.

## Causa raíz

- `engine/hooks/chat.js:52-66`, `mentions`: recorre cada aparición entera del ítem y de su `path.basename`,
  y la anota como negada o no según lo que hay **antes** del nombre en su frase (`chat.js:62`). No mira si
  la frase pide algo: cualquier aparición no negada da `named: true` (`chat.js:65`).
- `engine/hooks/chat.js:104-108`, `unauthorized`: deja pasar todo ítem con `mentions(...).named`. Lo usan
  todos los guards con salida angosta vía `engine/hooks/approval.js:45-48` (`pending`), y el de lectura de
  credenciales vía `engine/hooks/files.js:25` (`approved`).
- `engine/hooks/chat.js:55`: el basename entra siempre como segundo nombre. Para `…/credentials` o
  `feat/login` eso es una palabra común, no una ruta.

El 098 ya había registrado este borde en sus tradeoffs («limitarse a los verbos que piden la acción; sin
eso, prohibir algo lo autoriza»), y su cierre lo resolvió sólo con la negación: cubre prohibir, no
preguntar ni comentar.

## Fix propuesto

**Decisión pendiente del usuario:** qué cuenta como pedido. El criterio que viene del 098 es no limitar a
la persona y contener al agente. Las opciones:

- **(a) Exigir un verbo que pida la acción en la misma frase que el nombre**, manteniendo la negación. La
  lista sería leé, abrí, mostrame, editá, cambiá, borrá, escribí, corré, desactivá, reescribí… y sus formas
  en inglés (read, open, show, edit, change, delete, write, run, disable, rewrite…). En `mentions`, la frase
  que ya se corta con `CLAUSE` tiene que contener un verbo de la lista para que la aparición cuente como
  `named`.
- **(b) Sólo contar sin verbo las menciones con forma de ruta** (un punto o una barra: `.env`,
  `api/src/app.js`) y exigir el verbo para las demás. Así «el .env tiene algo raro?» seguiría pasando.
- **(c) Dejarlo como está**, y declarar en el README de los guards que nombrar autoriza.

**Recomendación: (a).** Es la más simple y cierra los cinco ejemplos, incluida la pregunta sobre el `.env`
que (b) deja pasar. Por la forma de ruta no se distingue una pregunta de un pedido: «el .env tiene algo
raro?» tiene ruta y no pide leer.

Esbozo de la forma (no es un diff probado):

```js
const ASKS = new RegExp(String.raw`(?:^|[^\p{L}])(?:le[eé]|abr[ií]|mostr[aá]|edit[aá]|cambi[aá]|borr[aá]`
  + String.raw`|escrib[ií]|corr[eé]|desactiv[aá]|reescrib[ií]|read|open|show|edit|change|delete|write|run`
  + String.raw`|disable|rewrite)\p{L}*`, 'iu')
// en mentions: const clause = <la frase entera que contiene el nombre>
// found.push({ denied: NEGATION.test(antes), asked: ASKS.test(clause) })
// named = alguna aparición con asked && !denied
```

## Tradeoffs

- **El «dale» sobre lo pendiente no cambia.** Quien recibe un bloqueo y contesta «dale» sigue aprobando
  exactamente lo frenado. La vía para quien dijo algo sin verbo reconocible queda así: se frena, el agente
  lo dice y la persona contesta. No se la limita, se le pide una palabra más.
- **La lista de verbos es lenguaje natural y va a quedar corta.** «Fijate qué tiene el .env» o «pasame el
  config» no tienen un verbo de la lista y quedarían frenados. El costo es un «dale», no un bloqueo
  definitivo, pero la lista necesita español rioplatense, neutro e inglés, y cada forma que falte es una
  vuelta más para la persona.
- **Un verbo en la frase no garantiza que pida esa acción**: en «leé el README y decime si el .env está bien
  documentado», «leé» está en la misma frase que `.env`. (a) reduce el hueco, no lo cierra. Cerrarlo del
  todo pediría atar el verbo a su objeto, y eso ya es un analizador.
- **La negación sigue mirando sólo lo que va antes del nombre**: «Arreglá el login y no subas nada» ya no
  autorizaría el push con (a), pero porque «arreglá» no está en la lista de verbos de publicar, no porque
  se lea el «no subas». Si la lista suma «subí» o «push», el caso vuelve. Hay que decidir si la negación se
  extiende a toda la frase.

## Qué tiene que probar el cierre

- Los cinco ejemplos de la reproducción con su resultado esperado: frenan la primera, la segunda, la
  cuarta y la quinta, y pasa la tercera («leé el archivo credentials»).
- «leé el .env» sigue pasando.
- La negación sigue frenando: «no leas el .env» y «sí, pero no el .env» no autorizan.
- «Arreglá el login y no subas nada» no autoriza `push origin feat/login` (vale cuando el 103 agregue ese
  ítem; hasta entonces, con `unauthorized` directo como en la reproducción).
- Una mutación que vuelve a aceptar la mención sin verbo, corrida en una copia desechable (R23), se pone
  roja.
- El recorrido del «dale» sobre lo que quedó frenado por falta de verbo pasa, en una sesión real.

## Contexto de descubrimiento

2026-09-11, revisando el 098 ya publicado en 0.81.0 mientras se mejoraban los casos 099 a 103. En el 103
apareció lo mismo para un ítem de push: «Arreglá el login y no subas nada» autoriza `push origin
feat/login`. Es el camino principal y no un borde: nombrar un archivo o un tema al pasar es lo más común de
una conversación, y el 098 hizo que ese nombre valga como pedido.

## Relacionados

- **098**: abrió la vía del chat. Su tradeoff «nombrar no es autorizar» se cerró sólo con la negación, y
  este caso es la parte que quedó afuera.
- **103**: el push pedido en la sesión. Si entra por la misma vía, hereda este hueco, como muestra la
  última línea del síntoma.
- **104**: la lectura de credenciales por shell. Cualquier arreglo de este caso tiene que valer también
  para el guard de shell que coteja con `approval.pending` (`engine/hooks/secrets-shell.js:56`).
