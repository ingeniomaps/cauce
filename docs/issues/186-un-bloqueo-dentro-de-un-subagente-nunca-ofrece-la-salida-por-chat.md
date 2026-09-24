---
caso: 186
titulo: Un bloqueo dentro de un subagente nunca ofrece la salida por chat, aunque la persona esté mirando
estado: abierto
prioridad: alta
version-detectada: 0.98.0
---

# 186 — Delegar el trabajo cierra la salida por chat sin decírselo a nadie

**🔴 abierto** · detectado en 0.98.0 · prioridad **alta**. `present()` excluye al subagente igual que
`said()`, así que el bloqueo que frena trabajo delegado no ofrece el «dale» ni dice que no lo ofrece. La
redacción imperativa con que cae en su lugar es de todos los caminos sin chat y vive en el caso 194.

## Resumen

Un guard que frena algo tiene dos salidas y `HOW()` (`engine/hooks/approval.js:96`) elige cuál ofrecer
según `CHAT.hold(input, lines)`: con una persona en el chat ofrece primero contestar, y sólo si no la hay
manda a pegar líneas en `planning/.ops-approval`.

`hold()` devuelve `false` cuando `present(input)` devuelve `null`
(`engine/hooks/chat.js:338-339`), y `present()` arranca con:

```js
if (process.env.CI || input.agent_id || !input.session_id) return null
```

`engine/hooks/chat.js:228` — la misma guarda que `said()` en `:212`. [verificado: leídas las dos
funciones en `node_modules/@ingeniomaps/cauce/engine/hooks/chat.js` de una instancia con
`package.json` en **0.98.0**, esta corrida]

Que `said()` excluya al subagente es correcto y está razonado en su comentario: **conceder** depende del
mensaje de la persona, y la llamada de un subagente no es ese mensaje. Pero `present()` no contesta esa
pregunta. El comentario que la encabeza lo dice con todas las letras:

> «Hay una persona en esta sesión a quien preguntarle, que no es lo mismo que «este mensaje lo escribió
> ella». […] Preguntar no es conceder, y fundir las dos preguntas le cobraba un copiar y pegar a la persona
> justo cuando estaba mirando (caso 166).»

El 166 separó las dos preguntas para el turno despertado por una notificación y dejó `agent_id` en las dos.
En trabajo delegado quedan fundidas otra vez, y con la misma consecuencia que el 166 describe: la persona
está en el chat, mirando, y el bloqueo le cobra editar un archivo.

Sin la rama del chat, el mensaje cae en la otra redacción, «Aprobalo pegando tal cual en…»
(`engine/hooks/approval.js:114`), que le ordena al agente lo que su contrato le reserva a la persona. Ese
daño **no es propio del subagente**: sale igual en CI, en un `/autobuild` literal y en Antigravity, así que
se separó como **caso 194** el 2026-09-23. Éste queda con lo que sí es del subagente: que la persona está
mirando y la salida por chat no se ofrece.

> **Contraste del 2026-09-23 (paso 1 del recorrido).** Las citas se abrieron en `main` (`83fc8698`), no en el
> `node_modules`: `git diff v0.98.0 HEAD -- engine/hooks/chat.js engine/hooks/approval.js` sale vacío, y
> `diff -q` contra `gouduet-ops/node_modules/@ingeniomaps/cauce` (`package.json` en 0.98.0) da idénticos los
> dos archivos. Coinciden `approval.js:96` (`HOW`), `chat.js:212` (`said`), `chat.js:228` (`present`) y
> `chat.js:338-339` (`hold`). Se corrigieron dos: la redacción imperativa está en la **114** —la 113 es
> `const paste = pasteable.length`— y `HOW()` termina en la **132**, no en la 120. La cita de `AGENTS.md` no
> era literal; con la frase real, pasó al 194 junto con el resto de ese defecto.
>
> **Y el contrato que el caso llama silencioso sí lo dice, en otro lugar.** `template/AGENTS.md:117`, el que
> recibe toda instancia: «cuando nadie está en el chat —CI, un recorrido, un subagente—, queda el archivo de
> abajo». O sea que excluir al subagente es comportamiento **documentado para la persona**, no un olvido del
> 166; lo que no lo dice es el mensaje del bloqueo, que es lo que leen el agente y la persona en el momento.
> Cambiarlo es cambiar un contrato publicado —ver «Decisiones abiertas»—.

## Reproducción

1. Una instancia con `guard-files.sh` activo y una persona en el chat.
2. Pedirle al agente principal que **delegue** en un subagente una escritura que el guard frena —cualquiera:
   la migración con `DROP TABLE` en su `Down` del caso 185 sirve.
3. El bloqueo llega **sin** la frase «Decile a la persona qué se frenó…». Llega con «Aprobalo pegando tal
   cual en …».
4. Decirle «dale» a la sesión principal y pedir el reintento: si el reintento lo hace otro subagente, frena
   igual, con el mismo mensaje.
5. El mismo paso, hecho por la sesión principal, sí ofrece contestar y el «dale» siguiente lo aprueba.

Los pasos de arriba son los de la corrida original, en vivo. Lo que sigue es la reproducción **corrida el
2026-09-23 contra `main` (= v0.98.0)**, sin runner: se invoca el guard real con el input que manda Claude y
se cambia sólo `agent_id`. Usa `secrets-read` porque no necesita planning; `HOW()` es el mismo para todos
los guards. El registro del chat vive en `path.join(os.tmpdir(), 'cauce-chat')` (`chat.js:30`), así que
`TMPDIR` apuntado a un directorio propio lo aísla del de la máquina.

```js
// repro.js — uso: TMPDIR=<dir propio> node repro.js <ruta-al-engine>
const path = require('node:path'); const fs = require('node:fs')
const { execute } = require(path.join(process.argv[2], 'hooks/run'))
const { DIR } = require(path.join(process.argv[2], 'hooks/chat'))
const root = path.join(__dirname, 'root')          // con ops.config.json { mode: 'embedded', workspaceRoots: [.] }
const S = `repro-186-${process.pid}`
const msg = (input) => { try { execute('secrets-read', input); return 'PASA' } catch (e) { return e.message } }
const call = (extra) => ({ session_id: S, prompt_id: 'm1', cwd: root,
  tool_input: { file_path: path.join(root, '.env') }, ...extra })
const say = (prompt, id) => execute('chat', { session_id: S, prompt_id: id, prompt })
const rec = () => JSON.parse(fs.readFileSync(path.join(DIR, `${S}.json`), 'utf8'))
say('revisá cómo arranca el servicio', 'm1')
console.log('A) sin agent_id\n' + msg(call({})), rec().pending)
say('revisá cómo arranca el servicio', 'm1')                       // vuelve pending a []
console.log('B) con agent_id\n' + msg(call({ agent_id: 'a1', agent_type: 'general-purpose' })), rec().pending)
say('dale', 'm2')
console.log('C) reintento del subagente\n' + msg(call({ prompt_id: 'm2', agent_id: 'a2' })))
console.log('C2) reintento de la principal\n' + msg(call({ prompt_id: 'm2' })))
say('/autobuild catalog-item-table', 'm3')
console.log('D) /autobuild, sin agent_id', rec().askable, '\n' + msg(call({ prompt_id: 'm3' })))
fs.rmSync(path.join(DIR, `${S}.json`), { force: true })
```

Salida real sobre `main`, recortada sólo en la ruta del banco (`<banco>/`) y en la primera línea, que es la
misma en todas («… es una credencial: leerla la deja en el contexto de la sesión…»):

```
registro tras el mensaje humano: askable=true human=true flow=false

--- A) sin agent_id (sesión principal) ---
Decile a la persona qué se frenó y por qué, y pedile que lo confirme con sus palabras: un «dale» alcanza, pero
no hace falta esa palabra. Si lo que contesta es un sí, reintentá el mismo cambio y pasa; […] Si prefiere
aprobarlo a mano, que pegue ella tal cual en planning/.ops-approval estas líneas:
  <banco>/.env
pending: ["<banco>/.env"]

--- B) con agent_id (subagente, mismo session_id) ---
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:
  <banco>/.env
Valen para ese conjunto y dejan de valer en cuanto cambie. La variable OPS_SECRETS_READ_OVERRIDE=1 sigue
existiendo y apaga el guard para toda la sesión, que es por lo que no es la vía recomendada.
pending: []

--- C) tras «dale» (m2): reintento del subagente ---
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:   [idéntico a B]

--- C2) tras «dale» (m2): reintento de la sesión principal ---
Decile a la persona qué se frenó y por qué, […]                     [frena: el «dale» no tenía nada pendiente]

--- D) mensaje /autobuild, llamada SIN agent_id ---  askable=false flow=true
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:   [idéntico a B]
```

**Se reproduce** [verificado: salida de arriba, esta corrida]. Con el mismo registro `askable: true`, lo
único que cambia entre A y B es `agent_id`, y B trae la redacción imperativa y **no anota nada en
`pending`**. Por eso el «dale» siguiente no aprueba nada, ni para el subagente (C) ni para la sesión
principal (C2): es exactamente el paso 4, y además muestra que el paso 5 sólo vale si el **primer** bloqueo
también fue de la principal. D es otra puerta que da lo mismo por otro motivo —ver «Contraste del fix»—.

## Síntoma

Tarea `catalog-item-table` de la instancia `gouduet-ops`, 2026-09-23, tres corridas del recorrido
`autobuild`:

- `wf_df659094-4cf` — el subagente de Build es frenado al escribir la migración. El bloqueo no ofrece chat.
  El subagente respeta su contrato, no escribe `.ops-approval`, para con `blocked-on-human` y deja la fila.
  WIP: **0 de 9 pasos**.
- `wf_7a7d672c-c18` — el dueño contesta «autorizo y sigue» en el chat. El reintento vuelve a correr en un
  subagente y **vuelve a frenar con el mensaje literal idéntico**. La aprobación dicha en voz alta no llega
  a ningún lado, y nada en la corrida le dice al dueño por qué.
- Tercera corrida — el dueño pega a mano la línea en `gouduet-ops/planning/.ops-approval`. El subagente
  escribe la migración **en el primer intento** y cierra los nueve pasos.

[verificado: las tres corridas son de esta máquina; lo que cambió entre la segunda y la tercera fue el
archivo `.ops-approval`, no el prompt ni el contenido del archivo frenado]

Lo que la persona vive: dijo que sí, en el chat, mirando la pantalla, y el sistema siguió frenado sin
decirle que su sí no contaba en ese canal.

## Causa raíz

- **`engine/hooks/chat.js:228`**, `present()`: `input.agent_id` la hace devolver `null`. `present()` decide
  **si hay a quién preguntarle**, y la respuesta a eso no cambia porque el trabajo esté delegado: la persona
  es de la sesión, no de la llamada. La sesión sigue siendo la misma —el subagente hereda `session_id`, que
  es lo que hace que la guarda tenga que nombrar `agent_id` aparte para excluirlo—.
  [documentado para `agent_id`: code.claude.com/docs/en/hooks, «Common input fields» —«`agent_id` … Present
  only when the hook fires inside a subagent call. Use this to distinguish subagent hook calls from
  main-thread calls»—, consultada el 2026-09-23. **Que `session_id` sea el del padre no lo dice esa página**;
  lo sostiene la transcripción de un subagente real de esta máquina
  (`~/.claude/projects/-home-manuel-Code-personal-cauce/32323e85-…/subagents/agent-ad28625b84a7e0810.jsonl`),
  cuya primera línea trae `sessionId` igual al de la sesión padre, `agentId` propio, `isSidechain: true` y el
  `promptId` del mensaje del padre que lo lanzó. Es la transcripción y no el input del hook: para el hook
  queda como hipótesis fuerte, coherente con la corrida original, donde la única diferencia visible con la
  sesión principal era la delegación.]
- **`engine/hooks/chat.js:337-339`**, `hold()`: devuelve `false` con `present()` en `null`, y `HOW()` toma
  eso como «no hay nadie».
- **`engine/hooks/approval.js:96-132`**, `HOW()`: sin la rama del chat no hay ningún texto que diga que el
  canal existe pero está cerrado acá. El silencio es indistinguible de «no hay persona».

## Fix propuesto

1. **Sacar `agent_id` de `present()` y dejarlo sólo en `said()`.** Es la separación que el 166 ya estableció,
   aplicada a la dimensión que le faltaba:

   ```diff
     function present(input) {
   -   if (process.env.CI || input.agent_id || !input.session_id) return null
   +   if (process.env.CI || !input.session_id) return null
       const saved = load(input.session_id)
       return saved && saved.askable ? saved : null
     }
   ```

   Conceder sigue exigiendo el mensaje humano, porque eso lo decide `said()` y no se toca. Lo que cambia es
   que el bloqueo **ofrece preguntar**, que es lo que el subagente sí puede hacer: devolverle el bloqueo a su
   padre con la pregunta armada.

2. **Que el texto diga a quién le toca reintentar.** Un subagente que recibe «reintentá el mismo cambio» no
   puede esperar la respuesta: su turno termina antes. La redacción para ese caso es que reporte el bloqueo
   con la pregunta exacta y que **el reintento lo haga quien recibe la confirmación**. Sin esto, el punto 1
   ofrece una salida que el subagente no puede tomar entera.

3. **Si se decide que en trabajo delegado el chat no va, decirlo en el mensaje.** Una línea —«esta llamada
   viene de trabajo delegado, así que acá no hay vía por chat: la línea la pega la persona»— convierte un
   silencio en un hecho. Hoy el agente, su contrato y la persona concluyen cosas distintas del mismo mensaje.
   Es el fix barato si el 1 y el 2 se consideran caros, y **no reemplaza** al 1: deja el costo donde está.
   Que el texto sin chat deje de ser imperativo es otra cosa y es del 194; este punto sólo agrega **por
   qué** no hay chat cuando la llamada viene de un subagente.

## Contraste del fix contra la reproducción (2026-09-23)

El punto 1 se aplicó en una **copia** del motor (`cp -r engine automatization package.json` al scratch;
`sed -i '228s/ input.agent_id ||//'`, con la línea resultante leída: `if (process.env.CI ||
!input.session_id) return null`) y se corrió el mismo `repro.js`. Salida, recortada igual que arriba:

```
--- B) con agent_id (subagente, mismo session_id) ---
Decile a la persona qué se frenó y por qué, y pedile que lo confirme con sus palabras: […]
pending: ["<banco>/.env"]

--- C) tras «dale» (m2): reintento del subagente ---
Decile a la persona qué se frenó y por qué, […]                     [sigue frenando]
--- C2) tras «dale» (m2): reintento de la sesión principal ---
PASA

--- D) mensaje /autobuild, llamada SIN agent_id ---  askable=false flow=true
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:   [sin cambios]
```

[verificado: esta corrida, sobre la copia; el repositorio no se tocó]

**El punto 1 arregla el texto y la anotación, y no cierra el síntoma.** Con él, el subagente ofrece el chat y
anota `pending`, y el «dale» siguiente de la persona lo aprueba —`record()` (`chat.js:183-185`) filtra
`previous.pending` sin mirar quién lo anotó—. Pero lo aprobado sólo lo puede **usar** una llamada sin
`agent_id`: `unauthorized()` (`chat.js:309-311`) pasa por `said()`, que sigue excluyendo al subagente en la
`:212`. La segunda corrida del síntoma —el reintento hecho por otro subagente— volvería a frenar igual (C),
ahora con la redacción del chat en vez de la imperativa. Lo que cierra el caso es C2: que reintente la
sesión principal. Y eso no es un olvido del fix sino una decisión escrita dos veces: la prueba
`test/hooks/chat.test.js:86-89` fija que lo concedido «no alcanza a un subagente», y `push.js:97-99,152`
frena todo push de un subagente mandándolo a devolver el resultado a la principal.

**El punto 2 —que reintente quien recibe la confirmación— es realizable con una delegación suelta y no
dentro de `autobuild`.** Con `Agent`, la principal puede hacer ella la escritura frenada después del «dale»
(C2 muestra que pasa). En `autobuild` la escritura es de la fase Build, que corre como agente del workflow:
que la principal escriba la migración es sacar el trabajo del recorrido, y relanzar el workflow vuelve a
poner el reintento en un subagente. Para ese camino, el punto 2 no alcanza sin decidir que lo aprobado con
«dale» —y sólo eso, no la `orden` ni lo `concedido`— valga también para una llamada con `agent_id`.

**Hay una segunda puerta que el caso no nombra: `flowCommand`** (`chat.js:38-43`, usado en `:197-198`). Un
mensaje que empieza con `/autobuild` deja `askable: false` y el bloqueo sale imperativo aunque la llamada no
traiga `agent_id` (D, igual con y sin el fix). En esta instancia no fue la causa: los lanzamientos de
`autobuild` de la sesión de `gouduet` que se revisaron —del 18 y del 23 hasta las 14:17— vienen de mensajes en
lenguaje natural («lanza el primer autobuild», «Relanza») y el agente llama a `Workflow`, así que el registro
queda `askable: true` [verificado: transcripción de esa sesión, mensajes de usuario y llamadas a
`Workflow`; los mensajes posteriores a las 16:47, donde caen las corridas `wf_df659094` y `wf_7a7d672c`, no
se leyeron]. Pero quien lance `/autobuild` literal vive el mismo síntoma por otra vía, y el punto 1 no la toca.

## Decisiones abiertas

1. **¿El trabajo delegado ofrece el chat?** `template/AGENTS.md:117` hoy promete que no. Aplicar el punto 1
   cambia ese contrato publicado, y baja a toda instancia en su `upgrade`.
2. **¿Lo aprobado con «dale» alcanza a un subagente?** Es lo único que cierra el síntoma dentro de
   `autobuild`, y va contra una decisión fijada por prueba (`chat.test.js:89`) y por R10 en `push.js`. Si la
   respuesta es no, el fix útil para `autobuild` es otro: que Build devuelva el bloqueo con la pregunta, y
   que la principal —o el workflow, al relanzar— escriba lo frenado o pida el archivo.
3. **¿Un `/autobuild` literal sigue cerrando el chat?** Hoy sí, por diseño del 098 («un recorrido es trabajo
   del agente»); con 1 y 2 resueltos a favor, quedaría como la única vía que todavía cobra el archivo.
4. La redacción sin chat, imperativa para todos los caminos y no sólo para el subagente, salió como **caso
   194**: se arregla sin decidir 1–3.

## Tradeoffs

- **El punto 1 amplía qué llamadas anotan `pending`.** `hold()` escribe lo frenado para que el «dale»
  siguiente apruebe exactamente eso; con trabajo delegado también anotando, un subagente podría dejar
  pendiente algo que la persona nunca vio nombrado. Lo acota el alcance que ya existe —cubre lo frenado y
  nada más— y lo dice el propio bloqueo cuando el padre lo reporta.
- **Un agente principal podría usar un subagente para lavar una aprobación**: delegar, hacer que el bloqueo
  se anote, y contestar él mismo. No es nuevo: conceder sigue exigiendo un mensaje con `human: true`, que un
  agente no puede fabricar, y esa guarda es la de `said()`, que este fix no toca.
- **El punto 3 solo deja el trabajo delegado dependiendo de que una persona edite un archivo**, que es
  exactamente el peaje que el 098, el 117 y el 126 fueron quitando. Sirve como mitigación, no como respuesta.

## Prioridad

Alta. Todo recorrido de Cauce que delegue una fase —`autobuild` delega Build, y es el caso normal— pierde la
salida por chat en cualquier bloqueo, no sólo en éste. Y el modo de fallo es silencioso en las dos puntas: la
persona no se entera de que su «dale» no llegó, y el agente no tiene ninguna salida que pueda tomar (la
orden que le da el texto imperativo es el 194).
Combinado con el 185 —que hace que **toda** migración que crea una tabla se frene— deja un hito entero de
esquema avanzando a una aprobación manual por archivo.

## Contexto de descubrimiento

Instancia `gouduet-ops` (Cauce 0.98.0), épica 012, hito `catalog-item`, tarea `catalog-item-table`. Salió de
mirar por qué la segunda corrida volvió a frenar después de que el dueño autorizara en el chat: la
explicación estaba escrita en la fila de `HUMAN_ACTIONS.md` que dejó la primera, y se comprobó leyendo
`chat.js` y `approval.js` en el `node_modules` de la instancia.

## Relacionados

- **185**: lo que frenó, en la misma tarea y la misma corrida. Son independientes: arreglar el 185 quita este
  bloqueo concreto y deja el mecanismo intacto para el siguiente.
- **166**: separó `present()` de `said()` por el turno despertado. Éste es la otra mitad de la misma
  separación, y su comentario ya describe el daño.
- **194**: la redacción imperativa del bloqueo sin chat, separada de éste el 2026-09-23. Es lo que el
  subagente lee hoy en lugar del chat.
- **098**: estableció que el archivo es de la persona y que la redacción imperativa hace que el agente se lo
  escriba solo. En trabajo delegado esa redacción vuelve a ser la única.
- **126** y **124**: la familia de «el guard frena a quien está dando la instrucción y no le ofrece salida».
