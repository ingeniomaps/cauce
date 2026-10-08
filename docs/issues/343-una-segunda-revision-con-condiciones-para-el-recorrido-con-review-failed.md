---
caso: 343
titulo: una segunda revisión con-condiciones para el recorrido con review-failed
estado: resuelto
resuelto-en: 0.105.0
prioridad: alta
version-detectada: 0.104.1
---

# 343 — La segunda revisión del diff para el recorrido con `review-failed` aunque el hallazgo se corrija con una frase

**🟢 resuelto en 0.105.0** · detectado en 0.104.1 · prioridad **alta**.

**Prioridad alta**: es el caso 248 en la fase siguiente. La crítica del plan ya distingue lo que se
corrige al escribir; la revisión del diff no, y frena más tarde y más caro: con el código construido, sin
commitear, y antes de Verify, QA y Commit.

## Resumen

Review admite una sola vuelta de corrección. Si la re-revisión trae cualquier hallazgo `blocking`, el
recorrido para con `review-failed` sin mirar el veredicto ni el tamaño de lo que falta. Un hallazgo
`con-condiciones` cuya corrección el propio revisor escribe entera —«cambiar sólo esa frase»— detiene la
corrida igual que un defecto de diseño.

## Reproducción

Reconstruida en el arnés del recorrido (`test/support/autobuild-harness.js`), con la forma exacta de la
corrida real: Review 1 con un bloqueante comprobado, corrección, Review 2 `con-condiciones` con **otro**
bloqueante comprobado que trae su propia corrección y no es una decisión.

```js
const { runFlow, KEY } = require('./test/support/autobuild-harness')
let turn = 0
const { result, asked } = await runFlow({
  [KEY.review]: () => (turn += 1) === 1
    ? { verdict: 'con-condiciones', consulted: ['api/alta.go'],
        concerns: [{ detail: 'un dependiente de la quita dejó de correr como dice su encabezado', blocking: true, verified: true }] }
    : { verdict: 'con-condiciones', consulted: ['api/alta.go'],
        concerns: [{ detail: 'un comentario sigue diciendo que las URLs salen del entorno: cambiar sólo esa frase',
          blocking: true, verified: true, decision: false }] },
})
```

Y como se observó, en una instancia sidecar real de una empresa, Cauce 0.104.1, 2026-10-08, run
`wf_8928dea1-401`, lanzada con `/autobuild --max 2 …`. Segunda tarea de la corrida (carril `full`):

1. Build termina con los nueve pasos del WIP tildados.
2. Review 1: `con-condiciones`. Bloqueante real: un script dependiente dejó de poder correr como dice su
   encabezado.
3. `review-fix` lo corrige.
4. Review 2: `con-condiciones`. Único hallazgo `blocking: true`, `verified: true`, `decision: false`: un
   comentario de un archivo de tipos sigue diciendo que dos URLs «salen del entorno».
   El hallazgo trae la corrección: «cambiar sólo esa frase por la fuente real (la fila del proveedor), sin
   tocar el resto del comentario». Los demás hallazgos son `blocking: false`.
5. El recorrido devuelve `{"stopped": true, "reason": "review-failed"}`.

## Síntoma

La sonda del arnés, corrida el 2026-10-08 sobre el fuente de 0.104.1:

```
turnos de review: 2 | resultado: {"stopped":true,"reason":"review-failed","detail":"un comentario sigue diciendo que las URLs salen del entorno: cambiar sólo esa frase"}
review-fix pedidos: 1
```

En la corrida real:

- La corrida entera: 32 agentes, 3 397 035 tokens, 3 419 s. La segunda tarea quedó con 16 archivos sin
  commitear en su rama —entre ellos una migración y un seed nuevos—, el WIP activo en Build 10/10 y el
  reclamo tomado.
- Lo que faltaba se resolvió a mano con una edición de una frase. Después, los tres gates del producto
  (`test`, `lint`, `build`) terminaron en exit 0.
- La frase vieja no la produjo la corrección de la vuelta 1: venía del cambio original. El barrido de
  dependientes del plan miró los importadores de la función que cambiaba, y ese archivo no la importa.

## Causa raíz

`automatization/workflows/autobuild.js`, líneas 1505-1523 en el fuente de 0.104.1 (1500-1524 en el paquete
instalado, que es donde se leyó primero): tras la re-revisión,

```js
if (review.verdict === 'bloqueado' || blockers(review).length) {
  return halt('review-failed', named(review).join('; ') || 'sin condiciones nombradas')
}
```

El comentario de ese mismo tramo ya describe el modo de fallo —«como la vuelta es una sola eso termina
en `review-failed` sobre trabajo correcto»— y lo mitiga pidiéndole a `review-fix` que traiga «lo que tu
propia corrección deje desactualizado». Esa mitigación cubre la deriva que crea la corrección, no la que
ya traía el diff y la primera revisión no vio.

La fase Critique ya hace la distinción desde 0.101.0 (caso 248): el esquema `CRITIQUED` exige por hallazgo
`replan`, y `replans` separa lo que pide replan de lo que viaja como condición (`carried`). El esquema
`REVIEWED` tiene `verified` y `decision` por hallazgo y no tiene nada que diga «esto se corrige con lo que
escribí». Confirmado leyendo las líneas 168-200 y 518-553 del fuente.

## Fix propuesto

Darle a Review la misma salida que a Critique. Dos formas, que no se excluyen:

1. **Condición que viaja**: si el veredicto de la re-revisión es `con-condiciones` y el hallazgo
   bloqueante trae su corrección, aplicarla con un `review-fix` más y comprobarla en Verify, en vez de
   detener.
2. **Una vuelta más, acotada**: permitir una segunda corrección sólo cuando los bloqueantes de la
   re-revisión no repiten los de la primera. Si repiten, es `review-failed` de verdad.

## Tradeoffs

- Una vuelta más cuesta un `review-fix` y una revisión. Contra eso, la parada deja el árbol sin commitear
  y obliga a una persona a retomar.
- Sin tope, dos revisores pueden encontrar siempre una frase más. La forma 2 lo acota: se corta cuando el
  hallazgo se repite.
- Un defecto de fondo mal rotulado `con-condiciones` pasaría a Verify. Verify y QA siguen después, y el
  rótulo `bloqueado` sigue deteniendo.

## Contexto de descubrimiento

Sesión de una empresa del 2026-10-08, primera corrida real después de los arreglos de 0.101.0 a 0.104.1.
La primera tarea de la misma corrida cerró sin frenos. El diario de la corrida (`journal.jsonl` del run
`wf_8928dea1-401`, en la carpeta de sesiones del runner) tiene las dos revisiones en sus líneas 59 y 63
—no en las entradas 28 a 31, que son Verify y QA de la primera tarea—: la 59 con `verdict:
con-condiciones` y un bloqueante `verified: true`, y la 63 con `verdict: con-condiciones`, diez hallazgos y
un solo bloqueante, `verified: true`, `decision: false`. Contrastado el 2026-10-08.

## Relacionados

- 248 — una segunda crítica con-condiciones para el recorrido como si bloqueara: el mismo defecto en
  Critique, ya arreglado.
- 279 — una corrida que frena deja el estado de planning sin commitear: acá el estado de planning sí se
  commiteó; lo que quedó suelto es el árbol del producto.
- R3 — un veredicto tiene tres salidas y no dos.

## Cierre

**Resuelto en 0.105.0**, por una tercera forma que el caso no proponía y el dueño eligió el 2026-10-08 con
el 248 como precedente: el hallazgo declara. En `REVIEWED` cada bloqueante puede traer `fixable: true`, «la
corrección está entera en este hallazgo»; en la re-revisión, un veredicto `con-condiciones` cuyos bloqueantes
son comprobados y `fixable` compra una corrección y una revisión más, con tope de dos correcciones por
tarea. Lo que no lo declara, y `bloqueado`, paran como hasta ahora.

Antes de construir se midió el valor sobre los diarios de las corridas de esta máquina: 116 con fase
Review, 40 con corrección y re-revisión, y 24 de esas 40 terminaron con bloqueantes en la re-revisión, las
24 con `con-condiciones` y un bloqueante nuevo. Los diarios no guardan tokens por fase, así que el costo de
una vuelta no está medido; sí está el de la parada, que es la corrida.

### El recorrido de lo que este caso enumeró

- **Forma 1, «condición que viaja a Verify» — se decidió que no.** Verify comprueba lo que una prueba puede
  asertar, y lo que faltaba era una frase de un comentario.
- **Forma 2, «una vuelta más si no repite» — se hizo distinto.** El comparador de «repite» era prosa de dos
  pasadas, el mismo hueco que la revisión del 248 nombró; en vez de comparar, decide el revisor por hallazgo.
  El tope sí quedó: dos correcciones.
- **Tradeoff «una vuelta más cuesta un review-fix y una revisión» — se paga sólo cuando se compra**, y hoy
  ese caso costaba la corrida entera.
- **Tradeoff «sin tope, siempre hay una frase más» — cerrado por construcción**: la tercera revisión con
  bloqueantes para aunque vengan `fixable`.
- **Tradeoff «un defecto de fondo mal rotulado pasaría a Verify» — sigue en pie, acotado.** `verified: true`
  sigue siendo condición para corregir, Verify y QA corren después, y el prompt dice «ante la duda, no lo
  marques». No está medido sobre una corrida real con revisor; lo mide la primera que lo use, como el 248.
- **Lo que el caso citaba y no era así** — las entradas 28 a 31 del diario eran Verify y QA de la primera
  tarea; las revisiones están en las líneas 59 y 63. Corregido en el caso.

### Qué se corrió

- Rojo previo: tres pruebas nuevas en `test/workflows/autobuild-review.test.js`; dos fallaron antes del
  cambio —la vuelta comprada y el tope— y la tercera, el bloqueante sin `fixable` que sigue parando, ya
  pasaba y queda como guardia de la conducta anterior. Después, 24 de 24 en la suite y 237 de 237 en
  `test/workflows/`. La primera versión del bucle rompía «un bloqueo sin condiciones nombradas frena igual»:
  miraba los bloqueantes antes que el veredicto `bloqueado`, y la suite lo encontró.
- Mutaciones, cada una con su prueba en rojo: `fixable` que no compra nada; tope en 99; y la segunda
  corrección que no llega a `done/`.
- Reproducción en el arnés con la forma exacta de la corrida real, antes del cambio: dos revisiones, una
  corrección y `{"stopped": true, "reason": "review-failed"}` con el hallazgo nuevo. Después del cambio la
  misma forma, con `fixable: true` en el hallazgo, llega al final con dos correcciones.
- Entrega: en un banco del toolkit, `automation install . claude` con el motor del fuente deja un
  `.claude/workflows/autobuild.js` que lleva `fixable` seis veces y parsea como cuerpo de workflow. En una
  instancia con el 0.104.1 instalado el workflow no lo lleva hasta reinstalar el runner, que es lo que dice
  el CHANGELOG.
- Lo que no se corrió: una corrida real de `/autobuild` con un revisor que declare `fixable`. Cuesta una
  corrida entera y depende de que el revisor encuentre un hallazgo de esa clase; se mide en uso.

