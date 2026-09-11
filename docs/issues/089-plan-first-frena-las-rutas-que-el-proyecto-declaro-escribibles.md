---
caso: 089
titulo: plan-first frena las rutas que el proyecto declaró escribibles, y su aprobación pide otra forma de ruta que la de commit
estado: abierto
prioridad: media
version-detectada: 0.79.0
---

# 089 — `writableOutsideRoots` levanta un guard y el siguiente vuelve a frenar la misma escritura

**🔴 abierto** · detectado en 0.79.0 · prioridad **media** — no deja pasar nada que no deba; frena lo que
el proyecto ya autorizó, y la salida que enseña se escribe distinto según qué guard la lea

## Resumen

Una instancia declara en `writableOutsideRoots` una carpeta fuera de sus raíces —en el caso medido, las
carpetas de casos de dos herramientas a las que el proyecto les reporta defectos—. Eso levanta el límite
de `workspace-boundary`, como promete el schema. La escritura siguiente la frena `plan-first`.

Escribir un caso sobre otra herramienta no es producto ni trabajo de una tarea. Pero `plan-first` sólo
exime lo que vive **dentro** de la instancia (`opsOwned`, `engine/hooks/files.js:147`) y lo aprobado
(`:182`). La declaración del proyecto no la consulta nadie más que el límite de raíces
(`engine/hooks/input.js:249`) y `check` (`engine/cli/planning.js:118`).

Y la salida que el mensaje enseña —aprobar la ruta en `planning/.ops-approval`— tiene una segunda
trampa: sólo pega escrita **absoluta**, que no es la forma en que la escriben los guards de commit.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable: una instancia sidecar con WIP en IDLE, una tarea
en el backlog (así `hasTasks` no deja el guard inerte) y una carpeta declarada fuera de raíces.

```bash
BANCO=$(mktemp -d)
env -u CLAUDE_PROJECT_DIR BANCO="$BANCO" node - <<'EOF'
const fs = require('node:fs'), path = require('node:path')
const { writeWip } = require('./test/support/environment')
const base = process.env.BANCO, root = path.join(base, 'acme-ops')
const afuera = path.join(base, 'otra-herramienta', 'docs', 'issues')
for (const d of [path.join(root, 'planning'), afuera, path.join(base, 'app')]) fs.mkdirSync(d, { recursive: true })
fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar',
  workspaceRoots: [{ name: 'app', path: '../app' }], writableOutsideRoots: [afuera] }))
fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), '# Backlog promovido\n\n## Hito primero — Primer resultado\n\n'
  + '- [ ] **alta-de-cliente** [lite] — Alta. _Aceptación: responde 201._ (service: api)\n')
writeWip(path.join(root, 'planning'), 'status: IDLE\n')
process.env.OPS_ROOT = root
const { execute } = require('./engine/hooks/run')
const run = (label, guard, file) => {
  try { execute(guard, { cwd: root, tool_input: { file_path: file } }); console.log(`PASA   ${label}`) }
  catch (e) { console.log(`FRENA  ${label}\n       ${e.message.split('\n')[0].replace(base, '<banco>')}`) }
}
const caso = path.join(afuera, '088.md')
const aprobar = (linea) => fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), `${linea}\n`)
run('boundary, ruta declarada', 'workspace-boundary', caso)
run('plan-first, ruta declarada, IDLE', 'plan-first', caso)
aprobar(path.relative(root, caso)); run(`plan-first, aprobada relativa (${path.relative(root, caso)})`, 'plan-first', caso)
aprobar(caso); run('plan-first, aprobada absoluta', 'plan-first', caso)
fs.rmSync(path.join(root, 'planning', '.ops-approval'))
writeWip(path.join(root, 'planning'), '---\ntask: alta-de-cliente\nphase: Build\nservice: api\n---\n\n## Plan aprobado\n1. [ ] x\n')
run('plan-first, ruta declarada, WIP con plan', 'plan-first', caso)
EOF
```

## Síntoma

Salida real de la reproducción, 2026-09-10, sobre 0.79.0 (la ruta del banco reemplazada por `<banco>`):

```
PASA   boundary, ruta declarada
FRENA  plan-first, ruta declarada, IDLE
       <banco>/otra-herramienta/docs/issues/088.md cambia el producto sin plan. WIP está en IDLE, así que el plan todavía no está escrito.
FRENA  plan-first, aprobada relativa (../otra-herramienta/docs/issues/088.md)
       <banco>/otra-herramienta/docs/issues/088.md cambia el producto sin plan. WIP está en IDLE, así que el plan todavía no está escrito.
PASA   plan-first, aprobada absoluta
PASA   plan-first, ruta declarada, WIP con plan
```

**Una exención declarada que vale a medias.** Quien lee el schema —*«Rutas que el proyecto declara
escribibles sin ser raíces de código —la memoria del runner, un scratchpad, un directorio de salida—»*—
entiende que declarar alcanza. Alcanza para el primer guard. Cada escritura posterior pide una
aprobación por archivo, que no es lo que la declaración decía. Los tres ejemplos del propio schema caen
en esto: son justamente lo que no es trabajo de una tarea.

**Y el guard decide por un dato que no tiene que ver con la ruta.** La última línea: con una tarea con
plan en el WIP, `planFirst` retorna antes del bucle (`files.js:167`) y la misma escritura pasa. Escribir
un caso sobre otra herramienta se permite o se frena según haya o no una tarea abierta, que es
independiente de si esa escritura es producto.

**La aprobación enseña a apagar el guard.** Si la ruta relativa no pega y el mensaje no dice por qué,
la salida que queda a mano es `OPS_PLAN_FIRST_OVERRIDE=1`, que apaga el guard toda la sesión — lo que
la aprobación por ruta vino a evitar.

## Causa raíz

Dos, independientes:

1. **`planFirst` no conoce `writableOutsideRoots`.** El bucle de `files.js:180-184` exime sólo
   `opsOwned` y lo aprobado. La lista declarada vive en `engine/config/paths.js:21` y sólo la consumen
   el límite de raíces (`input.js:249`) y `check` (`planning.js:118`).
2. **La aprobación se coteja como string literal.** `pending()` hace `approved.has(file)`
   (`engine/hooks/approval.js:40-41`), y cada guard le pasa la forma que tiene a mano: absoluta en
   `plan-first`, porque Write y Edit mandan la ruta absoluta (`files.js:28`, `:182`); relativa **al
   repositorio del commit** en los de commit, que cotejan `stagedForCommit(...).staged`
   (`engine/hooks/shell.js:343` y `:481`). `AGENTS.md` —en la tabla «Cuando un guard te frena con
   razón»— no dice qué forma lleva cada fila.

## Fix propuesto

**1. Lo declarado no es producto.** En el bucle de `planFirst`, antes de exigir plan:

```diff
  for (const raw of filesOf(input)) {
-   if (opsOwned(root, path.resolve(cwdOf(input), raw))) continue
+   const file = path.resolve(cwdOf(input), raw)
+   if (opsOwned(root, file)) continue
+   if (declaredWritable(root, file)) continue   // writableOutsideRoots, resuelto por config/paths.js
    if (approved(input, raw)) continue
```

Una ruta declarada fuera de raíces no es código de ningún `workspaceRoot`, así que no hay plan de
producto que exigirle. El límite que la protege es la declaración misma, que `check` muestra en cada
corrida. Hay una forma más general, que discute el 090: que `plan-first` juzgue sólo lo que cae dentro
de un `workspaceRoot`. Cerraría este punto sin nombrar `writableOutsideRoots`; se elige allá o acá, no
en los dos.

**2. El bloqueo imprime la línea exacta a pegar.** Es el arreglo de la segunda causa, no un parche
mientras llega otro: `plan-first` ya tiene la ruta resuelta, y decir `Aprobalo con esta línea: <ruta
absoluta>` elimina la adivinanza sin cambiar la semántica del cotejo.

**Lo que no conviene: normalizar resolviendo contra la raíz de ops.** La primera redacción de este caso
proponía resolver cada línea relativa de `.ops-approval` contra la raíz de ops. En sidecar eso rompe las
aprobaciones de commit que hoy funcionan: el archivo se lee de la raíz de ops (`approval.js:32`,
`read(root)` con `root = opsRoot(input)`), pero las rutas del índice son relativas al repositorio de
producto, que en sidecar es otro. Una línea `openapi/api.yaml` se resolvería a
`<ops>/openapi/api.yaml` y dejaría de coincidir. Registro: **leído en el código, no corrido**. Si se
quisiera normalizar igual, cada línea tiene que resolverse contra **cada** base que el guard tenga a
mano —la raíz de ops y el `dir` del commit—, y una aprobación relativa pasa a valer en dos lugares a
la vez, que es una ampliación de alcance a decidir.

## Tradeoffs

- **1 amplía lo que pasa sin plan.** Es lo que el proyecto declaró, y está a la vista en `check`. El
  riesgo real es declarar una raíz de producto como `writableOutsideRoots` para esquivar el plan, y
  **hoy nada lo impide**: `check` sólo avisa que la ruta está exenta (`planning.js:118-121`), no
  rechaza que caiga dentro de un `workspaceRoot`. Rechazarlo es parte de este fix o se decide que no,
  con la razón; no es una salvaguarda que ya exista.
- **2 alarga el mensaje.** Una línea más en un bloqueo que ya trae el texto de `AP.HOW`. Es la línea
  que hoy falta.

## Qué tiene que probar el cierre

- Junto a `guard-plan-first no juzga lo que la instancia posee` (`test/wiring/hooks.test.js:1446`): la
  ruta declarada pasa con WIP en IDLE, y una hermana **no declarada** que empieza igual sigue frenada.
- El fix 1 es una quita —deja de frenar algo que hoy frena—, así que su aserción se ve en rojo
  devolviendo el bloqueo (R9).
- El mensaje del fix 2 contiene la ruta absoluta que después, pegada en `.ops-approval`, destraba la
  misma escritura: la prueba pega lo que el mensaje dice, no una ruta armada aparte.

## Contexto de descubrimiento

Instancia real (sidecar, 0.79.0), 2026-09-10. El operador declaró escribibles las carpetas de casos de
dos herramientas a las que el proyecto les reporta defectos, para poder escribirlos desde ahí. El
primer caso (088) necesitó varios intentos: el límite de raíces, la edición de `ops.config.json` para
declarar la ruta —que `plan-first` también frenó, y que es el 090—, `plan-first` sobre el caso, la
aprobación relativa que no pegó y la absoluta. Este caso mismo pasó por lo mismo para poder escribirse.

La primera redacción mezclaba en un solo paso de la reproducción las dos escrituras —la del config y la
del caso—; al reproducirlo en un banco se separaron, y la del config salió como caso propio.

## Relacionados

- **088** — se descubrió escribiéndolo.
- **090** — la edición de `ops.config.json` que declara la ruta la frena el mismo guard. Comparten la
  pregunta de qué es producto para `plan-first`, y el fix general de allá cerraría el punto 1 de acá.
- **`engine/hooks/approval.js`** — su encabezado ya dice que *«quién las mira lo decide qué guard esté
  juzgando esa ruta»*; lo que falta es que la forma de la ruta no dependa también de eso.
