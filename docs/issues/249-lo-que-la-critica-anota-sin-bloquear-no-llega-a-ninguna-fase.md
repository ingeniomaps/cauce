---
caso: 249
titulo: lo que la crítica anota sin bloquear no llega a ninguna fase
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 249 — Un hallazgo `blocking: false` de la crítica del plan se pierde: ni el replan, ni Build, ni `done/` lo reciben

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no frena nada por sí solo, pero es por donde entró la parada del 248 —1,3 M de
tokens—, y sube a alta si el 248 se resuelve mandando condiciones a Build: ahí este canal pasa a ser el
que sostiene la aprobación.

## Resumen

El texto que acompaña a toda crítica le promete que lo que no bloquea «queda registrado y no manda a
tocar código». Para Review es cierto. Para la crítica del plan no: de su veredicto sólo se leen los
bloqueantes, y el resto no viaja al replan, ni al WIP, ni a Build, ni a la entrada de `done/`. Una
decisión que la crítica ya tomó —«se decide inglés»— se pierde, y el que sigue la vuelve a encontrar.

## Reproducción

En el arnés, sobre `0.100.0`, con dos críticas `con-condiciones`: la primera trae un bloqueante y un
segundo hallazgo `blocking: false` que dice «se decide inglés».

```js
const { KEY, runFlow } = require('./test/support/autobuild-harness')
let turn = 0
runFlow({
  [KEY.critique]: () => (++turn === 1
    ? { verdict: 'con-condiciones', consulted: ['a.ts'], concerns: [
      { detail: 'la secuencia de rojos no ocurre como el plan la describe', blocking: true },
      { detail: 'los dos identificadores nuevos van en inglés; se decide inglés', blocking: false }] }
    : { verdict: 'aprobado', consulted: ['a.ts'], concerns: [] }),
  [KEY.replan]: { approach: 'corregido', steps: ['1'], files: ['a.ts'], testStrategy: 'unit' },
}).then(({ prompts }) => console.log(
  prompts.filter((one) => one.prompt.includes('se decide inglés')).map((one) => one.key)))
```

## Síntoma

Con la segunda crítica bloqueando por ese mismo hallazgo —la forma del 248—, el único prompt de toda la
corrida que lo nombra es el que escribe la fila de la parada:

```
replan recibe el bloqueante: true
replan recibe el no bloqueante de la crítica 1: false
prompts que nombran «se decide inglés»: [ 'Critique|plan-human' ]
```

En la corrida real (`wf_2742e257-dd3`, initech, 2026-10-05) la primera crítica dejó nueve hallazgos, ocho
sin bloquear. El tercero resolvía lo que el plan había dejado abierto: «El plan lo dejó a decisión del
revisor: se decide inglés». El replan devolvió los dos nombres en español, la segunda crítica volvió a
encontrarlos, esta vez los marcó bloqueantes, y el recorrido paró.

## Causa raíz

`automatization/workflows/autobuild.js`, en `0.100.0`:

- Línea 364: `VERDICT` dice «el resto queda registrado y no manda a tocar código».
- Línea 948: el replan recibe `blockers(critique).join('; ')` y nada más.
- Después de la línea 962 `critique` no se vuelve a leer. El prompt de WIP lleva los pasos del plan, la
  estrategia de prueba y el reparto; el de Build y el de Review no reciben nada de la crítica.

Review sí guarda lo suyo: junta las decisiones, lo corregido y lo sospechado apenas cada pasada contesta,
con el comentario «sin esto lo que el revisor señaló se iba con la corrida». Es el mismo defecto, ya
arreglado de ese lado (casos 207 y 122).

## Fix propuesto

Que lo anotado viaje, separado de lo que manda a corregir:

- Al replan, detrás de los bloqueantes: «Y tené a la vista lo que la crítica anotó sin bloquear; aplicá
  lo que ya viene decidido y no amplíes el plan por el resto».
- Al WIP, en las decisiones, para que Build y Review lo lean donde ya leen el reparto.

## Tradeoffs

- **Invita a ampliar el alcance.** De los ocho hallazgos sin bloquear de esa crítica, dos decían de sí
  mismos que eran para registro y no para este cambio, y otro sólo confirmaba que el diseño daba bien. Mandárselos al replan como lista le da a quien
  corrige ocho cosas donde había una, que es lo que R3 separa a propósito. No está medido cuánto pesa.
- El prompt del replan y el WIP crecen con prosa de la crítica, y el WIP se relee en cada fase.
- No cierra el 248: una segunda crítica puede traer un bloqueante chico que la primera no vio.

## Contexto de descubrimiento

Al revisar el 248 contra el diario de su corrida, el 2026-10-05. El caso contaba que la segunda crítica
había bloqueado por los nombres; el diario muestra que la primera ya los había resuelto y que esa
resolución no llegó a nadie.

## Relacionados

- 248 — una segunda crítica `con-condiciones` para el recorrido como si bloqueara.
- 207 — lo que Review manda a corregir no llegaba a `done/`.
- 177 — la descripción de la tarea no viaja a ninguna fase y el plan vuelve a decidir.

## Cierre

**Resuelto en 0.101.0**, junto con el 248.

### El recorrido de lo que este caso enumeró

- **Fix, «al replan, detrás de los bloqueantes» — se hizo**, con el límite escrito: «Aplicá lo que ahí ya
  venga decidido y no amplíes el plan por el resto».
- **Fix, «al WIP, en las decisiones» — se hizo**, y va rotulado como anotado sin bloquear, que no manda a
  tocar código. Sale de la última crítica: lo de la primera ya viajó a la corrección.
- **Título, «ni `done/`» — se decidió que no.** Lo anotado no cambia código y el WIP se vacía al cerrar,
  así que no llega a la entrada de `done/`. Lo que sí llega es lo que Review encuentre al comprobar las
  condiciones, por el camino del 207.
- **Tradeoff «invita a ampliar el alcance» — sigue abierto.** El límite está en el prompt y una prueba lo
  fija; cuánto lo respeta un agente real no está medido. Lo activa el primer replan que crezca por algo
  anotado, y lo revisa quien lea ese plan.
- **Tradeoff «el WIP crece» — se paga.**
- **Tradeoff «no cierra el 248» — se cerró aparte**, en el mismo cambio.
- **Prioridad, «sube a alta si el 248 manda condiciones a Build» — pasó**, y por eso salieron juntos.

### Qué se corrió

- **La reproducción de arriba, antes y después.** Antes, el único prompt que nombraba «se decide inglés»
  era `Critique|plan-human`. Después lo recibe `Critique|replan`.
- **Tres mutaciones, las tres en rojo**, en la misma copia que el 248: el replan sin lo anotado, el WIP sin
  lo anotado, y lo anotado mandado a Build como condición.
- **La puerta entera**, `npm run ci`.
- **Un replan real recibiendo anotaciones** se corrió después, abajo, con cinco.

### Un replan real con lo anotado, el 2026-10-05

En la corrida del 248 de ese día, la corrección del plan recibió los tres bloqueantes y además «La crítica
anotó además esto sin bloquear: …», con las cinco anotaciones de la primera crítica. El plan corregido no
creció por ellas: la segunda crítica no objetó alcance.
