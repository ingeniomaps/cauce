---
caso: 089
titulo: plan-first frena las rutas que el proyecto declaró escribibles, y su aprobación pide otra forma de ruta que la de commit
estado: resuelto
resuelto-en: 0.80.0
prioridad: media
version-detectada: 0.79.0
---

# 089 — `writableOutsideRoots` levanta un guard y el siguiente vuelve a frenar la misma escritura

**🟢 resuelto en 0.80.0** · detectado en 0.79.0 · prioridad **media** — no deja pasar nada que no deba; frena lo que
el proyecto ya autorizó, y la salida que enseña se escribe distinto según qué guard la lea

## Resumen

Dos defectos, y el primero ya está cerrado.

1. **`plan-first` frenaba las rutas declaradas en `writableOutsideRoots`.** Lo cerró el **090**: desde
   0.80.0, una ruta fuera de toda raíz no es producto. La reproducción original de este caso, corrida
   sobre `main` después de ese arreglo, da `PASA` en las cinco líneas.
2. **La aprobación en `planning/.ops-approval` se escribe distinto según qué guard la coteje, y el
   bloqueo no dice cuál forma.** Cada guard compara el string que tiene a mano: `plan-first` la ruta
   absoluta que manda la herramienta, `governance` la ruta relativa al repositorio del commit. Lo que
   pega uno no pega el otro. Y dos guards —`verify` y `dependencies`— ni siquiera muestran la línea que
   habría que escribir.

## Reproducción

Del punto 2, desde un checkout de Cauce, sobre un banco desechable: una instancia embedded con un repo
git, WIP en IDLE y una tarea en el backlog; un archivo de producto que `plan-first` frena y uno gobernado
staged que `governance` frena al commitear. Cada uno se aprueba en las dos formas.

```bash
BANCO=$(mktemp -d)
env -u CLAUDE_PROJECT_DIR -u GIT_DIR -u GIT_WORK_TREE BANCO="$BANCO" node - <<'EOF'
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process')
const { writeWip } = require('./test/support/environment')
const root = path.join(process.env.BANCO, 'acme')
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })
fs.mkdirSync(path.join(root, 'planning'), { recursive: true }); fs.mkdirSync(path.join(root, 'engine'))
fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ project: 'acme', mode: 'embedded',
  workspaceRoots: [{ name: 'main', path: '.' }] }))
fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), '# Backlog promovido\n\n## Hito primero — Primer resultado\n\n'
  + '- [ ] **alta-de-cliente** [lite] — Alta. _Aceptación: responde 201._ (service: api)\n')
writeWip(path.join(root, 'planning'), 'status: IDLE\n')
git('init', '-q'); git('config', 'user.email', 'b@b'); git('config', 'user.name', 'b')
fs.writeFileSync(path.join(root, 'engine', 'x.js'), 'module.exports = 1\n')
git('add', 'engine/x.js')
process.env.OPS_ROOT = root
const { execute } = require('./engine/hooks/run')
const run = (label, guard, input) => {
  try { execute(guard, input); console.log(`PASA   ${label}`) }
  catch (e) { console.log(`FRENA  ${label}\n       ${e.message.split('\n')[0].replace(process.env.BANCO, '<banco>')}`) }
}
const aprobar = (linea) => fs.writeFileSync(path.join(root, 'planning', '.ops-approval'), `${linea}\n`)
const producto = path.join(root, 'src', 'altas.js')
const write = { cwd: root, tool_input: { file_path: producto } }
const commit = { cwd: root, tool_input: { command: 'git commit -m x' } }
for (const [forma, linea] of [['relativa', 'src/altas.js'], ['absoluta', producto]]) {
  aprobar(linea); run(`plan-first, aprobada ${forma}`, 'plan-first', write)
}
for (const [forma, linea] of [['relativa', 'engine/x.js'], ['absoluta', path.join(root, 'engine', 'x.js')]]) {
  aprobar(linea); run(`governance, aprobada ${forma}`, 'governance', commit)
}
EOF
```

## Síntoma

Salida real, 2026-09-11, sobre `main` = `fd5e540c` (0.80.0 sin publicar):

```
FRENA  plan-first, aprobada relativa
       <banco>/acme/src/altas.js cambia el producto sin plan. WIP está en IDLE, así que el plan todavía no está escrito.
PASA   plan-first, aprobada absoluta
PASA   governance, aprobada relativa
FRENA  governance, aprobada absoluta
       El commit toca gobernanza protegida:
```

Cada guard acepta exactamente la forma que el otro rechaza. Y el texto común de la salida angosta,
`AP.HOW` (`engine/hooks/approval.js:46-48`), dice *«Aprobalo escribiendo esa(s) ruta(s)»* sin decir cuáles
ni en qué forma. Qué muestra cada bloqueo contra qué coteja:

| guard | coteja | el bloqueo muestra |
|---|---|---|
| `plan-first` | la ruta tal como llega de la herramienta —absoluta con Write y Edit— (`files.js:204`) | esa misma ruta, sin decir que es la línea a pegar |
| `test-evidence` | la ruta del `*** Delete File:` del patch (`files.js:127`) | esa misma ruta |
| `migrations` | la ruta con `\` pasadas a `/` (`files.js:275-277`) | la ruta cruda: en Windows, otra |
| `dependencies` | `<carpeta>/<manifest>`, relativo al repo (`shell.js:183-184`) | `<carpeta>: cambió <manifest>`: la línea no aparece |
| `governance` | lo staged, relativo al repo (`shell.js:349`) | la lista exacta de lo pendiente |
| `verify` | todo lo staged, relativo al repo (`shell.js:491`) | ninguna ruta, en sus tres bloqueos |

Si la ruta que se escribió no pega y el mensaje no dice por qué, la salida que queda a mano es la variable
que apaga el guard toda la sesión, que es lo que la aprobación por ruta vino a evitar.

## Causa raíz

`pending()` compara strings (`engine/hooks/approval.js:39-41`), y cada guard le pasa la forma que tiene a
mano. Eso por sí solo no es un defecto —cada guard es coherente consigo mismo—; lo es que el mensaje no
diga la línea exacta, y que dos guards no la muestren en ningún lado.

## Fix propuesto

**El bloqueo imprime las líneas a pegar, en la forma que ese guard coteja.** `AP.HOW` recibe la lista y la
imprime tal cual; cada guard le pasa exactamente lo que va a comparar —`plan-first` la ruta cruda,
`migrations` la normalizada, `dependencies` la unida con su carpeta, `governance` y `verify` lo pendiente de
lo staged—. Pegar lo que el mensaje dice pasa a destrabar siempre, sin cambiar la semántica del cotejo.

**Lo que no conviene: normalizar resolviendo contra la raíz de ops.** La primera redacción de este caso lo
proponía. En sidecar rompe las aprobaciones de commit que hoy funcionan: el archivo se lee de la raíz de ops
(`approval.js:33`, `read(root)` con `root = opsRoot(input)`), pero las rutas del índice son relativas al
repositorio de producto, que en sidecar es otro. Una línea `openapi/api.yaml` se resolvería a
`<ops>/openapi/api.yaml` y dejaría de coincidir. Registro: se leyó en el código y después se corrió —el cierre
dice cómo—. Normalizar de
verdad obliga a resolver cada línea contra **cada** base que el guard tenga a mano, y una aprobación
relativa pasa a valer en dos lugares a la vez, que es una ampliación de alcance a decidir aparte.

## Tradeoffs

- **El mensaje crece una línea por ruta.** En `verify` puede ser un commit entero; es la lista que hoy hay
  que adivinar.
- **Las rutas absolutas quedan a la vista en el mensaje.** Ya lo estaban en `plan-first`; ahora lo están en
  todos los que las cotejan así.

## Qué tiene que probar el cierre

- Para cada guard con salida angosta, **la prueba pega en `.ops-approval` lo que dice el mensaje** —no una
  ruta armada aparte— y el mismo bloqueo deja de dispararse.
- `dependencies` con el manifiesto dentro de una carpeta, que es donde la línea hoy no aparece.
- Ningún bloqueo vuelve a decir «esa(s) ruta(s)» sin nombrarlas: aserción de ausencia, vista en rojo con el
  texto viejo.
- Una mutación que haga que `AP.HOW` ignore las líneas tiene que ponerse en rojo.

## Contexto de descubrimiento

Instancia real (sidecar, 0.79.0), 2026-09-10. El operador declaró escribibles las carpetas de casos de
dos herramientas a las que el proyecto les reporta defectos, para poder escribirlos desde ahí. El
primer caso (088) necesitó varios intentos: el límite de raíces, la edición de `ops.config.json` para
declarar la ruta —que `plan-first` también frenó, y que es el 090—, `plan-first` sobre el caso, la
aprobación relativa que no pegó y la absoluta. Este caso mismo pasó por lo mismo para poder escribirse.

2026-09-11, al mejorarlo antes de arreglarlo: con el 090 en `main` la reproducción original ya no mostraba
nada, y rehacerla para el punto 2 mostró que el problema no es sólo de `plan-first` contra los guards de
commit —ésa era la forma en que se vio—: `verify` y `dependencies` no muestran la línea en ningún caso.

## Relacionados

- **090** — cerró el punto 1: con él, una ruta fuera de toda raíz ya no es producto para `plan-first`.
- **`engine/hooks/approval.js`** — su encabezado ya dice que *«quién las mira lo decide qué guard esté
  juzgando esa ruta»*; lo que faltaba es que el guard diga en qué forma la mira.

## Cierre

**🟢 resuelto en 0.80.0** · `engine/hooks/approval.js`, `engine/hooks/files.js`, `engine/hooks/shell.js`,
`test/wiring/hooks.test.js`

### Contra lo que el caso enumeró

- **Punto 1** — cerrado por el 090, antes que este arreglo: la reproducción original, sobre `main` =
  `fd5e540c`, da `PASA` en sus cinco líneas.
- **Fix propuesto** — hecho: `AP.HOW(variable, lines)` imprime *«Aprobalo pegando tal cual en
  planning/.ops-approval estas líneas:»* y debajo cada una. Los seis guards le pasan lo que cotejan:
  `plan-first` la ruta cruda, `test-evidence` la del archivo o la del patch, `migrations` la normalizada,
  `dependencies` la unida con su carpeta, `governance` lo pendiente —y deja de imprimir su lista aparte,
  que habría quedado dos veces— y `verify` lo pendiente de lo staged en sus tres bloqueos.
- **Lo que el arreglo no cambia, dicho para que no se lea de más**: el cotejo sigue aceptando una sola forma
  por guard. La reproducción del punto 2 da hoy lo mismo que antes, y es lo esperado: lo que cambió es que
  el mensaje dice cuál forma, y eso es lo que la prueba mide.
- **Normalizar** — se decidió que no, y el dato que lo sostiene se corrió en la revisión de huecos previa al
  merge. En un banco sidecar con el repositorio de producto aparte, `governance` frena sin aprobación y pasa
  con `engine/x.js` en el `planning/.ops-approval` de la instancia; esa misma línea resuelta contra la raíz de
  ops da `<banco>/acme-ops/engine/x.js`, y el archivo que el commit lleva es `<banco>/producto/engine/x.js`.
  Normalizar así rompería la aprobación que hoy funciona.
- **Tradeoff «el mensaje crece una línea por ruta»** — se cumple.
- **Tradeoff «las rutas absolutas quedan a la vista»** — se cumple.
- **Cada ítem de «Qué tiene que probar el cierre»** — hechos los cuatro, con las pruebas y mutaciones de
  abajo.

### Lo que el caso no preveía

- **`verify` corre sus gates en otra función.** El bloqueo por gate en rojo vive en `verifyGates`, que
  recibía un booleano `aprobado` y no la lista. El primer intento la usó fuera de alcance, y cinco pruebas de
  `verify` que ya existían lo marcaron como `sinAprobar is not defined`. Ahora `verifyGates` recibe la lista.
- **La primera versión de la prueba dejaba tres caminos sin observar**: el bloqueo por gate en rojo, la
  ruta de `migrations` con `\` y los dos bloqueos de `test-evidence`. Las mutaciones M6 y M7 sobrevivieron
  la primera tanda, y el recorrido de la enumeración encontró que `test-evidence` faltaba. Los tres se
  agregaron antes de cerrar.

### Qué se corrió

- **El rojo previo**: la prueba nueva, corrida contra `approval.js`, `files.js` y `shell.js` de `main` en una
  copia desechable, falló —el bloqueo no decía qué pegar—.
- **La prueba nueva**, `lo que un bloqueo dice pegar destraba ese mismo bloqueo`: para `plan-first`, los dos
  bloqueos de `test-evidence`, `governance`, `dependencies` con el manifiesto en `packages/app/`, `verify`
  por OpenAPI y por gate en rojo, y `migrations` con una ruta que llega con `\`, saca las líneas del mensaje,
  las agrega a `.ops-approval` y comprueba que el mismo bloqueo deja de dispararse. `node --test
  test/wiring/hooks.test.js`: 64 de 64.
- **Nueve mutaciones, en una copia desechable del repositorio (R23)**, comprobadas aplicadas antes de
  contar, contra una base en verde:

  ```
  M1 HOW ignora las líneas               fail 2 → ROJA
  M2 plan-first muestra otra forma       fail 1 → ROJA
  M3 dependencies sin la carpeta         fail 1 → ROJA
  M4 governance no nombra nada           fail 2 → ROJA
  M5 verify (OpenAPI) no nombra nada     fail 1 → ROJA
  M6 migrations muestra la cruda         fail 1 → ROJA
  M7 verify (gate) no nombra nada        fail 1 → ROJA
  M8 test-evidence no nombra nada        fail 1 → ROJA
  M9 HOW vuelve a aludir las rutas       fail 1 → ROJA
  ```

  M9 conserva las líneas y sólo devuelve la frase vieja: es la aserción de ausencia vista en rojo por sí
  sola. Una tanda anterior corrió sobre una base con cinco pruebas en rojo y no se usó: su conteo mezclaba
  ese rojo con el de las mutaciones.
- `npm run ci`: código 0, 681 de 681, cobertura de 58 archivos en su piso o por encima.
