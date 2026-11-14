---
caso: 503
titulo: Lo que la persona pidió antes de `init` no cuenta para los guards, y el bloqueo no dice por qué
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 503 — Lo que la persona pidió antes de `init` no cuenta para los guards, y el bloqueo no dice por qué

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: frena dos veces a quien instala Cauce desde el runner y le pide trabajo en el mismo mensaje. Se destraba con un mensaje nuevo, pero nada lo dice.

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

## Cierre

Las dos mitades del fix, cada una donde la pedía el caso:

- `install`, dentro de una sesión de Claude Code, cierra diciendo que lo que la persona pidió antes no quedó registrado
  para los guards y que tiene que repetirlo en una sesión nueva. Es la misma línea del caso 502 y sale cuando la
  configuración que había no traía el hook de mensaje.
- `plan-first` y la gobernanza, cuando la sesión no tiene ningún registro de mensaje, agregan al bloqueo: «No hay ningún
  mensaje de la persona registrado en esta sesión: si Cauce se instaló con la sesión abierta, lo que pidió antes no
  cuenta para este guard. Pedile que abra una sesión nueva y lo repita ahí.» La línea vive en
  `engine/hooks/unrecorded.js`. No exime nada.

Línea de base: la reproducción del caso con el motor de la rama, sobre una copia de la instancia de la corrida a ciegas.
Los dos guards daban `exit=2` sin decir nada del registro, y `exit=0` después de un mensaje.

Contra el caso:

- **Fix, la línea de cierre de `install`:** se hizo, junto con el 502. Dice que lo repita «ahí», en la sesión nueva, y
  no en la misma. Que la sesión abierta registre los mensajes que siguen a la instalación no está medido: en la corrida
  a ciegas el «dale» que destrabó entró por una reanudación, que es un proceso nuevo.
- **Fix, la línea en los dos guards sólo sin registro:** se hizo distinto. No se separó `said`, y eso deja sin lugar el
  tradeoff de tocar la función que leen todos los guards de chat. La pregunta nueva es una función aparte que mira si
  existe el archivo de registro de la sesión. `said`, `confirmed` y `askable` no cambiaron.
- **Fix, prueba con y sin registro, y la mutación de «dar la línea siempre»:** se hizo, en
  `test/hooks/unrecorded.test.js`. La mutación pone en rojo el caso del registro de otro mensaje, como el caso pedía.
- **Lo que no se propone, eximir por ausencia de registro:** respetado. La función sólo devuelve texto, y la prueba
  comprueba que los dos guards frenan en todos los casos (`messageOf` falla si no bloquean).
- **Tradeoff, no quita el freno:** se mantiene.
- **Tradeoff, el diálogo de `-p`:** no se tocó, como decía el caso.

Lo que el caso no preveía:

- **CI, un rol delegado y un subagente tampoco tienen registro**, y ahí la línea sería falsa: no hay una persona que
  repita nada. Los tres la callan, con una aserción cada uno.
- **Antigravity no registra mensajes**, y la línea no le sale porque su puente manda `sessionId` y no `session_id`
  (`automatization/runners/antigravity/hook.js:140`). Está declarado en el encabezado de `unrecorded.js`.
- **`chat.js` está a 498 líneas**, y por eso la función vive en un archivo propio. `chat.js` exporta además
  `recordPath` y `delegated` para no duplicarlas.

### Lista de cierre

1. hecho: la reproducción del caso, con la salida pegada en «Síntoma», repetida al empezar sobre una copia nueva
   (`/var/tmp/repro-503`).
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: `unrecorded.test.js` en rojo con `files.js` y `governance.js` sin el cambio (`git stash`), y en verde con
   ellos.
4. hecho: cuatro mutaciones, todas en rojo: dar la línea aunque haya registro (rojo en el registro de otro mensaje), y
   sacar cada exclusión: `agent_id`, `CI` y `CAUCE_DELEGATED`.
5. no aplica: no se quita ni se reemplaza nada. El bloqueo conserva su texto y suma una línea.
6. hecho: la reproducción del caso con el motor de la rama sobre la copia. Sin registro, `plan-first` y la gobernanza
   dan `exit=2` con la línea nueva (la gobernanza, con las 172 rutas de la instancia stageadas). Con un mensaje, los
   dos `exit=0`. Con un registro de otro mensaje, `plan-first` frena sin la línea. Se repitió con el texto final.
7. hecho: el hook corre como lo corre el runner, por `engine/hooks/run.js` con el payload de Claude Code. La mitad de
   `install` corrió desde una sesión real de Claude Code (cierre del 502).
8. hecho: corrieron `plan-first` y la gobernanza, con y sin registro, con registro de otro mensaje, y con subagente,
   CI y rol delegado. No corrieron Codex ni Gemini, que mandan `session_id` y usan la misma función.
9. hecho: dos guards, y dos sesiones por guard: una sin registro y otra con el registro de otro mensaje.
10. hecho: `said` y sus lectores no cambiaron. `chat.js` sólo suma dos exportaciones, sin ciclo: `unrecorded.js`
    requiere sólo `chat`.
11. hecho: las tres pasadas independientes del 502 cubrieron este diff. De la primera salieron dos menores de acá: el
    encabezado afirmaba que la función excluía un runner sin hook de mensaje, cuando eso pasa por el payload de
    Antigravity, y «Pedile que lo repita» daba por hecho que la sesión abierta registra. Se arreglaron los dos. Las
    otras dos pasadas no encontraron nada de acá.
12. hecho: pasada uno por uno. El encabezado de la prueba repetía el del módulo y se recortó.
13. hecho: `npm run ci` con los archivos nuevos stageados.
14. hecho: recorrido arriba contra Fix, «Lo que no se propone» y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG junto con el 502.

**Sin probar:** Codex y Gemini en una sesión real, y si la sesión abierta registra los mensajes que llegan después de
instalar.
