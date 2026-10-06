---
caso: 281
titulo: una orden en el chat no sobrevive al aviso de una tarea de fondo
estado: resuelto
resuelto-en: 0.104.0
prioridad: media
version-detectada: 0.101.0
---

# 281 — Una orden de mergear o de publicar deja de valer cuando llega el aviso de una tarea de fondo

**🟢 resuelto en 0.104.0** · detectado en 0.101.0 · prioridad **media**.

## Resumen

«Cuando el CI quede verde mergeá el #7» es una orden que por definición se cumple después. Si el agente
espera el CI con una tarea de fondo, el aviso de que terminó entra como un mensaje que no escribió una
persona, y desde ahí la orden no cuenta: el merge se frena y hay que confirmarlo. Con un push pasa lo mismo.

## Reproducción

Desde la raíz de este repositorio, sobre la rama `fix/280-merge-order`:

```bash
node -e "
const { chatSession, pushRoot } = require('./test/support/hooks-harness')
const { executeAll } = require('./engine/hooks/run')
const root = pushRoot('cauce-repro281-')
const chat = chatSession()
const run = (turn, command) => {
  const input = { hook_event_name: 'PreToolUse', permission_mode: 'auto', cwd: root, tool_input: { command } }
  try { executeAll(['destructive'], turn(input)); return 'pasa' } catch (error) {
    if (error.blocked) return 'BLOQUEADO'
    throw error
  }
}
let turn = chat.says('cuando el CI quede verde mergeá el #7')
console.log('1 mismo turno que la orden          ', run(turn, 'gh pr merge 7 --repo acme/app'))
turn = chat.says('<task-notification>el vigía de CI terminó</task-notification>')
console.log('2 tras el aviso de la tarea de fondo', run(turn, 'gh pr merge 7 --repo acme/app --squash'))
turn = chat.says('subí feat/x a origin cuando pasen las pruebas')
console.log('3 push, mismo turno que la orden    ', run(turn, 'git push origin feat/x'))
turn = chat.says('<task-notification>pruebas listas</task-notification>')
console.log('4 push tras el aviso                ', run(turn, 'git push origin feat/x'))
chat.close()
"
```

## Síntoma

```
1 mismo turno que la orden           pasa
2 tras el aviso de la tarea de fondo BLOQUEADO
3 push, mismo turno que la orden     pasa
4 push tras el aviso                 BLOQUEADO
```

Medido en el arnés. En una sesión real no se observó: es el camino que sigue a esperar un CI en segundo
plano, y nadie lo reportó todavía.

## Causa raíz

- `engine/hooks/chat.js`, `said` — devuelve nada cuando el registro no lo escribió una persona
  (`!saved.human`), y una orden sólo se lee de lo que devuelve `said`.
- `engine/hooks/chat.js`, `record` — el aviso arrastra `spoken`, `granted`, `approved` y `pending`, pero
  `text` pasa a ser la etiqueta del runner. La línea 2 de arriba se frena aunque el ítem ya estaba en
  `granted`: `authorized` y `unauthorized` salen por `confirmed` antes de mirar lo concedido.

## Fix propuesto

Que una orden dada por la persona siga valiendo mientras el mensaje en curso sea un aviso del runner: leerla
de `spoken` cuando `human` es falso. Es lo que `hold` ya hace con la negación (caso 191).

## Tradeoffs

- La orden pasa a durar hasta el próximo mensaje humano, que puede ser mucho después. Para un push, R10 dice
  que la autorización vale para esa operación y no para el mensaje siguiente; habría que decidir si un aviso
  cuenta como «el mensaje siguiente».
- Un aviso es texto que no escribió la persona. Lo que se lee tiene que ser `spoken`, nunca la etiqueta: si
  no, el contenido del aviso podría ordenar (R19).

## Contexto de descubrimiento

Apareció al arreglar el 280, revisando hasta dónde llega una orden de mergear. No es de ese caso: pasa
igual con el push, que no se tocó.

## Relacionados

- **280** — la orden de mergear, que es la que vuelve visible este borde.
- **166, 186 y 191** — qué sobrevive al aviso de una tarea de fondo: la persona, lo confirmado y su negación.

## Cierre

**Resuelto en 0.104.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.** Mientras el mensaje en curso es un aviso del runner, la orden se lee de lo último que
  dijo la persona. No sólo para mergear y publicar: vale para todo lo que se pide nombrándolo, como leer
  un archivo.
- **Tradeoff, cuánto dura la orden — se decidió que un aviso no es «el mensaje siguiente».** No lo escribió
  la persona, así que su turno sigue abierto hasta que ella vuelva a escribir. Dentro de ese turno un push
  ordenado ya podía repetirse antes de este cambio; el aviso no agrega una repetición que no existiera.
- **Tradeoff, el aviso es texto que no escribió la persona — se atendió.** Se lee `spoken` y nunca el texto
  del aviso.

### Lo que el caso no preveía

- Una prueba fijaba lo contrario a propósito: «una notificación no hereda la autorización del mensaje
  anterior». Se reescribió con su contracara, que es lo que esa prueba cuidaba de verdad: el aviso no agrega
  nada, ni lo que la persona no nombró ni lo que el propio aviso dice.
- Desde 0.103.0 un mensaje que no nombra ningún PR aprueba los merges de su turno. Arrastrado a través del
  aviso, eso habría dejado pasar un merge que el aviso sugería. Tras un aviso pasa sólo lo que la persona
  nombró: «dale con todos» no lo cruza.
- Después de lanzar un recorrido —`/autobuild`— no hay orden que arrastrar.
- `plan-first` y el gate de gobernanza preguntan lo mismo —si la llamada sale de un pedido de la persona—,
  así que tras un aviso también la siguen tratando como su turno. No se midió por separado.

### Qué se corrió

- **La reproducción, antes y después**, en el arnés: el merge del #7 y el push de `feat/x` tras el aviso
  pasaron de `BLOQUEADO` a `pasa`. Un merge que sólo nombraba el aviso, y un merge tras lanzar un recorrido,
  siguen en `BLOQUEADO`.
- **Una sesión real en `auto`**, con el motor arreglado instalado y un remoto local: «lanzá `sleep 25` en
  segundo plano y cuando te llegue el aviso subí feat/x a origin». El hook de mensaje recibió el pedido y,
  28 segundos después, el `<task-notification>` de verdad; el `git push origin feat/x` corrió seis segundos
  más tarde, sin diálogo, y la rama quedó en el remoto.
- **Cinco mutaciones en rojo**, en una copia: el aviso cortando el turno otra vez, el texto del aviso leído
  como orden, un recorrido lanzado arrastrando la orden, los merges sin nombrar cruzando el aviso, y nada sin
  nombrar pasando ni en su turno.
- **La puerta entera**, `npm run ci`.
