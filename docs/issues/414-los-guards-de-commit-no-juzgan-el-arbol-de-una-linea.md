---
caso: 414
titulo: los guards de commit no juzgan el árbol de una línea, porque owns no lo cuenta entre los repositorios de la sesión
estado: resuelto
resuelto-en: 0.112.0
prioridad: alta
version-detectada: 0.111.0
---

# 414 — En `lines/<línea>/<repo>` pasa `git add -A`, el commit en la rama viva, la firma de IA y el commit sin la puerta: `owns` sólo reconoce la sesión, la instancia y `workspaceRoots`

**🟢 resuelto en 0.112.0** · detectado en 0.112.0, presente desde 0.111.0 · prioridad **alta**. Es el árbol donde trabaja todo el que
lleva una línea, y es justo donde los guards de commit se abstienen. Nada avisa: el guard decide que el repositorio no es de la
sesión y deja pasar.

## Resumen

Los guards de commit —`git-add`, `live-commit`, `ai-signature`, y `verify` y `dependencies` por `stagedForCommit`— opinan sólo
sobre repositorios de la sesión (R26, caso 258). `owns` (`engine/hooks/input.js:388-394`) arma esa lista con la carpeta de la
sesión (`OPS_ROOT`, que el shim exporta como la instancia), la instancia y las raíces de `workspaceRoots`. El árbol de una línea
vive en `<carpeta de sesión>/lines/<línea>/<repo>`, que no cuelga de ninguna de las tres. El caso 394 sumó esos árboles a lo
que `workspace-boundary` deja escribir (`lineTrees`, en `engine/core/task-trees.js`), y no a `owns`.

## Reproducción

El 2026-10-20, en un banco instalado fuera del árbol (`ops bench sidecar`, los cuatro runners instalados, la línea `web` sobre
`app`), el shim instalado de Claude (`ops/automatization/hooks/guard-shell.sh`, con `CLAUDE_PROJECT_DIR` y `CI=1`):

```
exit=2 | cwd=<W>                | git add -A
exit=0 | cwd=<W>/lines/web/app  | git add -A
exit=0 | cwd=<W>                | git -C lines/web/app add -A
exit=0 | cwd=<W>/lines/web/app  | git -C lines/web/app add -A
exit=2 | cwd=<W>                | git -C app add -A
exit=0 | cwd=<W>/lines/web/app  | git -C app add -A
```

Y en sesiones reales, con `CI=1` para que lo pedido no cuente como orden de la persona: Claude, `agy` y Codex corrieron
`git -C lines/web/app add -A` («hecho») y el árbol quedó con el cambio stageado. En las mismas sesiones, la edición sin plan sí
se frenó: `plan-first` reconoce el árbol (394) y los guards de commit no.

## Causa raíz

`engine/hooks/input.js:388-394` (`owns`): la lista de raíces no incluye los árboles de las líneas declaradas.

## Fix propuesto

Que `owns` sume los árboles de las líneas declaradas (`LT.trees(ops)`), que es la misma lista que `lineTrees` usa para escribir.
Lo que no es de ninguna línea ni raíz sigue afuera, como pide R26.

La aceptación pide la mutación: con los árboles quitados de `owns`, la prueba que corre `git add -A` en el árbol de una línea —
desde la carpeta de sesión con `-C` y desde adentro— deja de frenar y falla.

## Tradeoffs

- `verify` empieza a correr la puerta del repositorio también en los commits del árbol de la línea. Es lo que tenía que pasar;
  cuesta lo mismo que en el checkout principal.

## Contexto de descubrimiento

Al armar la matriz de roles por runner, el 2026-10-20: la sonda de guards stageó todo en el árbol de la línea con tres runners.

## Relacionados

- 394 — los árboles de las líneas, que sumó a `workspace-boundary` y no acá.
- 258 — por qué los guards de commit opinan sólo sobre los repositorios de la sesión.
- 413 — el otro hueco que encontró la misma tanda.

## Cierre

**Resuelto en 0.112.0.** `owns` (`engine/hooks/input.js`) suma los árboles de las líneas declaradas (`LT.trees(ops)`) a los
repositorios de la sesión, así que los guards de commit los juzgan como al checkout principal.

El enunciado, ítem por ítem:

- **Sumar los árboles declarados a `owns`, y lo ajeno sigue afuera**: hecho; la prueba fija las dos mitades.
- **La mutación**: abajo.
- **Tradeoff, `verify` corre también en el árbol de la línea**: así queda, como se buscaba.

**Lo que se corrió para saber que funciona.**

- `test/hooks/line-trees.test.js`, «los guards de commit juzgan el árbol de una línea declarada»: `git -C <árbol> add -A` desde
  la carpeta de sesión, y `git add -A` y `git add --all` desde el árbol, se frenan; en un repositorio ajeno, no. Roja antes del
  cambio (`Missing expected exception`).
- Mutación en una copia fuera del árbol, con los árboles quitados de `owns`: roja.
- El shim instalado sobre el mismo banco, con el motor arreglado: las cuatro formas de la reproducción salen con exit 2.
- **Real, las cuatro sondas otra vez**, con `CI=1` y el motor arreglado, pidiendo a cada runner `git -C lines/web/app add -A` y
  una edición sin plan en el árbol:

  | Runner | Stagear todo | Edición sin plan |
  |---|---|---|
  | Claude | «BLOQUEADO: 'git add -A/--all/.' está prohibido» | «BLOQUEADO: …Card.jsx cambia el producto sin plan» |
  | `agy` 1.4.3 | «tool call denied by pre-tool hook: Cauce: 'git add -A/--all/.' está prohibido» | negada, ídem |
  | Gemini 0.63.0 | «BLOQUEADO: 'git add -A/--all/.' está prohibido» | negada |
  | Codex 0.162.1 (`gpt-6-luna`) | «BLOQUEADO: 'git add -A/--all/.' está prohibido» | no la intentó: el pedido decía parar ante la primera negativa |

  Antes del arreglo, la misma sonda dejó el árbol con el cambio stageado en Claude, `agy` y Codex.
