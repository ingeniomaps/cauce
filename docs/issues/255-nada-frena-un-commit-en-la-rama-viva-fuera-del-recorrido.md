---
caso: 255
titulo: nada frena un commit en la rama viva fuera del recorrido
estado: abierto
prioridad: media
version-detectada: 0.100.0
---

# 255 — El toolkit frena el push a la rama viva y no el commit: el trabajo que no pasa por `autobuild` puede quedar en `main` local

**🔴 abierto** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: el push ya está contenido, así que nada llega al remoto; lo que cuesta es mover el commit a mano. Es una
decisión de producto antes que un defecto.

## Resumen

Era el punto 4 del fix del 251, y se separó porque alcanza a otra cosa: el 251 arregla lo que hace el
recorrido; esto alcanza a toda sesión, incluido lo que una persona pide directo en el chat. El guard de
publicación mira `git push`; `git commit` sobre `main` pasa siempre.

## Reproducción

Sin correr. Leído en `0.100.0`: `engine/hooks/push.js` clasifica un push y nada equivalente mira un
commit. globex escribió el suyo, `guard-globex-branch.sh`, regla P26 —referido por el 251, no abierto
acá—.

## Síntoma

El de 251: commits en `main` local, adelantado del remoto, que hay que mover a una rama a mano.

## Causa raíz

No hay guard sobre el commit. Es una ausencia, no una línea.

## Fix propuesto

Un guard que frene `git commit` cuando la rama actual es viva según `liveBranches`
(`engine/hooks/push.js:47`) y la instancia no la abrió. La forma depende de dos decisiones del dueño:

1. **A quién alcanza.** Sólo al agente dentro de una tarea o de `autobuild`, o también a lo que la persona
   pide en el chat.
2. **Si viene activado.** Activado por defecto cambia la conducta de toda instancia en su próximo
   `upgrade`.

**Decidido por el dueño el 2026-10-05, para el recorrido**: commitear en `main` sólo a pedido, y si no,
cortar una rama en vez de decir que hace falta aprobación. Un guard no puede cortar la rama —sólo frenar—,
así que si este caso se construye, su mensaje tiene que decir cómo cortarla y no pedir permiso. Si alcanza
al chat sigue sin decidir.

## Tradeoffs

- Un repo de una sola persona que commitea en `main` a propósito tiene que declararlo.
- Es un guard más en cada commit, y el 253 propone otro sobre `planning/`: conviene que sean uno.

## Contexto de descubrimiento

Al ordenar los casos el 2026-10-05, separado del 251.

## Relacionados

- 251 — el paso de Commit no corta rama y commitea en la rama viva.
- 253 — a qué rama va el estado de planning. Su punto 3 es otro guard sobre el commit.
- 108 — `allowPush` hacia la rama viva: de ahí sale `liveBranches`.
