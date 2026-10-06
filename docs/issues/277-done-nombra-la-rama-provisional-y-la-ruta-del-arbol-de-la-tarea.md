---
caso: 277
titulo: done nombra la rama provisional y la ruta del árbol de la tarea
estado: resuelto
resuelto-en: 0.101.0
prioridad: baja
version-detectada: 0.100.0
---

# 277 — En una línea, la entrada de `done/` cita una rama que el repositorio ya no tiene y una ruta de la máquina

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **baja**.

**Prioridad baja**: no rompe `check`. Deja en el registro que se audita un nombre de rama inexistente y una ruta absoluta. No llegó a publicarse: nació con el 274.

## Resumen

Desde el 274, en una línea la tarea se construye en un árbol propio, en la rama `task/<slug>`. Commit la
renombra a `<tipo>/<slug>` y saca el árbol. Review, Verify y QA corren antes, así que citan la rama
provisional y la ruta del árbol, y Done copia `review:` textual.

## Reproducción

Banco sidecar con una línea armada con `ops line`, sesión real con `/autobuild`. Al cerrar:

```bash
grep -o "task/[a-z-]*" planning/done/<slug>.md
git -C app branch --list 'task/*'
```

## Síntoma

La sesión lo reportó al terminar: «`review:` nombra una rama `task/informe-cuenta-con-email` que no existe».
El `grep` la encuentra y `git branch` no devuelve nada. En la primera corrida, además, `review:` traía la ruta
absoluta del árbol dentro del scratchpad de la máquina.

## Causa raíz

`automatization/workflows/autobuild.js`, el pedido de Done: arma `review=`, `verify=` y `qa=` con lo que las
fases devolvieron, y esas fases recibieron la ruta y la rama del árbol porque es donde tenían que mirar.

## Fix propuesto

Que lo que viaja a Done nombre lo que quedó: el servicio como lo declara la tarea en vez de la ruta del
árbol, y la rama del commit en vez de la provisional.

## Tradeoffs

- La sustitución es de texto: una fase que nombre el árbol sólo por su carpeta, sin la ruta, pasa como
  la escribió.

## Contexto de descubrimiento

La corrida real que midió la salvedad del 276.

## Relacionados

- 274 — en una línea, cada tarea en su árbol.
- 211 — `review:` se copia textual a `done/`.

## Cierre

**Resuelto en 0.101.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.** Fuera de una línea no se traduce nada.
- **Tradeoff — ocurre y se deja.** En la corrida de comprobación `done:` nombra la carpeta
  `app-alta-normaliza-email/` al contar lo que recorrió la puerta. Es lo que la puerta imprimió, y no es una
  ruta de la máquina.

### Qué se corrió

- **Una corrida real en la misma línea, con el motor arreglado.** `review:` quedó «sobre app — … (rama
  feat/alta-normaliza-email …)», `grep -c "task/alta-normaliza-email"` sobre la entrada da 0, y la ruta
  absoluta del árbol no aparece.
- **La prueba nueva vista en rojo** sin la sustitución, en una copia.
- **La puerta entera**, `npm run ci`.
