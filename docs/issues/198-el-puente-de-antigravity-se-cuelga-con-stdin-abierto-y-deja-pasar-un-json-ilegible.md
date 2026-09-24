---
caso: 198
titulo: El puente de Antigravity se cuelga con stdin abierto y deja pasar lo que no puede leer
estado: resuelto
resuelto-en: 0.99.0
prioridad: alta
version-detectada: 0.98.0
---

# 198 — El puente de Antigravity lee stdin por su cuenta: se cuelga como el 190 y ante un JSON ilegible permite

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **alta**. Dos defectos del mismo `readInput()`, y uno falla
en la dirección peligrosa y en silencio: un `git push --force` al que le falta la última llave sale
`{"decision":"allow"}`.

## Resumen

`automatization/runners/antigravity/hook.js` no usa el `readInput()` del motor (`engine/hooks/input.js`):
define el suyo, sincrónico y con un `catch` que devuelve `{}` para todo. De ahí salen dos cosas:

1. **Se cuelga con stdin abierto.** `fs.readFileSync(0)` bloquea hasta EOF, el mismo defecto que el 190
   arregló en el motor y que acá sigue intacto: un pipe, un socket o una terminal que nadie cierra dejan al
   proceso dormido sin juzgar nada.
2. **Falla abierto ante un JSON ilegible.** El `catch` que cubre «sin stdin» cubre también `JSON.parse`, así
   que una entrada que no se entiende se vuelve `{}`, `normalize()` la convierte en un comando y un archivo
   vacíos, y los guards —que no tienen nada que juzgar— permiten. El motor tomó la decisión contraria hace
   tiempo y la dejó escrita: «Devolver `{}` ahí dejaba a cada guard sin comando ni archivos, o sea
   permitiendo todo, y en silencio» (`engine/hooks/input.js`, comentario de `readInput`).

## Reproducción

Desde la raíz del repositorio principal, todo con `timeout`:

```sh
B=automatization/runners/antigravity/hook.js
sleep 6 | timeout 3 node $B pre-shell; echo "exit ${PIPESTATUS[1]}"                    # A pipe abierto
timeout 3 node $B pre-shell </dev/null; echo "exit $?"                                  # B /dev/null
printf '%s' '{"toolCall":{"args":{"CommandLine":"git push --force origin main"}}}' \
  | timeout 5 node $B pre-shell                                                          # C JSON válido
printf '%s' '{"toolCall":{"args":{"CommandLine":"git push --force origin main"}}' \
  | timeout 5 node $B pre-shell                                                          # D sin la última llave
printf '%s' '{"toolCall":{"args":{"TargetFile":".env","CodeContent":"X=1"}' \
  | timeout 5 node $B pre-files                                                          # E ilegible, archivo
printf '{roto' | timeout 5 node $B stop                                                  # F ilegible en stop
# G socket: spawn con stdio 'pipe', leer /proc/<pid>/wchan, SIGTERM a los 3 s
```

## Síntoma

Corrido el 2026-09-23 sobre `fix/cases-185-196` (con el arreglo del 190 ya integrado), Node v24.18.0,
`agy` 1.1.16 instalado:

```
A pipe abierto:
exit 124
B /dev/null:
{"decision":"allow"}
exit 0
C JSON válido que bloquea:
{"decision":"deny","reason":"Cauce: 'git push --force' reescribe historia ya publicada. R8 lo prohíbe y runner.allowPush no lo habilita: publicá con un push normal, o registrá una acción humana."}
exit 0
D el mismo JSON sin la última llave:
{"decision":"allow"}
exit 0
E JSON ilegible en pre-files:
{"decision":"allow"}
exit 0
F JSON ilegible en stop:
{"decision":"stop"}
exit 0
G socket:
   fd0: socket:[290926890] wchan: unix_stream_data_wait
   vivo a los 3 s; SIGTERM
exit null SIGTERM
leftovers: ninguno
```

C y D son el mismo comando: con el JSON entero el guard lo niega, y sin una llave pasa. G es la forma
exacta del colgado original del 190 —socket, `unix_stream_data_wait`—, ahora en el puente.

## Causa raíz

`automatization/runners/antigravity/hook.js:7-12`:

```js
function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8')
    return raw.trim() ? JSON.parse(raw) : {}
  } catch { return {} }
}
```

- La línea 9 lee hasta EOF sin plazo (defecto 1).
- La línea 11 atrapa en un solo `catch` la falta de stdin y el `JSON.parse` que falla (defecto 2).

`hook.js:157-158` lo evalúa antes de todo: `respond(evaluate(process.argv[2], readInput()))`. Con `{}`,
`normalize()` (`hook.js`, `normalize`) arma `command: ''` y `file_path: ''`, y `evaluate()` llega a
`hooks.executeAll` (`hook.js:144`) sin nada que juzgar: devuelve `allow`, o `stop` en el evento `stop`.

## Fix propuesto

**¿Puede reusar el `readInput` del motor?** No directamente, y la razón es de orden: el puente carga el
motor con `runtimeAt(root)`, y `root` sale de `findRoot(input)`, que en el camino no instalado mira
`input.toolCall.args.Cwd` y `input.workspacePaths`. O sea que necesita la entrada **antes** de saber dónde
está `engine/hooks/input.js`. Sólo cuando `automation install` dejó escrito `OPS_ROOT` se conoce la raíz sin
leer la entrada.

Dos formas, en orden de preferencia:

1. **Leer con la función del motor cuando la raíz está declarada, y con una copia mínima cuando no.** Evita la
   copia en el camino instalado, que es el real; deja dos caminos para una misma pregunta, que es lo que el
   encabezado de `input.js` pide no hacer.
2. **Una copia del contrato en el puente**, escrita al lado de la del motor: lectura asíncrona de
   `process.stdin` con plazo al primer byte (el mismo valor, `FIRST_BYTE_MS`), vacío o sin stdin → `{}`, y
   **JSON ilegible o plazo agotado → error**, nunca `{}`. `main()` pasa a ser asíncrono. Para que la copia no
   diverja, una prueba de `test/wiring/runners.test.js` corre las mismas entradas contra los dos lectores y
   exige el mismo resultado.

Forma de 2:

```js
function readInput(stream = process.stdin, waitMs = FIRST_BYTE_MS) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const timer = setTimeout(() => { stream.destroy(); reject(new Error('no llegó nada por stdin …')) }, waitMs)
    stream.on('data', (chunk) => { clearTimeout(timer); chunks.push(chunk) })
    stream.on('error', () => { clearTimeout(timer); resolve({}) })
    stream.on('end', () => {
      clearTimeout(timer)
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) return resolve({})
      try { resolve(JSON.parse(raw)) } catch (error) { reject(new Error(`entrada ilegible (${error.message})`)) }
    })
  })
}

async function main() {
  let input
  try { input = await readInput() } catch (error) {
    return respond(process.argv[2] === 'stop'
      ? { decision: 'stop', reason: `Cauce: ${error.message}` }
      : { decision: 'deny', reason: `Cauce: ${error.message}` })
  }
  respond(evaluate(process.argv[2], input))
}
```

## Tradeoffs

- **Qué devuelve `stop` ante una entrada que no se lee.** `evaluate()` ya distingue: un bloqueo da
  `continue` y una falla del puente da `stop`, porque atar al agente a una raíz que no resuelve no se arregla
  solo (comentario en `hook.js`, `evaluate`). Una entrada ilegible es una falla del puente y no un bloqueo,
  así que el fix propone `stop` con la razón a la vista. Es permisivo en `stop` por diseño previo; en
  `pre-shell` y `pre-files` es `deny`.
- **Un `{}` legítimo sigue permitiendo.** Vacío o sin stdin → `{}` → `allow`, igual que en el motor, porque
  ahí los guards caen a las variables de entorno. No cambia.
- **Una forma de payload desconocida también permite, y este caso no la cubre.** Un JSON válido con campos
  que `normalize()` no reconoce da `command: ''` y permite igual que el ilegible. Es el mismo modo de fallo
  por otra puerta; si se decide cerrarlo, es otra decisión —qué campos son obligatorios por evento— y otro
  caso.
- **Qué hace `agy` con stdin.** *Hipótesis, no comprobada*: que escribe el JSON y cierra, como Claude Code —si
  no cerrara, cada llamada a herramienta se colgaría y se habría visto—. Correr `agy` con una sesión real
  para medirlo queda fuera de lo que se puede hacer acá sin instalar el puente.

## Prioridad

**Alta**, por el segundo defecto. El colgado solo sería media, como el 190: no produce un resultado
incorrecto, sólo un proceso que no termina. El `allow` ante un JSON ilegible es otra clase: el guard falla en
la dirección peligrosa y sin rastro —D es un `push --force` a `main` que pasa porque le falta una llave—.
Que Antigravity mande un JSON truncado es *hipótesis* poco probable en el camino normal, pero un cambio de
formato, un payload cortado por un búfer o una invocación a mano bastan, y ninguno avisa. R27 no pide que
el caso sea probable; pide que lo que no se entiende no pase.

## Contexto de descubrimiento

Apareció al cerrar el 190 (2026-09-23): buscando quién más leía el descriptor 0 con
`readFileSync(0` sobre `engine/` y `automatization/`, salieron dos archivos, `engine/hooks/input.js` —el que
arreglaba el 190— y este puente, que tiene su propia copia. Medirlo mostró además el `allow` ante un JSON
ilegible, que el 190 no tenía porque el motor ya bloqueaba ahí.

## Relacionados

- **190** — el mismo colgado en el motor, arreglado con lectura asíncrona y plazo al primer byte. Su cierre
  deriva este caso.
- `sistema R27` — cerrado por defecto: una entrada ilegible no autoriza.
- `sistema R11` — una razón en un solo lugar: pesa sobre si el puente copia el lector o reusa el del motor.

## Cierre

**Resuelto en 0.99.0 reusando el lector del motor, sin copia**: el puente lee con el `readInput` de
`engine/hooks/input.js`, el mismo del 190, así que hereda el plazo al primer byte y el rechazo del JSON
ilegible. Recorriendo lo que el caso enumeró:

- **Fix propuesto → se hizo distinto de las dos formas, y sin la copia de ninguna.** La premisa de la forma 1
  —que sin `OPS_ROOT` no se sabe dónde está el motor sin leer la entrada— resultó cierta sólo a medias:
  `declaredRoot(markers)` ya resuelve sin la entrada en los dos caminos que existen, la raíz que `install`
  escribió y la carpeta de la que cuelga el puente, que desde el fuente es el propio repositorio. El puente
  busca ahí `engine/hooks/input.js` con la misma cascada con que ya buscaba `run.js` (`engineAt`, antes
  inlineada en `runtimeAt`) y lee con él (`hook.js`, `inputReader` y `main`). Una primera versión agregaba un
  segundo candidato relativo al paquete; una mutación que lo rompía sobrevivió, porque desde el fuente
  `declaredRoot` ya llega al mismo lugar, y se quitó. La forma 2 —copia más una prueba de paridad— se
  descartó por R11: la razón de cómo se lee stdin queda en un solo archivo.
- **Lo único que cambia entre los dos lectores es cómo invocarlo a mano**, y eso pasó a ser un parámetro de
  `readInput` (`usage`, con el texto de siempre por defecto): el puente dice `printf … | node hook.js
  <evento>` con el JSON de Antigravity en vez del de un guard.
- **JSON ilegible → `deny`** en `pre-shell` y `pre-files`, con el motivo del motor («la entrada del hook no es
  JSON válido (…)»). Nunca `allow`: R27.
- **Tradeoff de `stop` ante una entrada que no se lee → `stop` con la razón a la vista**, como el caso
  proponía. El motor marca esa falla `blocked`, que en `evaluate` daría `continue` y ataría al agente a una
  entrada que reintentar no arregla; `main` la trata como falla del puente (`refusal(event, message, false)`).
  Antes salía `{"decision":"stop"}` sin razón.
- **Plazo agotado → `deny`** con el motivo y cómo invocarlo a mano; en `stop`, `stop` con ese motivo.
- **Un `{}` legítimo sigue permitiendo → se mantuvo, con la razón.** `</dev/null` y stdin cerrado dan
  `allow`, como en el motor. No es un `allow` sobre una llamada que el guard debía juzgar: sin entrada no hay
  llamada descrita, y los guards caen a `OPS_HOOK_COMMAND`/`OPS_HOOK_FILE`, que es como se los invoca a mano.
  Antigravity no manda stdin vacío en una llamada a herramienta; si lo mandara, eso ya es la forma
  desconocida del punto siguiente.
- **Payload JSON válido con campos que `normalize()` no reconoce → no se cubrió acá**, como el caso
  anticipaba: decidir qué campos son obligatorios por evento es una decisión de producto, no parte de este
  arreglo. **Salió como caso propio: el 200.**
- **Qué hace `agy` con stdin → sigue siendo hipótesis**, no comprobable sin instalar el puente y correr una
  sesión real. Lo que cambió es el costo de que sea falsa: antes cada llamada se colgaba, ahora se niega a
  los 2 s con el motivo escrito.
- **Prioridad → ya no aplica**: el `push --force` sin la última llave se niega (forma D abajo).
- **R11 (copia o reuso) → reuso**, con el encabezado de `input.js` nombrando al puente como consumidor.

**Lo que el caso no preveía.** Una raíz declarada que dejó de existir falla ahora al leer y no al juzgar: el
puente ya no puede buscar la raíz desde la entrada antes de leerla. No cambia la respuesta —antes
`findRoot` tampoco la encontraba, porque Antigravity manda `workspacePaths` vacío y un `Cwd` que apunta al
home—, y el mensaje nombra la raíz declarada y pide reinstalar. Y la prueba nueva, al lanzar el puente del
fuente como proceso, es la primera que le atribuye cobertura a su `main()`: los pisos de
`automatization/runners/antigravity/hook.js` suben a 97/84/95 (`test/tools/coverage-baseline.json`, razón
en `test/tools/coverage-files.js`).

### Qué se corrió

- **La reproducción del caso, formas A–G, contra el puente arreglado** (2026-09-23, Node v24.18.0, Linux
  6.8, desde la raíz del worktree):

  ```
  A pipe abierto:
  {"decision":"deny","reason":"Cauce: no llegó nada por stdin en 2000 ms: stdin está abierto y nadie escribe (…). Un guard que no sabe qué juzgar no autoriza. Para invocarlo a mano, pasale el JSON de Antigravity —printf '%s' '{\"toolCall\":{\"args\":{\"CommandLine\":\"…\"}}}' | node hook.js pre-shell— o correlo sin entrada con </dev/null."}
     exit 0
  B /dev/null:
  {"decision":"allow"}
     exit 0
  C JSON válido que bloquea:
  {"decision":"deny","reason":"Cauce: 'git push --force' reescribe historia ya publicada. R8 lo prohíbe y runner.allowPush no lo habilita: …"}
  D el mismo JSON sin la última llave:
  {"decision":"deny","reason":"Cauce: la entrada del hook no es JSON válido (Expected ',' or '}' after property value in JSON at position 67 (line 1 column 68))."}
  E JSON ilegible en pre-files:
  {"decision":"deny","reason":"Cauce: la entrada del hook no es JSON válido (Expected ',' or '}' after property value in JSON at position 61 (line 1 column 62))."}
  F JSON ilegible en stop:
  {"decision":"stop","reason":"Cauce: la entrada del hook no es JSON válido (Expected property name or '}' in JSON at position 1 (line 1 column 2))."}
  C' JSON válido inocuo:
  {"decision":"allow"}
  G socket:
     fd0: socket:[291582947] wchan: ep_poll
     {"decision":"deny","reason":"Cauce: no llegó nada por stdin en 2000 ms: …"} exit 0 null a los 2024 ms
  leftovers: ninguno
  ```

  A pasó de `exit 124` a `deny` antes del `timeout 3`; D, E y F dejaron de permitir; G ya no duerme en
  `unix_stream_data_wait` sino en el `ep_poll` del bucle de eventos, y termina solo a los 2 s.
- **La prueba nueva, `test/wiring/bridge-stdin.test.js`**, lanza el puente como proceso en nueve formas
  —socket y pipe abiertos; push forzado válido; el mismo sin la última llave; ilegible en `pre-files` y en
  `stop`; JSON inocuo; `/dev/null`; stdin cerrado— y prueba `inputReader` sin raíz declarada. Cada hijo
  tiene su tope y se mata al final; `pgrep` no encontró ningún puente vivo después de ninguna tanda.
  **En rojo sobre el código de 0.98.0**: 7 de 12 —socket y pipe «no terminó solo en 8000 ms», y los tres
  ilegibles `'allow' !== 'deny'` o `stop` sin razón—; las tres de «stdin que termina» y el push forzado
  válido pasaban, que es lo que no debía cambiar.
- **Seis mutaciones en una copia del árbol, las seis en rojo**: ilegible o plazo agotado leídos como `{}`
  (fallan socket, pipe y los tres ilegibles); sin plazo (fallan socket y pipe, a los 8 s del tope); la falla
  de lectura tratada como bloqueo (falla `stop`, que da `continue`); sin el `usage` del puente (falla el
  socket, que ya no nombra `hook.js pre-shell`); el motor devolviendo `{}` ante JSON ilegible (fallan los
  tres ilegibles del puente, además de la prueba del motor); sin la guarda del lector ausente (falla
  `inputReader`, que tira el error genérico de `require`).
- **Los pisos**: la suite entera sin la prueba nueva mide 84/77/83 en `hook.js` y con ella 100/85/100, en
  dos corridas; con los pisos en 97/84/95 quitarla hace caer los tres.
- `npm run ci`, exit 0, 981 pruebas.

### Prueba real en un banco instalado (2026-09-23)

Banco: `ops bench sidecar` copiado fuera del árbol de Cauce con el layout de gouduet —instancia y producto en repositorios hermanos—, `automation install` del runner y los guards invocados por los shims instalados, como los invoca el runner. Control: el mismo input con el motor 0.98.0 de gouduet-ops, cambiando sólo el enlace del banco. El puente **instalado** por `automation install . antigravity`: un `push --force` sin la última llave y un stdin abierto reciben `deny` con la rama; con el puente de 0.98.0, `allow` y colgado hasta el `timeout` (124). `automation doctor` pasa. **Sesión real de `agy` 1.1.16** (`agy -p`, con el plugin del banco registrado por `agy plugin install`): el `git push --force` recibió «tool call denied by pre-tool hook: Cauce: 'git push --force' reescribe historia ya publicada…», y la escritura de un `.env.local` por `write_to_file` recibió la negativa del guard de secretos con la redacción sin chat del 194. Las llamadas legítimas (`git status`, `ls`) pasaron con `allow`. `agy` manda siempre JSON bien formado, así que el JSON roto sólo se puede medir con el puente, como arriba.
