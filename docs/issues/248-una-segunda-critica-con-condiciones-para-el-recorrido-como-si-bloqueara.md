---
caso: 248
titulo: una segunda crítica con-condiciones para el recorrido como si bloqueara
estado: resuelto
resuelto-en: 0.101.0
prioridad: alta
version-detectada: 0.100.0
---

# 248 — La segunda crítica del plan para el recorrido con `plan-rejected` aunque su veredicto sea `con-condiciones`

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **alta**.

**Prioridad alta**: la parada llega después de pagar Triage, Pick, Ready, Decompose, Plan, dos críticas y
un replan, y deja una fila en `HUMAN_ACTIONS.md` que bloquea la tarea por algo que el propio veredicto
dice que se corrige al escribir.

## Resumen

`autobuild` admite una sola corrección de plan. Si la segunda crítica devuelve cualquier hallazgo con
`blocking: true`, el recorrido para con `plan-rejected`, sin mirar el veredicto. Pero el veredicto
`con-condiciones` está definido en el mismo archivo como «lo que falta se corrige dentro de este mismo
cambio»: el recorrido trata como rechazo lo que su propio vocabulario declara corregible en Build.

## Reproducción

Observada, no reconstruida en un banco. Instancia `initech-ops`, Cauce 0.100.0, 2026-10-05, tarea
`integraciones-reconexion-exige-credencial-completa` (carril `full`), run `wf_2742e257-dd3`:

1. Plan propone dos identificadores nuevos en español y deja escrito: «P35 pide inglés para código nuevo
   y lo decide el revisor».
2. Crítica 1: `con-condiciones`, un bloqueante real sobre la secuencia de rojos. Replan lo corrige.
   **Y ya traía los nombres**, como tercer hallazgo y con `blocking: false`: «El plan lo dejó a decisión
   del revisor: se decide inglés». El replan no lo recibió —sólo viajan los bloqueantes— y volvió a
   proponer los dos nombres en español. Eso es el caso 249.
3. Crítica 2: `con-condiciones`. Único hallazgo `blocking: true`: los dos nombres van en inglés, con el
   texto «Se corrige dentro de este cambio, al escribir; no cambia el diseño». Los otros seis hallazgos
   son `blocking: false`, y el último enumera siete premisas del plan contrastadas contra el código.
4. El recorrido devuelve `{"stopped": true, "reason": "plan-rejected"}`.

El mismo hallazgo salió `blocking: false` en la primera crítica y `blocking: true` en la segunda, con el
plan igual en ese punto: lo que cambió fue el agente que lo clasificó.

Reconstruida después en el arnés (`test/support/autobuild-harness`, 2026-10-05, sobre `0.100.0`), con la
forma de esa corrida: dos críticas `con-condiciones`, la primera con un bloqueante y el de los nombres sin
bloquear, la segunda con el de los nombres bloqueando.

```
result: {"stopped":true,"reason":"plan-rejected","detail":"los dos identificadores nuevos van en inglés; se decide inglés. Se corrige dentro de este cambio, al escribir; no cambia el diseño"}
llegó a Build: false
replan recibe el bloqueante: true
replan recibe el no bloqueante de la crítica 1: false
```

No hace falta escribir una prueba para verlo: `autobuild-review.test.js` ya lo asercia en verde, dos
veces —«un plan que no sobrevive a la segunda crítica no llega a construirse» y la mitad `segunda` de «un
plan que ninguna crítica aprueba queda pedido por escrito»—. Las dos usan `con-condiciones` con un
bloqueante en la segunda crítica y esperan `plan-rejected`. **La conducta es la que se fijó al cerrar el
081, no un descuido.**

## Síntoma

- 12 agentes, 1 335 199 tokens y 652 s, sin una línea de código escrita.
- Fila nueva `pendiente` en `HUMAN_ACTIONS.md` con el título «nadie pudo escribir un plan que sobreviva a
  la crítica», que no describe lo que pasó: el plan sobrevivió en diseño, alcance y pruebas.
- Con la fila pendiente la tarea deja de ofrecerse, así que el operador tiene que resolverla a mano para
  poder seguir.
- La tarea se construyó después fuera del recorrido, sobre ese mismo plan con los dos nombres cambiados,
  y pasó gates, mutaciones y la revisión de los dos cargos del reparto.

## Causa raíz

`automatization/workflows/autobuild.js` (leído en el paquete instalado, 0.100.0):

- Línea 957: tras la segunda crítica,
  `if (critique.verdict === 'bloqueado' || blockers(critique).length) return planRejected('plan-rejected', …)`.
  La segunda mitad de la condición no distingue veredictos.
- Líneas 362-365: el texto `VERDICT` que recibe la crítica define `con-condiciones` como «si lo que falta
  se corrige dentro de este mismo cambio» y reserva `bloqueado` para lo que queda fuera.
- Líneas 390-391: `blockers` filtra por `blocking && !decision && verified !== false`; el comentario de
  arriba aclara que Critique no declara `verified`, así que para ella todo bloqueante bloquea.

El primer paso por la crítica sí usa la distinción (línea 943: `bloqueado` corta sin replan). El segundo
la pierde.

Lo que la distinción significa en el primer paso es más angosto que lo que el resumen de arriba le lee:
ahí `con-condiciones` con un bloqueante quiere decir «se corrige **replanificando**», y es la forma normal
de pedir el replan (línea 946). En el segundo paso ya no queda replan, así que la misma forma no tiene a
dónde ir. El hueco es del esquema: `DECISION` no separa el bloqueante que cambia el plan —y pide volver a
criticarlo— de la condición que sólo le dice algo a quien construye. Los dos son `blocking: true`.

Y nada de lo que la crítica encuentra pasa de la línea 962: `critique` no se vuelve a leer, así que hoy
no hay por dónde mandarle una condición a Build.

## Fix propuesto

En la segunda crítica, parar sólo con `bloqueado`. Con `con-condiciones`, los bloqueantes viajan a Build
como condiciones del plan aprobado —al WIP, bajo «Decisiones tomadas»— y Review comprueba que se
aplicaron:

```diff
-        if (critique.verdict === 'bloqueado' || blockers(critique).length) {
+        if (critique.verdict === 'bloqueado') {
           return planRejected('plan-rejected', task, blockers(critique))
         }
+        conditions = blockers(critique)
```

Alternativa más chica: permitir un segundo replan sólo cuando el veredicto es `con-condiciones` y los
bloqueantes de la segunda crítica no repiten los de la primera.

### Lo que la revisión del 2026-10-05 encontró sobre estas dos

- **El diff no alcanza.** `conditions` no existe y no tiene destino: el prompt de WIP, el de Build y el de
  Review no reciben nada de la crítica. Sin ese cableado el recorrido igual seguiría —Build escribiría
  los nombres del plan y Review los frenaría contra P35, con su vuelta de corrección—, que es más barato
  que parar pero no es lo que el fix dice hacer.
- **Da vuelta dos pruebas y parte del cierre del 081.** Las dos de arriba pasan a llegar a Build, y una
  usa de bloqueante «sigue mezclando dos resultados»: exactamente la señal de R17, rotulada
  `con-condiciones`. Con el fix, `plan-rejected` queda sólo para un `bloqueado` en la segunda crítica, y
  la tercera barra de R17 pasa a depender de un rótulo que en esta corrida cambió de una crítica a otra.
- **La alternativa no tiene comparador.** «No repiten los de la primera» compara prosa de dos agentes;
  o lo decide un agente más o la condición se cae y queda «un segundo replan si es `con-condiciones`».

**Es una decisión de producto y está sin tomar**: qué significa `plan-rejected` después de esto. Las tres
formas que hay sobre la mesa:

1. Sólo `bloqueado` para, y las condiciones viajan a Build y a Review (el fix de arriba, cableado).
2. Un segundo replan con `con-condiciones`, sin tercera crítica, y recién ahí parar.
3. Que la crítica declare por hallazgo si pide replan o es una condición para quien construye, y sólo lo
   primero pare. Es la única que no depende del rótulo del veredicto, y la única que toca el esquema.

## Tradeoffs

- Un bloqueante de diseño mal rotulado `con-condiciones` llegaría a Build. Lo acota que Review reciba las
  condiciones y las compruebe sobre el diff; hoy esa red ya existe para los hallazgos de Review.
- El segundo replan de la alternativa cuesta dos llamadas más en el peor caso, contra una corrida entera
  perdida.
- R17 y la regla propia P17 de initech leen «dos rechazos» como señal de que la unidad se parte. Este
  caso muestra que la señal vale cuando los dos rechazos caen sobre la aceptación; acá ninguno lo hacía,
  y la fila que el recorrido escribió lo reconoce: «la objeción no parece pedir una partición».

## Contexto de descubrimiento

Sesión de initech del 2026-10-05, al correr `/autobuild` sobre la primera tarea libre de la cola. Es el
segundo `plan-rejected` de esta misma tarea: la fila 78 de su `HUMAN_ACTIONS.md` registra el primero, del
2026-09-17, resuelto el 18. El
diario de la corrida con los dos planes y las dos críticas completas quedó en
el directorio de workflows de esa sesión.
El cierre a mano está en `initech-ops/planning/done/integraciones-reconexion-exige-credencial-completa.md`
(rama `docs/reconexion-credencial-cierre`), campo `review:`.

## Relacionados

- 081 — un plan rechazado dos veces no vuelve a las compuertas que lo dejaron pasar.
- 206 — un hallazgo del review no dice en qué regla se apoya ni si se verificó.
- 176 — una parada que registra acción humana deja su reclamo sobre una tarea bloqueada.
- 249 — lo que la crítica anota sin bloquear no llega a ninguna fase. Es por donde entró esta corrida.
- R3 — un veredicto tiene tres salidas y no dos.

## Cierre

**Resuelto en 0.101.0**, por la tercera de las formas que la revisión dejó sobre la mesa, elegida por el
dueño el 2026-10-05, y junto con el 249.

La crítica del plan tiene esquema propio (`CRITIQUED`) y cada hallazgo declara `replan`. Un bloqueante con
`replan: true` —o sin declararlo— pide corregir el plan y, si sigue ahí en la segunda crítica, para con
`plan-rejected`. Uno con `replan: false` es una condición: no compra corrección ni segunda crítica, y viaja
al WIP, a Build y a Review, que recibe la orden de comprobar sobre el diff que se cumplió.

### El recorrido de lo que este caso enumeró

- **Resumen, «trata como rechazo lo que su vocabulario declara corregible» — se hizo distinto.** El
  veredicto sigue sin decidir nada en la segunda crítica; decide el hallazgo. El rótulo `con-condiciones`
  cambió de una crítica a otra en la corrida original y no servía de apoyo.
- **Fix propuesto, el diff — se hizo distinto**, con el cableado que le faltaba: `conditions` existe y
  tiene tres destinos.
- **Alternativa del segundo replan — se decidió que no.** No tenía comparador y no hizo falta.
- **«Da vuelta dos pruebas y parte del cierre del 081» — no pasó.** Las dos siguen en verde sin tocarlas:
  sus bloqueantes no declaran `replan`, y eso pide replan. La señal de R17 queda como estaba.
- **Tradeoff «un bloqueante de diseño mal rotulado llegaría a Build» — sigue en pie, acotado.** El
  default frena, el prompt dice «ante la duda, true» y Review comprueba cada condición. No está medido
  sobre una corrida entera: lo activa la primera `review-failed` cuyo hallazgo sea una condición de la
  crítica, y lo revisa quien cierre ese caso.
- **Tradeoff del costo del segundo replan — no se paga**, porque no hay segundo replan. Al revés: una
  condición sola en la primera crítica ahora ahorra las dos llamadas que antes gastaba.
- **Tradeoff sobre R17 y los dos rechazos — se hizo**: `plan-rejected` queda sólo para lo que pide otro
  plan, que es lo que la fila le pide mirar a una persona.
- **Síntoma, «la fila no describe lo que pasó» — se hizo por el otro lado.** El texto de la fila no
  cambió; lo que cambió es que ya no se escribe por una condición.

### Lo que el caso no preveía

- La primera crítica ya había resuelto los nombres sin bloquear y nadie lo recibió: salió como caso 249.
- Las condiciones de la primera crítica se conservan aunque la segunda no las repita. La primera versión
  del arreglo las perdía en la corrección; lo encontró escribir la prueba.
- **Una corrida que se reanuda no le pasa las condiciones a Review por el prompt.** Están en el WIP, que
  Build lee; Review las recibe sólo en la corrida que criticó el plan. Queda así y se dice.

### Qué se corrió

- **La reproducción del caso, antes y después**, en el arnés. Antes: `plan-rejected`, sin llegar a Build.
  Después, con el hallazgo de los nombres declarado `replan: false`: el recorrido llega al final y la
  condición está en los prompts de WIP, Build y Review.
- **Once mutaciones, las once en rojo**, en una copia bajo el temporal de la sesión que primero se corrió
  en verde (195 pruebas). La que devuelve lo quitado —la condición volviendo a rechazar en la segunda
  crítica— pone en rojo «una condición para quien construye no rechaza el plan». Las otras: el bloqueante
  sin `replan` dejando de frenar (cuatro pruebas rojas, las del 081 entre ellas), cada uno de los tres
  destinos de la condición, la condición sola comprando replan, la parada nombrando condiciones, la
  condición de la primera crítica perdiéndose, y las tres del 249.
- **Una sonda con un agente real**, que no es una corrida: un agente recibió el texto literal de `VERDICT`
  y `REPLANNED`, los dos planes de `wf_2742e257-dd3` y los dieciséis hallazgos sin clasificar. Lo que la
  desmentía era que marcara `replan: true` el de los nombres. Devolvió `1.1` (la secuencia de rojos)
  `blocking: true, replan: true` y `2.1` (los nombres) `blocking: true, replan: false`: con eso la
  corrida original corrige el plan una vez y sigue a Build.
- **Lo que la sonda mostró de más**: marcó bloqueantes ocho hallazgos donde las críticas originales
  marcaron dos, siete de ellos como condición, y dos los declaró «limítrofes» con cómo se prueba. Es una muestra de
  uno y sin inspeccionar código, así que no dice cuánto pasa en una crítica real; dice por dónde miraría.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: un `autobuild` real de punta a punta con el campo nuevo.

### Corrida real del 2026-10-05

En un banco sidecar instalado fuera del árbol, sesión de Claude Code con `/autobuild`, tarea `full`: la crítica aprobó el plan con una condición para quien construye —un `test` por caso, para
ver los cuatro en rojo— y **no hubo replan ni segunda crítica**. El diario va `plan → critique → wip`. El
WIP quedó con «Condiciones con las que la crítica aprobó el plan» y, aparte, «Anotado por la crítica sin
bloquear», y la entrega salió con un `test()` por caso. No se dio el otro camino, el de la segunda crítica.
