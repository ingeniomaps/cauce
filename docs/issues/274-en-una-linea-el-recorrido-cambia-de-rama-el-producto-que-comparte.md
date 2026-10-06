---
caso: 274
titulo: en una línea el recorrido cambia de rama el producto que comparte
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 274 — Dos líneas de trabajo comparten por enlace el mismo checkout del producto, y el commit de una lo deja parado en su rama

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

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

## Cierre

**Resuelto en 0.101.0.** El dueño eligió la opción 1.

### El recorrido de lo que este caso enumeró

- **1, un árbol por tarea dentro de una línea — se hizo.** Fuera de una línea no se arma ninguno: se trabaja
  en la carpeta que está.
- **2, un árbol del producto por línea — se decidió que no.** Multiplicaba dependencias instaladas para
  resolver lo que la 1 resuelve sin copiar nada.
- **3, dejarlo y decirlo — se decidió que no.** Dos líneas a la vez es para lo que las líneas existen.
- **Tradeoff de la 1, la ruta deja de ser la declarada — se atendió.** A `planning` sigue viajando el
  servicio como lo nombra la tarea; la ruta del árbol sólo la reciben las fases que trabajan.

### Lo que el caso no preveía

- `ops worktree` dejaba el árbol al lado del destino del enlace: fuera de las raíces de la línea y dentro de
  la carpeta que comparten las demás. Ahora queda al lado del repositorio como lo ve la sesión.
- La puerta declarada de la raíz nombra al servicio por su ruta, que en una línea es el checkout compartido.
  Lo encontró la corrida real y salió como caso propio: 276.

### Qué se corrió

- **Dos sesiones reales a la vez**, una por línea, sobre el mismo repositorio de producto, cada una con
  `/autobuild` y su propia tarea. Al cerrar: el checkout compartido seguía en `main` y limpio, con las
  ramas `feat/baja-marca-inactivo` y `feat/alta-exige-email` salidas las dos de `main`; `git worktree list`
  devolvía sólo el principal; cada instancia tenía sus dos commits de planning en `line/admin` y `line/auth`,
  y `ops check planning` daba exit 0 en las dos.
- **Una segunda tarea en la misma línea**, después de resolver su checkpoint: tercera rama desde `main`, árbol
  retirado.
- **Fuera de una línea**, una corrida real en una instancia embebida parada en `main`: `git worktree list`
  con una sola entrada y la rama `fix/…` cortada en el lugar.
- **Las pruebas nuevas vistas en rojo** al quitar el árbol y al dejar de pasarle la ruta a las fases.
- **La puerta entera**, `npm run ci`.
