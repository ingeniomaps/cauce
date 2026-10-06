---
caso: 275
titulo: el árbol de una línea nace sucio
estado: resuelto
resuelto-en: 0.101.0
prioridad: baja
version-detectada: 0.100.0
---

# 275 — Recién armada, la instancia de una línea ya tiene `.cauce/manifest.json` modificado y `node_modules` sin trackear

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **baja**.

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

## Cierre

**Resuelto en 0.101.0.**

### El recorrido de lo que este caso enumeró

- **Que el hash no dependa de la ruta — se hizo.** Se calcula con la raíz de la instancia sin resolver.
- **Ignorar `node_modules` sin la barra — se hicieron las dos**: el molde lo ignora sin barra, y `ops line`
  lo anota además en el `exclude` del repositorio, que cubre a la instancia creada con el molde anterior.
- **«Le pasa igual a un segundo clon; no se midió» — se midió.** Un segundo clon en otra ruta, con el runner
  instalado: cero líneas cambiadas en el manifiesto.
- **Tradeoff, toda instancia instalada queda «desactualizada» una vez — no ocurre.** El motor reconoce
  también el hash que escribía la versión anterior.

### Qué se corrió

- **La reproducción**: dos líneas recién armadas con `ops line` sobre un banco sidecar, y en cada una
  `git status` sin nada que reportar.
- **El cambio de motor sobre una instalación vieja**: una instancia instalada con 0.100.0 pasó al motor
  nuevo y ninguno de sus nueve recorridos se leyó como editado; `uninstall` los retiró todos.
- **Reinstalar en una línea tras cambiar un recorrido**: el manifiesto cambió en una sola línea, la del
  recorrido que había cambiado.
- **Las pruebas nuevas vistas en rojo** con el hash calculado sobre la ruta.
- **La puerta entera**, `npm run ci`.
