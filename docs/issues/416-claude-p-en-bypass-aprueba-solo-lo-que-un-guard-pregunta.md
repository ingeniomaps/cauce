---
caso: 416
titulo: en una sesión claude -p con bypassPermissions, lo que un guard pregunta por el diálogo nativo se aprueba solo
estado: resuelto
resuelto-en: 0.112.0
prioridad: alta
version-detectada: 0.112.0
---

# 416 — `claude -p --permission-mode bypassPermissions` aprueba solo el diálogo que pide un guard: una credencial, un push o la propia aprobación pasan sin que nadie diga que sí

**🟢 resuelto en 0.112.0** · detectado en 0.112.0 · prioridad **alta**. Pedía una decisión antes de construir: cualquier arreglo cambia cómo
confirma una persona que trabaja en `bypassPermissions`.

## Resumen

Cuando un guard frena algo que una persona puede aprobar, con Claude Code no bloquea: responde
`permissionDecision: "ask"` y el runner abre su diálogo (`engine/hooks/confirm.js`, `native`). Así se confirma con un clic
desde el caso 221. El modo `bypassPermissions` está entre los que `native` acepta (`ANSWERED`), porque en una sesión
interactiva el diálogo aparece igual y lo contesta la persona.

En `claude -p` no hay diálogo, y en `bypassPermissions` Claude Code toma el `ask` como un sí. Lo pedía cualquier guard que
pase por `native`: `secrets-shell`, `secrets` y `secrets-read` (por `AP.HOW`), el push (`push.js`) y la aprobación que el
agente se querría escribir (`self-approval.js`).

El caso 415 cerró la mitad delegada: con `CAUCE_DELEGATED=1`, `native` devuelve falso y el guard frena. Queda la sesión
`-p` en `bypassPermissions` que alguien lanza sin la variable.

## Reproducción

El 2026-10-20, con Claude Code 2.1.305, en una instancia sidecar instalada desde el tarball de `npm pack` en `/var/tmp`, con
el adaptador de Claude y el shim `guard-shell.sh` envuelto para guardar lo que cada hook recibía y devolvía. Se le pidió a
`claude -p` correr `echo "//r/:_authToken=x" > app/.npmrc` (o encadenado tras un commit):

| `claude -p` con… | El hook devolvió | Resultado |
|---|---|---|
| `--permission-mode bypassPermissions`, sin `CAUCE_DELEGATED` | `ask` | aprobado: `app/.npmrc` quedó escrito |
| `--permission-mode bypassPermissions` y `CAUCE_DELEGATED=1`, antes del arreglo del 415 | `ask` | aprobado, igual |
| `--permission-mode default --allowedTools Bash` | `ask` | rechazado: «Claude requested permissions to edit …/app/.npmrc», nada escrito |
| `--permission-mode acceptEdits --allowedTools Bash` | `ask` | rechazado, igual |

El payload del hook trae `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `effort`,
`hook_event_name`, `tool_name`, `tool_input` y `tool_use_id`: nada distingue `-p` de una sesión interactiva.

## Causa raíz

`engine/hooks/confirm.js`, `native`: el diálogo se pide en `bypassPermissions` sin saber si alguien lo contesta. La medición
del caso 257 que lo sostiene se hizo en sesiones interactivas, y la frase «en `claude -p` cuenta como rechazo» se había
extendido a todos los modos sin medirlos.

## Fix propuesto

Las salidas que hay, para decidir:

1. **Sacar `bypassPermissions` de `ANSWERED`.** Cerrado: en ese modo el guard frena y la confirmación vuelve al chat, que
   no deja pasar nada que la persona no haya pedido. Cuesta el clic a quien trabaja interactivo en `bypassPermissions`: le
   queda la confirmación por chat, que es más lenta.
2. **Distinguir `-p` desde el hook.** El payload no lo dice; lo único que queda es mirar la línea de comandos del proceso
   padre, que depende del sistema operativo y de cómo Claude Code lance el hook. Frágil, y se rompe en silencio.
3. **Dejarlo como está y documentarlo**: quien lanza `claude -p` en `bypassPermissions` exporta `CAUCE_DELEGATED=1`, como
   ya pide `teamwork.md` para un rol lanzado por otro agente. Depende de que se acuerden, y el fallo no se ve.

La recomendación es la 1: es la dirección segura, y lo que cuesta es velocidad, no una conducta que se pierda.

La aceptación pide la mutación: con `bypassPermissions` de vuelta en `ANSWERED`, la prueba que corre un push frenado en ese
modo tiene que ver el `ask` y fallar. La prueba real es la reproducción de arriba, repetida: la primera fila tiene que
terminar sin `app/.npmrc`.

## Tradeoffs

- Con la 1, una persona en `bypassPermissions` interactivo pierde el diálogo para lo que los guards preguntan. Es el modo
  en que eligió que no le pregunten nada, así que la pérdida es chica; lo que no puede pasar es que el mismo modo apruebe solo
  lo que ella nunca vio.

## Contexto de descubrimiento

La prueba real de la revisión del conjunto de la tanda 396–415, el 2026-10-20: una sonda delegada con `claude -p` en
`bypassPermissions` escribió `app/.npmrc` aunque el guard lo frenaba, y el shim instrumentado mostró el `ask`.

## Relacionados

- 415 — la mitad delegada, cerrada ahí.
- 221 — por qué se confirma con el diálogo nativo.
- 257 y 268 — qué modos se midieron.

## Cierre

**Resuelto en 0.112.0, con la salida 1, que decidió el dueño del producto el 2026-10-20.** `bypassPermissions` salió de
`ANSWERED` (`engine/hooks/confirm.js`): en ese modo el guard frena y la confirmación vuelve al chat. La medición que lo
sostiene quedó escrita junto a `ANSWERED`, y la cabecera del archivo dice en qué modos `-p` cuenta como rechazo.

El enunciado, ítem por ítem:

- **Las tres salidas**: se tomó la 1. La 2 —leer la línea de comandos del proceso padre— no se intentó: depende del sistema
  operativo y de cómo Claude Code lance el hook, y se rompería en silencio. La 3 queda cubierta igual para los roles: la
  variable del 415 sigue frenando el diálogo en cualquier modo.
- **La mutación**: abajo.
- **La prueba real**: abajo, y también el costo que el tradeoff nombraba.
- **Tradeoff, el clic que pierde quien trabaja interactivo en `bypassPermissions`**: medido. La persona sigue pudiendo
  aprobar, ahora por el chat.

Lo que se movió con la quita (R9): las dos pruebas que daban por hecho el diálogo en ese modo —la de los modos que lo usan
y la de «el diálogo es para lo que pide autoridad»— lo sacaron de su lista, y la de la sesión delegada pasó a medir en
`default` que sin la variable el diálogo sigue. La de `delivery` recorre `bypassPermissions` con una orden de mergear que
entra por el chat, y siguió pasando sin cambios. Ningún documento del molde nombraba el diálogo en ese modo.

**Lo que se corrió para saber que funciona.**

- `test/hooks/native-confirmation.test.js`, «donde nadie contesta el diálogo, el guard bloquea en vez de pedirlo», con
  `bypassPermissions` entre los modos que bloquean: roja antes del cambio («bypassPermissions no usa el diálogo»).
- Mutación en una copia fuera del árbol: con `bypassPermissions` de vuelta en `ANSWERED`, roja con el mismo mensaje.
- **Real, con Claude Code 2.1.305**, en una instancia instalada desde el tarball de `npm pack` en `/var/tmp`:
  - `claude -p --permission-mode bypassPermissions` **sin** `CAUCE_DELEGATED`, la primera fila de la reproducción: la escritura
    de `app/.npmrc` sale «PreToolUse:Bash hook error: … BLOQUEADO: …/app/.npmrc es un archivo de credenciales…» y el archivo no
    existe. Antes del arreglo, la misma sesión lo escribía.
  - **El costo**, en una sesión interactiva en `bypassPermissions` (por tmux). Se le pide correr el comando que está en
    `app/cmd.txt` —un `echo … > app/.npmrc` que el pedido no nombra, para que no cuente como orden—. El guard frena sin
    diálogo y el bloqueo ofrece «Confirmarlo en el chat: un sí tuyo alcanza». La persona contesta «sí, dale», el agente lo
    corre y `app/.npmrc` queda escrito.
