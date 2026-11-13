---
caso: 503
titulo: Lo que la persona pidió antes de `init` no cuenta para los guards, y el bloqueo no dice por qué
estado: abierto
prioridad: media
version-detectada: 0.119.0
---

# 503 — Lo que la persona pidió antes de `init` no cuenta para los guards, y el bloqueo no dice por qué

**🔴 abierto** · detectado en 0.119.0 · prioridad **media**: frena dos veces a quien instala Cauce desde el runner y le pide trabajo en el mismo mensaje. Se destraba con un mensaje nuevo, pero nada lo dice.

## Resumen

`plan-first` y la gobernanza eximen lo que la persona pidió en el chat (`CHAT.said`). Ese registro lo escribe el hook `UserPromptSubmit`, que `init` instala. Un pedido hecho antes de `init` («instalá Cauce y llevá una tarea de punta a punta») entra cuando el hook todavía no existe, así que no queda registrado. Los dos guards tratan lo que sigue como trabajo que el agente decidió solo. El primer commit de la instancia se frena con 53 rutas para aprobar, y escribir un archivo de producto se frena por falta de plan. Basta un mensaje nuevo de la persona para que los dos pasen, y ninguno de los dos mensajes de bloqueo lo dice.

Junta los pasos 9 y 12 del informe a ciegas del caso 494: son el mismo defecto y piden la misma decisión.

## Reproducción

Sobre una copia de la instancia que dejó la corrida a ciegas (`/var/tmp/repro-494-12`, `sidecar` con `ops/` dentro del repo), con el motor de esta rama y una sesión sin registro previo:

1. `plan-first`: payload `PreToolUse` `Write` sobre `INFORME-CIEGO.md` en la raíz del proyecto, con `cwd` en `ops/`, WIP en IDLE y cuatro tareas en `BACKLOG.md`.
2. Gobernanza: la instancia stageada (`.gitignore`, `.claude`, `CLAUDE.md`, `ops`, 172 rutas) y un payload `PreToolUse` `Bash` con `git commit`.
3. Un `UserPromptSubmit` con un pedido cualquiera en la misma sesión, y los dos payloads otra vez.

Con el motor 0.119.0 que la copia trae instalado, el paso 1 da lo mismo.

## Síntoma

```
== plan-first, sin mensaje registrado
exit=2
BLOQUEADO: /var/tmp/repro-494-12/proyecto/INFORME-CIEGO.md cambia el producto sin plan. WIP está en IDLE, así que el plan todavía no está escrito.
== con mensaje
exit=0

== gobernanza, sin mensaje registrado
exit=2
BLOQUEADO: El commit toca gobernanza protegida.
Esto lo aprueba una persona: que pegue ella tal cual en ops/planning/.ops-approval estas líneas:
  (53 rutas)
== con mensaje
exit=0
```

En la corrida a ciegas pasó así: el bloqueo de `plan-first` (`.jsonl`, línea 472) cayó con el pedido original. La misma escritura pasó (línea 509) después del «dale» de la reanudación, que ya entró con el hook instalado. La sesión lo anotó: «el guard me dejó crearlo después de tu "dale"».

## Causa raíz

- `engine/hooks/chat.js:232-276`, `record`: escribe el registro cuando corre el hook de mensaje. Un mensaje anterior a la instalación no pasa por él.
- `engine/hooks/chat.js:293-302`, `said`: sin registro devuelve `null`.
- `engine/hooks/files.js:259` (`plan-first`) y `engine/hooks/governance.js:48` eximen sólo con `CHAT.said(input)`.
- Ninguno de los dos mensajes de bloqueo dice que lo pedido antes de instalar no se registró.

## Fix propuesto

El mismo remedio que el caso 502, y por eso conviene construirlos juntos. Cuando `install` corre dentro de una sesión del runner, su línea de cierre dice además que lo pedido antes no quedó registrado y que el pedido se repite en la sesión nueva.

Además, en los dos guards: cuando `said` da `null` porque **no hay registro** de la sesión (no porque el registro sea de otro mensaje o de un subagente), el bloqueo agrega una línea: «No hay ningún mensaje tuyo registrado en esta sesión: si Cauce se instaló con la sesión abierta, lo que pediste antes no cuenta. Repetilo o abrí una sesión nueva». Prueba con y sin registro; mutación: dar la línea siempre pone roja la de «con registro de otro mensaje».

**Lo que no se propone:** eximir por ausencia de registro. Sin registro también están CI, un subagente y un runner sin hook de mensaje, y ahí el guard tiene que frenar.

## Tradeoffs

- **No quita el freno, lo explica.** La persona igual tiene que escribir un mensaje. Es deliberado: no hay forma de saber qué dijo antes del hook.
- **`said` hoy no distingue «sin registro» de «registro de otro mensaje».** Separarlo toca la función que leen todos los guards de chat. Se prueba que los otros lectores (`confirmed`, `askable`) no cambian.
- El paso 9 del informe decía además que el mensaje nombra un diálogo que en `-p` no aparece. En la corrida a ciegas el guard devolvió `permissionDecision: ask`, y el texto ya trae «si no hay nadie que conteste, no reintentes». No se toca.

## Contexto de descubrimiento

Pasos 9 y 12 del informe de la corrida a ciegas del caso 494 (2026-11-05). Reproducidos el 2026-11-13 sobre la copia de esa instancia, con los hooks llamados directo.

## Relacionados

- 494, de donde sale.
- 502: la misma sesión abierta antes de `init`, por el lado de los subagentes.
- 098 y 126: por qué `plan-first` y la gobernanza eximen lo que la persona pidió.
