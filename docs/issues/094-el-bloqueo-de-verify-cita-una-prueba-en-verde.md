---
caso: 094
titulo: El bloqueo de verify cita una prueba en verde cuando su nombre contiene «error»
estado: resuelto
resuelto-en: 0.80.0
prioridad: media
version-detectada: 0.79.0
---

# 094 — `fallo()` elige la primera línea que dice «error», y un nombre de prueba lo dice

**🟢 resuelto en 0.80.0** · detectado en 0.79.0 · prioridad **media** — no deja pasar nada; manda a buscar el fallo donde
no está. Sube a **alta** si otro proyecto con `node --test` o `jest` nombra sus pruebas en lenguaje natural,
que es lo común

## Resumen

Cuando un gate falla, `verify` muestra una sola línea de su salida para que se sepa qué pasó. La elige
`fallo()` como la primera que coincide con `/error|err[_!]|fail|abort|not found|cannot|no such/i`
(`engine/hooks/shell.js:524-535`). Un reporte de pruebas lista **todas** las pruebas, las verdes también, y
basta que el nombre de una verde lleve la palabra «error» para que gane.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable: un repo con una suite real de `node --test` —una
prueba verde que nombra «error» y una que falla— y `verify` sobre el commit.

```bash
BANCO=$(mktemp -d)
env -u CLAUDE_PROJECT_DIR -u GIT_DIR -u GIT_WORK_TREE BANCO="$BANCO" node - <<'EOF'
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process')
const root = path.join(process.env.BANCO, 'acme')
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
fs.mkdirSync(path.join(root, 'planning'), { recursive: true })
fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'acme', mode: 'embedded',
  workspaceRoots: [{ name: 'main', path: '.' }] }))
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
fs.writeFileSync(path.join(root, 'alta.test.js'), "const test = require('node:test')\n"
  + "const assert = require('node:assert')\n"
  + "test('el error de validación se informa al usuario', () => assert.ok(true))\n"
  + "test('el alta guarda el cliente', () => assert.equal(1, 2))\n")
git('init', '-q'); git('config', 'user.email', 'b@b'); git('config', 'user.name', 'b')
git('add', 'package.json', 'alta.test.js')
process.env.OPS_ROOT = root
const { execute } = require('./engine/hooks/run')
try { execute('verify', { cwd: root, tool_input: { command: 'git commit -m x' } }); console.log('PASA') }
catch (e) { console.log(e.message.split('\n')[0].replace(process.env.BANCO, '<banco>')) }
EOF
```

## Síntoma

Salida real, 2026-09-11, sobre `main` = `3faf7b3a`:

```
Verify falló en acme: test (exit 1, 0.2 s): ✔ el error de validación se informa al usuario (0.591842ms)
```

La prueba que falló es `el alta guarda el cliente`, y no aparece. En este repositorio pasó lo mismo el
2026-09-10, dos veces seguidas: el guard citó `✔ el error de --bench dice qué hacer…` mientras lo que fallaba
era otra cosa (093 y 095), y encontrarla costó cinco corridas.

## Causa raíz

`fallo()` descarta el eco de npm (`>`) pero no distingue una línea de resultado exitoso de una de fallo, y
toma la primera coincidencia por palabra (`shell.js:533`).

## Marcas de resultado, comprobadas

Qué escribe cada herramienta al lado del nombre de una prueba, corrido el 2026-09-11 en esta máquina:

| herramienta | verde | roja | registro |
|---|---|---|---|
| `node --test`, reporter por defecto (spec, también con la salida entubada) | `✔ nombre` | `✖ nombre` | verificado, Node 24.18.0 |
| `node --test --test-reporter=tap` | `ok 1 - nombre` | `not ok 2 - nombre` | verificado, Node 24.18.0 |
| `go test` (`-v` para las verdes) | `--- PASS: TestX` | `--- FAIL: TestX` | verificado, go 1.26.3 |
| `pytest`, `jest`, `vitest`, `mocha` | — | — | no instalados acá: sin comprobar |

## Fix propuesto

Antes de buscar por palabra, elegir la primera línea con una marca de **fallo** comprobada: `✖`, `not ok`,
`--- FAIL:`. Si no hay ninguna, la búsqueda por palabra sigue, pero saltea las líneas con una marca de
**éxito** comprobada: `✔`, `ok `, `--- PASS:`.

Sólo entran marcas verificadas. Para las herramientas de la última fila la conducta es la de hoy —la búsqueda
por palabra—, así que no empeora, y sumar una es comprobarla y agregarla a la tabla.

## Tradeoffs

- Una lista de marcas envejece. Lo que no coincida con ninguna cae en la búsqueda por palabra de hoy.
- Saltear las líneas con `✔` podría esconder un error real que alguien imprima con ese prefijo; es
  improbable, y el volcado completo sigue disponible corriendo el gate a mano.

## Qué tiene que probar el cierre

- Con la suite real de la reproducción, el bloqueo cita `✖ el alta guarda el cliente` y no la verde.
- Lo mismo con el reporter TAP de Node y con la salida de `go test`.
- Una verde que dice «error» seguida de un error sin marca: se cita el error, no la verde. Es lo que observa la
  segunda mitad del arreglo, que la primera no toca.
- El camino sin suite —una herramienta que falla antes de correr pruebas— sigue citando su error, que es lo
  que ya cuida la prueba `un gate que falla dice cuánto tardó y qué dijo la herramienta`.

## Contexto de descubrimiento

2026-09-10, commiteando el arreglo del 088: el guard frenó dos veces citando una prueba verde, y la real
recién apareció reproduciendo el entorno del guard a mano (caso 093).

2026-09-11, al mejorarlo antes de arreglarlo: la reproducción apuntaba al procedimiento del 093 en vez de
tener una propia, y las marcas del fix propuesto estaban escritas de memoria. Se reemplazó por una suite real
y se comprobaron las marcas contra las herramientas que hay instaladas.

## Relacionados

- **093** — el fallo que este mensaje escondió.
- **066** — el caso que decidió mostrar una sola línea; este caso no discute eso, discute cuál.

## Cierre

**🟢 resuelto en 0.80.0** · `engine/hooks/shell.js`, `test/wiring/hooks.test.js`

### Contra lo que el caso enumeró

- **Fix propuesto** — hecho: `fallo()` elige primero la línea con una marca de fallo de la tabla
  (`FAILED_TEST`) y, si no hay, busca por palabra salteando las marcadas como éxito (`PASSED_TEST`). Sólo
  entran las marcas comprobadas.
- **Las herramientas sin comprobar** — quedan como estaban: sin marca en la tabla, su salida pasa por la
  búsqueda por palabra, que ahora sólo se diferencia en no elegir una línea con marca de éxito comprobada.
- **Tradeoff «la lista envejece»** — se cumple; el comentario de las marcas dice que van sólo las comprobadas,
  que es la regla para sumar una.
- **Tradeoff «saltear `✔` podría esconder un error»** — se cumple como estaba descrito; no se midió un caso
  real que lo haga, y no hay uno en esta suite.
- **Cada ítem de «Qué tiene que probar el cierre»** — hechos los cuatro: la suite real en spec y en TAP, la
  salida de `go test`, la verde con «error» seguida de un error sin marca, y la prueba del camino sin suite,
  que sigue en verde.

### Lo que el caso no preveía

**La salida de `go test` sin `-v` no observa su marca.** La primera versión de la prueba imprimía
`--- PASS:` y `--- FAIL:` solos, y la mutación que saca `--- FAIL:` de la lista sobrevivió: la línea dice
«FAIL» y la búsqueda por palabra la encontraba igual. Con `-v`, que es como se corre en CI con salida
detallada, la primera línea es `=== RUN   TestElErrorSeInforma` —sin marca, y dice «Error»—, y ahí sólo la
marca evita citarla. Se reemplazó por la salida real de `go test -v` con go 1.26.3, copiada de una corrida.

### Qué se corrió

- **El rojo previo**: con la prueba nueva escrita y `fallo()` sin tocar, `node --test
  --test-name-pattern="cita la prueba que falló" test/wiring/hooks.test.js` dio 0 de 1.
- **La reproducción del propio caso**, después del arreglo:

  ```
  Verify falló en acme: test (exit 1, 0.2 s): ✖ el alta guarda el cliente (0.530976ms)
  ```
- `node --test test/wiring/hooks.test.js`: 65 de 65.
- **Cinco mutaciones, en una copia desechable del repositorio (R23)**, comprobadas aplicadas antes de
  contar, contra una base en verde. En la primera tanda sobrevivió M4 —el porqué, arriba—; la tanda final:

  ```
  M1 sin preferir la marca de fallo    fail 1 → ROJA
  M2 sin saltear la marca de éxito     fail 1 → ROJA
  M3 sin la marca not ok de TAP        fail 1 → ROJA
  M4 sin la marca --- FAIL: de go      fail 1 → ROJA
  M5 sin la marca ✖ de spec            fail 1 → ROJA
  ```
- `npm run ci`: código 0, 682 de 682, cobertura de 58 archivos en su piso o por encima.
