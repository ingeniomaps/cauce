---
caso: 270
titulo: check cuenta el commit de planning como trabajo sin anotar
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 270 — En una instancia embebida, `check` avisa OPS-001 por el commit que el propio recorrido hace del estado de planning

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: es un aviso falso que sale después de cada tarea cerrada, y un aviso que siempre está enseña a no leerlo.

## Resumen

OPS-001 cuenta los commits del repositorio que ninguna entrada de `done/` nombra. Desde el 266 el recorrido
commitea el estado de planning al cerrar cada tarea, y en una instancia embebida ese commit cae en el
mismo repositorio: ninguna entrada lo nombra, así que cuenta como trabajo sin anotar.

## Reproducción

Corrida real de `autobuild` en un banco con una instancia embebida, 2026-10-05, y después:

```bash
node tools/ops.js check planning
```

## Síntoma

```
⚠ tienda: 2 commit(s) desde 2026-10-05 que ninguna entrada de DONE nombra, así que ese trabajo no está en planning/ (OPS-001)
```

Los dos eran `fix: point test script at the test files`, que sí es trabajo sin anotar, y
`chore(planning): close precio-rechaza-negativos`, que es el planning mismo.

## Causa raíz

`engine/core/repos.js`, `unrecordedCommits`: lista todo commit del repositorio desde la fecha, sin mirar
qué toca.

## Fix propuesto

No contar el commit que sólo toca el planning de la instancia.

## Tradeoffs

- Un commit que toca planning y además código sigue contando: es trabajo.
- En sidecar no cambia nada: la instancia es otro repositorio y nunca se contó.

## Contexto de descubrimiento

La primera corrida real sobre una instancia embebida, después de que el 266 agregara el commit de planning.

## Relacionados

- 266 — `autobuild` no commitea el estado de planning.
- 082 y 169 — el aviso OPS-001.

## Cierre

**Resuelto en 0.101.0.** La lista de commits excluye la carpeta de planning de la instancia cuando vive
dentro del repositorio.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo**, con un pathspec de exclusión de git: lo decide git, no un patrón sobre el asunto.
- **Tradeoff del commit mixto — se cumple**, y la prueba lo fija.
- **Tradeoff de sidecar — sin cambio.**

### Qué se corrió

- **La reproducción, antes y después**, sobre el banco de la corrida, cambiando sólo el motor: de «2
  commit(s)» a «1 commit(s)», y el que queda es el `fix:` que nadie anotó.
- **La prueba nueva**, con tres commits: uno que toca planning y configuración, uno que sólo toca
  planning, uno que toca planning y código. Cuentan el primero y el tercero.
- **Una mutación en rojo**, en una copia: sin la exclusión.
- **La puerta entera**, `npm run ci`.

### Una corrida entera con el motor arreglado, el 2026-10-05

Instancia embebida parada en `main`, sesión real con `/autobuild`. Quedaron tres commits en la rama de la
tarea —el del producto, `chore(planning): close …` y `chore(planning): await review of …`—, `main` sin
tocar, y `ops check planning --json` con `"warnings":[]`.
