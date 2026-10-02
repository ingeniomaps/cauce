---
caso: 221
titulo: la confirmación por chat aprueba un bloqueo que la persona no nombró
estado: resuelto
resuelto-en: 0.100.0
prioridad: alta
version-detectada: 0.99.2
---

# 221 — Después de un bloqueo, cualquier mensaje que no niegue ni pregunte lo aprueba, aunque hable de otra cosa

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **alta**.

**Prioridad alta**: una defensa que se abre sola. En conorbi-ops así se mergeó un PR sin que nadie lo pidiera (commit 62bf914, PR #14).

## Resumen

Desde el caso 184 lo frenado queda pendiente, y el siguiente mensaje humano que no niegue, no frene y no pregunte lo aprueba. El 184 lo hizo para que «listo», «claro» o «bueno dale» no volvieran a frenar lo que la persona acababa de aprobar; el costo es que un mensaje sobre otro tema también aprueba.

## Reproducción

Corrido el 2026-10-01 contra `main` con el arnés de hooks (`pushRoot` y `chatSession` de `test/support/hooks-harness.js`):

```
1. el agente empuja sin que nadie lo pida: BLOQUEADO
2. la persona pide otra cosa, sin nombrar el push; el agente reintenta: PASA
```

El segundo mensaje fue «agregá una regla nueva a planning/rules/process.md sobre los nombres de rama».

## Síntoma

Un push, un merge o cualquier ítem retenido se ejecuta con un mensaje que no lo autorizaba. conorbi lo vivió con un merge, y lo dejó escrito en el commit 62bf914: «Cauce toma cualquier respuesta que no niegue ni pregunte como el «sí» de un bloqueo pendiente. Así se mergeó el PR #14 mientras Manuel agregaba una regla». Su guard de entrega ahora exige que el mensaje pida mergear.

## Causa raíz

`engine/hooks/chat.js`, `record`: `answered = human && previous && !refuses(text) && !flowCommand(text) ? previous.pending.filter(...)`. `refuses` (líneas 165-174) sólo mira negación, freno y pregunta.

## Fix propuesto

Que una respuesta apruebe un pendiente sólo si lo nombra o si es una confirmación sin otro pedido. Dos formas, a decidir:

- Por ítem de riesgo: los ítems de publicación (push, merge) exigen que el mensaje los nombre —como `ordersPush` ya hace para el push ordenado—, y los demás siguen con la regla del 184.
- Por forma del mensaje: un mensaje que trae un pedido propio sobre otra cosa no es una respuesta al bloqueo.

## Tradeoffs

- Choca con lo que el 184 arregló y con no frenar a la persona: hay que comprobar con los mensajes que el 184 juntó que «dale», «listo» o «sí, mandale» sigan aprobando.
- La primera forma es más simple y protege lo que no se puede deshacer.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. Contrastado contra `engine/hooks/chat.js` de `main`.

## Relacionados

- 184 — la decisión que esto acota.
- 225 — el guard de entrega, que heredaría esta confirmación.

## Cierre

Resuelto en 0.100.0 con una salida que el caso no listaba. Manuel la pidió el 2026-10-01: la aprobación se
exige, pero sin limitar a la persona a ciertas palabras. Las dos formas del fix se descartaron por eso: las
dos deciden por las palabras del mensaje.

- **La forma elegida:** con Claude Code, el guard ya no deja el ítem esperando un sí del chat. Le pide al
  runner su diálogo nativo (`permissionDecision: "ask"`), con el motivo del guard. La persona aprueba o
  rechaza esa acción puntual, y un mensaje sobre otra cosa no aprueba nada porque no queda nada pendiente.
  Vale para todo lo que hoy pasaba por la confirmación del chat —también decisión de Manuel—:
  - el push (`push.js`);
  - lo que arma `AP.HOW`: credenciales, gates en rojo, gobernanza, migraciones, dependencias y pruebas
    apagadas;
  - lo que el agente quiere escribirse en `.ops-approval` (`self-approval.js`).
- **Un grupo de guards no se corta por una pregunta.** Si cortara, aprobar el diálogo dejaría correr la
  herramienta sin que los guards siguientes la miraran. `executeAll` junta las preguntas, deja correr los
  demás y, si alguno bloquea de verdad, gana el bloqueo; si no, va un solo diálogo con todos los motivos.
  La marca de «preguntar» se limpia antes de cada guard, así que un guard que no llega a bloquear no puede
  convertir en pregunta el bloqueo de otro.
- **Sin nada que aprobar no hay diálogo.** `plan-first` con un plan a la vista pide escribir el plan, no un sí.
- **Lo que se pide nombrándolo en el chat sigue pasando sin preguntar** (caso 117): es una orden y no una
  confirmación. Lo que sigue sin salida —la rama viva, reescribir historia— sigue bloqueado sin diálogo.
- **Codex y Gemini no cambian:** no tienen diálogo, y siguen con la confirmación por chat del caso 184.
  Claude Code se distingue por `prompt_id`, que es el campo que ya usaba `chat.js`.
- **Tradeoff: no frenar a la persona** — el diálogo no exige ninguna palabra; es un clic.

Lo que el caso no preveía:

- **El texto del motivo tiene dos lectores.** La persona lo ve en el diálogo, y el agente lo recibe como
  error cuando no hay diálogo (`claude -p`). Por eso dice qué pasa en cada caso y no le da órdenes a ninguno.
- **Queda sin medir:** el diálogo dentro de un workflow (`autobuild`). Se midió para un subagente lanzado con
  `Agent`, que es como delega un workflow, pero no dentro de una corrida de workflow. Lo mide la primera
  corrida real de `autobuild` que frene algo; si ahí el diálogo no aparece, la corrida lo recibe como
  rechazo, igual que hoy recibe el bloqueo.

Prueba real:

- **El mecanismo, con un hook mínimo**, en un banco aparte, sesión interactiva de Manuel en
  `bypassPermissions`:
  - El diálogo aparece; aprobado, el comando corre.
  - Rechazado, no corre, y el agente recibe «The user doesn't want to proceed… STOP».
  - Para la llamada de un subagente lanzado con `Agent`, el hook recibe `agent_id`, pide el diálogo y el
    comando corre después de aprobarlo.
  - En `claude -p`, el diálogo cuenta como rechazo y el agente recibe el motivo.
- **Con Cauce instalado desde esta rama**, en un banco `suelto`:
  - Con `claude -p` y un pedido que no nombra el archivo, el agente informó «el guard de lectura de
    credenciales bloqueó el Read», con el motivo de Cauce textual, y no lo intentó por otro camino. Costó
    USD 0,52.
  - Con un pedido que nombraba `ops/.env`, la lectura pasó sin diálogo, que es la orden por chat del 117.
  - En la sesión interactiva de Manuel, el primer `Read` sobre `ops/.env`, rechazado, devolvió «The user
    doesn't want to proceed», y el segundo, aprobado, devolvió el contenido.
- **Siete mutaciones en una copia, cada una en rojo por `test/hooks/native-confirmation.test.js`:**
  - Nunca diálogo.
  - Diálogo también en Codex.
  - La pregunta corta el grupo.
  - El push sigue anotando para el chat.
  - La salida equivocada (`deny`).
  - Diálogo sin nada que aprobar.
  - `HOW` sigue anotando para el chat. Ésta sobrevivió a la primera versión de las pruebas: hizo falta el
    reintento después de un mensaje sobre otra cosa.
