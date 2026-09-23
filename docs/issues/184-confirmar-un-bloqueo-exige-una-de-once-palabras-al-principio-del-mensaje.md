---
caso: 184
titulo: Confirmar un bloqueo exige que el mensaje empiece con una de once palabras, así que «listo», «claro» o «bueno dale» vuelven a frenar lo que la persona aprobó
estado: resuelto
resuelto-en: 0.98.0
prioridad: media
version-detectada: 0.97.0
---

# 184 — Una confirmación no es una contraseña

**🟢 resuelto en 0.98.0** · detectado en 0.97.0 · prioridad **media**. La persona confirma con sus palabras,
y lo que el guard sigue decidiendo es sólo la dirección segura.

## Resumen

Cuando un guard frena algo con una persona en el chat, le pide al agente que le pregunte y dice «si
contesta «dale», reintentá». Lo que el guard reconocía como confirmación era una lista cerrada de once
formas —*sí, dale, ok/okay, hazlo/hacelo, adelante, aprobado, apruebo, apruébalo, de acuerdo, yes*— y sólo
**al principio** del mensaje (`YES` en `engine/hooks/chat.js`). «Listo», «claro», «confirmo», «procede»,
«está bien» o «bueno dale» no contaban, y el reintento volvía a frenar lo que la persona acababa de aprobar.

La confirmación es de la persona, y juzgar si lo que escribió es un sí le toca al agente que lo lee. Una
palabra obligatoria es una camisa de fuerza que no protege de nada que no proteja ya la dirección segura.

## Reproducción

Con los hooks reales —`automatization/hooks/guard-chat.sh` para el mensaje y `guard-dependencies.sh` para
el commit—, sobre un banco `suelto` con un cambio de versión staged sin su lock: una sesión por respuesta,
el pedido, el bloqueo, la respuesta y el reintento. El script quedó en el scratchpad de la sesión como
`repro184.sh`; su forma es la de `chatSession` en `test/support/hooks-harness.js`, con las llamadas por
stdin como las hace el runner.

## Síntoma

Sobre 0.97.0, el 2026-09-23:

```
PASA   bloqueo=2  respuesta «dale»
PASA   bloqueo=2  respuesta «sí, adelante»
FRENA  bloqueo=2  respuesta «listo»
FRENA  bloqueo=2  respuesta «claro»
FRENA  bloqueo=2  respuesta «confirmo»
FRENA  bloqueo=2  respuesta «procede»
FRENA  bloqueo=2  respuesta «perfecto, seguí»
FRENA  bloqueo=2  respuesta «bueno dale»
FRENA  bloqueo=2  respuesta «está bien, commitealo»
```

## Causa raíz

- **`engine/hooks/chat.js`, `YES`**: la regex de once formas anclada al principio, y `record` aprobaba lo
  pendiente sólo si el mensaje la cumplía.
- **`engine/hooks/approval.js`, `HOW`**, y los mensajes de `push.js` y `self-approval.js`: le decían al
  agente «si contesta «dale», reintentá», que es lo que convertía la palabra en la única salida.

## Fix propuesto

- Sin lista: el mensaje siguiente a un bloqueo aprueba lo que quedó frenado, salvo que **niegue** (la
  misma `NEGATION` que ya revocaba), **arranque frenando** —«pará», «esperá», «cancelá», «stop»— o
  **pregunte**.
- El mensaje del bloqueo le pide al agente que pida la confirmación con las palabras que la persona quiera
  —un «dale» alcanza, pero no hace falta— y que no reintente si ella duda, pregunta o dice que no:
  juzgarlo le toca a él.

## Tradeoffs

- **Un mensaje que no niega, no frena ni pregunta aprueba, aunque no sea una confirmación.** «Dejame
  revisar el lockfile y te aviso» no dispara ninguna de las tres reglas. Lo que evita el reintento ahí es
  el juicio del agente, al que el mensaje del bloqueo se lo pide explícitamente. Es la decisión que tomó
  la persona dueña del proyecto: la confirmación la juzga el agente, no una palabra.
- **Las tres reglas se equivocan hacia el lado seguro.** «Dale, no hay drama» trae un «no» y no aprueba:
  el costo es volver a preguntar.
- **Lo que se frena mientras la persona dice que no, no queda pendiente.** Sin esto, con la lista fuera,
  «no toques el `.env`» → el agente lo intenta → frena → «seguí con lo tuyo» aprobaba el `.env`
  prohibido. Se mira el mensaje entero y no el ítem porque un push no se nombra como un archivo.

## Prioridad

Media. No abre nada que no debiera, pero cada falso bloqueo le cobra a la persona una vuelta más, y le
enseña que el sistema no entiende lo que dice.

## Contexto de descubrimiento

La persona preguntó si «lo del dale» ya estaba arreglado —si confirmar tiene que ser una palabra
específica— antes de publicar 0.98.0. Probado contra el reconocedor, no lo estaba.

## Relacionados

- **166**, **170**: la salida por chat y su alcance. Este caso cambia qué cuenta como confirmación, no a
  quién ni a qué alcanza.
- **181**: el guard de dependencias, sobre el que se reprodujo.

## Cierre

**Resuelto en 0.98.0, por el camino propuesto.** Recorriendo lo que enumeró:

- **Sacar la lista → se hizo.** `YES` se fue. `refuses` decide sólo la dirección segura: `NEGATION`,
  `HALT` —el mensaje que arranca frenando— o una pregunta.
- **El mensaje del bloqueo → se hizo, en los cuatro lugares que decían «dale»**: `approval.js`, los dos
  de `push.js` y `self-approval.js`. También `template/AGENTS.md` y `automatization/hooks/README.md`, que
  es lo que lee una persona de cada empresa.
- **Tradeoff «lo negado queda pendiente» → encontrado al correr la suite y arreglado.** Seis pruebas
  existentes fallaron al sacar la lista. Dos marcaban ese riesgo (un `.env` y un push que la persona había
  prohibido quedaban aprobables con cualquier mensaje siguiente), y se cerró en `hold`. Las otras cuatro
  asercian el texto viejo del bloqueo o medían otra cosa con una sesión compartida (que nombrar una rama no
  es ordenar el push); se actualizaron sin cambiar lo que miden.

### Qué se corrió

- **La reproducción con los hooks reales, después del arreglo:**

  ```
  PASA   bloqueo=2  respuesta «dale»
  PASA   bloqueo=2  respuesta «listo»
  PASA   bloqueo=2  respuesta «claro»
  PASA   bloqueo=2  respuesta «confirmo»
  PASA   bloqueo=2  respuesta «bueno dale»
  PASA   bloqueo=2  respuesta «está bien, commitealo»
  FRENA  bloqueo=2  respuesta «no»
  FRENA  bloqueo=2  respuesta «mejor no»
  FRENA  bloqueo=2  respuesta «pará»
  FRENA  bloqueo=2  respuesta «¿para qué sirve eso?»
  --- el bloqueo ocurrió mientras decía «no subas la versión»:
  FRENA  bloqueo=2  respuesta «listo»
  ```

- **Prueba nueva en `test/hooks/chat.test.js`**, «un bloqueo se confirma con cualquier palabra, y negar,
  frenar o preguntar no lo aprueba»: ocho confirmaciones pasan, siete respuestas que niegan, frenan o
  preguntan no, y lo frenado bajo una negación no se reabre.
- **Cinco mutaciones en una copia del árbol, las cinco en rojo**: volver a una lista de palabras (el rojo
  previo), que nada niegue, que una pregunta confirme, que frenar confirme, y que lo negado quede
  pendiente.
- **El juicio del agente, con dos agentes reales**, cada uno con el mensaje de bloqueo verdadero y una
  respuesta de la persona, sin decirles qué se medía, y la consigna de contestar si reintentaba:
  - «listo, mandalo así nomás» → `REINTENTO`: «es un sí claro al commit tal como estaba».
  - «mmm, dejame revisar el lockfile primero y te aviso» → `NO_REINTENTO`: «dejó la decisión en
    suspenso». Es justo la respuesta que el guard ya no frena solo, y la que el tradeoff deja en manos del
    agente.

  Son dos corridas, y alcanzan para mostrar que el mensaje se entiende; no miden cuánto varía el juicio.
