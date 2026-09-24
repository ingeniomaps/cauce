---
caso: 195
titulo: Verify no respeta la marca «(fuera de verify: …)» que check pide escribir, así que la condición marcada termina igual en uncovered
estado: resuelto
resuelto-en: 0.99.0
prioridad: media
version-detectada: 0.98.0
---

# 195 — La salida que `check` ofrece para una condición post-Verify no llega a Verify

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **media**. `check` le dice a quien planifica que marque la
condición con `(fuera de verify: <razón>)`, y el recorrido no sabe qué significa esa marca: se la pasa a
Verify como una condición más.

## Resumen

El caso 140 creó la marca `(fuera de verify: <razón>)` para una condición de aceptación que nombra algo que
sólo existe después de Verify —el commit, el reclamo, `done/`, la evidencia—. `check` la reconoce y deja de
avisar. `autobuild` no la reconoce en ningún lado: la aceptación viaja entera y literal al prompt de
Verify, sin ninguna instrucción sobre la marca, y el despacho de `uncovered` no la filtra. Si Verify pone
esa condición en `uncovered` —lo esperable, porque en ese momento el commit todavía no existe—, la
corrida rebota a escribir una prueba imposible y para en `verify-hollow`, que es justo el final que el 140
quería evitar.

## Reproducción

Sin agentes, con el arnés de fases (`test/support/autobuild-harness.js`, `runFlow`). El guion cambia dos
piezas del camino feliz: la aceptación pasa a ser `el alta rechaza un duplicado; el commit lleva el footer
Task: T-1 (fuera de verify: lo registra Commit, después de Verify)`, y Verify devuelve esa segunda
condición como `missing-test`. Script fuera del repositorio (`<scratchpad>/189/repro195.js`, 2026-09-23,
Node 24), corrido con `node repro195.js`.

Lo que el arnés **no** puede establecer es qué contesta un Verify real ante la marca: la respuesta está
guionada. Lo que sí establece es qué recibe Verify y qué hace el recorrido con la respuesta.

## Síntoma

```
marca en el prompt de Verify: true
instrucciones que la nombran fuera de la aceptación: 0
result: {"stopped":true,"reason":"verify-hollow","detail":"sin test que lo codifique: el commit lleva el footer
Task: T-1 (fuera de verify: lo registra Commit, después de Verify)"}
Verify: [ 'Verify|verify', 'Verify|missing-tests', 'Verify|verify' ]
exit=0
```

La marca llega a Verify sólo dentro del texto de la aceptación, y ninguna instrucción dice qué significa.
Con la condición en `uncovered`, el recorrido gasta un agente en `missing-tests`, vuelve a correr Verify y
para.

## Causa raíz

Contrastado contra `main` en `83fc8698` (Cauce 0.98.0):

- **La marca existe sólo en el lado de `check`**: `engine/planning/contracts.js:174` (`OUT_OF_VERIFY`), que
  consume `unverifiableAcceptance` en 193-205 (lo llama `engine/cli/validate.js:109`). La lista de lo que
  nombra un registro post-Verify está en 161-166 (`POST_VERIFY`).
- **El contrato la promete**: `template/planning/PROTOCOL.md:15-19` dice que la condición marcada así
  «deja de avisarse». Dice qué hace `check`, no qué hace Verify, y el recorrido no agregó nada.
- **El recorrido no la nombra**: `grep -rn "fuera de verify" automatization/` no devuelve nada (corrido el
  2026-09-23). El prompt de Verify (`automatization/workflows/autobuild.js:1086-1101`) cierra con
  `Aceptación: ${task.acceptance}.`, la aceptación entera, y pide contrastar «cada criterio de aceptación».
- **El despacho no filtra**: `autobuild.js:1109-1131` decide sólo por `cause` y por `uncovered.length`, y
  nunca mira el texto del criterio.
- **QA recibe lo mismo**: `autobuild.js:1140-1146` también pasa `task.acceptance` entera, sin la marca
  explicada.

Viene del 140: su fix (`1a48e15b`, «warn on acceptance Verify cannot check») tocó `check` y PROTOCOL, y
el recorrido quedó igual.

## Fix propuesto

Que la separación la haga el recorrido, no el modelo: la aceptación es texto conocido antes de Verify.

1. En `autobuild`, partir `task.acceptance` por `;` —el mismo grano que usa `unverifiableAcceptance`— y
   separar las condiciones que cumplen `/\(fuera de verify:\s*[^)]+\)/i`.
2. A Verify (y a QA) mandarle sólo las no marcadas. Las marcadas viajan a Done como hecho
   (`fuera-de-verify=[…]`), para que su cumplimiento quede en `tests:`, `qa:` o `commit:`, que es donde
   PROTOCOL:15-17 dice que va.
3. La regex vive en un solo lugar. Hoy está en el motor y el workflow no hace `require` (se renderiza con
   `{{INCLUDE:}}`), así que o se comparte por un include o se declara la copia con su razón (R11).
4. Una prueba en `test/workflows/autobuild-evidence.test.js` que asercie que el prompt de Verify no
   contiene la condición marcada y que Done la recibe. Hay que verla en rojo con el fuente de hoy.

## Tradeoffs

- **La marca se vuelve más fuerte**: hoy sólo calla un aviso, y con el fix saca la condición de Verify. Un
  planificador podría usarla para esquivar cualquier condición incómoda. Lo que la acota es que, en Done,
  la condición marcada tiene que quedar en la evidencia. Nada comprueba después que eso haya pasado, y eso
  es un hueco, no una garantía.
- **Partir por `;` a mano puede no coincidir con lo que Verify llama «criterio»**: Verify enumera criterios
  en su propia prosa. Por eso el fix saca la condición **antes** de mandarla, y no intenta reconocerla en
  la respuesta.

## Prioridad

Media. Hoy no hay registro de una corrida real que haya parado por esto. En el 140, de 62 tareas medidas,
sólo una condición llevaba la forma que la marca cubre. Pero la marca es la salida que `check` recomienda
por escrito, y quien la siga tiene garantizado el `verify-hollow` si Verify hace lo razonable.

## Contexto de descubrimiento

Revisando el caso 189 el 2026-09-23, mientras se buscaba si el recorrido ya tenía alguna salida para un
criterio que Verify no puede comprobar. La marca apareció en `contracts.js`, y el grep sobre
`automatization/` mostró que el recorrido no la conocía.

## Relacionados

- **189**: se superpone en el mecanismo y no en la semántica. Con este caso arreglado, una tarea de
  decisión podría marcar cada condición `(fuera de verify: es un documento)` y cerrar. Pero la marca está
  definida para lo que existe **después** de Verify (PROTOCOL:15-19; `POST_VERIFY` en `contracts.js:161-166`),
  no para lo que no tiene superficie ejecutable. Y la pone quien planifica, sin la puerta por diff que el
  189 pide para que no se vuelva la forma barata de cerrar sin tests. Estirarla para cubrir el 189 es una
  decisión de producto, no una consecuencia de arreglar esto.
- **140**: el origen de la marca. Su cierre no menciona Verify.

## Cierre

**Resuelto en 0.99.0, por el camino propuesto.** Recorriendo lo que enumeró:

- **Fix 1, partir por `;` y separar lo marcado → se hizo.** `autobuild` parte `task.acceptance` al llegar a
  Verify —después de que Ready pudo refinarla— y aparta las condiciones que cumplen `OUT_OF_VERIFY`.
- **Fix 2, a Verify y a QA sólo lo no marcado; lo marcado a Done → se hizo.** Los dos prompts reciben la
  aceptación sin esas condiciones (y si no queda ninguna, lo dicen). Done recibe `fuera-de-verify=[…]` y la
  instrucción de dejar cada una cumplida en `tests`, `qa` o `commit`.
- **Fix 3, la regex en un solo lugar → se hizo distinto: ni copia declarada ni include de ida.** La regex, el
  corte por `;` y la lista de no ejecutables del 189 viven en `automatization/shared/acceptance.js`; el
  recorrido lo incluye con `{{INCLUDE:}}` y el motor lo evalúa con `vm` desde `engine/planning/acceptance.js`
  (el mismo patrón por el que `engine/hooks/chat.js` ya lee `automatization/` desde el paquete). La definición
  y su comentario salieron de `contracts.js`, que ahora la importa. No hay segunda copia que se pudra.
- **Fix 4, la prueba en rojo con el fuente de antes → se hizo** en `test/workflows/autobuild-surface.test.js`
  («una condición marcada fuera de verify no llega a Verify ni a QA, y viaja a Done»), y no en
  `autobuild-evidence.test.js`: va junto con las del 189, que comparten el mismo trayecto hacia Done.
- **Tradeoff «la marca se vuelve más fuerte» → aceptado, y el hueco sigue.** Nada comprueba después que la
  condición marcada haya quedado cumplida en la evidencia; lo que la acota sigue siendo que la pone quien
  planifica y que `check` avisa sobre las que nombran el registro sin marcarlas. No se estiró la marca para
  cubrir el 189 (decisión del dueño).
- **Tradeoff «el corte puede no coincidir con lo que Verify llama criterio» → se sostuvo:** la separación
  ocurre antes de preguntar y la respuesta no se reinterpreta. Consecuencia medida abajo: si un Verify
  devolviera como `uncovered` una condición que no recibió, la corrida seguiría parando. No se filtró la
  respuesta a propósito: sería reconocer la marca en la prosa del modelo, que es lo que el caso descartó.
- **PROTOCOL → se completó.** `template/planning/PROTOCOL.md` decía qué hace `check` con la marca; ahora dice
  también que el recorrido la saca de Verify y QA y la lleva a Done. Baja a las instancias en su `upgrade`.

### Qué se corrió

- **La prueba nueva, en rojo sobre el fuente anterior** (falla en «la marcada no»: el prompt de Verify traía
  `footer Task`), verde con el arreglo.
- **Dos mutaciones en una copia del árbol (`git ls-files` + los archivos nuevos), las dos en rojo**: volver a
  mandar la aceptación entera a Verify, y no pasarle `fuera-de-verify` a Done.
- **La reproducción del caso contra el código arreglado** (`repro195.js` apuntado al worktree y su variante,
  2026-09-23, Node 24, exit 0):

  ```
  == 195, Verify guionado reportando la marcada (el guion original)
  marca en el prompt de Verify: false
  aceptación que recibe Verify: Aceptación: el alta rechaza un duplicado.
  marca en el prompt de QA: false
  result: {"stopped":true,"reason":"verify-hollow","detail":"sin test que lo codifique: el commit lleva el footer
  Task: T-1 (fuera de verify: lo registra Commit, después de Verify)"}
  == 195, Verify guionado sobre lo que recibe
  marca en el prompt de Verify: false
  aceptación que recibe Verify: Aceptación: el alta rechaza un duplicado.
  marca en el prompt de QA: false
  result: {"done":["T-1"],"count":1,"hito":"H1","phases":[…,"Verify","QA","Commit","Done","Pick","Closing"]}
  Done recibe: fuera-de-verify=["el commit lleva el footer Task: T-1 (fuera de verify: lo registra Commit, después de Verify)"]
  ```

  El guion original sigue parando porque le hace devolver a Verify una condición que ya no recibe; es el
  tradeoff de arriba, no el defecto. Qué contesta un Verify real sin la condición **no está medido**: pide
  lanzar un agente.
- `npm run ci`, exit 0 (941 pruebas).
