---
caso: 090
titulo: plan-first frena ops.config.json de la instancia, que es justo donde el límite de raíces manda a declarar la salida
estado: resuelto
resuelto-en: 0.80.0
prioridad: media
version-detectada: 0.79.0
---

# 090 — El mensaje de `workspace-boundary` manda a editar un archivo que `plan-first` no deja editar

**🟢 resuelto en 0.80.0** · detectado en 0.79.0 · prioridad **media** — no deja pasar nada que no deba; convierte la
salida que un guard recomienda en un bloqueo del siguiente. Sube a **alta** si una instancia recién
creada con roadmap cargado no puede declarar su primera ruta sin aprobar a mano

## Resumen

Cuando `workspace-boundary` frena una escritura fuera de raíces, su mensaje dice cómo salir:
*«declaralo en writableOutsideRoots de ops.config.json»* (`engine/hooks/input.js:262`). Con WIP en IDLE
y tareas en el backlog, esa edición la frena `plan-first`: `ops.config.json` no está entre lo que la
instancia posee según el guard, así que lo trata como producto.

Es el candado con la llave adentro que el comentario de `OPS_OWNED` dice evitar
(`engine/hooks/files.js:139-144`): la exención existe para que escribir el plan no exija haberlo
escrito, y la configuración de la instancia quedó afuera. En sidecar le pasa lo mismo al resto de los
archivos de la raíz de la instancia: `AGENTS.md`, `CLAUDE.md`, `package.json`, `.gitignore`.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable: instancia sidecar, WIP en IDLE, una tarea en el
backlog.

```bash
BANCO=$(mktemp -d)
env -u CLAUDE_PROJECT_DIR BANCO="$BANCO" node - <<'EOF'
const fs = require('node:fs'), path = require('node:path')
const { writeWip } = require('./test/support/environment')
const base = process.env.BANCO, root = path.join(base, 'acme-ops')
for (const d of [path.join(root, 'planning'), path.join(base, 'app')]) fs.mkdirSync(d, { recursive: true })
fs.writeFileSync(path.join(root, 'ops.config.json'), JSON.stringify({ mode: 'sidecar',
  workspaceRoots: [{ name: 'app', path: '../app' }] }))
fs.writeFileSync(path.join(root, 'planning', 'BACKLOG.md'), '# Backlog promovido\n\n## Hito primero — Primer resultado\n\n'
  + '- [ ] **alta-de-cliente** [lite] — Alta. _Aceptación: responde 201._ (service: api)\n')
writeWip(path.join(root, 'planning'), 'status: IDLE\n')
process.env.OPS_ROOT = root
const { execute } = require('./engine/hooks/run')
try { execute('workspace-boundary', { cwd: root, tool_input: { file_path: path.join(base, 'notas', 'x.md') } }) }
catch (e) { console.log('boundary:', e.message.replace(base, '<banco>')) }
for (const f of ['ops.config.json', 'AGENTS.md', 'CLAUDE.md', 'package.json', '.gitignore', 'tools/ops.js',
  'organization/workspace.md', 'planning/BACKLOG.md', '../app/src/a.js']) {
  let r = 'PASA '
  try { execute('plan-first', { cwd: root, tool_input: { file_path: path.join(root, f) } }) } catch { r = 'FRENA' }
  console.log(`plan-first ${r} ${f}`)
}
EOF
```

La variante que importa es la raíz que escribe `init` en sidecar: cambiar `{ name: 'app', path: '../app' }`
por `{ name: 'main', path: '..' }` (`engine/cli/instance.js:99`).

## Síntoma

Salida real de la reproducción, 2026-09-10, sobre 0.79.0:

```
boundary: <banco>/notas/x.md está fuera de las raíces declaradas en ops.config.json. Si el proyecto necesita escribir ahí, declaralo en writableOutsideRoots de ops.config.json; cambiar de herramienta no lo autoriza.
plan-first FRENA ops.config.json
plan-first FRENA AGENTS.md
plan-first FRENA CLAUDE.md
plan-first FRENA package.json
plan-first FRENA .gitignore
plan-first PASA  tools/ops.js
plan-first PASA  organization/workspace.md
plan-first PASA  planning/BACKLOG.md
plan-first FRENA ../app/src/a.js
```

La primera línea recomienda editar `ops.config.json`; la segunda frena esa edición con *«cambia el
producto sin plan»*. La última es la conducta correcta —`app/` es un `workspaceRoot`, es producto— y
sirve de contraste: el guard trata igual el código del servicio y la configuración de la instancia.

Con la raíz por defecto, `..`, vuelta a correr el 2026-09-11 sobre la rama del 088: `plan-first` frena
los mismos cinco archivos de la instancia y deja pasar los mismos tres. Falta la línea de `boundary`
porque `notas/x.md` ya cae dentro de `..`; el bloqueo de `ops.config.json` aparece igual en cuanto la ruta
que se quiere declarar está fuera del directorio padre, que es el caso del 089.

La salida que queda es aprobar `ops.config.json` en `.ops-approval`, y sólo pega escrita absoluta (089).

## Causa raíz

`OPS_OWNED` es `[...TEMPLATE_PREFIXES, 'agents/']` (`files.js:145`), y `TEMPLATE_PREFIXES` son
**directorios**: `planning/`, `organization/`, `integrations/`, `flows/`, `automatization/`, `tools/`
(`engine/core/ownership.js:73-80`). Ningún archivo suelto de la raíz entra: ni `ops.config.json`, que
no viene del molde, ni los que sí vienen (`TEMPLATE_FILES`, `ownership.js:87`: `AGENTS.md`, `Makefile`,
`.gitattributes`), ni los que la instancia agrega (`CLAUDE.md`, `package.json`, `.gitignore`).

## Fix propuesto

Dos piezas, y la segunda tiene un borde que la primera redacción de este caso no vio.

**A. `ops.config.json` nunca es producto.** Se exime por nombre, relativo a la raíz de ops. Vale en los
dos modos: en embedded la raíz de ops es también la del producto, pero la configuración de la instancia no
es código de ningún servicio.

**B. `plan-first` juzga sólo lo que es código de una raíz declarada, y la instancia sidecar no lo es.**
Un archivo es producto si cae dentro de algún `workspaceRoot` **y** no está dentro de la raíz de ops —salvo
que la raíz de ops sea ella misma una de esas raíces, que es lo que pasa en embedded—.

- **La condición es doble por la raíz por defecto.** `init` escribe `path: '..'` en sidecar y `'.'` en
  embedded (`engine/cli/instance.js:99` y `:332`), así que en la instancia sidecar más común la carpeta de
  la instancia está **dentro** de su raíz. La primera redacción decía «en sidecar la raíz de ops no es un
  `workspaceRoot`» y lo medía con `../app`; con `..`, «juzgar sólo lo que cae en una raíz» no destraba
  nada.
- En **sidecar**, con `..` o con raíces más angostas: `AGENTS.md`, `CLAUDE.md`, `package.json` y
  `.gitignore` de la instancia dejan de frenarse. Y lo declarado en `writableOutsideRoots`, que por
  definición cae fuera de toda raíz, también: cierra el punto 1 del 089 sin nombrarlo.
- En **embedded**, con `'.'` —así lo arma también el fixture de `plan-first`, `hooks.test.js:1436-1443`—,
  la raíz de ops es un `workspaceRoot`: un `package.json` en la raíz sigue siendo producto, que es lo
  correcto, y `ops.config.json` necesita A.
- Lo que queda fuera de toda raíz y no está declarado ya lo frena `workspace-boundary`, así que B no abre
  escrituras nuevas: saca un segundo bloqueo sobre lo que el primero ya juzgó.
- Borde: sin `workspaceRoots` legibles no hay contra qué comparar, y el guard corre sin validar la
  config (`engine/config/paths.js:18-21`). Ahí se degrada a la conducta de hoy, que frena de más. Una
  config validada no llega a ese estado: `validateOpsConfig` exige al menos una raíz
  (`engine/config/validate.js:73`).

**Propuesta:** B con A adentro. A sola deja el resto de la raíz sidecar frenado con un mensaje que dice
«producto» sobre archivos que no lo son. Es una decisión del operador, porque cambia qué llama producto
`plan-first` en toda instancia.

## Tradeoffs

- **B cambia la definición de producto del guard**, y lo que hoy frena de más en sidecar deja de
  frenarse. Si alguien contaba con que `plan-first` frenara ediciones a `AGENTS.md` de la instancia, lo
  pierde. Hay un argumento para frenar `AGENTS.md` y `Makefile`, que son del molde y `upgrade` los
  reescribe; pero ése es otro motivo con otro mensaje —«esto lo pisa el próximo upgrade»—, no «cambia el
  producto sin plan». No le toca a este caso decidirlo; si se quiere, sale como caso propio.
- **Un archivo del directorio padre que no es de ningún servicio** —notas sueltas junto a los repos, con
  la raíz en `..`— sigue siendo producto para B, como hoy. B no lo empeora; tampoco lo arregla.
- **Una lectura más de config por escritura** en `plan-first`, sólo en el camino que ya iba a bloquear
  (con WIP activo el guard retorna antes, `files.js:167`).

## Qué tiene que probar el cierre

- Con WIP en IDLE y tareas: `ops.config.json` pasa en sidecar **y** en embedded.
- En sidecar con la raíz por defecto, `..`, pasan los archivos sueltos de la instancia; es la condición que
  la primera redacción no miraba, y la mutación que saca la segunda mitad de la condición tiene que ponerla
  en rojo.
- Un archivo dentro de un `workspaceRoot` y fuera de la instancia sigue frenado —la última línea del
  síntoma—, que es el contraste que dice que el guard no quedó inerte. En embedded, un `package.json` en la
  raíz sigue frenado.
- Una ruta declarada en `writableOutsideRoots` pasa, que es el punto 1 del 089.
- Es una quita: cada aserción de «pasa» se ve en rojo devolviendo el `opsOwned` de hoy.

## Contexto de descubrimiento

2026-09-10, reproduciendo el 089 en un banco. La reproducción original de aquel caso aprobaba
`ops.config.json` en un paso que decía estar aprobando la escritura del caso: eran dos escrituras
distintas frenadas por el mismo guard, y ésta es la que cualquiera encuentra primero, porque es la que
el mensaje del límite de raíces manda a hacer.

2026-09-11, al mejorarlo antes de arreglarlo: la reproducción usaba `../app` como raíz, que no es la que
escribe `init`, y el fix que proponía no alcanzaba a la instancia sidecar por defecto.

## Relacionados

- **089** — la ruta que se quería declarar. Los dos preguntan qué es producto para `plan-first`, y B
  de acá cierra el punto 1 de allá.
- **`engine/hooks/files.js:139-144`** — el comentario de `OPS_OWNED` ya nombra el candado con la llave
  adentro; este caso es una instancia que se le escapó.

## Cierre

**🟢 resuelto en 0.80.0** · `engine/hooks/files.js`, `test/wiring/hooks.test.js`

El operador eligió B con A adentro el 2026-09-11, antes de construir.

### Contra lo que el caso enumeró

- **A, `ops.config.json` nunca es producto** — hecho: se exime por nombre en `isProduct`, relativo a la raíz
  de ops, en los dos modos.
- **B, la condición doble** — hecho: `isProduct` devuelve producto sólo si el archivo cae dentro de algún
  `workspaceRoot` y fuera de la raíz de ops, salvo que la raíz de ops sea ella misma una raíz. Reusa
  `outsideRoots`, la misma comparación que usa el límite de raíces, en vez de escribir otra.
- **El borde sin raíces legibles** — hecho como decía: se degrada a la conducta de hoy y frena. Tiene
  prueba propia, que no estaba en la enumeración y salió de una mutación que sobrevivía (abajo).
- **Tradeoff «B cambia la definición de producto»** — se cumple y queda en el CHANGELOG, con qué dejar de
  hacer. El argumento de frenar `AGENTS.md` y `Makefile` por `upgrade` no se tomó: es otro motivo y no se
  abrió caso, porque nadie lo pidió y hoy el guard no lo decía.
- **Tradeoff «un archivo suelto del directorio padre sigue siendo producto»** — se cumple: no se tocó.
- **Tradeoff «una lectura más de config»** — se cumple: `configOf` se lee dentro de `isProduct`, que sólo
  corre después de que el WIP activo ya retornó.
- **Relacionados, el 089** — su punto 1 queda cerrado por este arreglo, y está anotado en el 089. Su
  punto 2, la forma de la aprobación, sigue abierto ahí.

### Qué se corrió

- **El rojo previo**: con `isProduct` escrito y el llamador todavía en `opsOwned`, `node --test
  test/wiring/hooks.test.js` dio 61 de 63, con las dos pruebas nuevas en rojo por `ops.config.json`.
- **Después del arreglo**: 63 de 63.
- **La reproducción del propio caso**, con las dos raíces: los cinco archivos de la instancia pasan y
  `../app/src/a.js` sigue frenado.

  ```
  plan-first PASA  ops.config.json
  plan-first PASA  AGENTS.md
  plan-first PASA  CLAUDE.md
  plan-first PASA  package.json
  plan-first PASA  .gitignore
  plan-first PASA  tools/ops.js
  plan-first PASA  organization/workspace.md
  plan-first PASA  planning/BACKLOG.md
  plan-first FRENA ../app/src/a.js
  ```
- **Seis mutaciones, en una copia desechable del repositorio (R23)**, comprobadas aplicadas antes de
  contar. En la primera tanda sobrevivió M5 —sin raíces legibles, dejar pasar—: ninguna prueba miraba ese
  borde. Se agregó y la tanda final quedó toda en rojo:

  ```
  M1 la instancia dentro de la raíz es producto  fail 1 → ROJA
  M2 ops.config.json no se exime                 fail 1 → ROJA
  M3 lo de afuera de las raíces es producto      fail 1 → ROJA
  M4 en embedded la raíz se exime entera         fail 5 → ROJA
  M5 sin raíces legibles deja pasar              fail 1 → ROJA
  M6 el llamador vuelve a opsOwned               fail 2 → ROJA
  ```
- `npm run ci`: código 0, 680 de 680, cobertura de 58 archivos en su piso o por encima.

## Después del cierre: el argumento de `upgrade`, medido (2026-09-11)

El cierre dejó sin tomar el argumento de frenar `AGENTS.md` y `Makefile` porque «son del molde y `upgrade` los
reescribe», sin abrir caso y sin medirlo. La premisa es una afirmación de mecanismo, así que se corrió.

Una instancia sidecar hecha con el paquete publicado 0.80.0 (`npx @ingeniomaps/cauce@0.80.0 init …`) y
actualizada con el paquete empaquetado de `main` = `efd22905`, cuyo `AGENTS.md` del molde cambió con el 098.
Cada escenario, sobre su propia copia de la instancia:

```
U1 sin ediciones        upgrade → exit 0; AGENTS.md trae el molde nuevo
U2 AGENTS.md y Makefile editados
   upgrade --check      → exit 1: «editado localmente: AGENTS.md», «editado localmente: Makefile»
   upgrade              → exit 0: «= 2 archivo(s) conservados por tu edición», ofrece --force;
                          las dos ediciones siguen ahí y AGENTS.md no recibe el molde nuevo
U3 las mismas ediciones
   upgrade --force      → exit 0: «− descartado tu cambio en AGENTS.md», «− descartado tu cambio en Makefile»
```

`upgrade` sólo reescribe la copia que nadie tocó. Una editada la conserva y lo dice, y la única forma de
perderla es pedirlo con `--force`, que deja escrito qué descartó. El costo real de editar esos archivos es
otro, y ya está dicho: dejan de recibir las mejoras del molde, y `upgrade` avisa en cada corrida y dice
adónde mover lo propio.

**Se decidió que no**: un guard que frenara editar `AGENTS.md` o `Makefile` con «esto lo pisa el próximo
upgrade» protegería contra algo que no pasa, y limitaría a quien edita a propósito. El dato que sostiene la
decisión son las tres corridas de arriba.
