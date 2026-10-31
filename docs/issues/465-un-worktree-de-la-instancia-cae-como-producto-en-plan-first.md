---
caso: 465
titulo: Un worktree de la instancia dentro de una raíz de producto no se reconoce como instancia
estado: abierto
prioridad: baja
version-detectada: 0.117.2
---

# 465 — Un worktree de la instancia cae como producto en plan-first

**🔴 abierto** · detectado en 0.117.2 · prioridad **baja**: sólo se da en sidecar con una raíz que contenga al worktree, como
`..`, y la salida existe: un WIP con plan. Sube a media si el reconocimiento del worktree se vuelve el camino habitual para
mejorar el proceso, porque ahí también importa la llave de `ops.config.json` de abajo.

## Resumen

Los guards de archivos comparan la ruta contra la raíz de ops de la sesión. Un `git worktree` de esa misma instancia, en otra
carpeta, queda fuera de esa raíz: el mismo archivo relativo cambia de respuesta según el árbol. Pasa dos veces, en sentidos
opuestos: `plan-first` frena lo que en el checkout principal no frena, y `ops-config` no mira la llave que sí mira allá.

## Reproducción

```bash
S=$(node engine/cli/ops.js bench sidecar --force); D=$(dirname "$PWD/$S"); S=$D/ops
# en ops.config.json: "workspaceRoots": [{"name":"main","path":".."}]
git -C "$S" worktree add -q -b wt "$D/ops-wt"
node -e 'console.log(JSON.stringify({session_id:"p",cwd:process.argv[2],hook_event_name:"PreToolUse",tool_name:"Write",
  tool_input:{file_path:process.argv[3],content:process.argv[4]||"x\n"}}))' "$D" "<ruta>" \
  | CLAUDE_PROJECT_DIR=$D CAUCE_RUNNER=probe bash "$S/automatization/hooks/guard-files.sh"; echo "exit $?"
```

Sólo se le pregunta al hook, que no escribe el archivo.

## Síntoma

Salida real, 0.117.2, 2026-10-31:

| Raíces | WIP | Ruta | Exit | Quién |
|---|---|---|---|---|
| `..` | no | `ops/automatization/bin/n.js` | 0 | |
| `..` | no | `ops-wt/automatization/bin/n.js` | **2** | `plan-first` |
| `..` | no | `ops/planning/reports/n.md` | 0 | |
| `..` | no | `ops-wt/planning/reports/n.md` | **2** | `plan-first` |
| `..` | sí | `ops-wt/automatization/bin/n.js` | 0 | |
| `..` | no | `ops/ops.config.json` con `allowPush: true` | 2 | `ops-config` |
| `..` | sí | `ops-wt/ops.config.json` con `allowPush: true` | **0** | nadie |
| `../app` | sí | `ops-wt/automatization/bin/n.js` | 2 | `workspace-boundary` |

La última fila es la conducta correcta de otro guard: con esas raíces, el worktree está fuera de todas, y este caso no aplica.

La penúltima es lo que el caso no decía: el guard que no deja a un agente escribirse el permiso de push no reconoce la copia del
worktree. No se midió si un commit de ese archivo lo frena `governance`, ni qué pasa al juntar el árbol.

## Causa raíz

- `opsOwned` (`engine/hooks/files.js:182-186`): la ruta relativa a la raíz de ops empieza con `../`, así que da `false` en la
  `:184`.
- `isProduct` (`engine/hooks/files.js:198-209`): no está fuera de las raíces (`:207`) y sí de la raíz de ops (`:208`), así que
  es producto.
- `guards` (`engine/hooks/ops-config.js:60`) compara contra `path.join(root, INSTANCE_CONFIG)`, una sola ruta.

## Fix propuesto

Hipótesis, sin probar: cuando la ruta cae fuera de la raíz de ops, preguntarle a git si está en un worktree con el mismo
`git-common-dir` y, de ser así, juzgarla contra ese árbol. Las dos caras se arreglan juntas, porque son el mismo reconocimiento:
**arreglar sólo `plan-first` dejaría la fila de `allowPush` pasando también sin WIP**, que es peor que hoy.

Lo mismo se recorre en los demás guards que comparan contra la raíz: `generated`, `integration-snapshot`, `secrets`.

## Tradeoffs

- Preguntarle a git en cada escritura cuesta un proceso; sólo se hace cuando la ruta ya cayó fuera de la raíz de ops.
- En embedded un worktree trae también el producto. La exención se aplica por prefijo (`OPS_OWNED`), así que el código del producto
  seguiría pidiendo plan; hay que comprobarlo, porque este banco es sidecar.
- Una quita para `plan-first` (R29): se prueba que el producto real y una carpeta ajena con un `planning/` propio siguen frenando.
  Sin esa segunda, «tiene `planning/`» pasaría por «es la instancia».

## Contexto de descubrimiento

Una instancia que mejoraba su proceso en un worktree para no tocar un release en construcción. La salida usada fue un WIP y un runner
propios. Esa misma rama registró ediciones por terminal, que este guard no ve.

## Relacionados

Caso 394 (la línea en cuyo árbol cae un archivo), caso 260 (el plan con el id de la instancia).
