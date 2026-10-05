---
caso: 268
titulo: acceptEdits y plan quedaron sin el diálogo por no estar medidos
estado: abierto
prioridad: baja
version-detectada: 0.100.0
---

# 268 — En `acceptEdits` y `plan` los guards bloquean en vez de abrir el diálogo, porque nadie midió esos modos

**🔴 abierto** · detectado en 0.100.0 · prioridad **baja**.

**Prioridad baja**: es el lado seguro —frena y pide la confirmación por chat—, pero es más lento que el
diálogo y son dos modos de uso corriente.

## Resumen

El 257 dejó el diálogo de confirmación sólo en los modos donde está medido que lo contesta una persona:
`default` y `bypassPermissions`. `acceptEdits` y `plan` quedaron afuera sin haberse medido.

## Reproducción

Sin correr: es una ausencia. `engine/hooks/confirm.js` lista los dos modos medidos.

## Síntoma

En una sesión en `acceptEdits`, un guard que antes abría un diálogo de un clic ahora bloquea y pide un sí
por chat.

## Causa raíz

`engine/hooks/confirm.js`, `ANSWERED`: lista cerrada con lo medido.

## Fix propuesto

Medir cada modo y sumar el que corresponda. La medición que separa los dos casos es la del 257: con un
gate en rojo y el guard pidiendo el diálogo, ver si el commit se crea sin que nadie conteste.

## Tradeoffs

- Sin interfaz no hay quien conteste: lo que se puede medir así es que el modo **no** resuelve solo, no que
  el diálogo se vea bien.

## Contexto de descubrimiento

Anotado al cerrar el 257.

## Relacionados

- 257 — verify deja pasar dentro de la sesión un commit que a mano bloquea.
- 221 — la confirmación con el diálogo de Claude Code.

## Medición del 2026-10-05: el instrumento no sirve, y el caso sigue abierto

Se intentó medir como proponía el fix, y la medición no puede contestar la pregunta.

En un banco sidecar instalado, con el motor del banco cambiado para pedir el diálogo en todos los modos,
cinco sesiones de Claude Code sin interfaz (`claude -p --permission-mode <modo>`), cada una con el gate en
rojo, código stageado y el pedido de commitear:

```
auto:              el commit NO se creó
bypassPermissions: el commit NO se creó
acceptEdits:       el commit NO se creó
plan:              el commit NO se creó
default:           el commit NO se creó
```

**El control falló.** En `auto`, con una persona delante, el commit sí se crea: es lo que midió el 257 en
una sesión interactiva. Sin interfaz no se creó. O sea que una sesión sin interfaz no reproduce lo que
pasa en la interactiva, y que `acceptEdits` y `plan` den «no se creó» acá no dice nada sobre ellas.

**La documentación tampoco lo contesta.** Documentado, sin versión que conste: «`"ask"`: show the permission
prompt to the user as normal» y «the most restrictive answer applies, in the order `deny`, `defer`, `ask`,
`allow`» (code.claude.com/docs/en/hooks-guide). Qué es «as normal» en cada modo no está documentado; lo
consultó un agente sobre las páginas de hooks y de modos de permisos el 2026-10-05.

**Qué lo cierra, y quién**: una persona, en una sesión interactiva, dos veces —una en `acceptEdits` y otra
en `plan`—. En un banco con el gate en rojo y código stageado, con `ANSWERED` de `engine/hooks/confirm.js`
incluyendo ese modo, pedir el commit. Si aparece el diálogo y rechazarlo deja el commit sin crear, el modo
se suma a la lista. Si el commit se crea sin que nadie conteste, queda afuera, como `auto`.

Mientras tanto los dos modos quedan del lado que frena, que es donde el 257 los dejó.
