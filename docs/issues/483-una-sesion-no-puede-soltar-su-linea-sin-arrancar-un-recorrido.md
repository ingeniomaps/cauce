---
caso: 483
titulo: Una sesión no puede soltar su línea sin arrancar un recorrido, y su aprobación pide la ruta absoluta
estado: descartado
prioridad: baja
version-detectada: 0.118.0
---

# 483 — Una sesión no puede soltar su línea sin arrancar un recorrido, y su aprobación pide la ruta absoluta

**⚪ descartado** · detectado en 0.118.0 · prioridad **baja**: pasó una vez, hay cuatro salidas que funcionan, y lo único pedido revierte en parte el caso 445.

## Síntoma

Una sesión coordinó una línea (`ops claim --line <línea>`). Terminado ese trabajo, la persona le pidió otro que no era de la línea, en el checkout principal de un repositorio de la carpeta de sesión. Cada escritura frenó con «esta sesión lleva la línea …», y el mensaje ofrecía pegar en `planning/.ops-approval` la ruta absoluta del repositorio. La persona preguntó por qué hacía falta aprobar algo dentro de su propia carpeta, y por qué con ruta absoluta. Abrió otra sesión para seguir.

Reproducido con el arnés en un banco `sidecar`, línea `mini`, escribiendo `app/src/nuevo.js` en el checkout principal, 2026-11-03:

| Qué hizo la persona | Exit |
|---|---|
| Nada: la sesión lleva la línea | 2 |
| «seguí con lo que te pedí» | 2 |
| Nombra el repositorio, «un cambio en el repositorio app» o «app/» | 2 |
| Nombra el archivo, relativo a la carpeta de sesión, por su nombre o absoluto: «app/src/nuevo.js», «nuevo.js» | 0 |
| Nombra sólo la carpeta: «app/src» | 2 |
| Contesta después del bloqueo, en un turno suyo, con cualquier mensaje que no lo niegue | 0 |
| Nombra la ruta absoluta | 0 |
| `.ops-approval` con `app/src/nuevo.js` | 2 |
| `.ops-approval` con la ruta absoluta | 0 |
| Pide en palabras volver a la principal | 2 |
| `/autobuild` sin línea | Suelta la línea; frena después `plan-first`, que pide plan como en la principal |

Medido en sesiones nuevas por caso, con el arnés, en la revisión del 2026-11-03: el chat aprueba un destino si el mensaje nombra su ruta absoluta o el nombre del archivo (`CHAT.mentions`, `engine/hooks/chat.js:122`), nunca su carpeta. Una medición anterior de este caso daba por buena la carpeta: pasaba porque el mensaje llegaba después de un bloqueo, y ahí cualquier respuesta que no lo niegue confirma.

Confirmar tiene dos límites:

- Una confirmación aprueba lo que ya se frenó, no lo que viene: según la sesión que lo escribió, su «dale» llegó antes del bloqueo.
- El bloqueo del turno en que la persona escribió `/autobuild <línea>` no se destraba con el mensaje siguiente. Es diseño: ese turno es el recorrido, sin nadie a quien preguntar, y el chat no guarda su bloqueo (`engine/hooks/chat.js:240-256`).

Según la sesión que lo escribió, aquel día el guard frenó unas siete escrituras: el checkout principal de cinco repositorios, la carpeta de respaldos de otra línea y la configuración local. La absoluta en `.ops-approval` queda para siempre, para cualquier sesión de línea, y no vale en otra máquina; por eso la persona preguntó por la relativa.

## Causa raíz

- **Volver a la principal lo dice sólo `/autobuild`.** `told()` (`engine/hooks/line-scope.js:68-78`) reconoce el pedido de la persona sólo en `/autobuild`, que además arranca el recorrido. El porqué está en el comentario de `:64-67`: lo que esto contiene es al agente, y un comando suyo no puede cambiar de línea.
- **La línea anotada no se suelta con el trabajo.** `remember()` (`:81-92`) la guarda en el temporal de la sesión; `ops release` suelta la tarea, no la línea.
- **La aprobación es exacta.** `left()` (`engine/hooks/approval.js:73-76`) compara contra las líneas de `.ops-approval` tal cual: una ruta relativa no coincide con la absoluta del destino.

## Fix propuesto

Sólo el punto que la persona preguntó: que `.ops-approval` acepte una ruta relativa a la carpeta de sesión, y que el mensaje la ofrezca así.

**Plan.**

1. `left()` (`engine/hooks/approval.js:73-76`) suma, a cada línea relativa, su forma resuelta contra la carpeta de sesión, `LT.sessionOf(root)` (`engine/core/line-trees.js:29`). Relativa es una línea sin `/` inicial, sin espacios, distinta de `.` y sin `..`. La comparación sigue exacta, sin patrones, como pide el caso 103.
2. El mensaje (`HOW`, `engine/hooks/approval.js:188-193`) muestra relativa a la carpeta de sesión cada ruta que cae dentro de ella.
3. Sólo en una instancia `sidecar`: en una embebida `sessionOf` da vacío y todo queda como hoy.

**Probado en una copia, sin tocar el repositorio, 2026-11-03.** Con el paso 1 aplicado, la misma reproducción:

| `.ops-approval` | Motor actual | Copia |
|---|---|---|
| `app/src/nuevo.js`, relativa a la carpeta de sesión | 2 | 0 |
| `src/nuevo.js`, relativa al repositorio | 2 | 2 |
| `../sidecar/app/src/nuevo.js` | 2 | 2 |
| La ruta absoluta | 0 | 0 |

Con ese cambio, `test/hooks` pasa, 431 de 431. El paso 2 no se probó.

**Prueba a escribir:** en `test/hooks/`, una línea relativa aprueba su destino; una relativa al repositorio, una con `..`, `.` y una con espacios no aprueban nada; la absoluta sigue igual, y en una instancia embebida lo relativo no cambia nada. Mutaciones: quitar la resolución, aceptar `..`, y resolver contra la raíz de la instancia en vez de la carpeta de sesión.

**Se decidió que no:**

- **Nombrar el repositorio por su nombre en el chat:** una sola frase aprobaría escribir en todo su checkout principal durante ese turno.
- **Un pedido para soltar la línea sin arrancar nada:** es un pedido nuevo de producto, no puede salir de una lista de palabras, y abrir otra sesión ya lo resuelve.

## Tradeoffs

- **Quién depende:** `left()` está detrás de `pending` y `pendingNow`, que usan 15 archivos de `engine/hooks/`. Cambia la aprobación de todos los guards por archivo, no sólo la de la línea. Sus ítems no son siempre rutas —claves de dependencias, comandos de `workers`, ítems de Jira—: una línea relativa sólo agrega su forma resuelta, y lo que ya coincidía tal cual sigue coincidiendo.
- **Una línea relativa vale para toda la carpeta de sesión**, no para una instancia en particular. Es lo que la persona espera, y es lo mismo que ya hace una absoluta.
- **Revierte en parte el 445.** Ese caso decidió que una ruta relativa no apruebe nada: `package.json` nombraba el manifiesto de todos los repositorios y árboles (`engine/hooks/approval.js:35-37`), y `check` avisa las líneas relativas como «ya no aprueba nada» (`:253-256`). Resolver contra la carpeta de sesión no reabre aquel defecto —la prueba del 445 sigue pasando en la copia—, pero una línea relativa con carpeta escrita antes del 445 volvería a aprobar, y el aviso de `check` quedaría falso. Pendiente de decidir, con dos resguardos propuestos: que `check` siga avisando las relativas que no nombran nada dentro de la carpeta de sesión, y que el mensaje siga ofreciendo la absoluta y sume la relativa.
- **`self-approval` comparte el parser de `.ops-approval`** (caso 119), y compara líneas como texto: una relativa que el agente agregue es una línea nueva y frena igual (`engine/hooks/self-approval.js:98-99`, leído, no corrido). La prueba tiene que afirmarlo.

## Contexto de descubrimiento

Una corrida de una instancia real, escrita por otra sesión de esa instancia. Se saneó el nombre de la instancia, de la persona y de sus rutas. La instancia agregó en su guía que la sesión de coordinación termina al entregar.

## Relacionados

Casos 422, 449, 453.

## Cierre

Descartado el 2026-11-03 por decisión de la persona, coordinado con la sesión que lo escribió.

- **Ruta relativa en `.ops-approval`.** Revierte en parte el 445 y toca la aprobación de 15 guards. El plan y el prototipo quedaron arriba, probados en una copia.
- **Una pista en el bloqueo.** Se escribió una que decía «nombrá la carpeta», y la revisión mostró que era falsa: la carpeta no aprueba nada. Se quitó antes de commitearla. El bloqueo ya dice lo que funciona: confirmar después de frenar.
- **Nombrar el repositorio, y soltar la línea sin arrancar nada:** no, por lo dicho en «Fix propuesto».

Por qué descartado y no aplazado: pasó una sola vez, la instancia ya cerró la sesión de coordinación al entregar, y no hay cuándo hacerlo. Si vuelve con más casos, el plan y el prototipo de arriba son el punto de partida.

Lo que sí funciona hoy, y es lo que se le dijo a esa instancia: nombrar el archivo, contestar después del bloqueo en un turno de la persona, pegar la ruta absoluta, o llevar el trabajo de afuera de la línea a otra sesión.
