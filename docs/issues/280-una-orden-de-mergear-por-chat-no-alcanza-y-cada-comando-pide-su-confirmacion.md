---
caso: 280
titulo: una orden de mergear por chat no alcanza y cada comando pide su propia confirmación
estado: resuelto
resuelto-en: 0.102.0
prioridad: alta
version-detectada: 0.101.0
---

# 280 — Desde 0.101.0, en `auto` una orden de mergear no alcanza aunque nombre cada PR, y la confirmación vale para una sola línea de comando

**🟢 resuelto en 0.102.0** · detectado en 0.101.0 · prioridad **alta**.

**Prioridad alta**: es el camino principal y dos instancias lo reportaron el mismo día, minutos después de
actualizar de 0.100.0 a 0.101.0. El dueño, en una: «si es necesaria mi confirmación, que sólo alcance para
uno y tenga que repetir una y otra vez no nos funciona; esto fue un retroceso». En la otra: «esto quedó muy
restrictivo y ya lo habíamos arreglado […] se supone que cualquier palabra de confirmación hace posible el
merge».

Este caso reúne los dos reportes, que llegaron como 280 y 281 desde sesiones distintas. Ninguno de los dos
números estaba publicado; quedó el más bajo.

## Resumen

0.101.0 sacó a `auto` de los modos donde el guard pide el diálogo de Claude Code (casos 257 y 268), así que
en `auto` todo `gh pr merge` vuelve a la confirmación por chat. Ese camino tiene dos defectos que ya estaban
y que hasta ahora sólo pagaban Codex y Gemini:

1. **Ninguna orden humana destraba un merge.** El guard busca en el mensaje la línea de comando entera, así
   que «mergeá api #49» no la nombra nunca. Pasa en todos los modos: donde hay diálogo cuesta un clic que la
   orden ya había dado, y donde no lo hay cuesta un segundo mensaje.
2. **La confirmación queda atada al texto del comando.** El sí cubre la línea que se frenó, letra por letra.
   Otro PR de la misma lista vuelve a frenar, y el mismo PR con las banderas en otro orden también.

Y un tercero, que es el que los destapó:

3. **`auto` quedó del lado que frena sin estar medido.** El comentario de `confirm.js` lo dice: hay dos
   mediciones que se contradicen y ninguna explicación.

**Lo que los dos reportes daban por cierto y no lo es:** que en 0.100.0 el merge pasaba porque el guard leía
la orden. No la leía. En 0.100.0 el guard pedía el diálogo en todos los modos, y en `auto` Claude Code lo
resuelve solo —es lo que midió el 257—. Lo que «ya estaba arreglado» era ese hueco: los merges pasaban sin
que nadie los aprobara, con orden o sin ella.

## Reproducción

Desde la raíz de este repositorio, con el arnés de hooks. No escribe en el árbol: la instancia va a un
temporal y el registro del chat a `os.tmpdir()/cauce-chat`.

```bash
node -e "
const { chatSession, pushRoot } = require('./test/support/hooks-harness')
const { executeAll } = require('./engine/hooks/run')
const root = pushRoot('cauce-repro280-')
const merge = (n, repo = 'acme/acme-ops') => \`gh pr merge \${n} --repo \${repo} --merge --delete-branch\`
const run = (call, command, mode = 'auto') => {
  const input = { hook_event_name: 'PreToolUse', permission_mode: mode, cwd: root, tool_input: { command } }
  try { executeAll(['destructive'], call(input)); return 'pasa' } catch (error) {
    if (error.ask) return 'diálogo'
    if (error.blocked) return 'BLOQUEADO'
    throw error
  }
}
const chat = chatSession()
let turn = chat.says('mergealos todos')
console.log('1 «mergealos todos» → merge platform#2      ', run(turn, merge(2, 'acme/platform')))
turn = chat.says('confirmo')
console.log('2 «confirmo» → el mismo comando             ', run(turn, merge(2, 'acme/platform')))
console.log('3 los tres restantes, encadenados           ', run(turn, [2, 3, 4].map((n) => merge(n)).join(' && ')))
console.log('4 uno solo de los restantes                 ', run(turn, merge(2)))
turn = chat.says('mergeá platform #2 y acme-ops #2, #3 y #4')
for (const mode of ['auto', 'default', 'acceptEdits', 'bypassPermissions']) {
  console.log(\`5 orden que nombra cada PR, modo \${mode.padEnd(17)}\`, run(turn, merge(3), mode))
}
console.log('6 el merge ya confirmado, escrito distinto  ',
  run(turn, 'gh pr merge 2 --merge --delete-branch --repo acme/platform'))
turn = chat.says(\`corré \${merge(4)}\`)
console.log('7 la orden trae el comando literal          ', run(turn, merge(4)))
chat.close()
"
```

Las dos sesiones reales que lo originaron, el 2026-10-05, en sidecar y con Claude Code:

- **Acme**, modo `auto`. «Mergealos todos» con cuatro PR recién listados → el primero se frena → el agente
  enumera los cuatro y pregunta → «confirmo» → pasa el primero → los otros tres se frenan, juntos y de a uno.
- **Globex**, modo sin registrar. «Mergeá account #39, api #49 y globex-ops #33, #34 y #35» → se frenan los
  cinco. Horas antes, con 0.100.0, el mismo pedido sobre otros tres PR había pasado.

## Síntoma

Sobre `main` en `98454648` (0.101.0):

```
1 «mergealos todos» → merge platform#2       BLOQUEADO
2 «confirmo» → el mismo comando              pasa
3 los tres restantes, encadenados            BLOQUEADO
4 uno solo de los restantes                  BLOQUEADO
5 orden que nombra cada PR, modo auto              BLOQUEADO
5 orden que nombra cada PR, modo default           diálogo
5 orden que nombra cada PR, modo acceptEdits       diálogo
5 orden que nombra cada PR, modo bypassPermissions diálogo
6 el merge ya confirmado, escrito distinto   BLOQUEADO
7 la orden trae el comando literal           pasa
```

El mismo recorrido contra el motor de `v0.100.0` —`git archive v0.100.0 engine test/support` a un
temporal— devuelve `diálogo` en las líneas 1 a 6, también en `auto`, y `pasa` en la 7. O sea que la orden
tampoco se leía antes: lo único que cambió entre versiones es quién contesta en `auto`.

Lo que la persona ve, en la sesión de Globex:

```
PreToolUse:Bash hook error: [.../guard-shell.sh]: BLOQUEADO: 'gh pr' actúa sobre un pull request —mergear,
aprobar, cerrar o comentar es publicar en el repositorio de otra gente— y R10 lo deja a una persona.
Decile a la persona qué se frenó y por qué, y pedile que lo confirme con sus palabras: un «dale» alcanza,
pero no hace falta esa palabra. Si lo que contesta es un sí, reintentá el mismo cambio y pasa; […]
Si prefiere aprobarlo a mano, que pegue ella tal cual en globex-ops/planning/.ops-approval estas líneas:
  export GH_TOKEN="$(…)"; gh pr merge 39 --repo globex/account --squash
```

Y lo que cuesta: una orden sobre N merges son N+1 mensajes de la persona, salvo que el agente acierte a
encadenar los N en el primer comando —medido aparte: los cuatro en una línea se frenan una vez y un
«confirmo» los pasa juntos—. Eso es una salida que depende de cómo escriba el agente, no de lo que ella pidió.

### Lo que no se reprodujo

El reporte de Globex dice que el mensaje siguiente tampoco destrabó: la persona contestó «envia ese caso a
cauce esto quedo muy restrictivo […] cualquier palabra de confimacion hace posible el merge» y el reintento
se frenó igual. En el arnés, con ese texto literal, el reintento **pasa** —el comando reducido y el que
lleva el `export` delante, los dos—: el mensaje no niega, no frena y no pregunta.

El único camino medido a ese síntoma es la línea 6: reintentar el mismo merge con otro texto. Que eso sea lo
que pasó en Globex es **hipótesis** —no hay registro del comando reintentado—. Quedan sin mirar otras dos:
que Globex tiene además un guard de merge propio sobre el mismo comando, y que el reintento haya salido de
un subagente.

## Causa raíz

Abierto en `main`, `98454648`:

- `engine/hooks/shell.js:170` — el ítem que se autoriza es el comando entero tal como llegó
  (`String(raw).trim()`). El comentario de arriba lo dice a propósito: «cualquier otra bandera es otro
  comando y vuelve a preguntarse». De ahí salen las líneas 3, 4 y 6.
- `engine/hooks/chat.js:261` y `:108` — `named` es `mentions(text, item).named`, que busca el ítem o su
  basename dentro del mensaje. Con el ítem igual a la línea de shell, sólo la línea 7 lo nombra.
- `engine/hooks/chat.js:152` — el push tiene su lectura propia, `ordersPush`: verbo de publicar más remoto y
  rama. El merge no tiene una equivalente; `delivery.js` entra por la tabla de `destructive` y hereda `named`.
- `engine/hooks/confirm.js:30` — `ANSWERED = new Set(['default', 'acceptEdits', 'bypassPermissions'])`. El
  comentario de `:27-29` dice que `auto` «queda afuera sin que esté establecido por qué hace falta».
- `engine/hooks/chat.js:192-194` — el sí aprueba lo que estaba en `pending`, que son los ítems literales de
  los bloqueos del turno anterior. Nada que el agente haya enumerado en su pregunta entra ahí.

La hipótesis que traía el primer reporte —que «mergealos todos» no contara por no nombrar cada PR— queda
contestada por la línea 5: nombrarlos tampoco cuenta.

Lo que afirma lo contrario y hay que corregir junto con el arreglo:

- `engine/hooks/delivery.js:8-10` promete que estas reglas se destraban con «una orden en el chat que las
  nombre». Para un merge esa orden es pegar el comando.
- `template/AGENTS.md:108-112` le dice al operador «si lo pediste vos en el chat, no hace falta nada», y
  que si algo se frena «en Claude Code se abre su diálogo de confirmación». En `auto` desde 0.101.0 no se
  abre, y el párrafo no lo dice.
- `engine/hooks/approval.js:137` — «cubre lo que se frenó y nada más […] y sigue valiendo en los mensajes
  siguientes». Las dos mitades son ciertas —medido: el comando confirmado vuelve a pasar en el mensaje
  siguiente—, pero para un merge lo que sigue valiendo es un comando que ya corrió.

## Fix propuesto

La forma, no el diff. Las tres primeras no se excluyen.

1. **`ordersMerge`, al lado de `ordersPush`.** Un mensaje con un verbo de mergear, que no niega ni pregunta,
   aprueba los `gh pr merge` de ese turno; si nombra PRs con `#N` o «PR N», sólo ésos. Entra como el `asked`
   que `push.js:177` ya le pasa a `authorized`. Globex tiene esta lectura escrita y probada en su guard
   propio, incluido el borde que la afinó: contar cualquier dígito como número de PR frenó un merge porque
   el mensaje decía «e2e».
2. **Que la confirmación cubra la acción y no la línea.** Comparar (acción, repositorio, número) en vez del
   texto, que cierra la línea 6; y que el sí alcance al conjunto que quedó frenado o enumerado, que cierra la
   3 y la 4.
3. **Medir `auto`.** Explicar por qué en una sesión el diálogo apareció y en otra siete pedidos corrieron
   solos. Si lo contesta una persona, vuelve a `ANSWERED`; si no, la 1 cubre el caso común.
4. **Corregir lo que promete de más** —`delivery.js` y `template/AGENTS.md`— con lo que resulte de las tres.

**Hay dos decisiones que cambian el producto y se preguntan antes de construir:**

- Si una orden de mergear pasa **sin diálogo** también en `default`, `acceptEdits` y `bypassPermissions`. Hoy
  ahí se pregunta siempre, y el 221 lo eligió así para no interpretar palabras.
- Si «mergealos todos», sin números, aprueba todo `gh pr merge` del turno. Es lo que pidió la persona en
  Acme, y es más ancho que cualquier cosa que el guard concede hoy.

## Tradeoffs

- Ampliar lo que cubre un sí es lo que pagó el 184: un mensaje sobre otra cosa aprobó un merge que nadie
  había pedido. Por eso la 2 se limita a lo frenado o enumerado, y no a cualquier merge posterior.
- Una lectura de verbos puede aprobar un merge nombrado de pasada («después mergeamos»). Se acota negando
  ante pregunta, negación o frase que frena, y limitando a los `#N` nombrados.
- Devolver `auto` al diálogo sin entender las dos mediciones reabre el 268.
- Un proyecto con guard propio de merge queda con dos sobre el mismo comando. Si el nativo adopta la lectura,
  el propio sobra.

## Contexto de descubrimiento

Dos instancias en sidecar, el 2026-10-05, las dos minutos después de actualizar a 0.101.0. En Acme, al
mergear por orden del operador cuatro PR propios, sin conflictos y con CI en verde: pasó uno y quedaron tres.
En Globex, al mergear cinco: no pasó ninguno. Globex ya había resuelto esto ese mismo día en su guard propio.

Es el camino principal: todo merge de una sesión en `auto` pasa por acá, y en Codex y Gemini pasaba desde
que existe el guard de entrega.

## Relacionados

- **225** — el guard nativo de entrega. Este caso es su borde: la salida «orden en el chat» que promete no
  alcanza a un merge.
- **257 y 268** — el diálogo que no contesta nadie en `auto` y `plan`, y la lista de modos. Su cierre es lo
  que cambió el comportamiento entre 0.100.0 y 0.101.0.
- **184** — confirmar no exige una palabra, y una confirmación demasiado amplia aprobó lo que nadie pidió.
- **221** — quién confirma lo que un guard frena.
- **103** — por qué el push tiene su lectura propia en vez de `mentions`.
- **250** — el freno de las filas. Misma queja del dueño: frena más de lo que cuida.

## Cierre

Las dos decisiones que el caso dejó abiertas las tomó el dueño el 2026-10-05, las dos por sí: una orden de
mergear pasa sin diálogo en todos los modos, y «mergealos todos» sin números aprueba los merges del turno.

**Qué se corrió.** La reproducción de este caso, sobre la rama `fix/280-merge-order`:

```
1 «mergealos todos» → merge platform#2       pasa
2 «confirmo» → el mismo comando              pasa
3 los tres restantes, encadenados            BLOQUEADO
4 uno solo de los restantes                  BLOQUEADO
5 orden que nombra cada PR, modo auto              pasa
5 orden que nombra cada PR, modo default           pasa
5 orden que nombra cada PR, modo acceptEdits       pasa
5 orden que nombra cada PR, modo bypassPermissions pasa
6 el merge ya confirmado, escrito distinto   pasa
7 la orden trae el comando literal           pasa
```

Las líneas 3 y 4 siguen frenando en ese guion y es lo decidido: ahí el mensaje en curso es «confirmo», que
no ordena nada, y esos tres PR no se habían frenado. En la secuencia real ya no se llega a ese punto. Medido
con el mismo arnés:

```
a «mergealos todos» → platform#2                 pasa
a mismo turno → los otros tres, encadenados      pasa
b sin orden → platform#2                         BLOQUEADO
b «confirmo» → platform#2 con otras banderas     pasa
b «confirmo» → un PR que no se había frenado     BLOQUEADO
b «confirmo, mergeá los cuatro» → ese PR         pasa
```

**Mutaciones vistas en rojo**, en una copia fuera del árbol que primero corrió en verde. Cada una rompe
`test/hooks/delivery.test.js`: la orden que no se acota a los PR nombrados; el PR negado que se ignora; «no
mergees» sin número que se ignora; la pregunta o el freno que ordenan; «el merge» contado como verbo;
cualquier dígito contado como PR; cualquier mensaje sin verbo de mergear que ordena; el ítem que vuelve a
ser la línea entera; otro verbo de `gh pr` que entra en la lectura por partes; `--admin` que no distingue; y
el repositorio que no distingue. Dos no se pusieron rojas al primer intento: una porque faltaba el caso
—se agregó «mergeá cuando esté verde, ahora no mergees»— y otra porque la mutación no se había aplicado.

**El recorrido, ítem por ítem.**

- *Fix 1, `ordersMerge`* — se hizo, en `engine/hooks/chat.js`. Lee `#N` y «PR N»; «PR 2, 3 y 4» nombra sólo
  el 2 y los otros dos vuelven a la confirmación, que es la dirección segura.
- *Fix 2, que la confirmación cubra la acción* — se hizo distinto. El ítem pasó a ser
  `gh pr merge <PR> --repo <repo>` (`engine/hooks/delivery.js`), que cierra la línea 6. Que el sí alcance a
  lo que el agente **enumeró** no se hizo: el guard no ve la pregunta del agente, y un sí que cubra merges
  que no se frenaron es lo que pagó el 184. En su lugar el bloqueo le dice al agente que varios van en un
  mismo comando, y «confirmo, mergeá los cuatro» pasa por la orden.
- *Fix 3, medir `auto`* — le tocaba a una persona y salió como caso **282**.
- *Fix 4, lo que prometía de más* — se hizo: el encabezado de `delivery.js` y el párrafo de
  `template/AGENTS.md`, que ahora nombra el merge y dice que en `auto` se confirma por chat. El texto de
  `approval.js` se dejó: sus dos mitades eran ciertas, y con el ítem por PR dejó de leerse contradictorio.
- *Lo que no se reprodujo, el segundo mensaje de Globex* — sigue sin reproducirse. Su único camino medido,
  el mismo merge escrito distinto, quedó cerrado por la línea 6. Las otras dos hipótesis —el guard propio
  de Globex y un reintento desde un subagente— no se miraron: son de esa instancia.
- *Tradeoff, el merge nombrado de pasada* — se acotó como estaba propuesto, y además «el merge» con artículo
  no cuenta. «Después mergeamos» no ordena: la forma no está en la lista.
- *Tradeoff, el proyecto con guard propio* — no se tocó nada. Queda dicho en el CHANGELOG qué cambia.

**Lo que el caso no preveía.**

- Una línea de `gh pr merge` pegada antes en `.ops-approval` con sus banderas deja de valer, porque lo que
  se compara ahora es el PR. Va en el CHANGELOG como acción.
- Con otro verbo de `gh pr` en el mismo comando —`merge` y `comment` encadenados— no hay lectura por partes
  y vale el comando entero, como antes.
- Una orden no sobrevive al aviso de una tarea de fondo, así que «cuando el CI quede verde mergeá el #7»
  se frena si el agente espera en segundo plano. Pasa igual con el push y salió como caso **281**.
- El mensaje siguiente a un bloqueo aprueba lo frenado aunque sea otra orden de mergear: «mergeá el #49»
  después de que se frenó el #40 aprueba el #40. Es la regla del 184 —todo lo que no niega ni pregunta
  confirma— y no cambió.
