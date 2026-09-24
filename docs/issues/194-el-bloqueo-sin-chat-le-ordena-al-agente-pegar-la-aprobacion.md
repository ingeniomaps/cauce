---
caso: 194
titulo: El bloqueo sin chat le ordena al agente pegar la aprobación que su contrato le prohíbe escribir
estado: resuelto
resuelto-en: 0.99.0
prioridad: media
version-detectada: 0.98.0
---

# 194 — «Aprobalo pegando» le habla al agente cuando no hay chat

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **media**. Cuando no hay nadie en el chat, `HOW()` dice
«Aprobalo pegando tal cual en planning/.ops-approval…»: un imperativo dirigido a quien lee el bloqueo, que
es el agente. El 098 corrigió esa redacción sólo en la rama con chat; en todos los caminos sin chat —CI,
un recorrido lanzado con `/autobuild`, un subagente, Antigravity, `claude -p` sin hook de mensaje— sigue
siendo la única.

## Resumen

`engine/hooks/approval.js:114` elige entre dos redacciones según `chat` (lo que devuelve `CHAT.hold`):

```js
? (chat ? 'Si prefiere aprobarlo a mano, que pegue ella tal cual en' : 'Aprobalo pegando tal cual en')
```

La rama con chat deja el archivo como cosa de la persona; la otra le ordena pegarlo a quien lee el
mensaje. El comentario de `HOW()` (`approval.js:88-91`) dice por qué eso importa: «dicho en imperativo, el
agente leía «aprobalo» como una orden para él e intentaba escribírselo en vez de reintentar, medido en una
sesión real de Claude Code». Y el contrato que recibe cada instancia dice lo contrario del imperativo: «Lo
escribís vos: si el agente intenta escribírselo, un guard lo frena» (`template/AGENTS.md:123`). El guard que
lo frena existe —`engine/hooks/self-approval.js:26`, «escribírsela es aprobarse solo»—, así que el agente
obediente choca contra él y el que respeta su contrato no tiene ninguna frase que le diga qué hacer.

Que no haya chat no cambia de quién es el archivo: sigue siendo de una persona, que es lo que
`template/AGENTS.md:117-123` promete para «CI, un recorrido, un subagente». Lo que falla es sólo la
redacción.

## Reproducción

Desde un directorio vacío, con el motor de `main` (`83fc8698`, igual a v0.98.0 en `approval.js` y
`chat.js`: `git diff v0.98.0 HEAD` sobre los dos sale vacío). `TMPDIR` apunta a un directorio propio
porque el registro del chat vive en `os.tmpdir()/cauce-chat` (`chat.js:30`); acá no se escribe ninguno.

```bash
mkdir -p /tmp/repro-194/tmp && cd /tmp/repro-194
cat > r.js <<'EOF'
const path = require('node:path'), fs = require('node:fs')
const { execute } = require('<cauce>/engine/hooks/run')
const root = __dirname
fs.writeFileSync(path.join(root, 'ops.config.json'),
  JSON.stringify({ mode: 'embedded', workspaceRoots: [{ name: 'main', path: '.' }] }))
const m = (i) => { try { execute('secrets-read', i); return 'PASA' } catch (e) { return e.message } }
const c = { cwd: root, tool_input: { file_path: path.join(root, '.env') } }
console.log('--- sin session_id (Antigravity, claude -p sin hook de mensaje) ---\n' + m(c))
process.env.CI = 'true'
console.log('--- CI=true, con session_id ---\n' + m({ ...c, session_id: 'repro-194-' + process.pid }))
EOF
TMPDIR=/tmp/repro-194/tmp node r.js
```

`secrets-read` se usa porque no necesita `planning/`; el texto lo arma `HOW()` y es el mismo para todos los
guards que lo llaman. Los caminos del subagente (`agent_id`) y de `/autobuild` (`askable: false`) dan la
misma redacción: están corridos en el caso 186, «Reproducción» y «Contraste del fix».

## Síntoma

Salida real del 2026-09-23 sobre `main`, con la ruta del banco recortada a `<banco>/`:

```
--- sin session_id (Antigravity, claude -p sin hook de mensaje) ---
<banco>/.env es una credencial: leerla la deja en el contexto de la sesión. Si hace falta un valor, pedíselo a una persona.
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:
  <banco>/.env
Valen para ese conjunto y dejan de valer en cuanto cambie. La variable OPS_SECRETS_READ_OVERRIDE=1 sigue existiendo y apaga el guard para toda la sesión, que es por lo que no es la vía recomendada.
--- CI=true, con session_id ---
<banco>/.env es una credencial: leerla la deja en el contexto de la sesión. Si hace falta un valor, pedíselo a una persona.
Aprobalo pegando tal cual en planning/.ops-approval estas líneas:
  <banco>/.env
Valen para ese conjunto y dejan de valer en cuanto cambie. La variable OPS_SECRETS_READ_OVERRIDE=1 sigue existiendo y apaga el guard para toda la sesión, que es por lo que no es la vía recomendada.
```

[verificado: esta corrida]. Lo que el agente hace con esa frase no se midió acá; lo midieron el 098 (S1:
«pedido a un subagente → BLOQUEADO; intentó escribirse .ops-approval», en su cierre) y el comentario de
`push.js:104-105` («con «pegando tal cual» a secas el agente se ofreció a escribirse la aprobación»).

## Causa raíz

- **`engine/hooks/approval.js:114`**: la rama sin chat del ternario es imperativa y no nombra a la persona.
- **`engine/hooks/approval.js:88-91`**: el comentario razona la diferencia sólo para cuando hay persona en el
  chat, y de ahí salió que el 098 corrigiera una sola rama.

El precedente de cómo se escribe ya está en el motor: `engine/hooks/push.js:110` —«o pegando **ella** tal cual
en …»— se redactó así por la misma razón.

## Fix propuesto

1. **La rama sin chat nombra a la persona y le dice al agente qué hacer él.** Por ejemplo: «Esto lo aprueba
   una persona: que pegue ella tal cual en <ruta> estas líneas: … Vos no lo escribas —un guard lo frena—:
   decí qué se frenó y dónde, y reintentá cuando esté.» Dentro de un subagente, lo que el agente puede hacer
   es devolverle el bloqueo a quien lo lanzó, igual que `push.js:97-99` le pide a un subagente que devuelva
   el push a la sesión principal; la frase del agente tiene que caber en ese caso también.
2. **Tocar las pruebas que dependen del literal, y en dos grupos distintos:**
   - **Las que lo buscan para operar**: `test/support/hooks-harness.js:101`, `pasteApproval`, parte el
     mensaje en la línea que `startsWith('Aprobalo pegando tal cual')`. La usan `test/hooks/approval.test.js`
     (8 llamadas) y `test/hooks/chat-effects.test.js` (3). Si cambia el literal fallan en rojo, que es lo
     fácil. Conviene que busque el ancla que la redacción nueva conserve —la ruta seguida de «estas
     líneas:»— y no una frase entera.
   - **Las que afirman su ausencia**: `test/hooks/chat.test.js:54` y `:209`, y
     `test/hooks/plan-first.test.js:143`, hacen `assert.doesNotMatch(…, /Aprobalo pegando/)`. **Con el
     literal cambiado pasan siempre**, haga lo que haga el código, y nada lo avisa. Hay que reescribirlas
     contra un ancla que exista en la redacción nueva y verlas en rojo devolviéndole a la rama con chat (o
     al caso de `plan-first` con plan ajeno) la oferta de pegar.
   - `test/hooks/chat.test.js:60` afirma que la rama sin chat dice «Aprobalo pegando»: se cambia por la
     redacción nueva y por una aserción de ausencia del imperativo.
3. Revisar si `template/AGENTS.md` o el README de los guards citan la frase vieja. A la fecha, `grep -rn
   "Aprobalo pegando"` fuera de `docs/issues/` sólo la encuentra en `approval.js:114` y en las pruebas de
   arriba [verificado: esta corrida].

## Tradeoffs

- **Un mensaje algo más largo** en cada bloqueo sin chat. Es el que más se repite en CI y en recorridos.
- **Cambia texto que alguien puede estar leyendo con un regex**: una instancia que automatice sobre
  «Aprobalo pegando» se rompe. No se conoce ninguna; en el repo sólo lo hacen las pruebas.
- **No resuelve el 186.** El subagente seguiría sin salida por chat; lo que cambia es que el texto deja de
  ordenarle lo prohibido y le dice qué sí puede hacer.

## Prioridad

Media. No frena nada que hoy no se frene —el guard de autoaprobación ataja al agente que obedece—, pero
cada bloqueo sin chat le da al agente una instrucción que contradice su contrato, y la salida legítima no
está escrita en ninguna parte del mensaje. Es barato y no depende de ninguna decisión del 186.

## Contexto de descubrimiento

Salió el 2026-09-23 revisando el caso 186 (paso 1 del recorrido): ese caso mezclaba la falta de salida por
chat en un subagente con la redacción imperativa, y la reproducción mostró que la segunda no es propia del
subagente sino de todos los caminos sin chat —`/autobuild` literal y CI incluidos—. Se separó para que se
pueda arreglar sin decidir lo que el 186 deja abierto.

## Relacionados

- **186**: el subagente sin salida por chat. Es donde se vio esta redacción, y la comparte con los demás
  caminos sin chat.
- **098**: corrigió la redacción imperativa sólo en la rama con chat, después de medir que el agente
  intentaba escribirse la aprobación.

## Cierre

**Resuelto en 0.99.0, por el camino propuesto.** Recorriendo lo que enumeró:

- **Fix 1 (la rama sin chat nombra a la persona y le dice al agente qué hacer) → se hizo.** Dice «Esto lo aprueba
  una persona: que pegue ella tal cual en …», y al agente: «Vos no lo escribas —un guard lo frena—: decí qué se
  frenó y dónde, y reintentá cuando esté; si sos un subagente, devolvele el bloqueo a quien te lanzó».
- **Fix 2, las pruebas que operan con el literal → se hizo.** `pasteApproval` busca ahora la línea que termina
  en «tal cual en … estas líneas:», que conservan las dos ramas. El caso no listaba las cinco aserciones de
  `chat-effects.test.js` sobre la ruta en sidecar, que también buscaban «pegando tal cual en»: salieron al
  correr la suite y apuntan ahora a «que pegue ella tal cual en».
- **Fix 2, las que afirman ausencia → se hizo, y se vieron en rojo.** `chat.test.js` busca la ausencia de «Esto
  lo aprueba una persona» en la rama con chat, y `plan-first.test.js` la de «tal cual en», que cubre las dos
  ramas.
- **Fix 3 (template y README) → comprobado: no citaban la frase.**
- **Tradeoffs → aceptados**: el mensaje sin chat es algo más largo, y una instancia que automatizara sobre el
  literal viejo se rompería; no se conoce ninguna.

### Qué se corrió

- **La reproducción del caso contra el motor arreglado**: el bloqueo sin `session_id` y con `CI=true` ya no dice
  «Aprobalo»; dice «Esto lo aprueba una persona: que pegue ella tal cual» y «Vos no lo escribas». Lo fija
  `chat.test.js` en la rama sin chat, con la aserción de ausencia del imperativo.
- **La aserción nueva en rojo sobre el código anterior**, y **cuatro mutaciones en una copia del árbol, las
  cuatro en rojo**: el imperativo de vuelta (dos pruebas), la rama con chat mandando a pegar (dos), el texto sin
  qué hacer el agente, y `plan-first` ofreciendo pegar con un plan a la vista.
- El estado con sólo este arreglo, sin el del 186, pasó `node --test` de hooks y planning (292/292) en una copia
  antes de commitearlo aparte; `npm run ci`, exit 0, con los dos.
