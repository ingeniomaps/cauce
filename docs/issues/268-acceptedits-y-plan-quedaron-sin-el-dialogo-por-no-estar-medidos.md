---
caso: 268
titulo: acceptEdits y plan quedaron sin el diálogo por no estar medidos
estado: resuelto
resuelto-en: 0.101.0
prioridad: baja
version-detectada: 0.100.0
---

# 268 — En `acceptEdits` y `plan` los guards bloquean en vez de abrir el diálogo, porque nadie midió esos modos

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **baja**.

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

## Primera medición, sin interfaz: el instrumento no sirve

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

## Cierre

**Resuelto en 0.101.0, midiendo de verdad.** La sesión sin interfaz no servía; una sesión interactiva
manejada por una terminal virtual (`tmux`), sí: ahí hay pantalla, y se ve si el diálogo aparece.

Con Claude Code 2.1.289, en un banco sidecar instalado, el motor del banco pidiendo el diálogo en todos
los modos, el gate en rojo y código stageado:

```
default:           diálogo del guard apareció · rechazado · el commit NO se creó
acceptEdits:       diálogo del guard apareció · rechazado · el commit NO se creó
bypassPermissions: diálogo del guard apareció · rechazado · el commit NO se creó
auto:              diálogo del guard apareció · rechazado · el commit NO se creó
plan:              no llega a commitear: el modo no deja
```

Y en `plan`, con lo que ese modo sí deja hacer —leer—: se pidió un inventario que llevó al agente a abrir
un `.env` sin que la persona lo nombrara. El guard devolvió `permissionDecision: "ask"` a las 19:12:09,
**no apareció ningún diálogo** y el resultado con el contenido llegó a las 19:12:12.

### El recorrido de lo que este caso enumeró

- **Fix, medir cada modo y sumar el que corresponda — se hizo.** `acceptEdits` entra. `plan` queda afuera,
  y ahora por una medición y no por falta de ella: ahí el pedido de confirmación se resuelve solo.
- **Tradeoff «sin interfaz no hay quien conteste» — se resolvió cambiando de instrumento.**
- **`auto` no era de este caso y la medición lo alcanzó.** El control en `auto` mostró el diálogo, que es
  lo contrario de lo que el 257 daba por causa. Se corrigió allá; `auto` sigue afuera.

### Lo que el caso no preveía

- **En modo plan el guard de límites frenaba el archivo de plan del propio runner.** Salió como caso 269.
- **Un pedido que nombra el archivo no mide nada**: «leé app/.env» es una orden de la persona y el guard
  la deja pasar sin preguntar, a propósito. Hubo que pedir algo que llevara al agente a abrirlo solo.

### Qué se corrió

- **Las cinco sesiones interactivas de arriba**, y las dos lecturas en `plan`.
- **La misma lectura en `plan` con la lista ya corregida** en el motor del banco: el contenido del `.env`
  no apareció en pantalla, y el agente le dijo a la persona que el guard había frenado la lectura.
- **La prueba de `native-confirmation`**, que ahora fija `acceptEdits` adentro y `plan` afuera.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: `dontAsk`, y otras versiones del runner.

