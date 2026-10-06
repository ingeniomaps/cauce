---
caso: 285
titulo: un guard pregunta o bloquea según el modo y no según quién puede resolverlo
estado: resuelto
resuelto-en: 0.103.1
prioridad: alta
version-detectada: 0.103.0
---

# 285 — Qué hace un guard al frenar lo decide el modo de permisos, y debería decidirlo qué frena y dónde corre

**🟢 resuelto en 0.103.1** · detectado en 0.103.0 · prioridad **alta**.

**Prioridad alta**: en tres versiones seguidas el mismo proyecto vivió los dos extremos. Con bloqueo
(0.101.0–0.102.0) el dueño no pudo mergear lo que había pedido con todas las letras; con diálogo (0.103.0)
un recorrido quedó parado 10 y 24 minutos esperando que alguien aprobara un `grep`. El dueño: «con bloqueo
es muy restrictivo, pero sin bloqueo toca poner palabras claves».

## Resumen

Un guard que frena tiene dos salidas: **bloquear** (el agente recibe el motivo como error) o **preguntar**
(el diálogo de Claude Code espera a una persona). Hoy cuál usa lo decide el modo de permisos de la sesión
(`confirm.js`, `ANSWERED`), igual para toda regla y para todo contexto. Ninguna de las dos sirve sola:

1. **Bloquear siempre** obliga a la persona a escribir un segundo mensaje para lo que ya pidió, y el guard
   tiene que interpretar ese mensaje: de ahí salieron la lista de verbos de mergear y sus bordes (casos 280
   y 281).
2. **Preguntar siempre** detiene un recorrido en el que nadie está mirando, por cosas que el agente
   corregía solo en segundos.

Lo que falta es una división. No por modo: por **quién puede resolver lo frenado** y por **si hay alguien
del otro lado**.

## Reproducción

Corridas reales, no arnés. una instancia sidecar, Claude Code, la misma sesión, 2026-10-05 y 06.

1. **Bloqueo (0.101.0)**: la persona escribe «mergeá account #39, api #49 y acme-ops #33, #34 y #35».
   Los cinco `gh pr merge` se frenan y piden confirmar de nuevo. Su mensaje siguiente tampoco los destraba.
2. **Diálogo (0.103.0)**: se lanza `autobuild` sobre una tarea (`wf_5ffcbcab-35a`). Dos comandos de sólo
   lectura abren el diálogo y el recorrido espera.

## Síntoma

Medido sobre los transcriptos de `wf_5ffcbcab-35a`, restando la hora de la llamada a la de su resultado:

| Fase | Comando | Guard | Espera |
|---|---|---|---|
| Ready | `… grep -rn -E 'swc' jest.config.* package.json` | workers (caso 286) | 590 s |
| Verify | `… grep -n 'jest' -A25 package.json …` | workers (caso 286) | 1446 s |

En esa misma corrida, `guard-acme-host` (un guard del proyecto, que **bloquea**) frenó seis llamadas
—`tsc` o `pnpm` de un servicio en el host—. Las seis se resolvieron sin que nadie se enterara: el agente
leyó «corrélo con acme-run.sh» y reintentó bien. Espera total: cero.

Las dos clases de regla son la misma —«esto se hace de otra forma, y el mensaje dice cuál»— y una costó
34 minutos de una persona y la otra nada. La diferencia fue sólo el mecanismo.

## Causa raíz

- `engine/hooks/confirm.js`, `native()` — decide entre diálogo y bloqueo mirando `hook_event_name`,
  `prompt_id` y `permission_mode`. No mira qué regla frenó ni si la llamada viene de un subagente o de un
  recorrido. El comentario dice que el diálogo aparece «para la llamada de un subagente».
- Cada regla «con salida» pasa por el mismo camino (`AP.pending` → `block` → `askPerson`), tenga o no un
  arreglo que el agente pueda aplicar. El guard de workers es el ejemplo: su mensaje dice «agregale
  `--maxWorkers=2`» y aun así le pregunta a una persona.

## Fix propuesto

Dos preguntas, en este orden, y la respuesta sale de las dos:

**1. ¿Quién puede resolver lo frenado?** Cada regla lo declara.

| Clase | Qué es | Ejemplos | Qué hace el guard |
|---|---|---|---|
| **Corregible** | Hay otra forma de hacerlo y el mensaje la dice | workers sin cota, tooling en el host, commit en la rama viva, `git add -A`, `gh pr create` sin `--repo` | **Bloquea siempre**, con la instrucción. Nunca pregunta: no hay nada que decidir. |
| **De autoridad** | Sólo una persona puede decir que sí | merge, deploy, leer una credencial, borrado, commit de gobernanza | Sigue a la pregunta 2. |
| **Prohibido** | No tiene salida | `push --force`, `gh pr merge --auto` | Bloquea, como hoy. |

**2. ¿Hay una persona del otro lado de esta llamada?** Sólo para las de autoridad.

| Contexto | Qué hace el guard |
|---|---|
| Conversación directa, y el mensaje en curso ya lo pide | **Pasa.** Es lo que 0.103.0 hace con el merge: sin lista de palabras, por lo que el mensaje nombra o por el turno. |
| Conversación directa, y el mensaje no lo pide | **Diálogo.** Un clic; ni palabras ni interpretación. |
| Subagente o recorrido | **Bloquea** y devuelve el motivo a quien lo lanzó. Nadie mira un diálogo ahí. Si la parada es real, el recorrido ya sabe registrarla y seguir con otra cosa. |
| Sin persona (CI, `claude -p`) | Bloquea; la salida es `.ops-approval`. |

Con eso desaparecen los dos problemas a la vez: el diálogo queda sólo donde hay quien lo conteste y sólo
para lo que pide autoridad, así que no hace falta leer palabras claves; y un recorrido nunca espera a una
persona por algo que podía arreglar solo.

Lo que cada regla necesita es un campo —`corregible`, `autoridad`— en la tabla donde hoy lleva sólo si
«tiene salida». La segunda pregunta necesita saber si la llamada es de un subagente, que el motor ya
distingue para el push (`runner.allowPush` no alcanza a un subagente).

## Tradeoffs

- **Una regla mal clasificada como corregible deja de consultarse.** Si la «otra forma» no existe para ese
  caso, el agente queda sin salida y reintenta. Hace falta que una corregible conserve `.ops-approval`.
- **Un recorrido bloqueado por una regla de autoridad para**, donde hoy espera. Es el comportamiento que
  se busca, pero cambia qué ve la persona: una parada con su fila, no un diálogo.
- **«El mensaje en curso ya lo pide» sigue siendo una lectura.** 0.103.0 la dejó amplia: sin PRs nombrados,
  cualquier mensaje sin negación aprueba los merges del turno. Con el diálogo disponible para el resto, se
  podría volver a angostar —pasa sólo lo nombrado— sin que cueste un segundo mensaje. No está decidido.
- No está medido si el input del hook distingue con fiabilidad un subagente de la conversación principal en
  todos los runners.

## Contexto de descubrimiento

Una instancia sidecar. Tres actualizaciones en un día (0.101.0, 0.102.0, 0.103.0) persiguiendo este equilibrio,
cada una arreglando lo que la anterior había frenado de más. El dueño pidió escribir la división para dejar
de oscilar. Es el camino principal: toda sesión mezcla conversación directa y recorridos.

## Relacionados

- **286** — el guard de workers toma `jest` dentro de un `grep` por una ejecución. Es el falso positivo que
  mostró el costo del diálogo dentro de un recorrido.
- **280, 281 y 282** — la orden de mergear, su supervivencia entre mensajes y el modo `auto`. Son el lado
  «bloqueo» de este caso.
- **257 y 268** — la lista de modos donde el diálogo está medido.
- **221 y 184** — quién confirma lo que un guard frena, y que confirmar no exija una palabra.
- **250** — el recorrido le pregunta a una persona lo que no pide una persona. Misma idea aplicada a las
  filas en vez de a los guards: reparte por quién puede resolverlo.

## Cierre

**Resuelto en 0.103.1.**

### El recorrido de lo que este caso enumeró

- **Pregunta 1, quién puede resolverlo — se hizo, con una opción y no con un campo en una tabla.** Cada regla
  que arma su salida con `AP.HOW` dice si es corregible (`fixable`). Quedaron así: el runner de pruebas sin
  cota, la pasada de comentarios, la suite en rojo y el código generado sin regenerar al commitear, editar un
  snapshot del sincronizador o un archivo generado, cambiar el producto sin plan, reescribir una migración
  ya entregada y un comentario de Jira sin ADF. De autoridad siguen: credenciales, borrar o apagar una
  prueba, dependencias, gobernanza, una migración destructiva y las reglas de `destructive` —merge, deploy,
  borrado—. El commit en la rama viva y `git add -A` ya bloqueaban sin preguntar.
- **Pregunta 2, si hay una persona del otro lado — se hizo.** Una llamada con `agent_id` no pide el diálogo.
- **«Bloquea siempre» para lo corregible — se hizo distinto.** No abre el diálogo, pero conserva la
  confirmación por chat además de `.ops-approval`: si la otra forma no existe, la persona lo destraba con
  sus palabras. Quitarla le habría sacado una salida a quien conversa directo.
- **Tradeoff, una regla mal clasificada — se atendió** con lo anterior.
- **Tradeoff, un recorrido bloqueado por una regla de autoridad para — se paga.**
- **Tradeoff, angostar «el mensaje ya lo pide» — no se tocó.** Es una decisión aparte y no está tomada.
- **Tradeoff, si el hook distingue a un subagente en todos los runners — se midió en Claude Code**, que es el
  único con diálogo: la sesión principal no trae `agent_id`; un subagente lo trae con `agent_type:
  "general-purpose"` y el agente de un recorrido con `"workflow-subagent"` (2.1.290, con un hook que anota la
  entrada). En los otros runners la pregunta no aplica: no tienen diálogo.

### Lo que el caso no preveía

- El diálogo en `auto` que provocó la espera entró en 0.103.0 con una medición correcta y una conclusión
  corta: se midió que una persona lo contesta, y no que hubiera una persona. El 282 se cierra con éste.
- `template/AGENTS.md` seguía diciendo que en `auto` no estaba medido quién contesta. Se corrigió.

### Qué se corrió

- **Una sesión real en `auto`, con el motor arreglado instalado en un banco.** `npx jest` desde la conversación
  se bloqueó con su arreglo, sin diálogo. Un subagente lanzado a leer una credencial que el pedido no nombraba
  recibió el bloqueo y lo devolvió en 16 segundos. En toda la sesión no apareció ningún diálogo. Con 0.103.0
  esas dos formas esperaban un clic.
- **La entrada del hook, medida** en un banco mínimo con una llamada de la sesión, una de un subagente y una
  del agente de un recorrido.
- **Seis mutaciones en rojo**, en una copia, entre este caso y el 286.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: un `autobuild` entero sobre la instancia que lo reportó. Una regla de autoridad
  frenando adentro de un recorrido se corrió después, abajo.

### Una regla de autoridad dentro de un recorrido, el 2026-10-06

Lo que este caso no había visto: qué hace el recorrido cuando lo frena una regla que sólo una persona
resuelve y no hay otra forma de hacer el trabajo. En una corrida real, Build quiso borrar una prueba
commiteada (caso 294), recibió el bloqueo en 0,1 segundos y lo devolvió; el recorrido paró con
`build-blocked`, con su fila y el estado de planning commiteado. No hubo diálogo ni espera.
