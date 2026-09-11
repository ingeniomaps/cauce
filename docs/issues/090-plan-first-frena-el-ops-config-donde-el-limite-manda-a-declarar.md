---
caso: 090
titulo: plan-first frena ops.config.json de la instancia, que es justo donde el límite de raíces manda a declarar la salida
estado: abierto
prioridad: media
version-detectada: 0.79.0
---

# 090 — El mensaje de `workspace-boundary` manda a editar un archivo que `plan-first` no deja editar

**🔴 abierto** · detectado en 0.79.0 · prioridad **media** — no deja pasar nada que no deba; convierte la
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

La salida que queda es aprobar `ops.config.json` en `.ops-approval`, y sólo pega escrita absoluta (089).

## Causa raíz

`OPS_OWNED` es `[...TEMPLATE_PREFIXES, 'agents/']` (`files.js:145`), y `TEMPLATE_PREFIXES` son
**directorios**: `planning/`, `organization/`, `integrations/`, `flows/`, `automatization/`, `tools/`
(`engine/core/ownership.js:73-80`). Ningún archivo suelto de la raíz entra: ni `ops.config.json`, que
no viene del molde, ni los que sí vienen (`TEMPLATE_FILES`, `ownership.js:87`: `AGENTS.md`, `Makefile`,
`.gitattributes`), ni los que la instancia agrega (`CLAUDE.md`, `package.json`, `.gitignore`).

## Fix propuesto

Dos formas, y no son excluyentes:

**A. Mínima: `ops.config.json` nunca es producto.** Se exime por nombre en `opsOwned`, relativo a la
raíz de ops. Vale en los dos modos: en embedded la raíz de ops es también la del producto, pero el
config de la instancia sigue sin ser código del servicio.

**B. General: `plan-first` juzga sólo lo que cae dentro de un `workspaceRoot`.** Producto es el código
de una raíz declarada; lo demás no tiene plan de tarea que exigirle.

- En **sidecar** la raíz de ops no es un `workspaceRoot`, así que `AGENTS.md`, `CLAUDE.md`,
  `package.json` y `.gitignore` de la instancia dejan de frenarse, y también lo declarado en
  `writableOutsideRoots` — cierra el punto 1 del 089 sin nombrarlo.
- En **embedded** el `workspaceRoot` suele ser `.` (así lo arma el fixture de `plan-first`,
  `hooks.test.js:1415-1421`), y un `package.json` en la raíz sigue siendo producto, que es lo correcto.
  Por eso B no reemplaza a A: en embedded `ops.config.json` cae dentro de `.` y necesita la exención por
  nombre igual.
- Lo que queda fuera de toda raíz y no está declarado ya lo frena `workspace-boundary` (la primera línea
  del síntoma), así que B no abre escrituras nuevas: quita un segundo bloqueo sobre lo que el primero ya
  juzgó.
- Borde: sin `workspaceRoots` legibles no hay contra qué comparar, y el guard corre sin validar la
  config (`engine/config/paths.js:16-19`). Ahí se degrada a la conducta de hoy, que frena de más. Una
  config validada no llega a ese estado: `validateOpsConfig` exige al menos una raíz (comprobado
  llamándola con `workspaceRoots: []`: *«workspaceRoots debe contener al menos una raíz»*).

**Propuesta:** B con A adentro. A sola deja el resto de la raíz sidecar frenado por un mensaje que dice
«producto» sobre archivos que no lo son.

## Tradeoffs

- **B cambia la definición de producto del guard**, y lo que hoy frena de más en sidecar deja de
  frenarse. Si alguien contaba con que `plan-first` frenara ediciones a `AGENTS.md` de la instancia, lo
  pierde. Hay un argumento para frenar `AGENTS.md` y `Makefile`, que son del molde y `upgrade` los
  reescribe; pero ése es otro motivo con otro mensaje —«esto lo pisa el próximo upgrade»—, no «cambia el
  producto sin plan». No le toca a este caso decidirlo; si se quiere, sale como caso propio.
- **Una lectura más de config por escritura** en `plan-first`, sólo en el camino que ya iba a bloquear
  (con WIP activo el guard retorna antes, `files.js:167`).

## Qué tiene que probar el cierre

- Con WIP en IDLE y tareas: `ops.config.json` pasa en sidecar **y** en embedded.
- En sidecar pasan los archivos sueltos de la raíz de ops, y un archivo dentro de un `workspaceRoot`
  sigue frenado — la última línea del síntoma, que es el contraste que dice que el guard no quedó
  inerte.
- Es una quita: la aserción de que `ops.config.json` pasa se ve en rojo devolviendo el `opsOwned` de hoy.

## Contexto de descubrimiento

2026-09-10, reproduciendo el 089 en un banco. La reproducción original de aquel caso aprobaba
`ops.config.json` en un paso que decía estar aprobando la escritura del caso: eran dos escrituras
distintas frenadas por el mismo guard, y ésta es la que cualquiera encuentra primero, porque es la que
el mensaje del límite de raíces manda a hacer.

## Relacionados

- **089** — la ruta que se quería declarar. Los dos preguntan qué es producto para `plan-first`, y B
  de acá cierra el punto 1 de allá.
- **`engine/hooks/files.js:139-144`** — el comentario de `OPS_OWNED` ya nombra el candado con la llave
  adentro; este caso es una instancia que se le escapó.
