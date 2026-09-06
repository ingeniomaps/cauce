---
caso: 026
titulo: R17 dice medir las condiciones de aceptación de una tarea y sólo cuenta los criterios heredados
estado: abierto
prioridad: alta
version-detectada: 0.60.1
---

# 026 — La barra de cinco condiciones no ve la aceptación escrita en prosa

**🔴 abierto** · detectado en 0.60.1 · prioridad **alta** — el modo de falla que la regla describe es el que no mide

## Resumen

R17 fija dos barras para una tarea: **cinco condiciones de aceptación** y cuatro horas de esfuerzo. La
primera la mide `check`… pero contando sólo los criterios **heredados** con `(→ CN)`. Una tarea que
escribe su aceptación en la línea —`_Aceptación: (1)… (2)… (8)…_`, que es la forma que el propio molde
muestra primero— cuenta **cero**.

Y es precisamente la forma que la regla describe como peligrosa. Su texto dice: *«una aceptación crece sin
que nadie lo decida: se le suman condiciones de a tandas en cada rechazo de plan, y cada tanda parece
razonable»*. Esa acumulación ocurre en la prosa, no en las referencias. La regla mira hacia el otro lado.

## Reproducción

```bash
mkdir repro && cd repro
cp -r "<instancia>/planning" planning

cat >> planning/BACKLOG.md <<'EOF'

## Hito ejemplo — Un hito cualquiera

- [ ] **tarea-inflada** [full] — Resultado a construir. _Aceptación: (1) primera condición; (2) segunda; (3) tercera; (4) cuarta; (5) quinta; (6) sexta; (7) séptima; (8) octava._ (service: api)
EOF

node <ruta>/engine/cli/ops.js check planning        # no dice nada de tarea-inflada
```

Control: la **misma** tarea con las ocho como referencias —`(→ C1, C2, C3, C4, C5, C6, C7, C8)`— sí
dispara.

## Síntoma

Con ocho condiciones en prosa, `check` no menciona la tarea. Con las ocho como referencias:

```
✗ BACKLOG tarea-heredada: criterios: 8 (umbral 5 de R17). Revisá si son dos resultados con vidas
distintas y partilo; si es uno solo, partirlo lo empeora — dejalo entero agregando "(sin partir: <razón>)"
```

## Causa raíz

`engine/planning/contracts.js:465`:

```js
judge(task, `BACKLOG ${task.slug}: criterios`, task.criteria.length, R17.taskCriteria)
```

y `task.criteria` viene de `criteriaRefs(rest)` (`engine/planning/parser.js:88-100`), que sólo extrae
`(→ CN)` y `*(criterio N)*`. La aceptación en prosa se captura aparte, en `acceptance`, y nadie la cuenta.
Comprobado sobre las dos formas, misma tarea y mismo conteo: la de prosa deja `criteria=0` y `check`
calla; la de referencias deja `criteria=8` y dispara.

**Pero esto no es una mitad que falta por olvido: está afuera a propósito y con la razón escrita.**
`contracts.js:446-450`, cuatro líneas encima del `judge`:

> Se cuenta lo que está estructurado: criterios de la épica, criterios que hereda una tarea, tareas del
> hito. Quedan afuera las dos cosas que no son un conteo: la aceptación escrita en prosa —cuántas
> condiciones tiene una frase es una lectura, y un número inventado ahí sería peor que ninguno— y la
> segunda barra de R17, las cuatro horas de esfuerzo, que no está en el artefacto. Las dos las mira el
> review, que para eso está R3, y la de esfuerzo es la que R17 dice que encuentra lo que ésta deja pasar.

O sea que este caso no reporta un defecto: **propone revisar una decisión**, y tiene que ganarle al
argumento que ya está escrito. Le gana con lo único que el argumento no previó, que es cómo se comportó:
el respaldo que nombra —el review de R3 y la barra de esfuerzo— no atrapó ninguna de las seis tareas que
cruzaban el umbral en un proyecto real, y una de ellas era la primera de la cola.

Hay un segundo desacuerdo, más chico y más incómodo. R17 dice que la salida de cruzar el umbral es
escribir `(sin partir: <razón>)` «y `check` la exige». Para una tarea que escribe su aceptación en prosa,
`check` no la exige nunca: el umbral no se cruza, así que la escapatoria que la regla describe no existe
para la forma más común. El molde lo empuja hacia ahí — `template/planning/BACKLOG.md:14` muestra
`_Aceptación:_` en la primera tarea de ejemplo y las referencias recién en la segunda.

## Fix propuesto

Contar también las condiciones de la aceptación propia, y quedarse con la mayor de las dos:

```diff
-      judge(task, `BACKLOG ${task.slug}: criterios`, task.criteria.length, R17.taskCriteria)
+      // R17 mide «condiciones de aceptación», y una tarea las escribe de dos formas: heredadas del
+      // roadmap o propias en la línea. Contar sólo las heredadas deja sin medir la acumulación que la
+      // regla describe —la que crece de a tandas en cada rechazo de plan—, que ocurre en la prosa.
+      const propias = acceptanceConditions(task.acceptance)
+      judge(task, `BACKLOG ${task.slug}: criterios`, Math.max(task.criteria.length, propias), R17.taskCriteria)
```

La variable del bucle es `task`, no `entry` —`for (const task of milestone.tasks)`—, y
`acceptanceConditions` todavía no existe: el diff es la forma, no el parche. Aplicarlo tal cual no corre.
Y si se toma este camino hay que reescribir el comentario de `contracts.js:446-450`, que hoy afirma lo
contrario: dejarlo ahí deja el archivo diciendo por qué no se cuenta la prosa al lado del código que la
cuenta.

Contar la prosa exige elegir un separador, y ahí está la decisión de diseño: los marcadores explícitos
`(1)`, `(2)`… son inequívocos pero opcionales; el `;` es lo que se usa en la práctica y también aparece
dentro de una condición. Una salida conservadora es contar los marcadores numerados cuando existan y
caer al `;` sólo si no hay ninguno, aceptando que sub-cuenta antes que sobre-contar: un falso negativo
deja las cosas como están hoy, un falso positivo enseña a ignorar el mensaje.

Alternativa sin heurística: exigir que una aceptación con más de una condición las escriba numeradas.
Es un contrato nuevo sobre texto ya escrito, así que conviene sólo si se acompaña de un aviso durante
un tiempo.

## Tradeoffs

Esto cambia lo que `check` reporta en **toda** instancia, no en ésta: `contracts.js` es del motor y baja
a cada consumidor en su próximo `upgrade`. Medir la prosa hará aparecer el mensaje en instancias que hoy
pasan, y en las adoptadas puede aparecer en muchas tareas a la vez. Es el mismo perfil que tuvo R17 al
empezar a medirse, y la salida es la que la regla ya tiene escrita: `(sin partir: <razón>)`.

Sub-contar es preferible a sobre-contar. Un umbral que salta cuando no debe convierte la escapatoria en
trámite, y ahí la razón se escribe para callar el mensaje —que es exactamente lo que la regla dice que
desperdicia la razón—.

## Contexto de descubrimiento

Revisando en `gouduet` si las tareas de su cola respetaban la barra, después de que su dueño preguntara en
qué se diferencian los criterios de una épica, de un hito y de una tarea (2026-09-06). `check` estaba
verde. Contando a mano, **seis de sus cuarenta y ocho tareas** cruzaban el umbral, con diez, nueve, ocho y
siete condiciones — incluida la primera de la cola, que el loop iba a tomar. Ninguna era visible.

Vale notar cómo llegó una de ellas a siete: se le agregó una condición ese mismo día, al promover un
hallazgo, y la suma pareció razonable. Es el mecanismo que la regla describe, ocurriendo mientras se la
leía.

## Relacionados

- [019](019-los-campos-de-done-se-leen-de-una-sola-linea.md) — el otro caso donde el motor lee menos de lo
  que el documento contiene.
