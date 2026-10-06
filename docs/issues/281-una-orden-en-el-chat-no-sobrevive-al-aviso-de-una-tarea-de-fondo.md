---
caso: 281
titulo: una orden en el chat no sobrevive al aviso de una tarea de fondo
estado: abierto
prioridad: media
version-detectada: 0.101.0
---

# 281 — Una orden de mergear o de publicar deja de valer cuando llega el aviso de una tarea de fondo

**🔴 abierto** · detectado en 0.101.0 · prioridad **media**.

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
