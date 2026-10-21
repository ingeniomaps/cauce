---
caso: 424
titulo: el bloqueo que corrige el agente le habla a un subagente de «esa confirmación», que el texto nunca ofreció
estado: resuelto
resuelto-en: 0.113.0
prioridad: baja
version-detectada: 0.112.0
---

# 424 — Con `fixable` y un subagente, `AP.HOW` dice «no hace falta preguntarle a nadie» y en la frase siguiente «esa confirmación cubre lo que se frenó»

**🟢 resuelto en 0.113.0** · detectado en 0.112.0 · prioridad **baja**. Es un texto, no un permiso: nada pasa de más ni de menos.
Pero quien lo lee no sabe qué hacer con la segunda mitad.

## Resumen

`HOW` (`engine/hooks/approval.js:111`) arma la salida de un bloqueo. Con `fixable` y `agent_id`, el principio es «Esto lo
corregís vos, con lo que dice arriba: no hace falta preguntarle a nadie. Si no hay forma de hacerlo así, devolvele el
bloqueo a quien te lanzó.» Si además la sesión tiene a quién preguntarle (`chat`), se le pega la cola de la rama del chat:
«Esa confirmación cubre lo que se frenó y nada más… y sigue valiendo en los mensajes siguientes hasta que ella lo niegue».
En la rama de la persona esa frase sigue a «pedile que lo confirme», y tiene sentido; acá no hubo ninguna confirmación de
la que hablar. Lo usan los diez bloqueos con `fixable: true`: `verify` (tres), `plan-first`, `migrations`, `comments`,
`workers`, dos de `files.js` y el de la línea (`line-scope.js`).

## Reproducción

El 2026-10-21, en una sesión real de Claude Code sobre un banco instalado (la prueba del caso 423), un subagente corrió
`git -C /var/tmp/w423/app switch -c tmp` desde la línea `piloto` y recibió:

```
… Si la línea tiene que trabajar otro repositorio, se suma con `ops line <ops-root> piloto <repo>`.
Esto lo corregís vos, con lo que dice arriba: no hace falta preguntarle a nadie. Si no hay forma de hacerlo así, devolvele
el bloqueo a quien te lanzó. Esa confirmación cubre lo que se frenó y nada más —algo nuevo vuelve a frenar— y sigue
valiendo en los mensajes siguientes hasta que ella lo niegue. Si prefiere aprobarlo a mano, que pegue ella tal cual en
ops/planning/.ops-approval estas líneas:
```

El agente principal lo señaló solo: «El mensaje se contradice… Para un subagente bloqueado sobra todo a partir de "Esa
confirmación…"».

## Qué haría falta

- Que con `fixable`, la frase sobre el alcance de la confirmación diga primero de qué confirmación habla —la de la
  persona, si quien lo lanzó se lo pregunta—, o que no salga para un subagente.
- Mirar si la rama sin subagente (`fixable` y la persona en el chat) se lee bien: «si la persona quiere dejarlo pasar
  igual, alcanza con que lo confirme con sus palabras. Esa confirmación…» sí encadena.
- Las pruebas de `HOW` que fijan el texto, en `test/hooks/`.

## Relacionados

- 423 — en cuya prueba real apareció.
- 285 — la salida `fixable`.
- 186 — lo que un subagente hace con un bloqueo.

## Cierre

**Resuelto en 0.113.0**, a pedido del dueño el 2026-10-21 («arregla el 424»). La rama de `fixable` con subagente
(`engine/hooks/approval.js:141`) dice ahora lo mismo que la del subagente sin `fixable`: «devolvele el bloqueo a quien te
lanzó, para que se lo pregunte a la persona: si ella lo confirma, el mismo cambio pasa aunque lo reintente un subagente».
La frase que sigue —«Esa confirmación cubre lo que se frenó…»— tiene ahora a qué referirse.

El enunciado, ítem por ítem:

- **Que la frase sobre el alcance diga de qué confirmación habla, o no salga para un subagente**: se hizo lo primero. Es
  lo que pasa de verdad —quien lo lanzó le pregunta a la persona, y su confirmación vale para el reintento del subagente
  (caso 186)—, así que callarlo le quitaba al subagente la salida que existe.
- **Mirar si la rama sin subagente se lee bien**: se miró, y sí: «alcanza con que lo confirme con sus palabras. Esa
  confirmación…» encadena. Sin persona en el chat no sale la frase: queda la de pegar en el archivo de aprobación.
- **Las pruebas que fijan el texto**: `test/hooks/native-confirmation.test.js` ya fijaba el principio para un subagente;
  ahora fija también que «Esa confirmación cubre» venga después de «si ella lo confirma».

**Lo que se corrió para saber que funciona.**

- La aserción nueva, vista en rojo antes del arreglo («AssertionError: default general-purpose») y en verde después, en los
  tres modos de permiso y los dos tipos de subagente que manda Claude.
- Los guards como proceso sobre un banco `ops bench sidecar`, con el bloqueo de la línea —uno de los diez que usan
  `fixable`— en las tres ramas. Subagente con la persona en el chat: «…devolvele el bloqueo a quien te lanzó, para que se
  lo pregunte a la persona: si ella lo confirma, el mismo cambio pasa aunque lo reintente un subagente. Esa confirmación
  cubre lo que se frenó y nada más…». La sesión con la persona: «…alcanza con que lo confirme con sus palabras. Esa
  confirmación cubre…». Subagente sin chat: sin la frase, con la salida del archivo de aprobación.
- No se corrió una sesión real de un runner para esto: lo que cambia es el texto, y el texto es la salida del proceso de
  arriba, que es el mismo que lee el runner.
