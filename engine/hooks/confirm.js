'use strict'

// Quién confirma lo que un guard frena (caso 221). Con Claude Code, el propio runner abre un diálogo de
// confirmación si el hook se lo pide (`permissionDecision: "ask"`), y la persona aprueba o rechaza esa
// acción puntual, con un clic. Por chat, en cambio, el guard tenía que adivinar si el mensaje siguiente era
// un sí; desde el caso 184 cualquiera que no negara ni preguntara lo era, y un pedido sobre otra cosa
// aprobó un merge que nadie había pedido. El diálogo no pide palabras ni las interpreta.
//
// Medido el 2026-10-01 con Claude Code: el diálogo aparece también en `bypassPermissions` y para la llamada
// de un subagente —donde desde el caso 285 ya no se pide—; rechazado, la herramienta no corre; en `claude -p`
// cuenta como rechazo y el agente recibe el motivo como error. Codex y Gemini no tienen diálogo y siguen con
// la confirmación por chat.

const ASK = Symbol('cauce.ask')

// Claude Code es el que manda `prompt_id` en cada llamada; Codex manda `turn_id` y Gemini ninguno
// (`chat.js`, `idOf`). Sólo un `PreToolUse` puede pedir el diálogo.
//
// Y sólo en un modo de permisos donde está medido que el diálogo lo contesta una persona. La lista es de
// los que sí, y no de los que no, para que un modo nuevo nazca bloqueando: ahí el guard vuelve a la
// confirmación por chat, que es más lenta y no deja pasar.
//
// Medido el 2026-10-05 con Claude Code 2.1.289, en sesiones interactivas y con el guard pidiendo el diálogo:
// en `default`, `acceptEdits` y `bypassPermissions` el diálogo aparece y, rechazado, la herramienta no
// corre. En `plan` no: el guard pidió confirmar la lectura de un `.env`, no apareció ningún diálogo y la
// lectura se hizo. Por eso `plan` queda afuera (casos 257 y 268).
//
// `auto` entró después, con su propia medición. El 2026-10-05, con Claude Code 2.1.290 y nadie al teclado,
// tres sesiones en `auto` —dos con Read, una con Bash—: el diálogo apareció a los cinco segundos y esperó más
// de siete minutos sin resolverse. Ahí también lo contesta una persona. Los siete pedidos que en otra sesión
// corrieron sin que conste quién los aprobó siguen sin explicación; ninguna de estas tres lo reprodujo.
const ANSWERED = new Set(['default', 'acceptEdits', 'bypassPermissions', 'auto'])
// Y sólo en la conversación directa. El diálogo también se abre para la llamada de un subagente o de un
// recorrido, pero ahí nadie lo está mirando: en una corrida real dos lecturas quedaron 590 y 1446 segundos
// esperando un clic, mientras seis bloqueos de la misma corrida los resolvió el agente solo, sin espera
// (caso 285). Esas llamadas reciben el bloqueo, y devolvérselo a quien las lanzó es lo que ya saben hacer.
//
// Medido el 2026-10-06 con Claude Code 2.1.290: la llamada de la sesión principal no trae `agent_id`; la de un
// subagente lo trae con `agent_type: "general-purpose"`, y la del agente de un recorrido con
// `agent_type: "workflow-subagent"`.
function native(input) {
  return Boolean(input && input.hook_event_name === 'PreToolUse' && input.prompt_id && !input.agent_id
    && ANSWERED.has(input.permission_mode))
}

// Marca la llamada para que `run.js` responda con el diálogo en vez de bloquear. Va en la entrada y no en
// el error porque quien arma el mensaje (`AP.HOW`) no es quien lanza el bloqueo, que es cada guard.
function askPerson(input) {
  input[ASK] = true
}

function takeAsk(input) {
  const asked = Boolean(input && input[ASK])
  if (input) input[ASK] = false
  return asked
}

// Lo lee la persona en el diálogo, o el agente como error cuando no hay diálogo (`claude -p`): por eso no le
// da órdenes a ninguno de los dos, dice qué pasa en cada caso.
const LEAD = 'Claude Code se lo pregunta a la persona en su diálogo de confirmación: si lo aprueba, pasa; si lo '
  + 'rechaza, o no hay nadie que conteste, no reintentes. '

module.exports = { native, askPerson, takeAsk, LEAD }
