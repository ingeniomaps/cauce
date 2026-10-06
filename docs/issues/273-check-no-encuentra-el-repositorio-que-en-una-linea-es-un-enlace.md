---
caso: 273
titulo: check no encuentra el repositorio que en una línea es un enlace
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 273 — Desde la carpeta de una línea, `check` dice que el repositorio de un commit «no está en esta máquina» teniéndolo enlazado

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: es un aviso falso en toda línea de trabajo, sobre lo que `done/` afirma haber entregado.

## Resumen

En la carpeta de una línea los repositorios del producto son enlaces al original. `check` busca el
repositorio que nombra un `commit:` y compara la ruta que le dio a git con la que git contesta. Git
contesta la ruta real, la comparación falla y el commit queda «sin comprobar».

## Reproducción

Corrida real de `autobuild` del 2026-10-05, en una sesión interactiva abierta en la carpeta de una línea armada con `ops line`, sobre un banco sidecar con `workspaceRoots: ['..']`. Al terminar, desde el árbol de la línea:

```bash
node tools/ops.js check planning
```

## Síntoma

```
⚠ done/: 1 commit(s) no se comprobaron porque su repositorio no está en esta máquina (app)
```

La entrada decía `commit: ed11959… feat: add baja to deactivate a user (app@feat/baja-marca-inactivo)`, y
`app` estaba en la carpeta de la línea, enlazado.

## Causa raíz

`engine/core/repos.js`, `commitStatus`: `git rev-parse --show-toplevel` devuelve la ruta sin enlaces, y se
comparaba contra la ruta con el enlace.

## Fix propuesto

Comparar contra la ruta real.

## Tradeoffs

- Ninguno encontrado: un repositorio sin enlaces tiene la misma ruta de los dos lados.

## Contexto de descubrimiento

La primera corrida real dentro de una línea, después de que el 263 hiciera que la línea llevara el producto.

## Relacionados

- 263 — `ops line` deja la carpeta de la línea sin los repos.
- 254 — el repositorio nombrado como su raíz declarada.

## Cierre

**Resuelto en 0.101.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.**

### Qué se corrió

- **La reproducción, antes y después**, sobre el banco de la corrida, cambiando sólo el motor: del aviso
  del Síntoma a `✓ planning válido`, sin avisos.
- **La prueba nueva vista en rojo** sin el cambio: el repositorio movido y alcanzado por un enlace.
- **La puerta entera**, `npm run ci`.
