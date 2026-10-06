---
caso: 269
titulo: el límite de escritura frena el archivo de plan del modo plan
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 269 — En modo plan, Claude Code no puede escribir su plan: el guard de límites lo toma por una escritura fuera de las raíces

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no rompe una entrega, pero deja al modo plan sin lo único que escribe, en toda
instancia con los guards instalados.

## Resumen

El modo plan de Claude Code guarda su plan en `~/.claude/plans/<nombre>.md`. Esa ruta está fuera de las
raíces declaradas, así que `workspace-boundary` la bloquea como cualquier otra escritura de afuera.

## Reproducción

En un banco sidecar instalado, una sesión interactiva de Claude Code 2.1.289 con `--permission-mode plan`
y un pedido que termina en un plan.

## Síntoma

```
● Updated plan
  ⎿  Error: PreToolUse:Write hook error: […guard-files.sh]: BLOQUEADO: ~/.claude/plans/en-el-repo-app-joyfu….md
     está fuera de las raíces declaradas en ops.config.json. Si el proyecto necesita escribir ahí, declaralo en writableOutsideRoots
```

## Causa raíz

`engine/hooks/files.js`, `workspaceBoundary`: compara toda ruta escrita contra las raíces y las exentas
declaradas. No distingue lo que el runner escribe para sí.

## Fix propuesto

Eximir esa carpeta y sólo esa: un `.md` bajo `~/.claude/plans/`.

## Tradeoffs

- Es una ruta de un runner escrita en el motor. Si Claude Code la cambia, el bloqueo vuelve y se ve.
- `~/.claude` entero no se exime: ahí viven la configuración y la memoria.

## Contexto de descubrimiento

Al medir el modo plan para el caso 268.

## Relacionados

- 268 — `acceptEdits` y `plan` quedaron sin el diálogo por no estar medidos.
- 089 — `plan-first` frena las rutas que el proyecto declaró escribibles.

## Cierre

**Resuelto en 0.101.0.** `workspace-boundary` deja pasar un `.md` bajo `~/.claude/plans/`.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo**, con el alcance angosto que el caso pedía.
- **Tradeoff de la ruta de un runner en el motor — se paga.**
- **Tradeoff de `~/.claude` entero — se respeta**: la prueba fija que la configuración, la memoria, otra
  extensión en esa carpeta y una carpeta de nombre parecido siguen frenando.

### Qué se corrió

- **La reproducción, antes y después**, en una sesión interactiva real en modo plan sobre el banco. Antes:
  el bloqueo del Síntoma. Después: cero bloqueos «fuera de las raíces» en toda la sesión, y el archivo de
  plan quedó escrito.
- **La prueba nueva vista en rojo** sin el cambio.
- **La puerta entera**, `npm run ci`.
