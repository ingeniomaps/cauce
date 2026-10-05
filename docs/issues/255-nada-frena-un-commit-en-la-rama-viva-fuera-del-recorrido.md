---
caso: 255
titulo: nada frena un commit en la rama viva fuera del recorrido
estado: descartado
prioridad: media
version-detectada: 0.100.0
---

# 255 — El toolkit frena el push a la rama viva y no el commit: el trabajo que no pasa por `autobuild` puede quedar en `main` local

**⚪ descartado** · detectado en 0.100.0 · prioridad **media**.

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

## Cierre

**Descartado por el dueño el 2026-10-05.** No se construye un guard sobre `git commit` en la rama viva.

- **Lo que el guard iba a cuidar ya está cuidado donde importa.** Un commit en `main` local no sale de la
  máquina: el push a la rama viva se frena con un bloqueo que no se aprueba con un sí.
- **El caso que lo originó ya no ocurre**: el recorrido corta una rama por tarea (caso 251).
- **Sería un freno nuevo sobre lo que la persona pide en el chat**, y un guard no puede cortar la rama por
  ella: sólo puede frenar y pedir, que es lo que el dueño pidió no hacer.

### El recorrido de lo que este caso enumeró

- **Fix, el guard — se decidió que no**, por lo de arriba.
- **Decisión 1, a quién alcanza, y 2, si viene activado — no aplican.**
- **Tradeoff «conviene que sea uno con el del 253» — tampoco se construyó aquél.**

### Qué se corrió

- **El dato que sostiene la decisión**, que el push a la rama viva se frena: las dos pruebas de
  `test/hooks/push.test.js` que lo fijan, corridas solas el 2026-10-05, en verde —«allowPush no alcanza la
  rama viva sin su permiso, ni a un subagente con ningún permiso» y «la rama por defecto del remoto es
  viva»—. Y `native-confirmation.test.js` fija que ese bloqueo no se vuelve una pregunta: `git push origin
  main` da `blocked` sin `ask`.
- **Que el recorrido ya no commitea ahí**: la sonda del 251, comprobada en disco.
