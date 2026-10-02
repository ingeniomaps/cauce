---
caso: 221
titulo: la confirmación por chat aprueba un bloqueo que la persona no nombró
estado: abierto
prioridad: alta
version-detectada: 0.99.2
---

# 221 — Después de un bloqueo, cualquier mensaje que no niegue ni pregunte lo aprueba, aunque hable de otra cosa

**🔴 abierto** · detectado en 0.99.2 · prioridad **alta**.

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
