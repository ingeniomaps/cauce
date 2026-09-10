---
caso: 081
titulo: Un plan rechazado dos veces sobre la misma tarea no vuelve a Ready ni a Decompose, y el recorrido intenta una tercera
estado: resuelto
resuelto-en: 0.77.0
prioridad: media
version-detectada: 0.75.0
---

# 081 — Las compuertas que dejaron pasar la tarea no se enteran de que nadie pudo planificarla

**🟢 resuelto en 0.77.0** · detectado en 0.75.0 · prioridad **media** — hacía que una unidad mal formada se pagara en corridas de planificación en vez de partirse

## Resumen

Cuando `Critique` rechaza un plan, el recorrido para con `plan-rejected`. Si se relanza, vuelve a
**Triage → Claim → Ready → Decompose → Plan → Critique** sobre la misma tarea, y las dos compuertas que
ya la dejaron pasar la vuelven a dejar pasar — porque su criterio no cambió y la tarea tampoco.

Nada convierte «nadie pudo escribir un plan para esto» en la señal que es: que la unidad no está bien
formada. El protocolo lo tiene previsto para el tamaño y para el esfuerzo —R17, con sus dos barras— pero
**no para la planificabilidad**, que es la evidencia más directa de las tres y la única que aparece
después de haber intentado.

## Reproducción

Dos corridas consecutivas sobre la misma tarea, medidas en el journal:

```
wf_1af79777 → Triage · Triage · Claim · Ready · Decompose · Plan · Critique · Critique · Critique
wf_95c29942 → Triage · Triage · Claim · Ready · Decompose · Plan · Critique · Critique · Critique
```

Idénticas. `Ready` y `Decompose` corrieron las dos veces y pasaron las dos veces; `Critique` rechazó las
dos veces. Costo: **9 agentes y ~780 k tokens por corrida, sin escribir una línea de código.**

## Síntoma

**Las dos compuertas hicieron bien su trabajo, y ése es el punto.**

- `Ready` exige «aceptación concreta y decisiones resueltas». La aceptación de la tarea medida era
  concreta —cinco condiciones, todas observables con un comando— y no tenía decisiones pendientes. Ready
  acertó al pasarla.
- `Decompose` se dispara con **más de cinco** condiciones de aceptación. La tarea tenía **exactamente
  cinco**. Pasó por un pelo, y también correctamente: la regla dice lo que dice.

Y sin embargo la tarea no se podía planificar, y la prueba es que dos críticas independientes la
rechazaron. Además **por lo mismo las dos veces**: qué tiene que afirmar la prueba y cómo se la ve
fallar. La primera fue el parseo de unidades de una duración; la segunda, un caso que nacía verde y por
lo tanto no podía probarse por ausencia.

Leídos juntos, los dos rechazos dicen lo que ninguna compuerta vio: la aceptación mezclaba **dos cosas
que se comprueban de manera distinta** —un número que hay que interpretar con unidades, y un estado que
ya se cumple y necesita mutación—. Eso es una unidad con dos resultados adentro, que es exactamente lo
que R17 manda partir.

## Causa raíz

R17 enumera dos disparadores de división y los dos son **anteriores** a intentar: condiciones de
aceptación y horas de esfuerzo. Los dos se miden sobre la tarea escrita.

Falta el disparador **posterior**: la evidencia que sólo existe después de haber intentado planificar. Y
falta el camino de vuelta — `plan-rejected` deja el estado consistente y no dice que la próxima corrida
debería mirar la unidad antes que el plan.

El resultado es que el recorrido reintenta lo único que ya se sabe que no sale, y lo hace al precio
completo de una corrida de planificación.

## Fix propuesto

En R17, un tercer disparador con la misma forma que los otros dos:

```diff
  Dos barras, y cada una encuentra lo que la otra deja pasar: cinco condiciones de aceptación
  en una tarea, y cuatro horas de esfuerzo humano.
+
+ Y una tercera que no se mide antes sino después: **un plan rechazado dos veces sobre la misma
+ unidad**. Los dos primeros disparadores miran la tarea escrita; éste mira lo que pasó al
+ intentarla, que es la evidencia más directa de que no está bien formada — y la única que no
+ se puede tener antes. Al segundo rechazo se revisa la unidad, no se escribe un tercer plan:
+ se parte, o se deja con la razón escrita, igual que con las otras dos.
+
+ Dos rechazos sobre lo mismo dicen más que dos rechazos sobre cosas distintas. Si los dos
+ señalan la misma dimensión de la aceptación, ahí está la costura por donde parte.
```

Y en el recorrido, que `plan-rejected` lleve la cuenta: la segunda vez sobre la misma tarea no vuelve a
`Plan`, para con una razón que nombre la unidad como sospechosa. Hoy `claim-stuck` ya hace algo así para
el reclamo —«repetir no cambia nada»—, y es el mismo razonamiento.

## Tradeoffs

- Contar rechazos exige recordar entre corridas. El WIP ya persiste estado por runner, así que hay dónde;
  pero es estado nuevo y puede quedar viejo si alguien reescribe la tarea entre intentos — conviene que
  el contador se borre cuando la línea de la tarea cambia.
- Un segundo rechazo puede ser legítimamente sobre otra cosa. Por eso el disparador **revisa** y no
  parte: es la misma salida que R17 ya da a sus otras dos barras.

## Contexto de descubrimiento

Instancia real (sidecar, 0.75.0), 2026-09-10. Salió de una observación del operador, no de una falla:
al revisar por qué una tarea `full` había quedado sin revisión de cargo, dijo que ante una tarea que no
se entiende el proceso debería analizarla y partirla —retirando la vieja y dejando las nuevas— y que
creía que eso ya estaba resuelto **antes** de lanzar la tarea a ejecutarse.

Y casi lo está: las dos compuertas existen, corren antes de Plan, y en la corrida medida corrieron. Lo
que falta es que se enteren de que fallaron.

Vale decir el cierre, porque es la mitad del caso: tras el segundo rechazo la tarea **no se partió** —
la cerró una persona a mano. Los dos rechazos eran correctos y mejoraron el resultado, pero el trabajo
se pagó dos veces en planificación y una tercera en ejecución manual, cuando partir la unidad costaba
una línea. En la misma sesión y sobre la tarea anterior, `Decompose` **sí** partió una y las dos mitades
salieron mejor: el mecanismo funciona cuando se dispara.

## Relacionados

- **R17** — es la regla que gana el disparador. Sus dos barras ya dicen que «no deciden la división: la
  disparan», que es exactamente la forma que este tercero necesita.
- **071** — `claim-stuck` aplicó este mismo razonamiento al reclamo: si repetir no puede cambiar el
  resultado, no se repite. Acá falta el equivalente para el plan.
- **OPS-006** — el carril decide la ceremonia; una tarea que consume dos corridas de planificación y
  termina sin revisión es la señal de que la clasificación no describía a la unidad.

## Cierre

**Resuelto en 0.77.0.** El disparador de R17 es el que este caso proponía; el mecanismo del recorrido salió
distinto, y más chico, porque medir el motor mostró que ya existía.

### El contador no hacía falta, y su casa no existía

El caso proponía llevar la cuenta de rechazos entre corridas, guardada en el WIP. Dos cosas lo desarman:

- **El WIP todavía no existe cuando esto ocurre.** Las fases van `Ready → Decompose → Plan → Critique →
  WIP`, así que un plan rechazado corta **antes** de que haya dónde escribir el contador.
- **La evidencia ya está completa dentro de una corrida.** `plan-rejected` no llega al primer rechazo:
  llega después de una crítica, una corrección y una segunda crítica. Contar entre corridas habría pagado
  una corrida entera —las medidas: 9 agentes y ~780 k tokens— para aprender lo que la primera ya sabía.

### Lo que se usó en su lugar, y ya estaba

Una **acción humana** sobre la tarea. Medido contra el motor antes de escribir nada:

```
sin acciones pendientes      → tarea: dificil · blockedTasks: []
con una pendiente en dificil → tarea: facil   · blockedTasks: ["dificil"]
```

Una acción pendiente **saca esa tarea de la cola y ofrece la siguiente**, sin frenar la corrida. Con eso,
un solo acto hace las dos cosas que el caso pedía: el recorrido deja de reintentar lo que ya se sabe que
no sale, y una persona ve la fila con el motivo.

Es el razonamiento de `claim-stuck` del [071](071-claim-reintenta-sin-tope-y-no-repica-tras-decompose.md),
que el propio caso nombra: si repetir no puede cambiar el resultado, no se repite.

### El recorrido de lo que este caso enumeró

- **«Un tercer disparador en R17» — se hizo, con el texto ampliado.** Además de lo que el caso proponía,
  dice por qué es fácil de perder: llega **después** de que las otras dos dieron el visto bueno, y las dos
  acertaron. Una unidad puede estar bien escrita y no ser planificable, y eso sólo se sabe habiéndolo
  intentado.
- **«Que `plan-rejected` lleve la cuenta» — se hizo distinto**, por lo de arriba: sin contador, sin estado
  nuevo, y sin el problema que el propio caso anticipaba —«puede quedar viejo si alguien reescribe la
  tarea entre intentos»—. Una acción humana se resuelve a mano, que es exactamente cuando la tarea cambió.
- **`plan-blocked` entró también, y el caso no lo nombraba.** Es la misma decisión por el otro camino: el
  veredicto bloqueado en la primera crítica, donde el recorrido ni siquiera intenta corregir porque «lo
  que lo bloquea está fuera de lo que una segunda pasada puede tocar». Cortaba igual de mudo.
- **Tradeoff «contar rechazos exige recordar entre corridas» — no se paga**, porque no se cuenta.
- **Tradeoff «un segundo rechazo puede ser legítimamente sobre otra cosa» — sigue en pie y por eso la fila
  no parte nada**: dice qué mirar y quién decide. Es la misma salida que R17 da a sus otras dos barras.
- **Lo que el caso pedía y no se hizo**: nada de su enumeración. Lo que queda afuera por decisión es
  extender esto a los otros cortes mudos del recorrido —`review-failed`, `verify-failed`, `qa-failed`—.
  Son de otra clase: ahí la unidad está bien formada y lo que falló es el trabajo, así que registrar la
  tarea como acción humana la sacaría de la cola por algo que la próxima corrida sí puede cambiar.

### Qué se corrió

- **El mecanismo de acciones humanas, contra el motor**, antes de escribir nada: la salida de arriba.
- **El orden real de las fases**, leído del recorrido: `WIP` está después de `Critique`, que es lo que
  descarta la casa que el caso proponía para el contador.
- **Que `Decompose` no se dispara por condiciones de aceptación**: en el recorrido lo decide el carril
  —`!mechanical && !lite`— y parte sólo si la estimación supera `maxTaskHours`. El umbral de cinco vive en
  `oversizedUnits`, que lo mira `check`, y allí es `> 5` — así que una tarea de exactamente cinco pasa,
  tal como el caso midió.
- **Cinco mutaciones, las cinco en rojo**: el rechazo dejando de dejar rastro; cada uno de los dos cortes
  volviendo a la forma muda; la fila sin el motivo; y la fila sin decir qué regla aplica.
- **Todas en un clon desechable bajo `/tmp`**, con el árbol de trabajo comprobado intacto (R23).
- **La puerta entera**: 661 pruebas, 0 fallos.
- **Lo que no se pudo correr, y se dice**: las dos corridas reales de 9 agentes que originaron el caso son
  de la instancia sidecar. Acá se reprodujo el mecanismo —que la fila saca la tarea de la cola— y no el
  gasto que evita, que depende de agentes de verdad.
