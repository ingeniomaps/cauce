---
caso: 436
titulo: check ve que falta la crítica del plan, pero nada comprueba que lo que dice sea cierto
estado: resuelto
resuelto-en: 0.114.0
prioridad: baja
version-detectada: 0.114.0
---

# 436 — `critique:` atrapa la crítica que falta, no la que no se hizo bien

**🟢 resuelto en 0.114.0** · detectado en 0.114.0 · prioridad **baja**. Es la limitación que se aceptó al cerrar el caso
433. Se aplazó y el dueño pidió hacerlo igual el mismo día.

## Resumen

Desde el 433, una tarea `full` deja en `critique:` de `done/` lo que objetó la crítica del plan y qué cambió por eso,
y `check` nombra la que cierra sin crítica o con `n/a` (`engine/planning/done-entry.js:172`). Eso ve la crítica que
falta. No ve si es cierta: una `critique:` puede anunciar un cambio que el plan nunca tuvo, u objetar algo trivial
mientras el defecto real pasa. Nada la contrasta con el diff.

## Reproducción

No hay. En la medición del 433 no apareció ninguna crítica falsa ni vacía de contenido: las cinco que quedaron
registradas nombran una objeción concreta, y el cambio que anuncian está en el plan del WIP. Fueron agy, dos de
Gemini y Claude, que se cortó y se reanudó.

## Síntoma

Ninguno medido. El hueco es de diseño, y lo dice el propio contrato en `template/planning/done/README.md`, «Por qué
la crítica»: «atrapa la crítica que falta y no la que se dice hecha sin hacerla: que sea buena lo juzga quien revisa».

## Causa raíz

Quien escribe `critique:` es el mismo agente que criticó. En el recorrido de Claude la crítica es un agente aparte
del que planificó (fase Critique, `automatization/workflows/autobuild.js`, alrededor de `critiqueLine`, `:613`). En
Antigravity, Codex y Gemini, sin recorrido, el mismo agente planifica, critica y escribe el registro. Y `check` no
puede juzgar el contenido sin terminar en una lista de palabras o en un largo mínimo, que la convención del
repositorio prohíbe (`AGENTS.md`, «Un guard no decide con una lista de palabras permitidas»).

## Fix propuesto

Que Review compruebe la crítica contra el diff: si `## Crítica` dice que el plan cambió por algo, ese cambio está en lo
commiteado. Eso se verifica sin interpretar intención, igual que Verify ya contrasta lo que Build declara en rojo
(`verify-return`).
Cuando construye una sesión y revisa otra (`--role build` / `--role review`, caso 430), lo juzga alguien que no
escribió la crítica.

Toca el paso 9 de `PROTOCOL.md`, el prompt de Review del recorrido, y el skill y el comando de los runners sin
recorrido. Un hallazgo de ese contraste vuelve a quien construyó como cualquier otro.

## Tradeoffs

- Una llamada más de trabajo en cada Review de `full`, para un defecto que todavía no se vio.
- En una sola sesión de un runner sin recorrido, quien revisa es el mismo agente que criticó: el contraste agrega
  poco ahí, y sólo pesa en el reparto entre dos sesiones o en el recorrido de Claude.
- Que el cambio esté en el diff no dice que la crítica haya objetado lo que más importaba. Eso lo sigue mirando una
  persona.

## Contexto de descubrimiento

Cierre del caso 433, 2026-10-22, al preguntar el dueño qué se hacía con la crítica que se dice hecha y no lo está.

## Relacionados

- 433 (el campo y el aviso). 430 (el reparto entre dos sesiones, que es donde el contraste pesa).

## Cierre

**Resuelto en 0.114.0**, 2026-10-22, a pedido del dueño, sin esperar a que se cumpliera la condición del aplazado.

- **El paso 9 de `PROTOCOL.md`** dice que, si la tarea pasó por Critique, se comprueba sobre el diff lo que
  `## Crítica` del WIP dice que cambió en el plan, y que un cambio anunciado que el diff no tiene es un hallazgo.
  Antigravity, Codex y Gemini lo leen de ahí: su skill y su comando remiten al protocolo para las fases.
- **El recorrido de Claude** (`automatization/workflows/autobuild.js`) guarda lo que la primera crítica pidió
  cambiar (`critiqueChanges`) y se lo pasa a Review con el mismo pedido que ya usaba para las condiciones. Cuando
  la corrida retoma desde el WIP —la sesión que revisa, o una reanudación—, el pedido de abrir el WIP nombra también
  `## Crítica`.
- **`done/README.md`** dice que Review hace ese contraste, y que lo que la sigue mirando una persona es si la
  objeción fue la que más importaba.

El caso, sección por sección:

- **Resumen y Causa raíz, «nada la contrasta con el diff».** **Medido, no se sostiene en el reparto entre dos
  sesiones.** Se sembró el mismo estado en cinco bancos fuera del árbol: la tarea `dividir` construida y commiteada,
  con el WIP en `phase: Review` y una `## Crítica` que anuncia rechazar también el divisor `'0'`, que el código no
  rechaza. Ese cambio no está en la aceptación, así que sólo la crítica puede llevar al revisor a mirarlo. Se corrió
  `/autobuild --role review` en cada uno:

  | Banco | Texto | Resultado |
  |---|---|---|
  | Claude, sembrado | recorrido con el cambio | devolvió: «`src/dividir.js:4` solo compara con `b === 0`», con `dividir(1, '0')` dando `Infinity` (USD 2,12) |
  | Claude, control | recorrido con el cambio, y el código que sí rechaza `'0'` | aprobó y cerró `done/dividir.md`, sin devolución falsa (USD 4,35) |
  | Claude, base | recorrido de antes del cambio | **también devolvió por el `'0'`** (USD 2,13) |
  | Gemini 0.63.0 | paso 9 nuevo, y el plan del WIP sin el `'0'` | devolvió, citando «PROTOCOL.md paso 9 (comprobación de crítica)» |
  | Gemini 0.63.0 | paso 9 viejo, y el plan del WIP sin el `'0'` | **también devolvió**: «al contrastar el código y las pruebas… contra la `Crítica` del plan» |

  Con el texto de antes, los dos runners ya lo atrapaban: quien revisa en otra sesión abre el WIP (caso 267) y lee
  la crítica. En Claude, además, el plan corregido del WIP nombraba el `'0'`; en Gemini se sacó de ahí a propósito, y
  lo atrapó igual. Es una corrida por banco.
- **Lo que el cambio sí agrega.** El contraste existía como hábito y ahora está escrito como contrato. Y cubre el
  único camino donde no existía: Claude en una sola sesión, donde Review no abre el WIP y recibía las condiciones de
  la crítica pero no lo que cambió del plan. Ese camino lo prueba el arnés y **no una corrida real**: para medirlo
  haría falta un Build que se aparte del plan corregido, y eso no se puede sembrar en una sesión que construye sola.
- **Tradeoffs, «una llamada más en cada Review».** Era falso, y lo escribí yo: el cambio no agrega ninguna llamada,
  agrega una frase a la Review que ya corre.
- **Tradeoffs, «en una sola sesión de un runner sin recorrido agrega poco».** Sigue en pie, y no se midió.
- **Tradeoffs, si la objeción fue la que más importaba.** Lo sigue juzgando una persona, y lo dice `done/README.md`.

**Prueba.**

- `test/workflows/autobuild-critique-record.test.js`, «Review comprueba sobre el diff lo que la crítica dice que
  cambió el plan». Con un replan, Review recibe lo que cambió; sin replan, no hay pedido; y en el rol `review`, el
  pedido de abrir el WIP nombra `## Crítica`.
- Tres mutaciones en rojo en una copia del árbol con la prueba: no guardar lo que cambió, que Review no lo reciba, y
  que quien retoma no lo busque en el WIP.
- Las cinco corridas de la tabla.
