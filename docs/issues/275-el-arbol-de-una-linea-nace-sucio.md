---
caso: 275
titulo: el árbol de una línea nace sucio
estado: abierto
prioridad: baja
version-detectada: 0.100.0
---

# 275 — Recién armada, la instancia de una línea ya tiene `.cauce/manifest.json` modificado y `node_modules` sin trackear

**🔴 abierto** · detectado en 0.100.0 · prioridad **baja**.

**Prioridad baja**: no rompe nada, pero el primer `git status` de toda línea trae dos cosas que nadie tocó, y la primera
se termina commiteando en la rama de la línea.

## Resumen

`ops line` instala los runners en el árbol de la línea y enlaza el motor. Las dos cosas ensucian el
repositorio de la instancia: el manifiesto trackeado cambia, y el enlace a `node_modules` no está ignorado.

## Reproducción

Corrida real de `autobuild` del 2026-10-05, en una sesión interactiva abierta en la carpeta de una línea armada con `ops line`, sobre un banco sidecar con `workspaceRoots: ['..']`. En el árbol de la línea, sin haber hecho nada más:

```bash
git status -sb
git diff --stat
```

## Síntoma

```
## line/admin
 M .cauce/manifest.json
?? node_modules
 .cauce/manifest.json | 18 +++++++++---------
```

El diff del manifiesto son los nueve hashes de los workflows de Claude.

## Causa raíz

Dos causas, leídas y no corridas por separado:

- **El manifiesto guarda el hash de lo que se entregó ya renderizado**, y un workflow renderizado lleva
  escrita la ruta absoluta de la instancia (`engine/automation/index.js`, donde anota `M.digest` de cada
  destino). Otra carpeta, otro hash. Por lectura, le pasa igual a un segundo clon en otra ruta; no se midió.
- **`template/gitignore` ignora `node_modules/`**, con barra final, que cubre un directorio y no un enlace.

## Fix propuesto

- Que el hash que se guarda no dependa de la ruta: calcularlo sobre el texto con la raíz sin resolver.
- Ignorar `node_modules` sin la barra, o que `ops line` lo anote en el `exclude` del árbol.

## Tradeoffs

- Cambiar cómo se calcula el hash deja a toda instancia instalada con su manifiesto «desactualizado» una
  vez, hasta que reinstale.

## Contexto de descubrimiento

La primera corrida real dentro de una línea. La sesión lo reportó sin saber qué lo había cambiado.

## Relacionados

- 218 — una línea de trabajo, su propia carpeta de sesión.
- 095 — un enlace no es un directorio para un patrón con barra final.
