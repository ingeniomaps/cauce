---
caso: 274
titulo: en una línea el recorrido cambia de rama el producto que comparte
estado: abierto
prioridad: media
version-detectada: 0.100.0
---

# 274 — Dos líneas de trabajo comparten por enlace el mismo checkout del producto, y el commit de una lo deja parado en su rama

**🔴 abierto** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: con una sola línea activa no pasa nada. Con dos a la vez, que es para lo que existe una línea, una
construye sobre la rama que la otra acaba de cortar.

## Resumen

`ops line` enlaza los repositorios del producto al original: todas las líneas, y el árbol principal, ven
el mismo checkout. Desde el 251 el recorrido corta la rama de la tarea ahí con `git switch -c`. El
checkout compartido queda parado en la rama de la última tarea que commiteó, para todos.

## Reproducción

Corrida real de `autobuild` del 2026-10-05, en una sesión interactiva abierta en la carpeta de una línea armada con `ops line`, sobre un banco sidecar con `workspaceRoots: ['..']`.

## Síntoma

Al terminar la corrida de la línea `admin`, en la carpeta **original**:

```
== app (compartido por enlace)
ed11959 HEAD -> feat/baja-marca-inactivo | feat: add baja to deactivate a user
7482539 main | feat: alta e informe
```

La sesión lo dijo sola al cerrar: «`app` es un symlink a `../servers/app` y ese checkout quedó parado en la
rama de la tarea. Si otra línea comparte ese árbol, va a ver esa rama y no `main`».

## Causa raíz

- `engine/cli/lines.js`: enlaza el producto y lo dice —«separar el trabajo dentro del producto es de
  `ops worktree`, por tarea»—.
- `automatization/workflows/autobuild.js`: el recorrido no llama a `ops worktree`; trabaja en el checkout
  que encuentra.

Antes del 251 el defecto era otro y peor: las dos líneas commiteaban en la misma rama, la que hubiera.

## Fix propuesto

Pide una decisión del dueño, porque cambia dónde trabaja el recorrido:

1. **Que en una línea el recorrido trabaje en un árbol por tarea** (`ops worktree`), que es lo que el
   toolkit ya recomienda para dos sesiones. El checkout compartido no se toca.
2. **Que `ops line` le dé a cada línea su propio árbol del producto**, en vez de enlazar el original.
3. **Dejarlo y decirlo**: una línea a la vez por repositorio de producto.

## Tradeoffs

- La 1 toca todas las fases que trabajan sobre el servicio: la ruta deja de ser la declarada.
- La 2 multiplica árboles del producto, uno por línea, con sus dependencias instaladas.
- La 3 no cuesta nada y deja el caso que las líneas existen para resolver.

## Contexto de descubrimiento

La primera corrida real dentro de una línea.

## Relacionados

- 251 — el paso de Commit no corta rama.
- 218 — una línea de trabajo, su propia carpeta de sesión.
- 263 — `ops line` deja la carpeta de la línea sin los repos.
