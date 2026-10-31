---
caso: 458
titulo: Un /flow frenado en un gate por una decisión humana no se puede retomar con la respuesta, y relanzarlo vuelve a pagar todas las etapas que ya cerraron
estado: resuelto
resuelto-en: 0.118.0
prioridad: media
version-detectada: 0.117.1
---

# 458 — Un flow frenado en un gate no se retoma con la respuesta y se relanza entero

**🟢 resuelto en 0.118.0** · detectado en 0.117.1 · prioridad **media**: no rompe nada, pero el camino normal de un recorrido
—frenar para que la persona decida y seguir— cuesta una corrida entera cada vez: del orden de 1 M de tokens y 25
minutos en `product-development`. Sube a alta si una instancia lo vuelve a pagar más de una vez en el mismo mes.

## Resumen

Cuando una etapa de `flow` cierra con `gate=no-cumplido` porque falta una decisión de la persona, el recorrido escribe
la acción humana y para con `gate-no-cumplido`. La persona contesta, y el recorrido no tiene por dónde recibir esa
respuesta. Hay dos daños, y el arreglo tiene que cerrar los dos:

1. **No hay entrada para la respuesta.** `flow` ignora cualquier campo de `args` que no sea `intent`, `flow` o `root`.
   La única vía es meter la respuesta en la intención.
2. **Meterla en la intención vuelve a pagar todo.** La intención va en el prompt de todas las etapas, así que
   `resumeFromRunId` no reutiliza ninguna. Retomar sin cambiarla las reutiliza todas, también la que frenó, que
   vuelve a frenar con la misma razón.

Hoy las únicas salidas son relanzar entero o no retomar.

## Reproducción

### En el motor, sin gastar modelo (2026-10-28, `main` en `fe889ed3`)

Se corre `flow` con el arnés de `test/flows/flow.test.js` (`compileWorkflow('flow')`). Los cargos están guionados con
las cinco etapas de descubrimiento de `product-development` y su `dependsOn` real (`frame → research → shape →
architect(frame, shape) → plan`), y `plan` devuelve `gate=no-cumplido`. Se comparan los prompts de tres corridas:

- A: `{ intent }`
- B: `{ intent, answers }`
- C: `{ intent: intent + respuestas }`

```js
// node probe.js desde la raíz del repo
require('./test/support/environment')
const { compileWorkflow } = require('./test/support/workflow')
const st = (id, dependsOn) => ({ id, agent: `a-${id}`, phase: 'discovery', skill: `/r/${id}/SKILL.md`,
  produces: ['x'], exitGate: `g-${id}`, dependsOn })
const script = { 'flow-contract': { exists: true, name: 'product-development', purpose: 'p', outcome: 'epic',
  entryAgent: 'pm', facilitator: 'pm', today: '2026-10-26', guardrails: ['g'],
  stages: [st('frame', []), st('research', ['frame']), st('shape', ['research']),
    st('architect', ['frame', 'shape']), st('plan', ['architect'])] } }
for (const id of ['frame', 'research', 'shape', 'architect'])
  script[`stage:${id}`] = { gate: 'cumplido', summary: `s-${id}`, analysis: `/w/${id}.md` }
script['stage:plan'] = { gate: 'no-cumplido', summary: 's', analysis: '/w/plan.md', missing: 'D1 y D4', humanAction: 'contestar' }
async function run(args) {
  const prompts = new Map()
  const agent = async (prompt, o = {}) => { prompts.set(o.label, prompt); return o.schema ? script[o.label] : { ok: true } }
  const result = await compileWorkflow('flow')(agent, () => {}, () => {}, async (t) => Promise.all(t.map((f) => f())),
    async () => [], async () => ({}), args, { total: null, spent: () => 0, remaining: () => Infinity })
  return { result, prompts }
}
;(async () => {
  const a = await run({ intent: 'banco' })
  const b = await run({ intent: 'banco', answers: 'D1=si D4=no, 6h/semana' })
  const c = await run({ intent: 'banco. Respuestas: D1=si D4=no, 6h/semana' })
  console.log('A:', JSON.stringify(a.result))
  for (const [tag, o] of [['B', b], ['C', c]])
    for (const [k, p] of a.prompts) console.log(tag, k.padEnd(16), p === o.prompts.get(k) ? 'igual' : 'CAMBIA')
  console.log('answers en algún prompt de B:', [...b.prompts.values()].some((p) => p.includes('6h/semana')))
})()
```

Salida:

```
A: {"stopped":true,"reason":"gate-no-cumplido","detail":"plan: D1 y D4"}
B flow-contract    igual
B stage:frame      igual
B stage:research   igual
B stage:shape      igual
B stage:architect  igual
B stage:plan       igual
B human-actions    igual
B partial-report   igual
C flow-contract    igual
C stage:frame      CAMBIA
C stage:research   CAMBIA
C stage:shape      CAMBIA
C stage:architect  CAMBIA
C stage:plan       CAMBIA
C human-actions    CAMBIA
C partial-report   CAMBIA
answers en algún prompt de B: false
```

B muestra el daño 1: un campo de respuestas no llega a ninguna parte. C muestra el daño 2: con la respuesta en la
intención cambian los cinco prompts de etapa, y la caché de `resumeFromRunId` va por `(prompt, opts)`. Lo único que
sobrevive es `flow-contract`, cuyo prompt no lleva la intención.

### En una instancia real (2026-10-26)

Instancia sidecar, recorrido `product-development`:

1. `Workflow({ scriptPath: <instancia>/.claude/workflows/flow.js, args: "<intención>" })`, run `wf_8560ea97-090`.
   Las cuatro primeras etapas cierran y `plan` devuelve `gate=no-cumplido`: la persona no validó rangos ni capacidad,
   y hay dos decisiones abiertas (D1, D4).
2. La persona contesta D1-D4 y su capacidad en el chat. Se anota en la acción humana de `planning/human/`.
3. Para que `plan` reciba la respuesta, se la mete en `args`. Todas las etapas se vuelven a lanzar: run
   `wf_431dce34-039`.
4. Sin cambiar `args`, `resumeFromRunId: "wf_8560ea97-090"` devuelve de caché las cinco etapas, `plan` incluida, y
   termina otra vez en el paso 1.

## Síntoma

Primera corrida:

```
{"stopped":true,"reason":"gate-no-cumplido","detail":"plan: La persona, que es dueña de todo, no validó los rangos, la secuencia ni los criterios de integración. Tampoco están escritas sus horas por semana, y casi todo el plan (reclutar, entrevistar, decidir, integrar) es tiempo suyo. D1 y D4 siguen abiertas."}
```

Uso: `agent_count 8`, `subagent_tokens 1018603`, `duration_ms 1466937`. Las respuestas que desbloqueaban `plan`
ocupaban cinco líneas.

Segunda corrida, con las respuestas en la intención: corrió otra vez las cinco etapas, `agent_count 8`,
`subagent_tokens 1149950`, `duration_ms 2044479`. Entre las dos, 2,17 M de tokens y 58 minutos. Frenó otra vez en
`plan`, y por qué frenó es otro defecto, que se registró como caso propio: el 460.

## Causa raíz

En `automatization/workflows/flow.js` (0.117.1, citas abiertas el 2026-10-28):

- `:40` — `const input = typeof args === 'string' ? { intent: args } : (args || {})`. Después sólo se leen `intent`
  (`:41`), `flow` (`:43`) y `root` (`:25`). No hay campo para las respuestas de un gate.
- `:236-241` — `RULES` termina en `Intención a evaluar: ${GOAL}`, y `GOAL` es la intención (`:229`). `RULES` encabeza
  el prompt de cada etapa (`runStage`, `:298`, prompt en `:313`). Cualquier cambio de la intención cambia todos los
  prompts, también los de etapas que la respuesta no toca.
- `:364-427` — al frenar, el recorrido escribe la fila humana y el informe parcial, que incluyen los resúmenes de las
  etapas cerradas, pero como prosa redactada por un agente. Ninguna corrida posterior los puede tomar como handoffs.
  `stop()` (`:427`) tampoco los devuelve, así que ni quien lanzó la corrida los tiene en una forma que pueda volver
  a pasar.

A esto se suma un límite del runtime: `resumeFromRunId` es **sólo de la misma sesión**. Es un dato documentado (la
descripción de la herramienta `Workflow` en Claude Code: «Same-session only»), no verificado acá. Si la persona
contesta al día siguiente, en otra sesión, ningún arreglo apoyado en esa caché sirve.

## Fix propuesto

**Decidido el 2026-10-28: se retoma desde el archivo en disco (forma B).** La A queda escrita para que se vea qué se
descartó y por qué.

**A — Sobre la caché del runtime.** `args.answers` llega sólo al prompt de la etapa que frenó y de las siguientes. Las
anteriores se llaman con el prompt de antes y salen de la caché de `resumeFromRunId`. Es el cambio más chico, pero
depende de que la persona conteste en la misma sesión, y el caso real (contestar después de pensarlo) es justo el
que no cubre.

**B — Sobre un archivo de retoma (la elegida).** Es la forma que ya usa `autobuild`, que retoma desde el WIP en disco y
no desde la caché (ver 391).

1. **Al frenar**, el recorrido deja `planning/reports/<fecha>-<flow>-retoma.json` con `flow`, `intent`, `today`, los
   ids de etapa del manifiesto, la etapa que frenó y, por cada etapa cerrada, `{ id, agent, gate, summary, analysis,
   openQuestions }`. El script del workflow no escribe en disco, así que lo escribe un agente. Para que no parafrasee,
   el recorrido calcula una suma de control del JSON y un comando del motor (`node tools/ops.js flow resume-file`)
   la comprueba al guardar. `stop()` además devuelve la ruta.
2. **Al retomar**, con `args: { resume: <ruta>, answers: <texto o ruta de la fila humana> }`:
   - Las etapas cerradas no se lanzan: sus handoffs salen del archivo.
   - La etapa que frenó, y lo que viene después, reciben un bloque aparte: `Respuestas de la persona al gate de
     <etapa>: …`. También reciben la ruta de su análisis anterior, para trabajar sobre él y no rehacerlo de cero.
   - Si `flow`, `intent` o los ids de etapa del archivo no coinciden con los de la corrida, se para con
     `retoma-no-coincide`, nombrando qué difiere. Un handoff viejo no se reutiliza en silencio.
3. **Invalidar etapas anteriores** lo decide quien retoma, no el motor: `args.rerun: ["frame"]` relanza esa etapa y
   todas las que dependen de ella según `dependsOn`, y no las demás. En el caso real, D2 cambiaba el nicho que `frame`
   había recomendado.

Fuera de este caso: que la etapa que frena declare qué etapas invalida cada respuesta posible (el §9 del informe de
`plan` lo pedía). Eso cambia el esquema `STAGE` y el prompt de **todas** las etapas, que es justo lo que mide
`flow-eval`, y su único consumidor sería el punto 3. Si después de usar `rerun` a mano se ve que hace falta, va como
caso propio.

### Aceptación y mutación (R29)

- **Sin `resume`, ningún prompt cambia.** Con los mismos `args` de hoy, todos los prompts son byte a byte los de
  0.117.1, en un recorrido que cierra y en uno que frena. Es la comparación antes/después que pide un cambio de
  «cómo». Mutación: emitir el bloque de respuestas siempre; la prueba se pone roja.
- **Retomar no relanza lo cerrado.** Con un archivo de retoma, las etapas cerradas no aparecen en lo que se pidió al
  agente. La que frenó sí, con el bloque de respuestas y la ruta de su análisis anterior. Mutación: ignorar `resume`;
  la prueba se pone roja.
- **Una retoma ajena se rechaza.** Con otro `intent`, `flow` o conjunto de etapas, se para con
  `retoma-no-coincide`. Mutación: sacar la comprobación; la prueba se pone roja.
- **`rerun` sigue el grafo.** `rerun: ["frame"]` relanza `frame` y sus dependientes transitivos, y nada más. Mutación:
  relanzar sólo la etapa nombrada; la prueba se pone roja.
- **Prueba real**: el mismo frenado en un banco instalado (`ops bench`), retomado con la respuesta. Se cuentan los
  agentes que corrieron y los tokens contra la corrida completa.

## Tradeoffs

- **Reutilizar una etapa después de que la persona cambió algo de fondo es reutilizar un análisis que ya no vale.**
  El motor no sabe qué respuesta invalida qué etapa, así que `rerun` es manual. El error esperable es no relanzar
  `frame` cuando correspondía. Mitigación: el prompt de la etapa que retoma pide decir si la respuesta contradice un
  handoff anterior, y en ese caso frena nombrándolo.
- **El archivo de retoma sobrevive a la sesión**, y por eso puede reutilizarse semanas después con un contexto que
  cambió. La comprobación de `flow`/`intent`/etapas lo acota, pero no ve un cambio en `organization/`. Se guarda la
  fecha y, si es de otro día, se avisa en el log.
- **Copia por agente.** Cualquier escritura de un workflow pasa por un agente. Sin la suma de control, un resumen
  parafraseado entraría como handoff sin que nada lo note.
- **Tamaño.** `flow.js` ya pasa las 500 líneas con razón registrada en `test/repo/repo.test.js:159`. La retoma va en
  un include (`automatization/shared/`) con su propia prueba, y no engorda el recorrido.
- **`flow-eval` no se mueve** si se cumple la primera condición de aceptación: sus casos no usan `resume`, así que sus
  prompts son los de hoy y los veredictos medidos siguen valiendo.
- Que el gate que frena sea casi siempre el último (`plan` en `product-development`) hace que esto valga más: lo que
  se repite es todo lo de antes.

## Contexto de descubrimiento

Una instancia sidecar estaba evaluando con `product-development` si un proyecto suyo debía existir y por dónde
arrancar. El gate de `plan` frenó con razón: la persona es dueña de todo y no había validado nada. Contestó en cinco
líneas, y relanzar costó otra corrida entera. Quien lo pidió lo dijo así: «ya nos dimos cuenta que puede pasar
exactamente esto y fue un caso que no teníamos en mente». No es un borde: frenar en el gate para que una persona
decida es el uso previsto del recorrido.

## Relacionados

- 460 — el gate de `plan` en `product-development` pide una validación humana de lo que la misma corrida produce, así
  que no se puede cumplir en una corrida. Salió de este caso. Su cierre necesita la retoma de éste.
- 391 — la misma forma en `autobuild`: reanudar después de una aprobación vuelve a pagar fases que ya cerraron.
  Aplazado. Su retoma desde el WIP en disco es el antecedente de la forma B.
- 462 — los runners que corren `flow` sin el workflow no tienen retoma. Salió del cierre de éste.
- 437 — la fecha y el recorrido en el nombre del informe de cada etapa. Por eso los análisis de la corrida frenada
  siguen en disco y la retoma puede apuntarles.

## Cierre

**Resuelto en 0.118.0**, con la forma B: la retoma vive en disco.

- **Daño 1, no hay entrada para la respuesta.** Se hizo: `args.answers`, junto con `args.resume`. Sin `resume`, las
  respuestas ya no se ignoran en silencio: la corrida frena en `sin-retoma` sin llamar a ningún agente. Con la
  reproducción de este caso, el comando B ahora termina ahí.
- **Daño 2, meterla en la intención vuelve a pagar todo.** Se hizo: al retomar no se cambia la intención y las etapas
  cerradas no se lanzan.
- **Punto 1, la retoma al frenar.** Se hizo distinto de lo previsto. Una prueba real mostró que el JSON no puede ir
  por la línea de comandos: Claude Code rechaza el heredoc antes de ejecutarlo («Contains brace with quote character
  (expansion obfuscation)»). El agente lo escribe con su herramienta de archivos en `planning/reports/`, y
  `ops flow resume save <archivo> --hash <suma>` (`engine/flows/resume.js`) lo sella en el lugar si la suma
  coincide. Si no coincide, queda sin sellar, y `show` no lo acepta. La suma la calculan igual el recorrido
  (`automatization/shared/flow-resume.js`) y el motor, y una prueba compara las dos.
- **Punto 2, retomar.** Se hizo: `resumePlan` decide qué se reutiliza y `resumeBlock` arma lo que recibe la etapa que
  vuelve a correr: las respuestas, la ruta de su análisis anterior y la orden de partir de él. Una retoma de otro
  recorrido, de otra intención o con otras etapas se rechaza en `retoma-no-coincide`, nombrando qué difiere. Una
  ilegible o editada, en `retoma-ilegible` o `retoma-corrupta`.
- **Punto 3, `rerun`.** Se hizo: relanza la etapa nombrada y sus dependientes según `dependsOn`, con `ancestors`, el
  mismo cálculo que ya decide qué handoffs ve cada etapa. Una etapa que no existe se rechaza.
- **Declarar qué invalida cada respuesta.** Se decidió que no, como decía el caso: cambia el esquema y el prompt de
  todas las etapas. La parte barata sí entró: la etapa que retoma cierra en `no-cumplido`, nombrando qué etapa
  relanzar, si una respuesta contradice lo establecido.
- **Aceptación 1, sin `resume` ningún prompt cambia.** Se comparó lado a lado, sobre cuatro escenarios: cierra,
  frena, cierra con condiciones e informe. Los prompts de 0.117.2 contra los de la rama dieron byte a byte iguales en
  todas las llamadas que ya existían. Lo único nuevo está en el camino que frena: la llamada `resume-save` y el campo
  `resume` en el resultado. La prueba «sin retoma no aparece nada de la retoma en ningún prompt» lo cuida de ahora en
  más.
- **Aceptaciones 2 a 4, y la del rechazo sin respuestas.** Se hicieron en `test/flows/flow-resume.test.js`, con
  nueve mutaciones, cada una en rojo:
  - ignorar `REUSED`;
  - vaciar `resumeBlock`;
  - no comprobar la suma al leer;
  - `rerun` sin dependientes;
  - una suma del recorrido distinta de la del motor;
  - sellar sin comparar;
  - leer sin comparar;
  - pedir la retoma en el contrato siempre;
  - aceptar `answers` sin `resume`.

  Los archivos se restauraron, y se comprobó que volvieron iguales.
- **Aceptación 5, la prueba real.** Se hizo en un banco instalado fuera del árbol de Cauce, con `claude -p` y un
  recorrido de dos etapas (`frame` → `plan`) cuyo gate pedía las horas de la persona.
  - Frenó en `plan` (`wf_479d9ef0-1b6`): 6 agentes, 483 878 tokens, 282 s. `frame` sola costó 90 508 tokens y 92 s.
    La retoma quedó sellada, y `ops flow resume show` la leyó con exit 0.
  - Retomada con las horas (`wf_482b6c19-8e6`): `Retomando …: frame sale(n) de la retoma`. No corrió `stage:frame`.
    `plan` recibió las respuestas y la ruta de su análisis anterior, cerró, y la corrida escribió la épica con
    `check` en verde.
- **Tradeoff, reutilizar un análisis que ya no vale.** Se acotó como se dijo: `rerun` es manual, y la etapa que
  retoma frena si una respuesta contradice algo establecido. Que lo haga bien es conducta de un cargo y no se midió.
- **Tradeoff, la retoma sobrevive a la sesión.** Se hizo: la comprobación de recorrido, intención y etapas, y un
  aviso en el log si la retoma es de otro día. Un cambio en `organization/` sigue sin verse, como decía el caso.
- **Tradeoff, copia por agente.** Se hizo con la suma (punto 1).
- **Tradeoff, tamaño.** La decisión de qué reutilizar y el bloque de respuestas van en el include. `flow.js` creció
  igual, de 575 a 635 líneas, dentro de la razón que ya tiene registrada en `test/repo/repo.test.js`.
- **Tradeoff, `flow-eval` no se mueve.** Se sostiene con la comparación de la aceptación 1: sus casos no usan
  `resume`, y sus prompts son los de antes.
- **Prioridad, «sube a alta si se paga más de una vez al mes».** Quedó sin objeto: retomar ya no paga lo que cerró.

Encontrado y no previsto:

- **El guardado cuesta.** `resume-save` es un agente más en cada corrida que frena: 70 615 tokens y 22 s en la prueba
  real, del mismo orden que cualquier otro, porque casi todo es el contexto con que arranca. En un recorrido de dos
  etapas casi empata con lo que ahorra, y en `product-development`, que frena en la quinta, ahorra cuatro. Juntarlo
  con el informe parcial lo abarataría, pero cambiaría un prompt que hoy no cambia, y no se hizo.
- **La primera prueba real frenó en `frame`**, porque la intención era vaga, y además mostró el heredoc rechazado.
  Retomar desde el primer gate funciona igual: la etapa que frenó vuelve a correr y no hay nada que reutilizar.
- **Los argumentos estructurados llegaban como texto.** En una de las corridas de prueba del 460, la sesión pasó el
  JSON de `/flow {...}` como cadena, y `flow` lo tomó entero por la intención: corrió `product-development` desde
  cero, que es este mismo daño por otra puerta. Le pasaba a cualquier invocación estructurada, no sólo a la retoma.
  Se arregló acá, porque sin eso la retoma no es confiable: un texto que es un objeto JSON se lee como argumentos, y
  cualquier otro sigue siendo la intención. La prueba «los argumentos que llegan como texto JSON…» se vio en rojo con
  la lectura sacada.
- **El freno por contradicción se midió de verdad.** En las tres primeras corridas del 460, la respuesta («Turnito ya
  manda emails de confirmación») contradecía lo que había dejado `architect`. La etapa que retomaba cerró en
  `no-cumplido` y nombró qué relanzar: «hay que relanzar research y luego architect». Es la conducta que pide el
  `resumeBlock`, en tres de tres (`wf_2bb3e940-f0e`, `wf_fa23f563-434`, `wf_52c7b5c6-691`).

Revisión y pruebas reales que se agregaron antes del PR:

- **Dos pasadas de revisión.** La primera fue `/code-review` del diff entero; la segunda, una revisión acotada a lo que
  cambió por la primera. Entre las dos dieron quince hallazgos, nueve y seis. Trece se arreglaron:
  - la retoma perdía `evidence`, `assumptions`, `missing` y `humanAction`, y a la síntesis le llegaba menos que en una
    corrida normal;
  - `rerun` suelto, nulo o vacío se tomaba mal, y `answers` como objeto llegaba como «[object Object]»;
  - retomar sólo con `rerun`, sin respuestas, se frenaba;
  - un handoff que no era objeto rompía con `TypeError` en vez de rechazarse por su forma;
  - las rutas iban sin comillas en los comandos;
  - `resume` no aceptaba `[ops-root]`, la forma que el caso 172 pidió para todo `flow`;
  - las dos sumas se comparaban sobre un solo ejemplo, y ahora sobre ocho, con Unicode, anidados y `undefined`;
  - `retoma-ilegible` tapaba la causa: ahora el contrato copia el error de `show` en `resumeError`;
  - la acción humana que el gate había abierto quedaba pendiente después de contestarla.

  Lo último tiene ahora su contraparte: la etapa que frenó cierra su propia fila, sólo si con la respuesta su gate se
  cumple, la reconoce por lo que pedía y no toca ninguna si duda. Si frenaron varias a la vez, lo hace cada una.
  Quedan dos hallazgos que se decidieron distinto:
  - **La comprobación de la suma sobre la copia que hace el agente al leer se mantiene.** Puede dar un falso
    `retoma-corrupta`, pero en las 11 corridas reales que leyeron una retoma la copia coincidió siempre, y sin ella una
    copia distinta pasaría sin que nada lo note.
  - **Que la fila humana se reconozca por su texto es un riesgo que queda escrito.** El agente que la escribe no
    devuelve su ruta.

  Las mutaciones son 22 en total, y cada una se vio en rojo sobre la prueba que la cuida.
- **`rerun` en una sesión real** (`wf_aba448d5-4d6`): con `"rerun": ["shape"]` corrieron `shape`, `architect` y
  `plan`, y `frame` y `research` salieron de la retoma.
- **Retomar una retoma** (`wf_4f0a16da-a3d`): `retoma-2.json` la había guardado una corrida que ya era retomada y
  volvió a frenar. Retomada desde ahí, las cuatro etapas salieron del archivo, `plan` cerró, se escribió la épica con
  `check` en verde, y la fila que había dejado esa corrida (`outcome-horizonte-capacidad.md`) quedó `resuelta
  2026-10-29`. Ninguna otra de las diez filas del banco cambió de estado.
- **El aviso de una retoma de otro día.** Lo cubre la prueba «retomar una retoma de otro día lo avisa…», que se vio en
  rojo con la comparación de fechas sacada.
- **Dos etapas que frenan juntas, en una sesión real.** Un recorrido de tres etapas, `frame` → (`horas`, `canal`), con
  las dos hermanas pidiendo una decisión distinta de la persona.
  - Frenaron las dos a la vez (`wf_fdb46da5-42e`), cada una con su acción humana en la retoma.
  - Retomada con `answers` como objeto (`{"horas": …, "canal": …}`) y `"rerun": null` (`wf_229a70ee-ea1`): `frame`
    salió del archivo, y cada hermana recibió «frenó en el gate de horas y canal», las respuestas como JSON y su
    propio análisis anterior.
  - Las dos filas que habían abierto quedaron `resuelta 2026-10-29`. Las dos pendientes del banco son condiciones
    nuevas de esa misma corrida, y la épica quedó escrita.
- **Una retoma de formato viejo, en una sesión real** (`wf_ced28fad-95a`): frenó en `retoma-ilegible` con la causa que
  dio `show` —«handoffs[0]: falta evidence; … falta humanAction»— y no con un «no se pudo leer» a secas. Costó un
  agente, 80 384 tokens.
- **Los runners sin workflow no tienen retoma.** Codex, Antigravity y Gemini corren `flow` siguiendo un texto que dice
  frenar y nada más. Salió como caso propio, el 462: cambia lo que reciben esos runners y no es parte de este caso.
- **Una sesión de `claude -p` puede dejar el workflow en segundo plano y cortarlo a los 10 minutos.** Pasó en una
  corrida de medición. No es del producto, y se evita con `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`.

**Sin probar:** la retoma en Codex, Antigravity y Gemini, que no la tienen (caso 462); y retomar después de un cambio en
`organization/`, que no se detecta.
