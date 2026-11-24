---
caso: 556
titulo: un guard del proyecto que pide confirmar sólo pasa nombrando el ítem, nunca con un sí
estado: resuelto
resuelto-en: 0.124.0
prioridad: baja
version-detectada: 0.123.0
---

# 556 — Un guard del proyecto que pide confirmar no deja nada esperando el sí: pasa sólo si el mensaje nombra el ítem

**🟢 resuelto en 0.124.0** · detectado en 0.123.0, sigue en 0.123.1 y en 0.124.0 (sin publicar) · prioridad **baja**: muerde sólo
a un guard del proyecto que carga `engine/hooks/approval.js` y frena con `AP.HOW`, que no es parte del contrato
documentado de `guards` (stdin y código de salida, CHANGELOG de 0.114.0, caso 428); la única instancia conocida que lo
hace ya lo esquivó de su lado. Sube a **media** si se decide que `HOW` y `chat.js` son API para los guards del
proyecto, o si otra instancia llega con el mismo bloqueo.

## Resumen

Un guard del proyecto corre en un proceso aparte (`project-guards.js:73-77`) y recibe la misma llamada que los de
Cauce. Si carga el motor y frena con `AP.HOW`, en una sesión de Claude Code en `default`, `acceptEdits` o `auto`
`CF.native` da verdadero, así que `HOW` no retiene lo frenado y arma el texto prometiendo el diálogo. Pero ese diálogo
no se abre nunca: la marca de `askPerson` queda en el proceso del guard, y si el guard contesta `ask`,
`project-guards.js:101-103` lo convierte en bloqueo. Queda frenado, con `pending: []`, y la única salida es que el
mensaje nombre el ítem como orden. Un «dale» después del bloqueo no aprueba nada.

El mismo guard en modo `plan`, o en un runner sin diálogo, sí retiene y un «dale» lo pasa: la diferencia depende del
modo de la sesión, no de lo que el guard cuida.

## Reproducción

Con el motor en `$E` (sin instancia; `unauthorizedNow` y `HOW` directo):

```bash
for v in empujá subí pusheá dale; do node -e "
const C=require('$E/engine/hooks/chat.js');const s='c556-'+process.pid
const input={session_id:s,prompt_id:'p1',prompt:'revisado, $v line/acme-pagos en api y web'}
C.record(input)
const left=C.unauthorizedNow(input,['release push api line/acme-pagos:line/acme-pagos'])
console.log('$v ->', left.length? 'frena':'pasa'); require('fs').rmSync(C.recordPath(s),{force:true})"; done

for mode in auto plan; do node -e "
const C=require('$E/engine/hooks/chat.js');const A=require('$E/engine/hooks/approval.js');const s='c556h-'+process.pid
const input={session_id:s,prompt_id:'p1',prompt:'revisado',hook_event_name:'PreToolUse',permission_mode:'$mode'}
C.record(input); A.HOW(null,['release push api line/acme-pagos:line/acme-pagos'],input)
console.log('$mode pending:', JSON.stringify(JSON.parse(require('fs').readFileSync(C.recordPath(s))).pending))
require('fs').rmSync(C.recordPath(s),{force:true})"; done
```

Y de punta a punta, por `runProjectGuards`, con un guard del proyecto que carga el motor —el bloqueo, un «dale» en el
mensaje siguiente, y otra vez el guard—. Instancia en un temporal con `ops.config.json` =
`{"guards":{"pre-shell":["guards/g.js"]}}` y este `guards/g.js` ejecutable:

```js
#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'))
const A = require(process.env.ENGINE + '/engine/hooks/approval.js'), C = require(process.env.ENGINE + '/engine/hooks/chat.js')
const item = 'release push api line/acme-pagos:line/acme-pagos'
if (!C.unauthorizedNow(input, [item]).length) process.exit(0)
process.stderr.write(A.HOW(null, [item], input)); process.exit(2)
```

```js
// ENGINE=$E OPS_ROOT=<instancia> node e2e.js <respuesta>
const E = process.env.ENGINE, PG = require(E + '/engine/hooks/project-guards.js'), C = require(E + '/engine/hooks/chat.js')
const { hookGroups } = require(E + '/engine/hooks/run.js')
const s = 'c556e-' + process.pid
const base = { session_id: s, hook_event_name: 'PreToolUse', permission_mode: 'auto', cwd: process.env.OPS_ROOT,
  tool_name: 'Bash', tool_input: { command: 'git push' } }
const run = (id) => { try { PG.runProjectGuards(['pre-shell'], { ...base, prompt_id: id }, hookGroups); return 'pasa' }
  catch (e) { return 'frena: ' + e.message.slice(0, 140).replace(/\n/g, ' ') } }
try {
  C.record({ ...base, prompt_id: 'p1', prompt: 'revisado' }); console.log('1:', run('p1'))
  console.log('pending:', JSON.stringify(JSON.parse(require('fs').readFileSync(C.recordPath(s))).pending))
  C.record({ ...base, prompt_id: 'p2', prompt: process.argv[2] }); console.log(`2 "${process.argv[2]}":`, run('p2'))
} finally { require('fs').rmSync(C.recordPath(s), { force: true }) }
```

## Síntoma

Corrido el 2026-11-24 con los motores de los tags `v0.123.0` y `v0.123.1` (extraídos con `git archive`) y con la rama
de trabajo (0.124.0 sin publicar):

```
0.123.0                  0.123.1                  0.124.0
empujá -> frena          empujá -> frena          empujá -> frena
subí -> pasa             subí -> frena            subí -> frena
pusheá -> pasa           pusheá -> frena          pusheá -> frena
dale -> frena            dale -> frena            dale -> frena
auto pending: []         auto pending: []         auto pending: []
plan pending: ["release push api line/acme-pagos:line/acme-pagos"]   (las tres versiones)
```

De punta a punta, con el motor de la rama (0.124.0):

```
== auto
1: frena: [guards/g.js] Claude Code se lo pregunta a la persona en su diálogo de confirmación: si lo aprueba, pasa; si lo rechaza, o no hay nadie que
pending: []
2 "dale": frena: [guards/g.js] Claude Code se lo pregunta a la persona en su diálogo de confirmación: si lo aprueba, pasa; si lo rechaza, o no hay nadie que
== plan
1: frena: [guards/g.js] Decile a la persona qué se frenó y por qué, y pedile que lo confirme con sus palabras: un «dale» alcanza, pero no hace falta e
pending: ["release push api line/acme-pagos:line/acme-pagos"]
2 "dale": pasa
```

Lo que el caso no decía al escribirse: además de no retener, el bloqueo **promete un diálogo que no se abre** cuando el
guard sale en 2 con el texto de `HOW`. Si el guard contesta `ask`, lo que llega es el de `project-guards.js`, «pide
confirmación, y acá frena: los guards del proyecto no abren diálogo».

En la instancia donde apareció, un guard de release del proyecto frenó cuatro `git push` de una línea a cuatro
repositorios, y el registro de la sesión quedó con `pending: []`. La orden «revisado, empujá <línea> en <cuatro repos>»
volvió a frenar los cuatro; con «subí» en lugar de «empujá» pasaron —eso era 0.123.0; desde 0.123.1 tampoco pasa—.

## Causa raíz

1. `engine/hooks/approval.js:145-147` — con diálogo, `HOW` no retiene:

   ```js
   const native = !fixable && lines.length > 0 && CF.native(input)
   if (native) CF.askPerson(input)
   const held = native ? false : CHAT.hold(input, lines)
   ```

   `CF.native` (`engine/hooks/confirm.js:50-53`) decide por la llamada —`PreToolUse`, `prompt_id`, sin `agent_id`,
   modo en `ANSWERED` (`confirm.js:39`)— y por `CAUCE_DELEGATED`, nada más. Un guard del proyecto recibe esa misma
   llamada por stdin, así que dentro de su proceso `native` es verdadero aunque nadie vaya a abrir el diálogo:
   `askPerson` (`confirm.js:57-59`) marca un objeto que `run.js:327-334` nunca ve, y el `ask` que el guard devuelva
   termina en bloqueo (`project-guards.js:101-103`). Lo que sí distingue a ese proceso ya existe: `judge` le pone
   `CAUCE_HOOK_EVENT` en el entorno (`project-guards.js:76`), y nada más en el motor lo pone (`grep -rn
   CAUCE_HOOK_EVENT engine automatization` da sólo esa línea).

2. Lo que queda —nombrar el ítem— no es un defecto, es la vía de la orden, y por eso no alcanza: se juzga por palabras
   y un ítem como `release push <repo> <rama>:<rama>` no se dice así en una frase. En 0.123.0 `mentions` aceptaba el
   ítem con un verbo de `ASKS` (`engine/hooks/chat.js:77`, por `asks`, `chat.js:101`), y «empujá» no está —sí está en
   `PUSHES`, que en 0.123.0 vivía en `chat.js:158` y hoy en `engine/hooks/orders.js:25`—. Desde 0.123.1 (caso 523),
   `chat.js:128` y `:138-142` exigen que un ítem de varias palabras aparezca entero, así que ningún verbo alcanza.
   Esta mitad no se arregla: la lista `ASKS` es deuda (`AGENTS.md`, «Un guard no decide con una lista de palabras
   permitidas») y ampliarla no es la salida. Lo que falta es la otra vía, la del sí, que es la causa 1.

## Fix propuesto

Que `CF.native` dé falso dentro del proceso de un guard del proyecto, leyendo lo que `judge` ya le pone:

```js
// engine/hooks/confirm.js:51-52
return Boolean(input && input.hook_event_name === 'PreToolUse' && input.prompt_id && !input.agent_id
  && ANSWERED.has(input.permission_mode) && process.env.CAUCE_DELEGATED !== '1' && !process.env.CAUCE_HOOK_EVENT)
```

Con eso, `HOW` retiene como en `plan` y en los runners sin diálogo, el texto deja de prometer el diálogo, y ningún
guard del proyecto tiene que saberlo. Probado en una copia (`ops copy`) con la reproducción de punta a punta, modo
`auto`:

```
== copia con el fix, «dale»
1: frena: [guards/g.js] Decile a la persona qué se frenó y por qué, y pedile que lo confirme con sus palabras: un «dale» alcanza, pero no hace falta e
pending: ["release push api line/acme-pagos:line/acme-pagos"]
2 "dale": pasa
== copia con el fix, «no, esperá»
2 "no, esperá": frena: [guards/g.js] Lo último que dijo la persona niega o frena release push api line/acme-pagos:line/acme-pagos, así que no quedó esperando su co
```

Y fuera de un guard del proyecto no cambia: la misma llamada a `HOW` sin `CAUCE_HOOK_EVENT` sigue con `pending: []` y
el texto del diálogo; `node --test` sobre `native-confirmation`, `project-guards`, `approval-chat-name`,
`boundary-approval`, `mcp-writes`, `jira-adf`, `line-scope` y `delivery` dio 75/75 en la copia.

La alternativa que el caso proponía al escribirse, una opción `{ dialog: false }` en `HOW`, también cierra la
reproducción si el guard la pasa (medido: `pending` con el ítem, «dale» pasa), pero sin pasarla sigue igual que hoy:
cada guard del proyecto tendría que saberlo, que es lo que el arreglo en el motor debía evitar. Queda como opción si se
prefiere no cargar de sentido a `CAUCE_HOOK_EVENT`; otra es una variable propia que `judge` ponga para esto.

La prueba: un guard del proyecto escrito como el `g.js` de arriba, corrido por `runProjectGuards` en modo `auto`, deja
el ítem en `pending`, un «dale» lo pasa, un «no, esperá» lo sigue frenando y el texto no nombra el diálogo. Mutación:
quitar `&& !process.env.CAUCE_HOOK_EVENT` y la prueba se pone roja (es la línea de base de arriba). Y la de ausencia,
la que cuida el otro lado: un guard de Cauce en `auto` sigue pidiendo el diálogo (`native-confirmation.test.js`).

## Tradeoffs

- **Retener vuelve aprobable por un sí lo que hoy sólo pasa nombrándolo**, y no sólo por un «dale»: el mensaje
  siguiente que no pregunta ni niega lo aprueba. Para un guard de release o de entrega a producción eso es aflojar en
  `default`, `acceptEdits` y `auto`. Pero es la misma conducta que ese guard ya tiene en `plan` y en los otros runners
  (medido arriba en `plan`); el rigor de hoy es un accidente del modo, no una decisión. Un guard que necesite la orden
  literal la sigue pudiendo pedir: `unauthorizedNow` sin `HOW` no deja nada pendiente, y sin pendiente no hay
  `approved` que un sí llene (`chat.js:316-320`).
- **El riesgo que el caso 221 nombró vuelve para estos guards**: un pendiente puede aprobarlo un mensaje que hablaba de
  otra cosa. Es el precio que ya se paga en todo lo que no tiene diálogo, y `hold` descarta lo que el último mensaje
  negaba (`chat.js:430-445`).
- **Cargar de sentido a `CAUCE_HOOK_EVENT`**: hoy es información para el guard; con el fix también apaga el diálogo en
  su proceso. Si un guard del proyecto lanzara a su vez otra sesión o un hook de Cauce como hijo, ese hijo heredaría la
  variable y tampoco tendría diálogo. No se midió ningún caso así; si preocupa, una variable propia lo separa.
- Un guard del proyecto que hoy contesta `ask` decidiéndolo con `CF.takeAsk` o `CF.native` cambia de rama: con el fix
  `native` da falso y su código tomará la de sin diálogo. Es lo correcto, pero es código de la instancia y no se ve
  desde acá.

## Contexto de descubrimiento

Una instancia, al pasar a `revisado` la release de una línea de trabajo: el push de la línea a cuatro repositorios
desde un guard de release del proyecto que frenaba con `HOW`. La instancia lo arregló de su lado: su guard de release
dejó de pedir el diálogo y retiene el push con `CHAT.hold`, como ya hacía su guard de entrega, y después hizo lo mismo
con su guard de línea. Cada guard del proyecto que use `HOW` o pida el diálogo tiene que saber esto por su cuenta, que
es lo que el arreglo en el motor evitaría.

## Decisiones

- **¿`HOW`, `chat.js` y `confirm.js` son API para los guards del proyecto?** El contrato publicado de `guards` es stdin
  y código de salida; cargar el motor no está dicho en ningún lado. Recomendación: sí, con el fix de arriba y una línea
  en el CHANGELOG que diga que un guard que frena con `HOW` se aprueba como en los runners sin diálogo. Si la respuesta
  es no, el caso se cierra como descartado y lo que corresponde es decirlo en el encabezado de `project-guards.js`.

## Relacionados

- 184 — confirmar dejó de exigir una palabra.
- 221 — por qué con diálogo no se anota pendiente.
- 280 — el merge se pide sin lista de verbos.
- 428 — el contrato de los guards del proyecto.
- 523 — el último tramo de una ruta dejó de contar como nombrarla (de ahí el ítem entero de 0.123.1).
- 554 — otro bloqueo de la misma sesión cuya única salida era aprobar a mano.

## Cierre

Se recorrió el caso entero, con la decisión de la persona del 2026-11-24: `HOW`, `chat.js` y `confirm.js` cuentan como
API para los guards del proyecto.

- **Fix, `CF.native` falso dentro de un guard del proyecto**: se hizo (`engine/hooks/confirm.js`), con la variable que
  `judge` ya pone, `CAUCE_HOOK_EVENT`, en vez de una nueva.
- **Tradeoff, un hijo del guard hereda la variable**: la revisión lo marcó para una sesión que el guard lance. Se cerró:
  `run.js` la borra al arrancar como hook (`engine/hooks/run.js`), así que un hook de esa sesión vuelve a pedir el
  diálogo. Probado por proceso en `test/hooks/native-confirmation.test.js`.
- **Causa 2 (nombrar el ítem por palabras)**: se decidió que no se toca; `ASKS` es deuda y no se amplía.
- **Opción `{ dialog: false }`**: se decidió que no; cada guard tendría que saberlo.
- **Tradeoff, un sí aprueba lo que antes exigía nombrarlo, en cualquier modo**: es así, decidido; se dice en el
  CHANGELOG con la salida para el guard que necesite la orden literal.
- **Lo que el enunciado no preveía**: un guard del proyecto que delega en un guard de Cauce (corre `run.js` o un
  `guard-*.sh` adentro) sigue sin dejar pendiente: ahí `run.js` borra la variable y vuelve a pedir el diálogo, que su
  padre convierte en bloqueo. Antes de este caso pasaba igual, así que no empeora; se anota sin caso propio.

Lo que se corrió, guardado en el scratchpad de la sesión, fuera del repositorio:

- La reproducción de punta a punta del caso, por `runProjectGuards` con un guard del proyecto real que carga el motor,
  modo `auto`. Antes (motor sin el arreglo): promete el diálogo, `pending: []`, y un «dale» vuelve a frenar. Después,
  con el motor final: pide el sí, `pending` con el ítem, «dale» pasa y «no, esperá» sigue frenando.
- **Una sesión real de Claude Code 2.1.331** (`claude -p`, modo `default`, USD 0,95 en dos turnos), en un banco con el
  paquete final instalado y un guard del proyecto que pide confirmar `echo despliegue-demo`. Primer turno: el guard lo
  frenó con «Decile a la persona qué se frenó…», sin nombrar el diálogo, y el registro quedó con
  `pending: ["despliegue demo"]`. Segundo turno, `--resume` con «dale»: el mismo comando corrió y devolvió
  `despliegue-demo`, y el registro quedó con `approved: ["despliegue demo"]`. Contrastado contra el `.jsonl`.
- Las pruebas nuevas en `test/hooks/project-guards.test.js` y `native-confirmation.test.js`, en rojo antes de cada
  arreglo y en verde después.
- 2 mutaciones en una copia, las 2 rojas: sin `CAUCE_HOOK_EVENT` en `native`, y `run.js` sin borrarla.
- Dos pasadas de revisión independiente; la segunda, sin nada que impida entregar.
- `npm run ci`: 1982 de 1982, exit 0.

**Sin probar:** los otros runners con un guard del proyecto (Codex, Gemini, Antigravity), y una sesión interactiva con
alguien mirando.

### Lista de cierre

1. hecho: la reproducción de punta a punta con el motor sin el arreglo, guardada lado a lado con la de después.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas, en rojo antes de cada arreglo y en verde después.
4. hecho: 2 mutaciones en una copia, las 2 rojas.
5. hecho: cambia cómo pide confirmación un guard del proyecto; antes y después sobre la misma reproducción, y la aserción
   de que el mensaje ya no nombra el diálogo, vista en rojo.
6. hecho: una sesión real de Claude Code, sin dobles; se midió que el diálogo prometido se fue y que el «dale» pasa.
7. hecho: lo que depende del runner se corrió en Claude Code, dos turnos, USD 0,95.
8. hecho: la sesión real y la reproducción corrieron con el motor final.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: dependían los 20 módulos que llaman a `HOW` y los que usan `CF.native`, que corren en `run.js` sin la
    variable (la suite pasa entera), y la sesión que un guard lance, que se arregló en `run.js`.
11. hecho: dos pasadas de revisión; los hallazgos de la primera se arreglaron, y la segunda no trajo nada que impida
    entregar.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, exit 0.
14. hecho: este cierre recorre el Fix propuesto, las decisiones y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
